import hashlib
import html
import asyncio
import base64
import stat
import mimetypes
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from xml.etree import ElementTree

from fastapi import UploadFile

from app.config import settings
from app.core.llm_client import client
from app.database import (
    create_id,
    get_conversation_attachment,
    update_attachment_meta,
    upsert_conversation_attachment,
)


TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".xml", ".html", ".htm",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".css", ".scss", ".sql", ".yaml", ".yml",
}
ARCHIVE_OFFICE_EXTENSIONS = {".docx", ".pptx", ".xlsx"}
BINARY_OFFICE_EXTENSIONS = {".doc", ".ppt", ".xls", ".pdf"}
ZIP_EXTENSIONS = {".zip"}
UNSUPPORTED_ARCHIVE_EXTENSIONS = {".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
IMAGE_MIME_PREFIX = "image/"
PARSE_STATUSES = {"pending", "parsed", "partial", "empty", "unsupported", "oversized", "failed"}
SYSTEM_ZIP_NAMES = {".ds_store", "thumbs.db"}
WRITE_INTENT_MARKERS = (
    "修改", "编辑", "改一下", "改成", "调整", "优化排版", "补充", "生成", "新建",
    "导出", "转换", "转成", "另存", "合并", "拆分", "重做", "完善", "写入",
    "modify", "edit", "change", "rewrite", "create", "generate", "export",
    "convert", "save", "merge", "split", "update",
)
READ_ONLY_MARKERS = (
    "总结", "分析", "提取", "解释", "说明", "翻译", "看看", "看下", "阅读",
    "这是什么", "讲一下", "有什么", "评价", "review", "summarize", "analyze",
    "extract", "explain", "translate",
)


def safe_attachment_name(name: str) -> str:
    base = Path(str(name or "")).name.strip() or "attachment"
    base = re.sub(r"[\x00-\x1f]+", "", base)
    base = re.sub(r"[\\/]+", "-", base)
    return base[:160] or "attachment"


def _storage_root(owner_user_id: str, conversation_id: str) -> Path:
    root = Path(settings.ATTACHMENT_STORAGE_ROOT).expanduser().resolve()
    return root / str(owner_user_id) / str(conversation_id)


def _attachment_dir(owner_user_id: str, conversation_id: str, attachment_id: str) -> Path:
    return _storage_root(owner_user_id, conversation_id) / str(attachment_id)


def uploaded_attachment_path(owner_user_id: str, conversation_id: str, attachment_id: str) -> Optional[Path]:
    root = _storage_root(owner_user_id, conversation_id)
    if not root.exists():
        return None
    safe_id = re.sub(r"[^A-Za-z0-9_-]+", "", str(attachment_id or ""))
    if not safe_id:
        return None
    isolated = root / safe_id / "original"
    if isolated.is_file() and _is_path_under(isolated.resolve(), root):
        return isolated.resolve()
    matches = sorted(root.glob(f"{safe_id}-*"))
    for match in matches:
        resolved = match.resolve()
        if _is_path_under(resolved, root) and resolved.is_file():
            return resolved
    return None


def _is_path_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _attachment_storage_root() -> Path:
    return Path(settings.ATTACHMENT_STORAGE_ROOT).expanduser().resolve()


def resolve_local_attachment_path(attachment: Dict[str, Any]) -> Optional[Path]:
    raw_path = str(attachment.get("storagePath") or attachment.get("storage_path") or "").strip()
    if not raw_path:
        return None
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        return None
    resolved = path.resolve()
    if not _is_path_under(resolved, _attachment_storage_root()):
        return None
    if not resolved.is_file():
        return None
    return resolved


def public_attachment(attachment: Dict[str, Any]) -> Dict[str, Any]:
    meta = attachment.get("meta") if isinstance(attachment.get("meta"), dict) else {}
    return {
        "id": attachment.get("id"),
        "conversationId": attachment.get("conversationId"),
        "messageId": attachment.get("messageId"),
        "kind": attachment.get("kind") or attachment.get("type") or "file",
        "type": attachment.get("type") or attachment.get("kind") or "file",
        "name": attachment.get("name") or "attachment",
        "mimeType": attachment.get("mimeType") or "application/octet-stream",
        "size": int(attachment.get("size") or 0),
        "sha256": meta.get("sha256") or attachment.get("sha256") or "",
        "url": attachment.get("url") or "",
        "parseStatus": meta.get("parseStatus") or "pending",
        "summary": meta.get("summary") or "",
        "meta": {
            key: value
            for key, value in meta.items()
            if key
            in {
                "sha256",
                "parseStatus",
                "parser",
                "summary",
                "skipped",
                "entryCount",
                "parsedEntryCount",
                "zipSha256",
                "zipBaseName",
                "vision",
            }
        },
        "createdAt": attachment.get("createdAt"),
    }


def render_attachment_placeholder(attachment: Dict[str, Any]) -> str:
    meta = attachment.get("meta") if isinstance(attachment.get("meta"), dict) else {}
    attachment_id = attachment.get("id")
    name = attachment.get("name") or "attachment"
    kind = attachment.get("kind") or attachment.get("type") or Path(str(name)).suffix.lower().lstrip(".") or "file"
    size = int(attachment.get("size") or 0)
    sha256 = str(meta.get("sha256") or attachment.get("sha256") or "")
    status = str(meta.get("parseStatus") or attachment.get("parseStatus") or "pending")
    summary = str(meta.get("summary") or attachment.get("summary") or "")
    sha_label = sha256[:12] if sha256 else "-"
    return (
        f"[Attachment: {name} | id={attachment_id} | type={kind} | size={size} "
        f"| sha256={sha_label} | status={status} | summary={summary}]"
    )


def is_image_attachment(attachment: Dict[str, Any]) -> bool:
    mime_type = str(attachment.get("mimeType") or "").lower()
    name = str(attachment.get("name") or "")
    suffix = Path(name).suffix.lower()
    return mime_type.startswith(IMAGE_MIME_PREFIX) or suffix in IMAGE_EXTENSIONS


def _image_data_url(path: Path, mime_type: str) -> Optional[str]:
    if not settings.ATTACHMENT_VISION_ENABLED:
        return None
    if not path.is_file():
        return None
    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size <= 0 or size > settings.ATTACHMENT_VISION_MAX_BYTES:
        return None
    guessed_mime = mimetypes.guess_type(path.name)[0] or ""
    resolved_mime = mime_type if str(mime_type or "").lower().startswith(IMAGE_MIME_PREFIX) else guessed_mime
    if not str(resolved_mime or "").lower().startswith(IMAGE_MIME_PREFIX):
        resolved_mime = "image/png"
    try:
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    except OSError:
        return None
    return f"data:{resolved_mime};base64,{encoded}"


def build_vision_user_content(user_input: str, attachments: List[Dict[str, Any]]) -> Any:
    if not attachments:
        return user_input
    parts: List[Dict[str, Any]] = [{"type": "text", "text": user_input}]
    image_count = 0
    for attachment in attachments:
        if not is_image_attachment(attachment):
            continue
        source = resolve_local_attachment_path(attachment)
        if not source:
            continue
        data_url = _image_data_url(source, str(attachment.get("mimeType") or ""))
        if not data_url:
            continue
        image_count += 1
        parts.append({
            "type": "image_url",
            "image_url": {
                "url": data_url,
                "detail": "auto",
            },
        })
    return parts if image_count else user_input


def has_vision_attachments(attachments: List[Dict[str, Any]]) -> bool:
    return any(is_image_attachment(attachment) and resolve_local_attachment_path(attachment) for attachment in attachments)


def _is_system_zip_entry(path: str) -> bool:
    normalized = path.replace("\\", "/").strip("/")
    parts = [part for part in normalized.split("/") if part]
    if not parts:
        return True
    if parts[0] == "__MACOSX":
        return True
    return parts[-1].lower() in SYSTEM_ZIP_NAMES


def _normalize_zip_path(path: str) -> Optional[str]:
    cleaned = str(path or "").replace("\\", "/").strip()
    if not cleaned or cleaned.startswith("/"):
        return None
    parts = []
    for part in cleaned.split("/"):
        if not part or part == ".":
            continue
        if part == "..":
            return None
        parts.append(part)
    if not parts:
        return None
    return "/".join(parts)


def _zip_entry_type(info: zipfile.ZipInfo) -> str:
    mode = (info.external_attr >> 16) & 0o170000
    if info.is_dir() or stat.S_ISDIR(mode):
        return "directory"
    if stat.S_ISLNK(mode):
        return "symlink"
    if mode and not stat.S_ISREG(mode):
        return "special"
    return "file"


def _skip_item(path: str, reason: str) -> Dict[str, str]:
    return {"path": path, "reason": reason}


def _zip_summary_payload(path: Path) -> Dict[str, Any]:
    skipped: List[Dict[str, str]] = []
    snippets: List[str] = []
    parsed_entries: List[str] = []
    total_uncompressed = 0
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            total_uncompressed = sum(max(int(info.file_size or 0), 0) for info in infos)
            if len(infos) > settings.ATTACHMENT_ZIP_MAX_FILES:
                return {
                    "status": "oversized",
                    "parser": "zip",
                    "text": "",
                    "skipped": [_skip_item(path.name, "too_many_entries")],
                    "entryCount": len(infos),
                    "uncompressedSize": total_uncompressed,
                }
            if total_uncompressed > settings.ATTACHMENT_ZIP_MAX_UNCOMPRESSED_BYTES:
                return {
                    "status": "oversized",
                    "parser": "zip",
                    "text": "",
                    "skipped": [_skip_item(path.name, "too_large_uncompressed")],
                    "entryCount": len(infos),
                    "uncompressedSize": total_uncompressed,
                }
            seen_paths = set()
            for info in infos:
                raw_name = info.filename or ""
                normalized = _normalize_zip_path(raw_name)
                if not normalized:
                    skipped.append(_skip_item(raw_name, "unsafe_path"))
                    continue
                if _is_system_zip_entry(normalized):
                    skipped.append(_skip_item(normalized, "system_file"))
                    continue
                entry_type = _zip_entry_type(info)
                if entry_type == "directory":
                    continue
                if entry_type != "file":
                    skipped.append(_skip_item(normalized, f"unsupported_entry_type:{entry_type}"))
                    continue
                if normalized in seen_paths:
                    skipped.append(_skip_item(normalized, "duplicate_path"))
                    continue
                seen_paths.add(normalized)
                if int(info.file_size or 0) > settings.ATTACHMENT_ZIP_ENTRY_MAX_BYTES:
                    skipped.append(_skip_item(normalized, "entry_too_large"))
                    continue
                suffix = Path(normalized).suffix.lower()
                if suffix not in TEXT_EXTENSIONS and suffix not in {".docx", ".pptx", ".xlsx"}:
                    skipped.append(_skip_item(normalized, "unsupported_file_type"))
                    continue
                try:
                    data = archive.read(info)
                    temp_text = ""
                    if suffix in TEXT_EXTENSIONS:
                        temp_text = data.decode("utf-8", errors="replace")
                    else:
                        # Reuse the normal Office parser by writing only small zip entries is not enough
                        # because Office files are nested zips. For zip attachments, summarize Office entries by name.
                        temp_text = f"{normalized}: Office 文件，已识别但未展开内嵌结构。"
                    if temp_text.strip():
                        parsed_entries.append(normalized)
                        snippets.append(f"--- {normalized} ---\n{_truncate(temp_text, 1500)}")
                except Exception as exc:
                    skipped.append(_skip_item(normalized, f"read_failed:{exc}"))
    except zipfile.BadZipFile:
        return {"status": "failed", "parser": "zip", "text": "", "error": "invalid_zip"}
    text = "\n\n".join(snippets)
    status = "parsed" if text and not skipped else ("partial" if text else ("empty" if not skipped else "partial"))
    return {
        "status": status,
        "parser": "zip",
        "text": _truncate(text, settings.ATTACHMENT_SUMMARY_MAX_SOURCE_CHARS),
        "skipped": skipped[:50],
        "entryCount": len(parsed_entries) + len(skipped),
        "parsedEntryCount": len(parsed_entries),
        "parsedEntries": parsed_entries[:50],
        "uncompressedSize": total_uncompressed,
    }


def _summary_fallback(name: str, parse_payload: Dict[str, Any]) -> str:
    status = parse_payload.get("status") or parse_payload.get("parseStatus") or "pending"
    text = str(parse_payload.get("text") or "").strip()
    if text:
        return _truncate(text, 360)
    if parse_payload.get("isImage"):
        return f"{name} 是图片附件，当前未生成视觉摘要。"
    if status == "unsupported":
        return f"{name} 当前格式暂不支持正文解析。"
    if status == "oversized":
        return f"{name} 超过当前解析限制，暂未读取正文。"
    if status == "empty":
        return f"{name} 未提取到可读文本。"
    if status == "partial":
        return f"{name} 已部分解析，部分内容因格式或安全限制被跳过。"
    return f"{name} 已上传，当前没有可用正文摘要。"


async def _generate_model_summary(
    name: str,
    mime_type: str,
    size: int,
    parse_payload: Dict[str, Any],
    path: Optional[Path] = None,
) -> str:
    if parse_payload.get("isImage") and path:
        data_url = _image_data_url(path, mime_type)
        if data_url:
            prompt = (
                "请观察这张用户上传的图片，并只基于图像中可见内容生成 1-3 句中文摘要。"
                "可以描述图片类型、主体、明显标注、可见文字或布局。"
                "不要推测图片外的信息，不确定就说明无法确定。"
            )
            try:
                response = await asyncio.to_thread(
                    client.chat.completions.create,
                    model=settings.MODEL_EP,
                    messages=[
                        {"role": "system", "content": "你是图片附件摘要器。你必须忠实描述图片中可见内容。只输出摘要正文。"},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": data_url,
                                        "detail": "auto",
                                    },
                                },
                            ],
                        },
                    ],
                    stream=False,
                )
                summary = str(response.choices[0].message.content or "").strip()
                if summary:
                    parse_payload["status"] = "parsed"
                    parse_payload["visionSummary"] = True
                    return summary[:800]
            except Exception:
                pass
    source_text = _truncate(str(parse_payload.get("text") or ""), settings.ATTACHMENT_SUMMARY_MAX_SOURCE_CHARS)
    prompt = {
        "fileName": name,
        "mimeType": mime_type,
        "size": size,
        "parseStatus": parse_payload.get("status") or parse_payload.get("parseStatus"),
        "parser": parse_payload.get("parser"),
        "skipped": parse_payload.get("skipped") or [],
        "parsedEntries": parse_payload.get("parsedEntries") or [],
        "extractedSnippet": source_text,
        "instruction": (
            "请只基于 metadata 和 extractedSnippet 生成 1-3 句中文附件摘要。"
            "不要推测未读取文件的内容；如果 extractedSnippet 为空或格式不支持，说明当前只能识别文件类型/状态。"
        ),
    }
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": "你是附件摘要器。你必须忠实于已读取内容，不得猜测。只输出摘要正文。"},
                {"role": "user", "content": json_dumps(prompt)},
            ],
            stream=False,
        )
        summary = str(response.choices[0].message.content or "").strip()
        return summary[:800] if summary else _summary_fallback(name, parse_payload)
    except Exception:
        return _summary_fallback(name, parse_payload)


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)


