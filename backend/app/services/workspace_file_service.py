import hashlib
import mimetypes
import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services.sandbox_service import SandboxService


class WorkspaceConflictError(ValueError):
    def __init__(self, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(message)
        self.data = data or {}


class WorkspaceFileService:
    SKIPPED_DIRS = set(SandboxService.SKIPPED_DIRS) | {"venv", "dist", "build"}
    TEXT_MIME_PREFIXES = ("text/",)
    TEXT_SUFFIXES = {
        ".py", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".htm", ".md", ".markdown",
        ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".svg", ".csv", ".ini", ".cfg",
        ".sh", ".bat", ".ps1", ".sql", ".rs", ".go", ".java", ".c", ".cpp", ".h",
    }

    def workspace_root(self, workspace: Dict[str, Any]) -> Path:
        return Path(str(workspace.get("workspacePath") or "")).resolve()

    def deleted_workspace_root(self, workspace: Dict[str, Any]) -> Optional[Path]:
        path = str(workspace.get("deletedWorkspacePath") or "").strip()
        return Path(path).resolve() if path else None

    def trash_path_for_workspace(self, workspace: Dict[str, Any], deleted_at: str) -> Path:
        root = self.workspace_root(workspace)
        trash_root = root.parent / "workspaces_trash"
        suffix = re.sub(r"[^0-9A-Za-z._-]+", "_", deleted_at).strip("_") or "deleted"
        return (trash_root / f"{workspace['id']}_{suffix}").resolve()

    def move_to_trash(self, workspace: Dict[str, Any], deleted_at: str) -> Path:
        root = self.workspace_root(workspace)
        target = self.trash_path_for_workspace(workspace, deleted_at)
        if target.exists():
            raise WorkspaceConflictError("删除目标路径已存在", {"error": "trash_path_exists", "path": str(target)})
        target.parent.mkdir(parents=True, exist_ok=True)
        if root.exists():
            shutil.move(str(root), str(target))
        else:
            target.mkdir(parents=True, exist_ok=True)
        return target

    def restore_from_trash(self, workspace: Dict[str, Any]) -> None:
        deleted_root = self.deleted_workspace_root(workspace)
        active_root = self.workspace_root(workspace)
        if active_root.exists():
            raise WorkspaceConflictError("恢复目标路径已存在", {"error": "workspace_path_exists", "path": str(active_root)})
        if not deleted_root or not deleted_root.exists():
            raise FileNotFoundError("已删除的 Workspace 文件不存在")
        active_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(deleted_root), str(active_root))

    def move_active_back_to_trash(self, workspace: Dict[str, Any], deleted_root: Path) -> None:
        active_root = self.workspace_root(workspace)
        if active_root.exists() and not deleted_root.exists():
            deleted_root.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(active_root), str(deleted_root))

    def move_trash_back_to_active(self, workspace: Dict[str, Any], deleted_root: Path) -> None:
        active_root = self.workspace_root(workspace)
        if deleted_root.exists() and not active_root.exists():
            active_root.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(deleted_root), str(active_root))

    def purge_deleted_workspace(self, workspace: Dict[str, Any]) -> None:
        deleted_root = self.deleted_workspace_root(workspace)
        if deleted_root and deleted_root.exists():
            shutil.rmtree(deleted_root)

    def _clean_relative_path(self, path: str, allow_empty: bool = False) -> str:
        clean = str(path or "").strip().replace("\\", "/")
        if clean in {"", "."} and allow_empty:
            return ""
        candidate = Path(clean)
        if not clean or candidate.is_absolute() or ".." in candidate.parts:
            raise ValueError("非法文件路径")
        return candidate.as_posix().strip("/")

    def _resolve_existing(self, root: Path, path: str) -> Path:
        relative = self._clean_relative_path(path)
        target = (root / relative).resolve()
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise ValueError("非法文件路径") from exc
        return target

    def _resolve_for_write(self, root: Path, path: str) -> Path:
        relative = self._clean_relative_path(path)
        target = root / relative
        parent = target.parent
        if parent.exists():
            parent_resolved = parent.resolve()
            try:
                parent_resolved.relative_to(root)
            except ValueError as exc:
                raise ValueError("非法文件路径") from exc
        if target.exists() or target.is_symlink():
            resolved = target.resolve()
            try:
                resolved.relative_to(root)
            except ValueError as exc:
                raise ValueError("非法文件路径") from exc
        return target

    def _safe_upload_name(self, filename: str) -> str:
        name = Path(str(filename or "")).name.strip()
        name = re.sub(r"[^A-Za-z0-9._+ -]+", "-", name).strip(" .")
        if not name or name in {".", ".."}:
            raise ValueError("文件名不能为空")
        return name

    def _sha256_file(self, path: Path) -> str:
        sha = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                sha.update(chunk)
        return sha.hexdigest()

    def _mime_type(self, path: Path) -> str:
        return mimetypes.guess_type(path.name)[0] or "application/octet-stream"

    def _is_text_file(self, path: Path, mime_type: str, sample: bytes) -> bool:
        if mime_type.startswith(self.TEXT_MIME_PREFIXES) or path.suffix.lower() in self.TEXT_SUFFIXES:
            try:
                sample.decode("utf-8")
                return True
            except UnicodeDecodeError:
                return False
        try:
            sample.decode("utf-8")
            return b"\x00" not in sample
        except UnicodeDecodeError:
            return False

    def build_tree(self, workspace: Dict[str, Any], max_depth: Optional[int] = None, max_entries: Optional[int] = None) -> Dict[str, Any]:
        root = self.workspace_root(workspace)
        root.mkdir(parents=True, exist_ok=True)
        limit_depth = max(1, min(int(max_depth or settings.WORKSPACE_TREE_MAX_DEPTH), 20))
        limit_entries = max(1, min(int(max_entries or settings.WORKSPACE_TREE_MAX_ENTRIES), 10000))
        truncated = False
        reason = ""
        count = 0

        def visit(directory: Path, relative: str, depth: int) -> List[Dict[str, Any]]:
            nonlocal count, truncated, reason
            if depth >= limit_depth:
                try:
                    has_children = any(directory.iterdir())
                except OSError:
                    has_children = False
                if has_children:
                    truncated = True
                    reason = reason or "max_depth"
                return []
            children: List[Dict[str, Any]] = []
            try:
                entries = sorted(directory.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
            except OSError:
                return children
            for entry in entries:
                if count >= limit_entries:
                    truncated = True
                    reason = reason or "too_many_entries"
                    break
                if entry.name in self.SKIPPED_DIRS:
                    continue
                try:
                    resolved = entry.resolve()
                    resolved.relative_to(root)
                except (OSError, ValueError):
                    continue
                child_relative = f"{relative}/{entry.name}".strip("/")
                if entry.is_dir():
                    count += 1
                    children.append({
                        "name": entry.name,
                        "path": child_relative,
                        "type": "directory",
                        "children": visit(entry, child_relative, depth + 1),
                    })
                    continue
                if entry.is_file():
                    count += 1
                    mime_type = self._mime_type(entry)
                    children.append({
                        "name": entry.name,
                        "path": child_relative,
                        "type": "file",
                        "size": entry.stat().st_size,
                        "mime": mime_type,
                    })
            return children

        return {
            "name": workspace.get("name") or "workspace",
            "path": "",
            "type": "directory",
            "children": visit(root, "", 0),
            "truncated": truncated,
            "reason": reason,
            "maxDepth": limit_depth,
            "maxEntries": limit_entries,
        }

    def read_content(self, workspace: Dict[str, Any], path: str) -> Dict[str, Any]:
        root = self.workspace_root(workspace)
        target = self._resolve_existing(root, path)
        if not target.is_file():
            raise FileNotFoundError("文件不存在")
        size = target.stat().st_size
        mime_type = self._mime_type(target)
        with target.open("rb") as file:
            sample = file.read(min(size, settings.WORKSPACE_FILE_PREVIEW_MAX_BYTES + 1, 4096))
        is_text = self._is_text_file(target, mime_type, sample)
        content = ""
        truncated = False
        encoding = ""
        if is_text:
            with target.open("rb") as file:
                data = file.read(settings.WORKSPACE_FILE_PREVIEW_MAX_BYTES + 1)
            truncated = len(data) > settings.WORKSPACE_FILE_PREVIEW_MAX_BYTES
            content = data[: settings.WORKSPACE_FILE_PREVIEW_MAX_BYTES].decode("utf-8", errors="replace")
            encoding = "utf-8"
        return {
            "path": self._clean_relative_path(path),
            "name": target.name,
            "mime": mime_type,
            "size": size,
            "sha256": self._sha256_file(target),
            "isText": is_text,
            "encoding": encoding,
            "content": content,
            "truncated": truncated,
        }

    def write_content(self, workspace: Dict[str, Any], path: str, content: str, base_sha256: str) -> Dict[str, Any]:
        root = self.workspace_root(workspace)
        root.mkdir(parents=True, exist_ok=True)
        target = self._resolve_for_write(root, path)
        data = str(content or "").encode("utf-8")
        if len(data) > settings.WORKSPACE_FILE_EDIT_MAX_BYTES:
            raise ValueError("文件内容超过可编辑大小限制")
        if target.exists() and target.is_file() and target.stat().st_size > settings.WORKSPACE_FILE_EDIT_MAX_BYTES:
            raise ValueError("当前文件超过可编辑大小限制，请下载后在本地编辑")
        current_sha = self._sha256_file(target) if target.exists() and target.is_file() else ""
        if str(base_sha256 or "") != current_sha:
            raise WorkspaceConflictError(
                "File has been modified since it was opened.",
                {
                    "error": "file_conflict",
                    "message": "File has been modified since it was opened.",
                    "currentSha256": current_sha,
                    "baseSha256": str(base_sha256 or ""),
                    "path": self._clean_relative_path(path),
                },
            )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return self.read_content(workspace, path)

    def upload_file(self, workspace: Dict[str, Any], directory: str, filename: str, data: bytes) -> Dict[str, Any]:
        if len(data) > settings.WORKSPACE_UPLOAD_MAX_BYTES:
            raise ValueError("上传文件超过大小限制")
        root = self.workspace_root(workspace)
        root.mkdir(parents=True, exist_ok=True)
        clean_dir = self._clean_relative_path(directory, allow_empty=True)
        safe_name = self._safe_upload_name(filename)
        target_path = f"{clean_dir}/{safe_name}".strip("/")
        target = self._resolve_for_write(root, target_path)
        if target.exists() or target.is_symlink():
            raise WorkspaceConflictError(
                "文件已存在",
                {"error": "file_exists", "path": target_path},
            )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return self.read_content(workspace, target_path)

    def download_path(self, workspace: Dict[str, Any], path: str) -> Path:
        root = self.workspace_root(workspace)
        target = self._resolve_existing(root, path)
        if not target.is_file():
            raise FileNotFoundError("文件不存在")
        return target
