import hashlib
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings
from app.database import (
    create_sandbox_file_version,
    get_agent_run_step,
    get_sandbox_file,
    get_sandbox_file_version,
    list_sandbox_files,
    upsert_sandbox_file_metadata,
)
from app.services.dag_step_policy import path_matches_patterns, step_target_paths
from app.services.sandbox_service import SandboxService
from app.services.secret_path_service import is_sensitive_workspace_path


TEXT_MIME_PREFIXES = ("text/",)
TEXT_SUFFIXES = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".htm", ".md", ".markdown",
    ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".svg", ".csv", ".ini", ".cfg",
    ".sh", ".bat", ".ps1", ".sql", ".rs", ".go", ".java", ".c", ".cpp", ".h",
}
GENERATED_CONTEXT_FILES = {"AGENTS.md"}


def meaningful_workspace_changes(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        file
        for file in files
        if str(file.get("path") or "").strip() not in GENERATED_CONTEXT_FILES
    ]


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


def _file_payload(path: Path, workspace: Path) -> Dict[str, Any]:
    data = path.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    is_text = _is_text_file(path, mime_type, data)
    content = data.decode("utf-8", errors="replace") if is_text else ""
    try:
        relative = path.relative_to(workspace).as_posix()
    except ValueError:
        relative = path.name
    return {
        "path": relative,
        "sha256": sha256,
        "mimeType": mime_type,
        "isText": is_text,
        "content": content,
        "contentPreview": content[:4000] if is_text else "",
        "size": len(data),
    }


def _iter_workspace_files(workspace: Path, max_files: Optional[int] = None):
    max_count = max_files or settings.SANDBOX_WORKSPACE_SCAN_MAX_FILES
    skipped_dirs = SandboxService.SKIPPED_DIRS
    scanned = 0
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
        yield path


def capture_workspace_snapshot(
    sandbox: Dict[str, Any],
    run_id: str,
    max_files: Optional[int] = None,
) -> Dict[str, Any]:
    workspace = Path(sandbox["workspacePath"]).resolve()
    files: Dict[str, Dict[str, Any]] = {}
    if not workspace.exists():
        return {"id": f"snapshot-{run_id}", "files": files}
    for path in _iter_workspace_files(workspace, max_files=max_files):
        payload = _file_payload(path, workspace)
        tracked = get_sandbox_file(run_id, payload["path"])
        files[payload["path"]] = {
            "sha256": payload["sha256"],
            "currentVersion": int((tracked or {}).get("currentVersion") or 0),
            "fileId": (tracked or {}).get("id"),
            "isText": payload["isText"],
        }
    return {"id": f"snapshot-{run_id}-{len(files)}", "files": files}


def _restore_current_version_to_workspace(workspace: Path, run_id: str, relative_path: str) -> None:
    current = get_sandbox_file(run_id, relative_path)
    target = (workspace / relative_path).resolve()
    try:
        target.relative_to(workspace)
    except ValueError:
        return
    if not current or not current.get("currentVersion"):
        if target.exists() and target.is_file():
            target.unlink()
        return
    version = get_sandbox_file_version(current["id"], current["currentVersion"])
    if version and isinstance(version.get("content"), str):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(version.get("content") or "", encoding="utf-8")


def _binary_incoming_placeholder(payload: Dict[str, Any], reason: str = "binary_changed") -> str:
    return (
        "[Binary Incoming]\n"
        f"reason={reason}\n"
        f"path={payload.get('path')}\n"
        f"mimeType={payload.get('mimeType')}\n"
        f"size={payload.get('size')}\n"
        f"sha256={payload.get('sha256')}\n"
    )


def _append_conflict(conflicts: List[Dict[str, Any]], result: Dict[str, Any]) -> None:
    conflict = result.get("conflict")
    if isinstance(conflict, dict):
        conflicts.append(conflict)


def _mutation_rejection(path: str, reason: str = "readonly_platform_runtime_mutation") -> Dict[str, Any]:
    return {
        "path": path,
        "reason": reason,
        "message": "只读 platform runtime 产生了 workspace 修改，已拒绝提交",
    }


