import hashlib
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings
from app.database import list_sandbox_files, upsert_sandbox_file_metadata
from app.services.sandbox_service import SandboxService


TEXT_MIME_PREFIXES = ("text/",)
TEXT_SUFFIXES = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".htm", ".md", ".markdown",
    ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".svg", ".csv", ".ini", ".cfg",
    ".env", ".sh", ".bat", ".ps1", ".sql", ".rs", ".go", ".java", ".c", ".cpp", ".h",
}


def _is_text_file(path: Path, mime_type: str, data: bytes) -> bool:
    if mime_type.startswith(TEXT_MIME_PREFIXES) or path.suffix.lower() in TEXT_SUFFIXES:
        try:
            data.decode("utf-8")
            return True
        except UnicodeDecodeError:
            return False
    try:
        data[:4096].decode("utf-8")
        return b"\x00" not in data[:4096]
    except UnicodeDecodeError:
        return False


def sync_workspace_files(
    sandbox: Dict[str, Any],
    run_id: str,
    created_by_step_id: Optional[str] = None,
    max_files: Optional[int] = None,
) -> List[Dict[str, Any]]:
    workspace = Path(sandbox["workspacePath"]).resolve()
    if not workspace.exists():
        return []
    max_count = max_files or settings.SANDBOX_WORKSPACE_SCAN_MAX_FILES
    synced: List[Dict[str, Any]] = []
    scanned = 0
    skipped_dirs = SandboxService.SKIPPED_DIRS
    existing_paths = {item["path"] for item in list_sandbox_files(run_id)}
    for path in sorted(workspace.rglob("*")):
        try:
            relative = path.relative_to(workspace).as_posix()
        except ValueError:
            continue
        if set(Path(relative).parts) & skipped_dirs:
            continue
        if not path.is_file():
            continue
        scanned += 1
        if scanned > max_count:
            break
        data = path.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        is_text = _is_text_file(path, mime_type, data)
        content = data.decode("utf-8", errors="replace") if is_text else ""
        preview = content[:4000] if is_text else ""
        result = upsert_sandbox_file_metadata(
            sandbox_id=sandbox["id"],
            run_id=run_id,
            file_path=relative,
            mime_type=mime_type,
            size=len(data),
            sha256=sha256,
            is_text=is_text,
            content_preview=preview,
            content=content,
            created_by_step_id=created_by_step_id,
        )
        file_meta = result["file"]
        if relative not in existing_paths or file_meta.get("sha256") == sha256:
            synced.append(file_meta)
    return synced

