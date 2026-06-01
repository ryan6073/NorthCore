import re
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional

from app.services.file_version_service import FileVersionService


LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
SCRIPT_TAG_RE = re.compile(r"<script\b[^>]*\bsrc\s*=\s*(['\"])(.*?)\1[^>]*>[\s\S]*?</script>", re.IGNORECASE)
ATTR_RE = re.compile(r"\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(['\"])(.*?)\2", re.DOTALL)


def _attrs(tag: str) -> Dict[str, str]:
    return {name.lower(): value for name, _, value in ATTR_RE.findall(tag)}


def _is_external_ref(ref: str) -> bool:
    ref = ref.strip()
    return (
        not ref
        or ref.startswith("#")
        or ref.startswith("/")
        or ref.startswith("//")
        or bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", ref))
    )


def _safe_path(path: str) -> str:
    cleaned = (path or "").strip().replace("\\", "/")
    parts = [part for part in PurePosixPath(cleaned).parts if part not in {"", "."}]
    if not cleaned or cleaned.startswith("/") or any(part == ".." for part in parts):
        raise ValueError("非法文件路径")
    return "/".join(parts)


def _resolve_relative_path(source_file_path: str, ref: str) -> Optional[str]:
    clean_ref = ref.split("?", 1)[0].split("#", 1)[0].strip().replace("\\", "/")
    if _is_external_ref(clean_ref):
        return None

    base_parts = _safe_path(source_file_path).split("/")[:-1]
    for part in PurePosixPath(clean_ref).parts:
        if part in {"", "."}:
            continue
        if part == "..":
            if not base_parts:
                return None
            base_parts.pop()
            continue
        base_parts.append(part)

    if not base_parts:
        return None
    return "/".join(base_parts)


def _escape_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _escape_inline_style(content: str) -> str:
    return re.sub(r"</style", r"<\/style", content, flags=re.IGNORECASE)


def _escape_inline_script(content: str) -> str:
    return re.sub(r"</script", r"<\/script", content, flags=re.IGNORECASE)


def build_sandbox_html_preview(run_id: str, source_file_path: str) -> Dict[str, Any]:
    file_service = FileVersionService()
    source_path = _safe_path(source_file_path)
    source_file = file_service.read_file(run_id, source_path)
    if not source_file:
        raise FileNotFoundError(source_path)

    html = str(source_file.get("content") or "")
    resolved_assets: List[Dict[str, Any]] = []
    missing_assets: List[Dict[str, Any]] = []
    warnings: List[str] = []

    def resolve_asset(ref: str, kind: str) -> Optional[Dict[str, Any]]:
        if _is_external_ref(ref):
            warnings.append(f"跳过外部或非相对资源: {ref}")
            return None
        asset_path = _resolve_relative_path(source_path, ref)
        if not asset_path:
            warnings.append(f"跳过越界资源路径: {ref}")
            return None
        asset_file = file_service.read_file(run_id, asset_path)
        if not asset_file:
            missing_assets.append({"ref": ref, "path": asset_path, "kind": kind})
            return None
        return {
            "ref": ref,
            "path": asset_path,
            "kind": kind,
            "content": str(asset_file.get("content") or ""),
        }

    def replace_link(match: re.Match[str]) -> str:
        tag = match.group(0)
        attrs = _attrs(tag)
        rel = attrs.get("rel", "")
        href = attrs.get("href", "")
        if "stylesheet" not in rel.lower() or not href:
            return tag
        asset = resolve_asset(href, "stylesheet")
        if not asset:
            return tag
        resolved_assets.append({k: v for k, v in asset.items() if k != "content"})
        return (
            f'<style data-sandbox-preview-href="{_escape_attr(href)}">\n'
            f'{_escape_inline_style(asset["content"])}\n'
            "</style>"
        )

    def replace_script(match: re.Match[str]) -> str:
        tag = match.group(0)
        src = match.group(2)
        attrs = _attrs(tag)
        asset = resolve_asset(src, "script")
        if not asset:
            return tag
        resolved_assets.append({k: v for k, v in asset.items() if k != "content"})
        script_type = ' type="module"' if attrs.get("type", "").lower() == "module" else ""
        return (
            f'<script{script_type} data-sandbox-preview-src="{_escape_attr(src)}">\n'
            f'{_escape_inline_script(asset["content"])}\n'
            "</script>"
        )

    bundled_html = LINK_TAG_RE.sub(replace_link, html)
    bundled_html = SCRIPT_TAG_RE.sub(replace_script, bundled_html)

    return {
        "html": bundled_html,
        "sourceFilePath": source_path,
        "resolvedAssets": resolved_assets,
        "missingAssets": missing_assets,
        "warnings": warnings,
    }
