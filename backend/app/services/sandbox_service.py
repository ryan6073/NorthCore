import asyncio
import shutil
from pathlib import Path
from typing import Dict, List, Optional

from app.config import settings
from app.database import update_sandbox
from app.services.sandbox_runtime import PersistentDockerShell


class SandboxService:
    SKIPPED_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache"}

    def __init__(
        self,
        image: Optional[str] = None,
        network: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
        max_output_chars: Optional[int] = None,
        workspace_root: Optional[str] = None,
    ) -> None:
        self.image = image or settings.SANDBOX_IMAGE
        configured_network = network or settings.SANDBOX_NETWORK
        self.network = configured_network if settings.SANDBOX_ALLOW_NETWORK else "none"
        self.timeout_seconds = timeout_seconds or settings.SANDBOX_COMMAND_TIMEOUT_SECONDS
        self.max_output_chars = max_output_chars or settings.SANDBOX_MAX_OUTPUT_BYTES or settings.SANDBOX_MAX_OUTPUT_CHARS
        self.workspace_root = Path(workspace_root or settings.SANDBOX_WORKSPACE_ROOT)
        self._sessions: Dict[str, PersistentDockerShell] = {}
        self._environment_states: Dict[str, Dict[str, object]] = {}

    def build_workspace_path(self, workspace_id: str) -> Path:
        return self.workspace_root / workspace_id

    def prepare_workspace(self, workspace_id: str) -> Path:
        path = self.build_workspace_path(workspace_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    async def start_container(self, sandbox_id: str, workspace_path: str) -> str:
        workspace = Path(workspace_path)
        workspace.mkdir(parents=True, exist_ok=True)
        print(
            f"[SandboxDocker] starting sandbox={sandbox_id} image={self.image} "
            f"network={self.network} workspace={workspace.resolve()}",
            flush=True,
        )
        command = [
            "docker",
            "run",
            "-d",
            "--rm",
            "--network",
            self.network,
            "--cpus",
            str(settings.SANDBOX_CPUS),
            "--memory",
            str(settings.SANDBOX_MEMORY),
            "--pids-limit",
            str(settings.SANDBOX_PIDS_LIMIT),
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "-e",
            "HOME=/workspace",
            "-e",
            "DEBIAN_FRONTEND=noninteractive",
            "-e",
            "PIP_NO_INPUT=1",
            "-e",
            "GIT_TERMINAL_PROMPT=0",
            "-e",
            "CI=true",
            "-e",
            "NONINTERACTIVE=1",
            "-v",
            f"{workspace.resolve()}:/workspace",
            "-w",
            "/workspace",
        ]
        if settings.SANDBOX_RUN_AS_USER:
            command.extend(["--user", settings.SANDBOX_RUN_AS_USER])
        if settings.SANDBOX_READ_ONLY_ROOTFS:
            command.extend(["--read-only", "--tmpfs", "/tmp:rw,size=256m"])
        command.extend([
            self.image,
            "tail",
            "-f",
            "/dev/null",
        ])
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            error = stderr.decode("utf-8", errors="replace").strip() or "docker run failed"
            update_sandbox(sandbox_id, status="failed", error=error)
            print(f"[SandboxDocker] start failed sandbox={sandbox_id} error={error}", flush=True)
            raise RuntimeError(error)
        container_id = stdout.decode("utf-8", errors="replace").strip()
        update_sandbox(sandbox_id, status="running", container_id=container_id)
        print(f"[SandboxDocker] started sandbox={sandbox_id} container={container_id[:12]}", flush=True)
        return container_id

    async def stop_container(self, sandbox_id: str, container_id: Optional[str], final_status: str = "cancelled") -> None:
        if not container_id:
            update_sandbox(sandbox_id, status=final_status)
            print(f"[SandboxDocker] stop skipped sandbox={sandbox_id} final={final_status}", flush=True)
            return
        print(f"[SandboxDocker] stopping sandbox={sandbox_id} container={container_id[:12]} final={final_status}", flush=True)
        await self.close_session(container_id)
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "stop",
            container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        update_sandbox(sandbox_id, status=final_status)
        print(f"[SandboxDocker] stopped sandbox={sandbox_id} final={final_status}", flush=True)

    async def execute(self, container_id: str, command: str, timeout_seconds: Optional[int] = None) -> Dict[str, object]:
        session = self._sessions.get(container_id)
        if not session:
            print(f"[SandboxShell] open persistent shell container={container_id[:12]}", flush=True)
            session = PersistentDockerShell(
                container_id=container_id,
                timeout_seconds=self.timeout_seconds,
                max_output_chars=self.max_output_chars,
            )
            self._sessions[container_id] = session
        return await session.run(command, timeout_seconds=timeout_seconds)

    def get_environment_state(self, container_id: str) -> Dict[str, object]:
        return dict(self._environment_states.get(container_id, {}))

    def update_environment_state(self, container_id: str, updates: Dict[str, object]) -> Dict[str, object]:
        state = self.get_environment_state(container_id)
        state.update(updates)
        self._environment_states[container_id] = state
        return dict(state)

    async def close_session(self, container_id: str) -> None:
        session = self._sessions.pop(container_id, None)
        if session:
            await session.close()
        self._environment_states.pop(container_id, None)

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

    def safe_read_workspace_file(
        self,
        workspace_path: str,
        relative_path: str,
        max_bytes: Optional[int] = None,
    ) -> Dict[str, object]:
        workspace = Path(workspace_path).resolve()
        target = (workspace / relative_path).resolve()
        if workspace not in target.parents and target != workspace:
            raise ValueError("file path escapes sandbox workspace")
        if not target.exists() or not target.is_file():
            raise FileNotFoundError(relative_path)
        limit = max_bytes or settings.SANDBOX_WORKSPACE_FILE_MAX_BYTES
        size = target.stat().st_size
        if size > limit:
            raise ValueError(f"file too large: {size} bytes")
        content = target.read_text(encoding="utf-8")
        return {
            "path": relative_path,
            "size": size,
            "content": content,
        }

    def scan_workspace(
        self,
        workspace_path: str,
        tracked_paths: Optional[List[str]] = None,
        max_files: Optional[int] = None,
        max_bytes: Optional[int] = None,
    ) -> Dict[str, object]:
        workspace = Path(workspace_path).resolve()
        tracked_set = set(tracked_paths or [])
        tracked = []
        untracked = []
        skipped = []
        max_count = max_files or settings.SANDBOX_WORKSPACE_SCAN_MAX_FILES
        max_size = max_bytes or settings.SANDBOX_WORKSPACE_FILE_MAX_BYTES
        scanned = 0
        if not workspace.exists():
            return {"tracked": [], "untracked": [], "skipped": [{"path": "", "reason": "workspace missing"}]}
        for path in workspace.rglob("*"):
            try:
                relative = path.relative_to(workspace).as_posix()
            except ValueError:
                continue
            parts = set(Path(relative).parts)
            if parts & self.SKIPPED_DIRS:
                if path.is_dir() and relative in self.SKIPPED_DIRS:
                    skipped.append({"path": relative, "reason": "ignored directory"})
                continue
            if not path.is_file():
                continue
            scanned += 1
            if scanned > max_count:
                skipped.append({"path": relative, "reason": "scan file limit exceeded"})
                break
            size = path.stat().st_size
            if size > max_size:
                skipped.append({"path": relative, "reason": f"file too large: {size} bytes"})
                continue
            item = {"path": relative, "size": size}
            if relative in tracked_set:
                tracked.append(item)
            else:
                untracked.append(item)
        return {"tracked": tracked, "untracked": untracked, "skipped": skipped}

    def maybe_cleanup_workspace(self, workspace_path: str, final_status: str) -> None:
        keep_statuses = {
            item.strip()
            for item in settings.SANDBOX_KEEP_WORKSPACE_ON_STATUSES.split(",")
            if item.strip()
        }
        if final_status in keep_statuses:
            return
        if final_status == "completed" and not settings.SANDBOX_CLEANUP_COMPLETED_WORKSPACE:
            return
        self.cleanup_workspace(workspace_path)

    def cleanup_workspace(self, workspace_path: str) -> None:
        path = Path(workspace_path)
        if path.exists() and path.is_dir():
            shutil.rmtree(path)
