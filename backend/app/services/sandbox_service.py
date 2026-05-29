import asyncio
import shutil
from pathlib import Path
from typing import Dict, Optional

from app.config import settings
from app.database import update_sandbox


class SandboxService:
    def __init__(
        self,
        image: Optional[str] = None,
        network: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
        max_output_chars: Optional[int] = None,
        workspace_root: Optional[str] = None,
    ) -> None:
        self.image = image or settings.SANDBOX_IMAGE
        self.network = network or settings.SANDBOX_NETWORK
        self.timeout_seconds = timeout_seconds or settings.SANDBOX_TIMEOUT_SECONDS
        self.max_output_chars = max_output_chars or settings.SANDBOX_MAX_OUTPUT_CHARS
        self.workspace_root = Path(workspace_root or settings.SANDBOX_WORKSPACE_ROOT)

    def build_workspace_path(self, run_id: str) -> Path:
        return self.workspace_root / run_id

    def prepare_workspace(self, run_id: str) -> Path:
        path = self.build_workspace_path(run_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    async def start_container(self, sandbox_id: str, workspace_path: str) -> str:
        workspace = Path(workspace_path)
        workspace.mkdir(parents=True, exist_ok=True)
        command = [
            "docker",
            "run",
            "-d",
            "--rm",
            "--network",
            self.network,
            "-v",
            f"{workspace.resolve()}:/workspace",
            "-w",
            "/workspace",
            self.image,
            "tail",
            "-f",
            "/dev/null",
        ]
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            error = stderr.decode("utf-8", errors="replace").strip() or "docker run failed"
            update_sandbox(sandbox_id, status="failed", error=error)
            raise RuntimeError(error)
        container_id = stdout.decode("utf-8", errors="replace").strip()
        update_sandbox(sandbox_id, status="running", container_id=container_id)
        return container_id

    async def stop_container(self, sandbox_id: str, container_id: Optional[str], final_status: str = "cancelled") -> None:
        if not container_id:
            update_sandbox(sandbox_id, status=final_status)
            return
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "stop",
            container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        update_sandbox(sandbox_id, status=final_status)

    async def execute(self, container_id: str, command: str, timeout_seconds: Optional[int] = None) -> Dict[str, object]:
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "exec",
            container_id,
            "sh",
            "-lc",
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout_seconds or self.timeout_seconds,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return {
                "command": command,
                "exitCode": 124,
                "stdout": "",
                "stderr": "Command timed out",
                "timedOut": True,
            }
        return {
            "command": command,
            "exitCode": proc.returncode,
            "stdout": stdout.decode("utf-8", errors="replace")[: self.max_output_chars],
            "stderr": stderr.decode("utf-8", errors="replace")[: self.max_output_chars],
            "timedOut": False,
        }

    def safe_write_file(self, workspace_path: str, relative_path: str, content: str) -> Path:
        workspace = Path(workspace_path).resolve()
        target = (workspace / relative_path).resolve()
        if workspace not in target.parents and target != workspace:
            raise ValueError("file path escapes sandbox workspace")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def safe_read_file(self, workspace_path: str, relative_path: str) -> str:
        workspace = Path(workspace_path).resolve()
        target = (workspace / relative_path).resolve()
        if workspace not in target.parents and target != workspace:
            raise ValueError("file path escapes sandbox workspace")
        return target.read_text(encoding="utf-8")

    def cleanup_workspace(self, workspace_path: str) -> None:
        path = Path(workspace_path)
        if path.exists() and path.is_dir():
            shutil.rmtree(path)