def sync_platform_workspace_changes(
    sandbox: Dict[str, Any],
    run_id: str,
    snapshot: Dict[str, Any],
    created_by_step_id: Optional[str] = None,
    max_files: Optional[int] = None,
    allow_write: bool = True,
) -> Dict[str, Any]:
    workspace = Path(sandbox["workspacePath"]).resolve()
    if not workspace.exists():
        return {"files": [], "conflicts": [], "skippedFiles": [], "rejectedFiles": [], "writeRejected": False, "snapshotId": snapshot.get("id")}
    snapshot_files = snapshot.get("files") if isinstance(snapshot.get("files"), dict) else {}
    step = get_agent_run_step(created_by_step_id) if created_by_step_id else None
    declared_targets = step_target_paths(step or {}) if step else []
    saved_files: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    skipped_files: List[Dict[str, Any]] = []
    rejected_files: List[Dict[str, Any]] = []
    seen_paths: set[str] = set()
    for path in _iter_workspace_files(workspace, max_files=max_files):
        payload = _file_payload(path, workspace)
        seen_paths.add(payload["path"])
        before = snapshot_files.get(payload["path"]) if isinstance(snapshot_files.get(payload["path"]), dict) else None
        if before and before.get("sha256") == payload["sha256"]:
            continue
        if not allow_write:
            rejected_files.append(_mutation_rejection(payload["path"]))
            _restore_current_version_to_workspace(workspace, run_id, payload["path"])
            continue
        if is_sensitive_workspace_path(payload["path"]):
            skipped_files.append({
                "path": payload["path"],
                "reason": "sensitive_path",
                "message": "敏感文件已跳过 workspace 内容同步",
            })
            continue
        if declared_targets and not path_matches_patterns(payload["path"], declared_targets):
            conflicts.append({
                "path": payload["path"],
                "reason": "outside_declared_target_paths",
                "targetPaths": declared_targets,
                "message": "Platform runtime 写入超出当前 step 声明的 targetPaths，已拒绝提交",
            })
            _restore_current_version_to_workspace(workspace, run_id, payload["path"])
            continue
        base_version = int((before or {}).get("currentVersion") or 0)
        if payload["isText"]:
            result = create_sandbox_file_version(
                sandbox_id=sandbox["id"],
                run_id=run_id,
                file_path=payload["path"],
                content=payload["content"],
                base_version=base_version,
                created_by_step_id=created_by_step_id,
                mime_type=payload["mimeType"],
                size=payload["size"],
                content_preview=payload["contentPreview"],
            )
            if result.get("status") == "conflict":
                _append_conflict(conflicts, result)
                _restore_current_version_to_workspace(workspace, run_id, payload["path"])
                continue
            file_meta = result.get("file")
            if isinstance(file_meta, dict):
                saved_files.append(file_meta)
            continue
        current = get_sandbox_file(run_id, payload["path"])
        current_version = int((current or {}).get("currentVersion") or 0)
        if current_version != base_version:
            result = create_sandbox_file_version(
                sandbox_id=sandbox["id"],
                run_id=run_id,
                file_path=payload["path"],
                content=_binary_incoming_placeholder(payload),
                base_version=base_version,
                created_by_step_id=created_by_step_id,
                mime_type="text/plain",
                size=len(_binary_incoming_placeholder(payload).encode("utf-8")),
                content_preview=_binary_incoming_placeholder(payload),
            )
            _append_conflict(conflicts, result)
            _restore_current_version_to_workspace(workspace, run_id, payload["path"])
            continue
        result = upsert_sandbox_file_metadata(
            sandbox_id=sandbox["id"],
            run_id=run_id,
            file_path=payload["path"],
            mime_type=payload["mimeType"],
            size=payload["size"],
            sha256=payload["sha256"],
            is_text=False,
            content_preview="",
            content="",
            created_by_step_id=created_by_step_id,
        )
        if isinstance(result.get("file"), dict):
            saved_files.append(result["file"])
    for relative_path, before in snapshot_files.items():
        if relative_path in seen_paths:
            continue
        base_version = int((before or {}).get("currentVersion") or 0)
        if base_version <= 0:
            continue
        if not allow_write:
            rejected_files.append(_mutation_rejection(relative_path))
            _restore_current_version_to_workspace(workspace, run_id, relative_path)
            continue
        if is_sensitive_workspace_path(relative_path):
            skipped_files.append({
                "path": relative_path,
                "reason": "sensitive_path",
                "message": "敏感文件删除已跳过 workspace 内容同步",
            })
            continue
        if declared_targets and not path_matches_patterns(relative_path, declared_targets):
            conflicts.append({
                "path": relative_path,
                "reason": "outside_declared_target_paths",
                "targetPaths": declared_targets,
                "message": "Platform runtime 删除超出当前 step 声明的 targetPaths，已拒绝提交",
            })
            _restore_current_version_to_workspace(workspace, run_id, relative_path)
            continue
        current = get_sandbox_file(run_id, relative_path)
        current_version = int((current or {}).get("currentVersion") or 0)
        tombstone_payload = {
            "path": relative_path,
            "mimeType": "application/x-deleted",
            "size": 0,
            "sha256": "",
        }
        result = create_sandbox_file_version(
            sandbox_id=sandbox["id"],
            run_id=run_id,
            file_path=relative_path,
            content="",
            base_version=base_version,
            created_by_step_id=created_by_step_id,
            mime_type="application/x-deleted",
            size=0,
            content_preview="[Deleted by platform runtime]",
        )
        if result.get("status") == "conflict" or current_version != base_version:
            if result.get("status") != "conflict":
                result = create_sandbox_file_version(
                    sandbox_id=sandbox["id"],
                    run_id=run_id,
                    file_path=relative_path,
                    content=_binary_incoming_placeholder(tombstone_payload, reason="deleted"),
                    base_version=base_version,
                    created_by_step_id=created_by_step_id,
                    mime_type="text/plain",
                    content_preview=_binary_incoming_placeholder(tombstone_payload, reason="deleted"),
                )
            _append_conflict(conflicts, result)
            _restore_current_version_to_workspace(workspace, run_id, relative_path)
            continue
        file_meta = result.get("file")
        if isinstance(file_meta, dict):
            saved_files.append(file_meta)
    return {
        "files": saved_files,
        "conflicts": conflicts,
        "skippedFiles": skipped_files,
        "rejectedFiles": rejected_files,
        "writeRejected": bool(rejected_files),
        "snapshotId": snapshot.get("id"),
    }


