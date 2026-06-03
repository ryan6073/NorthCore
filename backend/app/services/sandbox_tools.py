import json
import re
import shlex
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.config import settings
from app.database import create_id, get_agent_run, get_sandbox_file, list_sandbox_files, now_text
from app.services.file_version_service import FileVersionService
from app.services.sandbox_service import SandboxService


SANDBOX_TOOL_SPECS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "inspect_environment",
            "description": "Inspect OS, architecture, runtime tools, cwd, and sandbox network policy.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_dependency_manifest",
            "description": "Read dependency manifests from the sandbox workspace.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "setup_environment",
            "description": "Create or activate the project environment and install dependencies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "packageManager": {"type": "string"},
                    "installDependencies": {"type": "boolean"},
                    "createPythonEnv": {"type": "boolean"},
                    "dependencies": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files currently tracked in the sandbox workspace.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scan_workspace",
            "description": "Scan actual files in /workspace and report tracked/untracked files.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_workspace_file",
            "description": "Read an actual workspace file, including files not tracked in the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "import_workspace_file",
            "description": "Import an actual workspace file into the tracked sandbox file version system.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a tracked sandbox file by relative path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write a full file into the sandbox using optimistic locking. For existing files, call read_file first and use the returned currentVersion/baseVersion; baseVersion=0 is only for new files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "baseVersion": {"type": "integer"},
                },
                "required": ["path", "content", "baseVersion"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a non-interactive shell command in the persistent sandbox shell.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeoutSeconds": {"type": "integer"},
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate_command",
            "description": "Run a command as an explicit validation for the current step.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeoutSeconds": {"type": "integer"},
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "Finish the current sandbox step with success or failure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "summary": {"type": "string"},
                    "changedFiles": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "nextActions": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "validationCommandId": {"type": "string"},
                    "validationSkippedReason": {"type": "string"},
                },
                "required": ["success", "summary"],
                "additionalProperties": False,
            },
        },
    },
]


def safe_relative_path(path: str) -> str:
    cleaned = (path or "").strip().replace("\\", "/")
    if not cleaned or cleaned.startswith("/") or ".." in Path(cleaned).parts:
        raise ValueError("非法文件路径")
    return cleaned


def command_policy_error(command: str) -> Optional[str]:
    normalized = (command or "").strip()
    if not normalized:
        return "命令不能为空"
    if re.search(r"(^|\s)(?:2>|&>)\s*/dev/null", normalized):
        return "命令屏蔽了错误输出，沙箱要求保留 stderr 以便诊断"
    if re.search(r"\b(?:make|cmake|npm|pnpm|yarn|pip|uv|poetry|pytest|bash|sh)\b[\s\S]*\|\s*(?:head|tail|grep)\b", normalized):
        return "耗时命令不能直接通过管道接 head/tail/grep 截断输出"
    return None


