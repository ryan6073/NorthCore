from pathlib import Path
from typing import Any, Dict, Optional

from app.database import (
    create_sandbox_file_version,
    get_sandbox_file,
    get_sandbox_file_version,
    resolve_sandbox_conflict,
)
from app.services.sandbox_service import SandboxService


class FileVersionService:
    def __init__(self, sandbox_service: Optional[SandboxService] = None) -> None:
        self.sandbox_service = sandbox_service or SandboxService()

    def write_file(
        self,
        sandbox: Dict[str, Any],
        run_id: str,
        path: str,
        content: str,
        base_version: int,
        step_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        result = create_sandbox_file_version(
            sandbox_id=sandbox["id"],
            run_id=run_id,
            file_path=path,
            content=content,
            base_version=base_version,
            created_by_step_id=step_id,
        )
        if result["status"] == "saved":
            self.sandbox_service.safe_write_file(sandbox["workspacePath"], path, content)
        return result

    def read_file(self, run_id: str, path: str) -> Optional[Dict[str, Any]]:
        file_meta = get_sandbox_file(run_id, path)
        if not file_meta:
            return None
        version = get_sandbox_file_version(file_meta["id"], file_meta["currentVersion"])
        return {
            **file_meta,
            "content": version["content"] if version else "",
            "version": version,
        }

    def download_file_path(self, run_detail: Dict[str, Any], path: str) -> Optional[Path]:
        clean_path = str(path or "").strip()
        candidate_path = Path(clean_path)
        if not clean_path or candidate_path.is_absolute() or ".." in candidate_path.parts:
            raise ValueError("非法文件路径")
        file_meta = get_sandbox_file(run_detail["id"], clean_path)
        if not file_meta:
            return None
        sandbox = run_detail.get("sandbox") or {}
        workspace_path = str(sandbox.get("workspacePath") or "").strip()
        if not workspace_path:
            return None
        workspace_root = Path(workspace_path).resolve()
        target_path = (workspace_root / clean_path).resolve()
        try:
            target_path.relative_to(workspace_root)
        except ValueError as exc:
            raise ValueError("非法文件路径") from exc
        if not target_path.is_file():
            return None
        return target_path

    def resolve_conflict(
        self,
        run_id: str,
        conflict_id: str,
        resolution: str,
        manual_content: Optional[str] = None,
        sandbox: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        resolved = resolve_sandbox_conflict(
            run_id=run_id,
            conflict_id=conflict_id,
            resolution=resolution,
            manual_content=manual_content,
        )
        if resolved and resolution in {"incoming", "manual"} and sandbox:
            content = resolved.get("incomingContent") if resolution == "incoming" else manual_content or ""
            self.sandbox_service.safe_write_file(sandbox["workspacePath"], resolved["filePath"], content)
        return resolved