def sync_workspace_files(
    sandbox: Dict[str, Any],
    run_id: str,
    created_by_step_id: Optional[str] = None,
    max_files: Optional[int] = None,
) -> List[Dict[str, Any]]:
    workspace = Path(sandbox["workspacePath"]).resolve()
    if not workspace.exists():
        return []
    synced: List[Dict[str, Any]] = []
    existing_paths = {item["path"] for item in list_sandbox_files(run_id)}
    for path in _iter_workspace_files(workspace, max_files=max_files):
        payload = _file_payload(path, workspace)
        if is_sensitive_workspace_path(payload["path"]):
            print(
                f"[WorkspaceSync] skip sensitive path run={run_id} path={payload['path']}",
                flush=True,
            )
            continue
        result = upsert_sandbox_file_metadata(
            sandbox_id=sandbox["id"],
            run_id=run_id,
            file_path=payload["path"],
            mime_type=payload["mimeType"],
            size=payload["size"],
            sha256=payload["sha256"],
            is_text=payload["isText"],
            content_preview=payload["contentPreview"],
            content=payload["content"],
            created_by_step_id=created_by_step_id,
        )
        file_meta = result["file"]
        if payload["path"] not in existing_paths or file_meta.get("sha256") == payload["sha256"]:
            synced.append(file_meta)
    return synced