class SandboxToolExecutor:
    def __init__(
        self,
        sandbox_service: SandboxService,
        file_service: FileVersionService,
        sandbox: Dict[str, Any],
        run_id: str,
        container_id: str,
        step_id: str,
        environment_profile: Optional[Dict[str, Any]] = None,
        command_callback: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    ) -> None:
        self.sandbox_service = sandbox_service
        self.file_service = file_service
        self.sandbox = sandbox
        self.run_id = run_id
        self.container_id = container_id
        self.step_id = step_id
        self.environment_profile = environment_profile or {}
        self.command_callback = command_callback
        run = get_agent_run(run_id) or {}
        self.workspace_action_context = (run.get("dag") or {}).get("workspaceActionContext") or {}

    def _write_scope_error(self, path: str) -> Optional[Dict[str, Any]]:
        if self.workspace_action_context.get("action") != "modify_existing":
            return None
        allowed = {
            str(item.get("path"))
            for item in self.workspace_action_context.get("targetFiles") or []
            if isinstance(item, dict) and item.get("path")
        }
        allowed.update(str(path) for path in self.workspace_action_context.get("allowedRelatedFiles") or [])
        if path not in allowed:
            return {
                "ok": False,
                "error": "修改类任务不允许写入非 targetFiles/allowedRelatedFiles 文件",
                "path": path,
                "extraChangedFile": {
                    "path": path,
                    "reason": "not in workspaceActionContext allowed write scope",
                },
            }
        return None

    async def execute(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        print(f"[SandboxTool] start run={self.run_id} step={self.step_id} tool={name} args={arguments}", flush=True)
        if name == "inspect_environment":
            result = await self._inspect_environment()
        elif name == "read_dependency_manifest":
            result = self._read_dependency_manifest()
        elif name == "setup_environment":
            result = await self._setup_environment(arguments)
        elif name == "list_files":
            result = {"ok": True, "files": list_sandbox_files(self.run_id)}
        elif name == "scan_workspace":
            result = self._scan_workspace()
        elif name == "read_workspace_file":
            result = self._read_workspace_file(arguments)
        elif name == "import_workspace_file":
            result = self._import_workspace_file(arguments)
        elif name == "read_file":
            result = self._read_file(arguments)
        elif name == "write_file":
            result = self._write_file(arguments)
        elif name == "run_command":
            result = await self._run_command(arguments)
        elif name == "validate_command":
            result = await self._validate_command(arguments)
        elif name == "finish":
            result = self._finish(arguments)
        else:
            result = {"ok": False, "error": f"不支持的沙箱工具: {name}"}
        status = "ok" if result.get("ok") else "failed"
        print(f"[SandboxTool] done run={self.run_id} step={self.step_id} tool={name} status={status}", flush=True)
        return result

    async def _inspect_environment(self) -> Dict[str, Any]:
        probes = {
            "arch": "uname -m",
            "os": "cat /etc/os-release",
            "cwd": "pwd",
            "python": "python --version",
            "python3": "python3 --version",
            "pip": "python -m pip --version",
            "uv": "uv --version",
            "node": "node --version",
            "npm": "npm --version",
            "conda": "conda --version",
        }
        tools: Dict[str, Any] = {}
        command_results: List[Dict[str, Any]] = []
        for name, command in probes.items():
            result = await self._execute_backend_command(command, timeout_seconds=20)
            command_results.append(result)
            tools[name] = {
                "available": int(result.get("exitCode") or 0) == 0,
                "version": (result.get("stdout") or result.get("stderr") or "").splitlines()[0]
                if (result.get("stdout") or result.get("stderr")) else "",
            }
        environment_state = self.sandbox_service.update_environment_state(
            self.container_id,
            {
                "workspace": "/workspace",
                "network": self.sandbox.get("network") or settings.SANDBOX_NETWORK,
                "allowNetwork": (self.sandbox.get("network") or settings.SANDBOX_NETWORK) != "none",
                "lastInspection": now_text(),
            },
        )
        return {
            "ok": True,
            "environment": {
                "tools": tools,
                "state": environment_state,
            },
            "commandResults": command_results,
        }

    def _read_dependency_manifest(self) -> Dict[str, Any]:
        manifests = self._dependency_manifest_payload()
        return {
            "ok": True,
            "manifests": manifests,
            "detected": {
                "python": bool(manifests.get("requirements.txt") or manifests.get("pyproject.toml")),
                "node": bool(manifests.get("package.json")),
                "npmLock": bool(manifests.get("package-lock.json")),
                "pnpmLock": bool(manifests.get("pnpm-lock.yaml")),
                "yarnLock": bool(manifests.get("yarn.lock")),
            },
        }

    async def _setup_environment(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        command_results: List[Dict[str, Any]] = []
        manifests = self._dependency_manifest_payload()
        package_manager = str(
            arguments.get("packageManager")
            or self.environment_profile.get("packageManager")
            or "uv"
        ).strip().lower() or "uv"
        install_dependencies = arguments.get("installDependencies")
        if install_dependencies is None:
            install_dependencies = True
        requested_dependencies = [
            str(item).strip()
            for item in (arguments.get("dependencies") or [])
            if str(item).strip()
        ]

        sandbox_network = str(self.sandbox.get("network") or settings.SANDBOX_NETWORK)
        allow_network = bool(self.environment_profile.get("allowNetwork", settings.SANDBOX_ALLOW_NETWORK))
        allow_network = allow_network and sandbox_network != "none"

        node_project = bool(manifests.get("package.json"))
        explicit_python_env = bool(
            arguments.get("createPythonEnv")
            or self.environment_profile.get("pythonVersion")
            or requested_dependencies
        )
        python_project = bool(
            manifests.get("requirements.txt")
            or manifests.get("pyproject.toml")
            or requested_dependencies
            or (not node_project and explicit_python_env)
        )
        needs_dependency_install = bool(
            install_dependencies and (
                manifests.get("requirements.txt")
                or manifests.get("pyproject.toml")
                or manifests.get("package.json")
                or requested_dependencies
            )
        )

        environment_state = self.sandbox_service.update_environment_state(
            self.container_id,
            {
                "workspace": "/workspace",
                "packageManager": package_manager,
                "network": sandbox_network,
                "allowNetwork": allow_network,
                "lastSetupStatus": "running",
            },
        )

        if needs_dependency_install and not allow_network:
            environment_state = self.sandbox_service.update_environment_state(
                self.container_id,
                {"lastSetupStatus": "failed", "lastSetupError": "沙箱网络已关闭，无法安装依赖"},
            )
            return {
                "ok": False,
                "error": "沙箱网络已关闭，无法安装依赖；请使用预构建镜像、依赖缓存或 allowNetwork=true",
                "manifests": manifests,
                "environmentState": environment_state,
                "commandResults": command_results,
            }

        actual_package_manager = package_manager
        if python_project:
            uv_available = await self._command_succeeds("uv --version", command_results)
            if package_manager == "uv" and not uv_available and settings.SANDBOX_AUTO_INSTALL_UV and allow_network:
                install_uv = await self._execute_backend_command(
                    "python3 -m pip install --user uv || python -m pip install --user uv",
                    timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS,
                )
                command_results.append(install_uv)
                path_export = await self._execute_backend_command(
                    'export PATH="$HOME/.local/bin:$PATH"',
                    timeout_seconds=20,
                )
                command_results.append(path_export)
                uv_available = await self._command_succeeds("uv --version", command_results)

            if package_manager == "uv" and uv_available:
                create_venv = await self._execute_backend_command("uv venv .venv", timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS)
                command_results.append(create_venv)
                if int(create_venv.get("exitCode") or 0) != 0:
                    actual_package_manager = "pip"
                elif not manifests.get("pyproject.toml"):
                    init_project = await self._execute_backend_command(
                        "test -f pyproject.toml || uv init --bare --name agenthub-workspace",
                        timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS,
                    )
                    command_results.append(init_project)
                    if int(init_project.get("exitCode") or 0) != 0:
                        fallback_project = await self._execute_backend_command(
                            "python3 -c \"from pathlib import Path; "
                            "Path('pyproject.toml').write_text('[project]\\nname = \\\"agenthub-workspace\\\"\\nversion = \\\"0.1.0\\\"\\nrequires-python = \\\">=3.11\\\"\\ndependencies = []\\n', encoding='utf-8') "
                            "if not Path('pyproject.toml').exists() else None\"",
                            timeout_seconds=20,
                        )
                        command_results.append(fallback_project)
                        if int(fallback_project.get("exitCode") or 0) != 0:
                            environment_state = self.sandbox_service.update_environment_state(
                                self.container_id,
                                {"lastSetupStatus": "failed", "lastSetupError": "初始化 uv 项目失败"},
                            )
                            return {
                                "ok": False,
                                "error": "初始化 uv 项目失败",
                                "environmentState": environment_state,
                                "commandResults": command_results,
                            }
            else:
                actual_package_manager = "pip"

            if actual_package_manager != "uv":
                create_venv = await self._execute_backend_command(
                    "python3 -m venv .venv || python -m venv .venv",
                    timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS,
                )
                command_results.append(create_venv)
                if int(create_venv.get("exitCode") or 0) != 0:
                    environment_state = self.sandbox_service.update_environment_state(
                        self.container_id,
                        {"lastSetupStatus": "failed", "lastSetupError": "创建 Python 虚拟环境失败"},
                    )
                    return {
                        "ok": False,
                        "error": "创建 Python 虚拟环境失败",
                        "environmentState": environment_state,
                        "commandResults": command_results,
                    }

            activate = await self._execute_backend_command(". .venv/bin/activate", timeout_seconds=20)
            command_results.append(activate)
            if int(activate.get("exitCode") or 0) != 0:
                environment_state = self.sandbox_service.update_environment_state(
                    self.container_id,
                    {"lastSetupStatus": "failed", "lastSetupError": "激活 Python 虚拟环境失败"},
                )
                return {
                    "ok": False,
                    "error": "激活 Python 虚拟环境失败",
                    "environmentState": environment_state,
                    "commandResults": command_results,
                }

            python_install_pairs: List[Dict[str, Optional[str]]] = []
            if install_dependencies and requested_dependencies:
                dependency_args = " ".join(shlex.quote(item) for item in requested_dependencies)
                dependency_command = (
                    f"uv add {dependency_args}"
                    if actual_package_manager == "uv"
                    else f"python -m pip install {dependency_args}"
                )
                dependency_result = await self._execute_backend_command(
                    dependency_command,
                    timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS,
                )
                command_results.append(dependency_result)
                if int(dependency_result.get("exitCode") or 0) != 0:
                    environment_state = self.sandbox_service.update_environment_state(
                        self.container_id,
                        {"lastSetupStatus": "failed", "lastSetupError": f"依赖安装失败: {dependency_command}"},
                    )
                    return {
                        "ok": False,
                        "error": f"依赖安装失败: {dependency_command}",
                        "environmentState": environment_state,
                        "commandResults": command_results,
                    }
            if install_dependencies and manifests.get("requirements.txt"):
                python_install_pairs.append({
                    "primary": "uv pip install -r requirements.txt" if actual_package_manager == "uv" else None,
                    "fallback": "python -m pip install -r requirements.txt",
                })
            if install_dependencies and manifests.get("pyproject.toml"):
                python_install_pairs.append({
                    "primary": "uv pip install -e ." if actual_package_manager == "uv" else None,
                    "fallback": "python -m pip install -e .",
                })

            for pair in python_install_pairs:
                commands = [cmd for cmd in [pair.get("primary"), pair.get("fallback")] if cmd]
                installed = False
                last_command = ""
                for command in commands:
                    last_command = command
                    result = await self._execute_backend_command(command, timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS)
                    command_results.append(result)
                    if int(result.get("exitCode") or 0) == 0:
                        installed = True
                        break
                    if command.startswith("uv "):
                        actual_package_manager = "pip"
                if not installed:
                    environment_state = self.sandbox_service.update_environment_state(
                        self.container_id,
                        {"lastSetupStatus": "failed", "lastSetupError": f"依赖安装失败: {last_command}"},
                    )
                    return {
                        "ok": False,
                        "error": f"依赖安装失败: {last_command}",
                        "environmentState": environment_state,
                        "commandResults": command_results,
                    }

        if node_project and install_dependencies:
            npm_available = await self._command_succeeds("npm --version", command_results)
            if not npm_available:
                environment_state = self.sandbox_service.update_environment_state(
                    self.container_id,
                    {"lastSetupStatus": "failed", "lastSetupError": "检测到 package.json，但容器中没有 npm"},
                )
                return {
                    "ok": False,
                    "error": "检测到 package.json，但容器中没有 npm",
                    "environmentState": environment_state,
                    "commandResults": command_results,
                }
            npm_command = "npm ci" if manifests.get("package-lock.json") else "npm install"
            npm_result = await self._execute_backend_command(npm_command, timeout_seconds=settings.SANDBOX_SETUP_TIMEOUT_SECONDS)
            command_results.append(npm_result)
            if int(npm_result.get("exitCode") or 0) != 0:
                environment_state = self.sandbox_service.update_environment_state(
                    self.container_id,
                    {"lastSetupStatus": "failed", "lastSetupError": f"Node 依赖安装失败: {npm_command}"},
                )
                return {
                    "ok": False,
                    "error": f"Node 依赖安装失败: {npm_command}",
                    "environmentState": environment_state,
                    "commandResults": command_results,
                }

        environment_state = self.sandbox_service.update_environment_state(
            self.container_id,
            {
                "workspace": "/workspace",
                "pythonVenv": ".venv" if python_project else None,
                "venvActivated": bool(python_project),
                "packageManager": actual_package_manager,
                "nodeDependenciesInstalled": bool(node_project and install_dependencies),
                "network": sandbox_network,
                "allowNetwork": allow_network,
                "lastSetupStatus": "success",
                "lastSetupAt": now_text(),
            },
        )
        return {
            "ok": True,
            "manifests": self._dependency_manifest_payload(),
            "environmentState": environment_state,
            "commandResults": command_results,
        }

    def _dependency_manifest_payload(self) -> Dict[str, Any]:
        manifest_names = {
            "requirements.txt",
            "pyproject.toml",
            "package.json",
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
        }
        manifests: Dict[str, Any] = {}
        for file_meta in list_sandbox_files(self.run_id):
            path = str(file_meta.get("path") or "")
            if path not in manifest_names:
                continue
            detail = self.file_service.read_file(self.run_id, path)
            if not detail:
                continue
            content = detail.get("content") or ""
            parsed: Optional[Any] = None
            if path == "package.json":
                try:
                    parsed = json.loads(content)
                except Exception:
                    parsed = None
            manifests[path] = {
                "path": path,
                "version": detail.get("currentVersion"),
                "content": content,
                "parsed": parsed,
                "tracked": True,
            }
        for path in manifest_names - set(manifests.keys()):
            try:
                file_payload = self.sandbox_service.safe_read_workspace_file(
                    self.sandbox["workspacePath"],
                    path,
                )
            except (FileNotFoundError, UnicodeDecodeError, ValueError):
                continue
            content = str(file_payload.get("content") or "")
            parsed = None
            if path == "package.json":
                try:
                    parsed = json.loads(content)
                except Exception:
                    parsed = None
            manifests[path] = {
                "path": path,
                "version": None,
                "content": content,
                "parsed": parsed,
                "tracked": False,
            }
        return manifests

    async def _command_succeeds(self, command: str, command_results: List[Dict[str, Any]]) -> bool:
        result = await self._execute_backend_command(command, timeout_seconds=20)
        command_results.append(result)
        return int(result.get("exitCode") or 0) == 0

    async def _execute_backend_command(self, command: str, timeout_seconds: Optional[int] = None) -> Dict[str, Any]:
        started_at = now_text()
        started = time.time()
        effective_timeout = timeout_seconds or settings.SANDBOX_COMMAND_TIMEOUT_SECONDS
        print(
            f"[SandboxCommand] start run={self.run_id} step={self.step_id} "
            f"timeout={effective_timeout}s cmd={command}",
            flush=True,
        )
        result = await self.sandbox_service.execute(
            self.container_id,
            command,
            timeout_seconds=effective_timeout,
        )
        finished_at = now_text()
        duration_ms = int((time.time() - started) * 1000)
        stdout = str(result.get("stdout") or "")
        stderr = str(result.get("stderr") or "")
        enriched = {
            **result,
            "startedAt": started_at,
            "finishedAt": finished_at,
            "durationMs": duration_ms,
            "stdoutPreview": stdout[:4000],
            "stderrPreview": stderr[:4000],
        }
        if self.command_callback:
            await self.command_callback(enriched)
        print(
            f"[SandboxCommand] done run={self.run_id} step={self.step_id} "
            f"exit={enriched.get('exitCode')} timedOut={enriched.get('timedOut')} "
            f"durationMs={duration_ms}",
            flush=True,
        )
        return enriched

    def _read_file(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        path = safe_relative_path(str(arguments.get("path") or ""))
        detail = self.file_service.read_file(self.run_id, path)
        if not detail:
            return {"ok": False, "error": "文件不存在", "path": path}
        return {"ok": True, "file": detail}

    def _scan_workspace(self) -> Dict[str, Any]:
        tracked_files = list_sandbox_files(self.run_id)
        scan = self.sandbox_service.scan_workspace(
            self.sandbox["workspacePath"],
            tracked_paths=[str(item.get("path") or "") for item in tracked_files],
        )
        return {"ok": True, "workspaceScan": scan}

    def _read_workspace_file(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        path = safe_relative_path(str(arguments.get("path") or ""))
        try:
            file_payload = self.sandbox_service.safe_read_workspace_file(
                self.sandbox["workspacePath"],
                path,
            )
        except FileNotFoundError:
            return {"ok": False, "error": "workspace 文件不存在", "path": path}
        except (UnicodeDecodeError, ValueError) as exc:
            return {"ok": False, "error": str(exc), "path": path}
        tracked = get_sandbox_file(self.run_id, path)
        return {
            "ok": True,
            "file": {
                **file_payload,
                "tracked": bool(tracked),
                "currentVersion": tracked.get("currentVersion") if tracked else 0,
            },
        }

    def _import_workspace_file(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        path = safe_relative_path(str(arguments.get("path") or ""))
        scope_error = self._write_scope_error(path)
        if scope_error:
            return scope_error
        try:
            file_payload = self.sandbox_service.safe_read_workspace_file(
                self.sandbox["workspacePath"],
                path,
            )
        except FileNotFoundError:
            return {"ok": False, "error": "workspace 文件不存在", "path": path}
        except (UnicodeDecodeError, ValueError) as exc:
            return {"ok": False, "error": str(exc), "path": path}
        tracked = get_sandbox_file(self.run_id, path)
        base_version = int((tracked or {}).get("currentVersion") or 0)
        result = self.file_service.write_file(
            sandbox=self.sandbox,
            run_id=self.run_id,
            path=path,
            content=str(file_payload.get("content") or ""),
            base_version=base_version,
            step_id=self.step_id,
        )
        return {
            "ok": result.get("status") == "saved",
            "importedPath": path,
            **result,
        }

    def _write_file(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        path = safe_relative_path(str(arguments.get("path") or ""))
        scope_error = self._write_scope_error(path)
        if scope_error:
            return scope_error
        content = str(arguments.get("content") or "")
        try:
            base_version = int(arguments.get("baseVersion", 0))
        except (TypeError, ValueError):
            base_version = 0
        existing = self.file_service.read_file(self.run_id, path)
        if existing and int(existing.get("currentVersion") or 0) > 0 and base_version == 0:
            return {
                "ok": False,
                "status": "requires_read",
                "error": "已存在文件不能使用 baseVersion=0 覆盖；请先 read_file 获取当前内容和 currentVersion，再基于原内容更新并使用正确 baseVersion 写回。",
                "path": path,
                "currentVersion": int(existing.get("currentVersion") or 0),
            }
        result = self.file_service.write_file(
            sandbox=self.sandbox,
            run_id=self.run_id,
            path=path,
            content=content,
            base_version=base_version,
            step_id=self.step_id,
        )
        return {"ok": result.get("status") == "saved", **result}

    async def _run_command(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        command = str(arguments.get("command") or "").strip()
        policy_error = command_policy_error(command)
        if policy_error:
            timestamp = now_text()
            return {
                "ok": False,
                "command": {
                    "command": command,
                    "exitCode": 126,
                    "stdout": "",
                    "stderr": policy_error,
                    "timedOut": False,
                    "blockedByPolicy": True,
                    "startedAt": timestamp,
                    "finishedAt": timestamp,
                    "durationMs": 0,
                    "stdoutPreview": "",
                    "stderrPreview": policy_error,
                },
            }
        timeout = arguments.get("timeoutSeconds")
        try:
            timeout_seconds = int(timeout) if timeout is not None else None
        except (TypeError, ValueError):
            timeout_seconds = None
        result = await self._execute_backend_command(
            command,
            timeout_seconds=timeout_seconds or settings.SANDBOX_COMMAND_TIMEOUT_SECONDS,
        )
        return {"ok": int(result.get("exitCode") or 0) == 0, "command": result}

    async def _validate_command(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        command_result = await self._run_command(arguments)
        result = command_result.get("command") if isinstance(command_result.get("command"), dict) else {}
        validation = {
            "id": create_id("validation"),
            "command": result.get("command") or str(arguments.get("command") or ""),
            "success": bool(command_result.get("ok")),
            "result": result,
            "createdAt": now_text(),
        }
        return {
            "ok": validation["success"],
            "validationId": validation["id"],
            "validation": validation,
            "command": result,
        }

    def _finish(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        changed_files = arguments.get("changedFiles") if isinstance(arguments.get("changedFiles"), list) else []
        next_actions = arguments.get("nextActions") if isinstance(arguments.get("nextActions"), list) else []
        finish = {
            "success": bool(arguments.get("success")),
            "summary": str(arguments.get("summary") or ""),
            "changedFiles": [str(item) for item in changed_files],
            "nextActions": [str(item) for item in next_actions],
            "validationCommandId": str(arguments.get("validationCommandId") or ""),
            "validationSkippedReason": str(arguments.get("validationSkippedReason") or ""),
        }
        return {"ok": True, "finish": finish}