def extract_attachment_summary_source(path: Path, display_name: Optional[str] = None) -> Dict[str, Any]:
    suffix = Path(display_name or path.name).suffix.lower()
    if suffix in UNSUPPORTED_ARCHIVE_EXTENSIONS:
        return {"status": "unsupported", "parser": f"{suffix.lstrip('.')}-unsupported", "text": ""}
    if suffix == ".zip":
        return _zip_summary_payload(path)
    if suffix in IMAGE_EXTENSIONS:
        return {"status": "pending", "parser": "image-vision", "text": "", "isText": False, "isImage": True}
    extracted = extract_attachment_text(path, settings.ATTACHMENT_SUMMARY_MAX_SOURCE_CHARS, display_name)
    text = str(extracted.get("text") or "").strip()
    if extracted.get("error"):
        return {"status": "failed", **extracted}
    if extracted.get("unsupportedReason"):
        return {"status": "unsupported", **extracted}
    if text:
        parser = extracted.get("parser") or ("csv" if suffix == ".csv" else "text")
        return {"status": "parsed", "parser": parser, **extracted}
    return {"status": "empty", **extracted}


async def save_upload_attachment(
    owner_user_id: str,
    conversation_id: str,
    upload: UploadFile,
) -> Dict[str, Any]:
    original_name = safe_attachment_name(upload.filename or "attachment")
    original_suffix = Path(original_name).suffix.lower()
    if original_suffix in UNSUPPORTED_ARCHIVE_EXTENSIONS:
        raise ValueError(f"暂不支持该压缩格式：{original_suffix}，请上传 .zip")
    attachment_id = create_id("attach")
    target_dir = _attachment_dir(owner_user_id, conversation_id, attachment_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / "original"

    size = 0
    digest = hashlib.sha256()
    with target_path.open("wb") as handle:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.ATTACHMENT_MAX_BYTES:
                try:
                    target_path.unlink()
                except FileNotFoundError:
                    pass
                raise ValueError(f"附件超过大小限制：{settings.ATTACHMENT_MAX_BYTES} bytes")
            digest.update(chunk)
            handle.write(chunk)

    mime_type = upload.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    kind = Path(original_name).suffix.lower().lstrip(".") or "file"
    parse_payload = extract_attachment_summary_source(target_path, original_name)
    summary = await _generate_model_summary(original_name, mime_type, size, parse_payload, target_path)
    parse_status = str(parse_payload.get("status") or "pending")
    if parse_payload.get("isImage") and parse_status == "pending":
        parse_status = "unsupported"
    if parse_status not in PARSE_STATUSES:
        parse_status = "failed"
    meta = {
        "sha256": digest.hexdigest(),
        "source": "backend_upload",
        "displayName": original_name,
        "parseStatus": parse_status,
        "parser": parse_payload.get("parser") or kind or "file",
        "summary": summary,
    }
    if parse_payload.get("isImage"):
        meta["vision"] = {
            "enabled": bool(settings.ATTACHMENT_VISION_ENABLED),
            "summaryGenerated": bool(parse_payload.get("visionSummary")),
        }
    for key in ("skipped", "entryCount", "parsedEntryCount", "uncompressedSize", "parsedEntries"):
        if key in parse_payload:
            meta[key] = parse_payload[key]
    if kind == "zip":
        meta["zipSha256"] = digest.hexdigest()
        meta["zipBaseName"] = Path(original_name).stem or "archive"
    attachment = {
        "id": attachment_id,
        "name": original_name,
        "kind": kind,
        "type": kind,
        "mimeType": mime_type,
        "size": size,
        "url": f"/api/v1/conversations/{quote(conversation_id)}/attachments/{quote(attachment_id)}",
        "storagePath": str(target_path),
        "meta": meta,
    }
    saved = upsert_conversation_attachment(conversation_id, attachment, message_id=None)
    return public_attachment(saved)


def _truncate(value: str, max_chars: int) -> str:
    text = value.strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n...[内容已截断]"


def _xml_text(xml_bytes: bytes) -> str:
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return ""
    parts = []
    for node in root.iter():
        if node.text and node.text.strip():
            parts.append(html.unescape(node.text.strip()))
    return "\n".join(parts)


def _extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        try:
            return _xml_text(archive.read("word/document.xml"))
        except KeyError:
            return ""


def _extract_pptx(path: Path) -> str:
    lines: List[str] = []
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            [name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")],
            key=lambda item: [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", item)],
        )
        for index, slide_name in enumerate(slide_names, start=1):
            text = _xml_text(archive.read(slide_name))
            if text:
                lines.append(f"Slide {index}:\n{text}")
    return "\n\n".join(lines)


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> List[str]:
    try:
        root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    except (KeyError, ElementTree.ParseError):
        return []
    values = []
    for item in root.iter():
        if item.tag.endswith("}si") or item.tag == "si":
            texts = [node.text or "" for node in item.iter() if node.tag.endswith("}t") or node.tag == "t"]
            values.append("".join(texts))
    return values


def _extract_xlsx(path: Path) -> str:
    lines: List[str] = []
    with zipfile.ZipFile(path) as archive:
        shared_strings = _xlsx_shared_strings(archive)
        sheet_names = sorted(
            [name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")],
            key=lambda item: [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", item)],
        )
        for index, sheet_name in enumerate(sheet_names[:8], start=1):
            try:
                root = ElementTree.fromstring(archive.read(sheet_name))
            except ElementTree.ParseError:
                continue
            rows: List[str] = []
            for row in root.iter():
                if not (row.tag.endswith("}row") or row.tag == "row"):
                    continue
                cells = []
                for cell in list(row):
                    if not (cell.tag.endswith("}c") or cell.tag == "c"):
                        continue
                    cell_type = cell.attrib.get("t")
                    value_node = next((node for node in cell.iter() if node.tag.endswith("}v") or node.tag == "v"), None)
                    if value_node is None or value_node.text is None:
                        continue
                    value = value_node.text
                    if cell_type == "s":
                        try:
                            value = shared_strings[int(value)]
                        except (ValueError, IndexError):
                            pass
                    cells.append(value)
                if cells:
                    rows.append(", ".join(cells))
                if len(rows) >= 40:
                    break
            if rows:
                lines.append(f"Sheet {index}:\n" + "\n".join(rows))
    return "\n\n".join(lines)


def extract_attachment_text(path: Path, max_chars: Optional[int] = None, display_name: Optional[str] = None) -> Dict[str, Any]:
    max_chars = max_chars or settings.ATTACHMENT_CONTEXT_MAX_CHARS
    suffix = Path(display_name or path.name).suffix.lower()
    try:
        if suffix in TEXT_EXTENSIONS:
            return {"isText": True, "text": _truncate(path.read_text(encoding="utf-8", errors="replace"), max_chars)}
        if suffix == ".docx":
            return {"isText": False, "text": _truncate(_extract_docx(path), max_chars), "parser": "docx-zip"}
        if suffix == ".pptx":
            return {"isText": False, "text": _truncate(_extract_pptx(path), max_chars), "parser": "pptx-zip"}
        if suffix == ".xlsx":
            return {"isText": False, "text": _truncate(_extract_xlsx(path), max_chars), "parser": "xlsx-zip"}
        if suffix == ".zip":
            payload = _zip_summary_payload(path)
            return {
                "isText": False,
                "text": _truncate(str(payload.get("text") or ""), max_chars),
                "parser": "zip",
                "unsupportedReason": None if payload.get("text") else payload.get("status"),
            }
        if suffix in BINARY_OFFICE_EXTENSIONS:
            return {"isText": False, "text": "", "unsupportedReason": "binary_or_pdf_parser_unavailable"}
    except Exception as exc:
        return {"isText": suffix in TEXT_EXTENSIONS, "text": "", "error": str(exc)}
    return {"isText": False, "text": "", "unsupportedReason": "unsupported_file_type"}


def resolve_message_attachments(
    payload: Dict[str, Any],
    conversation_id: str,
) -> Dict[str, List[Dict[str, Any]]]:
    raw_attachments = payload.get("attachments")
    if not isinstance(raw_attachments, list):
        return {"public": [], "internal": []}
    public_items: List[Dict[str, Any]] = []
    internal_items: List[Dict[str, Any]] = []
    seen = set()
    for item in raw_attachments:
        if not isinstance(item, dict):
            continue
        attachment_id = str(item.get("id") or item.get("attachmentId") or "").strip()
        if not attachment_id or attachment_id in seen:
            continue
        seen.add(attachment_id)
        internal = get_conversation_attachment(
            conversation_id,
            attachment_id,
            include_storage_path=True,
        )
        if not internal:
            continue
        public_items.append(public_attachment(internal))
        internal_items.append(internal)
    return {"public": public_items, "internal": internal_items}


def build_attachment_context(attachments: List[Dict[str, Any]]) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = [public_attachment(item) for item in attachments]
    blocks: List[str] = []
    for attachment in attachments:
        blocks.append(render_attachment_placeholder(attachment))
    context = "\n\n".join(blocks).strip()
    return {"items": items, "context": context}


def build_attachment_full_context(attachments: List[Dict[str, Any]]) -> str:
    blocks: List[str] = []
    remaining = settings.ATTACHMENT_CONTEXT_MAX_CHARS
    for attachment in attachments:
        if remaining <= 0:
            break
        path = resolve_local_attachment_path(attachment)
        name = str(attachment.get("name") or "attachment")
        if not path:
            blocks.append(f"[Attachment Content: {name}] 原始文件不可访问。")
            continue
        extracted = extract_attachment_text(path, max(1000, remaining), name)
        text = str(extracted.get("text") or "").strip()
        if text:
            snippet = _truncate(text, remaining)
            blocks.append(f"[Attachment Content: {name}]\n{snippet}")
            remaining -= len(snippet)
        else:
            reason = extracted.get("unsupportedReason") or extracted.get("error") or "未提取到文本"
            blocks.append(f"[Attachment Content: {name}] 正文不可用：{reason}")
    return "\n\n".join(blocks).strip()


def append_attachment_context_to_input(user_input: str, attachment_context: Dict[str, Any]) -> str:
    context = str((attachment_context or {}).get("context") or "").strip()
    if not context:
        return user_input
    return f"{user_input.strip()}\n\n[上传附件上下文]\n{context}".strip()


def needs_attachment_clarification(original_content: str, attachments: List[Dict[str, Any]]) -> bool:
    return bool(attachments) and not str(original_content or "").strip()


def attachment_write_intent(content: str) -> bool:
    normalized = str(content or "").lower()
    return any(marker.lower() in normalized for marker in WRITE_INTENT_MARKERS)


def attachment_read_only_intent(content: str) -> bool:
    normalized = str(content or "").lower()
    return any(marker.lower() in normalized for marker in READ_ONLY_MARKERS)


def maybe_force_attachment_chat(content: str, attachments: List[Dict[str, Any]], decision: Dict[str, Any]) -> Dict[str, Any]:
    if not attachments or decision.get("executionMode") != "sandbox":
        return decision
    if attachment_write_intent(content):
        return decision
    if attachment_read_only_intent(content):
        return {
            **decision,
            "executionMode": "chat",
            "reason": "用户上传了附件但表达的是读取/分析类问题，优先使用解析文本直接回答，不创建 sandbox",
        }
    return {
        **decision,
        "executionMode": "chat",
        "reason": "上传附件未包含明确修改/转换/生成指令，先按对话处理",
    }


def attachment_clarification_content(attachments: List[Dict[str, Any]]) -> str:
    summary = "、".join([str(item.get("name") or "附件") for item in attachments[:3]])
    if len(attachments) > 3:
        summary += f" 等 {len(attachments)} 个附件"
    return f"已收到附件：{summary}。请说明你希望我对这些文件做什么，例如总结内容、提取信息、修改文件、转换格式或生成新产物。"


def materialize_attachments_to_workspace(
    attachments: List[Dict[str, Any]],
    workspace_path: str,
) -> List[Dict[str, Any]]:
    workspace_root = Path(workspace_path).expanduser().resolve()
    target_dir = workspace_root / "attachments"
    target_dir.mkdir(parents=True, exist_ok=True)
    materialized: List[Dict[str, Any]] = []
    for attachment in attachments:
        source = resolve_local_attachment_path(attachment)
        name = safe_attachment_name(str(attachment.get("name") or "attachment"))
        if not source:
            materialized.append({
                "name": name,
                "path": "",
                "status": "skipped",
                "reason": "source_not_accessible",
            })
            continue
        if Path(name).suffix.lower() == ".zip":
            zip_base = safe_attachment_name(Path(name).stem or "archive")
            zip_dir = target_dir / zip_base
            counter = 1
            while zip_dir.exists():
                zip_dir = target_dir / f"{zip_base}-{counter}"
                counter += 1
            zip_dir.mkdir(parents=True, exist_ok=True)
            original_zip_target = zip_dir / name
            shutil.copy2(source, original_zip_target)
            extract_result = safe_extract_zip(source, zip_dir / "extracted")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            materialized.append({
                "id": attachment.get("id"),
                "name": name,
                "path": str(original_zip_target.relative_to(workspace_root)).replace("\\", "/"),
                "extractDir": str((zip_dir / "extracted").relative_to(workspace_root)).replace("\\", "/"),
                "mimeType": attachment.get("mimeType") or "application/zip",
                "size": source.stat().st_size,
                "sha256": digest,
                "zipSha256": digest,
                "status": "materialized",
                "archive": True,
                **extract_result,
            })
            continue
        target = target_dir / name
        counter = 1
        while target.exists():
            stem = Path(name).stem or "attachment"
            suffix = Path(name).suffix
            target = target_dir / f"{stem}-{counter}{suffix}"
            counter += 1
        shutil.copy2(source, target)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        materialized.append({
            "id": attachment.get("id"),
            "name": name,
            "path": str(target.relative_to(workspace_root)).replace("\\", "/"),
            "mimeType": attachment.get("mimeType") or mimetypes.guess_type(name)[0] or "application/octet-stream",
            "size": target.stat().st_size,
            "sha256": digest,
            "status": "materialized",
        })
    return materialized


def safe_extract_zip(source: Path, target_dir: Path) -> Dict[str, Any]:
    skipped: List[Dict[str, str]] = []
    extracted: List[str] = []
    target_root = target_dir.resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(source) as archive:
            infos = archive.infolist()
            total_uncompressed = sum(max(int(info.file_size or 0), 0) for info in infos)
            if len(infos) > settings.ATTACHMENT_ZIP_MAX_FILES:
                return {
                    "extractStatus": "oversized",
                    "entryCount": len(infos),
                    "uncompressedSize": total_uncompressed,
                    "skipped": [_skip_item(source.name, "too_many_entries")],
                    "extractedFiles": [],
                }
            if total_uncompressed > settings.ATTACHMENT_ZIP_MAX_UNCOMPRESSED_BYTES:
                return {
                    "extractStatus": "oversized",
                    "entryCount": len(infos),
                    "uncompressedSize": total_uncompressed,
                    "skipped": [_skip_item(source.name, "too_large_uncompressed")],
                    "extractedFiles": [],
                }
            seen = set()
            for info in infos:
                normalized = _normalize_zip_path(info.filename or "")
                if not normalized:
                    skipped.append(_skip_item(info.filename or "", "unsafe_path"))
                    continue
                if _is_system_zip_entry(normalized):
                    skipped.append(_skip_item(normalized, "system_file"))
                    continue
                entry_type = _zip_entry_type(info)
                if entry_type == "directory":
                    continue
                if entry_type != "file":
                    skipped.append(_skip_item(normalized, f"unsupported_entry_type:{entry_type}"))
                    continue
                if normalized in seen:
                    skipped.append(_skip_item(normalized, "duplicate_path"))
                    continue
                seen.add(normalized)
                if int(info.file_size or 0) > settings.ATTACHMENT_ZIP_ENTRY_MAX_BYTES:
                    skipped.append(_skip_item(normalized, "entry_too_large"))
                    continue
                destination = (target_root / normalized).resolve()
                try:
                    destination.relative_to(target_root)
                except ValueError:
                    skipped.append(_skip_item(normalized, "unsafe_path"))
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source_handle, destination.open("wb") as target_handle:
                    shutil.copyfileobj(source_handle, target_handle)
                extracted.append(normalized)
    except zipfile.BadZipFile:
        return {
            "extractStatus": "failed",
            "entryCount": 0,
            "uncompressedSize": 0,
            "skipped": [_skip_item(source.name, "invalid_zip")],
            "extractedFiles": [],
        }
    return {
        "extractStatus": "partial" if skipped else "extracted",
        "entryCount": len(extracted) + len(skipped),
        "skipped": skipped[:100],
        "extractedFiles": extracted[:200],
    }
