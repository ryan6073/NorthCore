import asyncio
import re
import shlex
import time
import uuid
from typing import Dict, List, Optional


class PersistentDockerShell:
    """A per-container shell session that preserves cwd and exported env."""

    _SENTINEL_PREFIX = "__AGENTHUB_CMD_DONE__"
    _REPLAY_READY_PREFIX = "__AGENTHUB_REPLAY_READY__"
    _ENV_CMD_PATTERN = re.compile(
        r"^\s*(?:"
        r"cd\s+\S+"
        r"|export\s+[A-Za-z_][A-Za-z0-9_]*"
        r"|source\s+\S+"
        r"|\.\s+\S+"
        r"|(?:conda|mamba|micromamba)\s+activate\s+\S+"
        r")"
    )
    _ENV_DEACTIVATE_PATTERN = re.compile(
        r"^\s*(?:"
        r"(?:conda|mamba|micromamba)\s+deactivate"
        r"|deactivate"
        r")"
    )

    def __init__(
        self,
        container_id: str,
        timeout_seconds: int,
        max_output_chars: int,
        workdir: str = "/workspace",
    ) -> None:
        self.container_id = container_id
        self.timeout_seconds = timeout_seconds
        self.max_output_chars = max_output_chars
        self.workdir = workdir
        self.cwd = workdir
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._lock = asyncio.Lock()
        self._env_replay_commands: List[str] = []

    async def close(self) -> None:
        if self._proc and self._proc.returncode is None:
            try:
                self._proc.kill()
            except ProcessLookupError:
                pass
            try:
                await self._proc.wait()
            except ProcessLookupError:
                pass
        self._proc = None

    async def run(self, command: str, timeout_seconds: Optional[int] = None) -> Dict[str, object]:
        async with self._lock:
            await self._ensure_started()
            timeout = timeout_seconds or self.timeout_seconds
            sentinel = f"{self._SENTINEL_PREFIX}_{uuid.uuid4().hex}"
            stdout_marker = f"__AGENTHUB_STDOUT__{uuid.uuid4().hex}"
            stderr_marker = f"__AGENTHUB_STDERR__{uuid.uuid4().hex}"
            end_marker = f"__AGENTHUB_END__{uuid.uuid4().hex}"
            stdout_path = f"/tmp/agenthub-{uuid.uuid4().hex}.stdout"
            stderr_path = f"/tmp/agenthub-{uuid.uuid4().hex}.stderr"
            wrapped = (
                f"__agenthub_stdout={shlex.quote(stdout_path)}\n"
                f"__agenthub_stderr={shlex.quote(stderr_path)}\n"
                "{\n"
                f"{command}\n"
                "} >\"$__agenthub_stdout\" 2>\"$__agenthub_stderr\"\n"
                "__agenthub_rc=$?; __agenthub_cwd=$(pwd 2>/dev/null || echo ''); "
                f"printf '\\n%s:%s:%s\\n' '{sentinel}' \"$__agenthub_rc\" \"$__agenthub_cwd\"\n"
                f"printf '%s\\n' '{stdout_marker}'\n"
                "cat \"$__agenthub_stdout\" 2>/dev/null || true\n"
                f"printf '\\n%s\\n' '{stderr_marker}'\n"
                "cat \"$__agenthub_stderr\" 2>/dev/null || true\n"
                f"printf '\\n%s\\n' '{end_marker}'\n"
                "rm -f \"$__agenthub_stdout\" \"$__agenthub_stderr\"\n"
            )
            assert self._proc and self._proc.stdin and self._proc.stdout
            self._proc.stdin.write(wrapped.encode("utf-8"))
            await self._proc.stdin.drain()

            started = time.time()
            stdout_lines: List[str] = []
            stderr_lines: List[str] = []
            section = "prelude"
            exit_code = 0
            sentinel_re = re.compile(rf"{re.escape(sentinel)}:(-?\d+):(.*)")
            try:
                while True:
                    remaining = timeout - (time.time() - started)
                    if remaining <= 0:
                        raise asyncio.TimeoutError()
                    raw_line = await asyncio.wait_for(self._proc.stdout.readline(), timeout=remaining)
                    if not raw_line:
                        self._proc = None
                        raise RuntimeError("Sandbox shell exited unexpectedly")
                    line = raw_line.decode("utf-8", errors="replace")
                    match = sentinel_re.search(line.rstrip("\r\n"))
                    if match:
                        try:
                            exit_code = int(match.group(1))
                        except ValueError:
                            exit_code = 1
                        cwd = match.group(2).strip()
                        if cwd:
                            self.cwd = cwd
                        section = "await_stdout_marker"
                        continue
                    stripped = line.rstrip("\r\n")
                    if stripped == stdout_marker:
                        section = "stdout"
                        continue
                    if stripped == stderr_marker:
                        section = "stderr"
                        continue
                    if stripped == end_marker:
                        break
                    if section == "stdout":
                        stdout_lines.append(line)
                    elif section == "stderr":
                        stderr_lines.append(line)
            except asyncio.TimeoutError:
                partial_stdout = self._trim_output("".join(stdout_lines).strip())
                partial_stderr = self._trim_output("".join(stderr_lines).strip())
                await self._kill_non_init_processes()
                await self.close()
                return {
                    "command": command,
                    "exitCode": 124,
                    "stdout": partial_stdout,
                    "stderr": "\n".join(part for part in [partial_stderr, "Command timed out"] if part),
                    "timedOut": True,
                    "cwd": self.cwd,
                }

            if exit_code == 0:
                self._record_environment_commands(command)
            return {
                "command": command,
                "exitCode": exit_code,
                "stdout": self._trim_output("".join(stdout_lines).strip()),
                "stderr": self._trim_output("".join(stderr_lines).strip()),
                "timedOut": False,
                "cwd": self.cwd,
            }

    async def _ensure_started(self) -> None:
        if self._proc and self._proc.returncode is None:
            return
        self._proc = await asyncio.create_subprocess_exec(
            "docker",
            "exec",
            "-i",
            "-w",
            self.cwd or self.workdir,
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
            self.container_id,
            "sh",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            stdin=asyncio.subprocess.PIPE,
        )
        await self._replay_environment()

    async def _replay_environment(self) -> None:
        if not self._proc or not self._proc.stdin or not self._proc.stdout:
            return
        replay_lines = list(self._env_replay_commands)
        if self.cwd and self.cwd != self.workdir:
            replay_lines.append(f"cd {shlex.quote(self.cwd)}")
        if not replay_lines:
            return
        marker = f"{self._REPLAY_READY_PREFIX}_{uuid.uuid4().hex}"
        script = "\n".join(replay_lines + [f"printf '%s\\n' {shlex.quote(marker)}"]) + "\n"
        try:
            self._proc.stdin.write(script.encode("utf-8"))
            await self._proc.stdin.drain()
            deadline = time.time() + 30
            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    raise asyncio.TimeoutError()
                raw_line = await asyncio.wait_for(self._proc.stdout.readline(), timeout=remaining)
                if not raw_line:
                    raise RuntimeError("Sandbox shell exited during environment replay")
                if raw_line.decode("utf-8", errors="replace").strip() == marker:
                    return
        except Exception:
            self._env_replay_commands = []
            await self.close()
            self._proc = await asyncio.create_subprocess_exec(
                "docker",
                "exec",
                "-i",
                "-w",
                self.workdir,
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
                self.container_id,
                "sh",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.PIPE,
            )

    async def _kill_non_init_processes(self) -> None:
        script = (
            'self=$$; '
            'for p in /proc/[0-9]*; do '
            'pid=${p##*/}; '
            '[ "$pid" = "1" ] && continue; '
            '[ "$pid" = "$self" ] && continue; '
            'kill -KILL "$pid" 2>/dev/null || true; '
            'done'
        )
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker",
                "exec",
                self.container_id,
                "sh",
                "-lc",
                script,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.communicate(), timeout=5)
        except Exception:
            pass

    @classmethod
    def _split_shell_commands(cls, command: str) -> List[str]:
        parts = re.split(r"\s*(?:&&|\|\||;)\s*", command or "")
        return [part.strip() for part in parts if part.strip()]

    def _record_environment_commands(self, command: str) -> None:
        for part in self._split_shell_commands(command):
            if self._ENV_DEACTIVATE_PATTERN.match(part):
                self._env_replay_commands = [
                    existing
                    for existing in self._env_replay_commands
                    if not re.search(r"(?:conda|mamba|micromamba)\s+activate|\.\s+\S*activate|source\s+\S*activate", existing)
                ]
                continue
            if not self._ENV_CMD_PATTERN.match(part):
                continue
            if part.startswith("cd "):
                self._env_replay_commands = [existing for existing in self._env_replay_commands if not existing.startswith("cd ")]
            if part.startswith("export "):
                key = part.split("=", 1)[0].strip()
                self._env_replay_commands = [
                    existing for existing in self._env_replay_commands
                    if not existing.startswith(key)
                ]
            if part not in self._env_replay_commands:
                self._env_replay_commands.append(part)

    def _trim_output(self, output: str) -> str:
        if len(output) <= self.max_output_chars:
            return output
        head_limit = int(self.max_output_chars * 0.4)
        tail_limit = self.max_output_chars - head_limit
        skipped = len(output) - head_limit - tail_limit
        return (
            f"{output[:head_limit]}\n\n"
            f"...(middle {skipped} chars folded)...\n\n"
            f"{output[-tail_limit:]}"
        )
