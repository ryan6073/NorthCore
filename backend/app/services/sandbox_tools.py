import json
import re
import shlex
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.config import settings
from app.database import (
    create_id,
    get_agent_run,
    get_agent_run_step,
    get_sandbox_file,
    is_workspace_mutation_lock_current,
    list_sandbox_files,
    now_text,
)
from app.services.dag_step_policy import (
    path_matches_patterns,
    safe_path_pattern,
    step_mutation_mode,
    step_read_paths,
    step_target_paths,
    step_write_tool_only,
)
from app.services.agent_tool_catalog_service import agent_has_tool
from app.services.file_version_service import FileVersionService
from app.services.office_file_service import office_write_block_reason
from app.services.sandbox_service import SandboxService
from app.services.workspace_sync_service import capture_workspace_snapshot, _restore_current_version_to_workspace


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
        agent: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.sandbox_service = sandbox_service
        self.file_service = file_service
        self.sandbox = sandbox
        self.run_id = run_id
        self.container_id = container_id
        self.step_id = step_id
        self.environment_profile = environment_profile or {}
        self.command_callback = command_callback
        self.agent = agent or {}
        run = get_agent_run(run_id) or {}
        self.run_mode = str(run.get("runMode") or "write")
        self.workspace_id = str(run.get("workspaceId") or "")
        self.lock_fencing_token = run.get("lockFencingToken")
        self.workspace_action_context = (run.get("dag") or {}).get("workspaceActionContext") or {}
        self.step = get_agent_run_step(step_id) or {}

    def _step_write_scope_error(self, path: str) -> Optional[Dict[str, Any]]:
        mode = step_mutation_mode(self.step)
        target_paths = step_target_paths(self.step)
        if mode == "read":
            return {
                "ok": False,
                "status": "read_step_write_blocked",
                "error": "read step 不允许写入文件",
                "path": path,
            }
        if target_paths and not path_matches_patterns(path, target_paths):
            return {
                "ok": False,
                "status": "outside_declared_target_paths",
                "error": "写入路径超出当前 step 声明的 targetPaths",
                "path": path,
                "targetPaths": target_paths,
                "extraChangedFile": {
                    "path": path,
                    "reason": "outside declared targetPaths",
                    "targetPaths": target_paths,
                },
            }
        return None

    def _command_write_validation_enabled(self) -> bool:
        return step_mutation_mode(self.step) == "write" and bool(step_target_paths(self.step))

    def _changed_paths_between(self, before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
        before_files = before.get("files") if isinstance(before.get("files"), dict) else {}
        after_files = after.get("files") if isinstance(after.get("files"), dict) else {}
        changed: List[str] = []
        for path in sorted(set(before_files.keys()) | set(after_files.keys())):
            old = before_files.get(path) if isinstance(before_files.get(path), dict) else None
            new = after_files.get(path) if isinstance(after_files.get(path), dict) else None
            if old is None or new is None or old.get("sha256") != new.get("sha256"):
                if safe_path_pattern(path):
                    changed.append(path)
        return changed

    def _outside_declared_targets(self, paths: List[str]) -> List[str]:
        target_paths = step_target_paths(self.step)
        if not target_paths:
            return []
        return [path for path in paths if not path_matches_patterns(path, target_paths)]

    def _outside_declared_target_result(
        self,
        changed_paths: List[str],
        outside_paths: List[str],
        error: str,
        base_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        target_paths = step_target_paths(self.step)
        workspace_root = Path(str(self.sandbox.get("workspacePath") or "")).resolve()
        for outside_path in outside_paths:
            _restore_current_version_to_workspace(workspace_root, self.run_id, outside_path)
        return {
            **(base_payload or {}),
            "ok": False,
            "status": "outside_declared_target_paths",
            "error": error,
            "changedFiles": changed_paths,
            "targetPaths": target_paths,
            "extraChangedFile": {
                "path": outside_paths[0],
                "reason": "changed path outside declared targetPaths",
                "targetPaths": target_paths,
            },
            "extraChangedFiles": [
                {
                    "path": path,
                    "reason": "changed path outside declared targetPaths",
                    "targetPaths": target_paths,
                }
                for path in outside_paths
            ],
        }

    def _validate_declared_snapshot_changes(
        self,
        before_snapshot: Optional[Dict[str, Any]],
        error: str,
        base_payload: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        if before_snapshot is None:
            return None
        after = capture_workspace_snapshot(self.sandbox, self.run_id)
        changed_paths = self._changed_paths_between(before_snapshot, after)
        outside_paths = self._outside_declared_targets(changed_paths)
        if not outside_paths:
            return None
        return self._outside_declared_target_result(changed_paths, outside_paths, error, base_payload)

    def _read_scope_error(self, path: str) -> Optional[Dict[str, Any]]:
        if step_mutation_mode(self.step) != "read":
            return None
        read_paths = step_read_paths(self.step)
        if read_paths and not path_matches_patterns(path, read_paths):
            return {
                "ok": False,
                "status": "outside_declared_read_paths",
                "error": "读取路径超出当前 read step 声明的 readPaths",
                "path": path,
                "readPaths": read_paths,
            }
        return None

    def _read_scope_paths(self) -> List[str]:
        if step_mutation_mode(self.step) != "read":
            return []
        return step_read_paths(self.step)

    def _path_allowed_by_read_scope(self, path: str) -> bool:
        read_paths = self._read_scope_paths()
        return not read_paths or path_matches_patterns(path, read_paths)

    def _filter_read_scoped_file_list(self, files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        read_paths = self._read_scope_paths()
        if not read_paths:
            return files
        return [
            item
            for item in files
            if isinstance(item, dict) and self._path_allowed_by_read_scope(str(item.get("path") or ""))
        ]

    def _filter_read_scoped_scan(self, scan: Dict[str, Any]) -> Dict[str, Any]:
        read_paths = self._read_scope_paths()
        if not read_paths:
            return scan
        filtered = dict(scan)
        for key in ("tracked", "untracked"):
            items = scan.get(key) if isinstance(scan.get(key), list) else []
            filtered[key] = [
                item
                for item in items
                if isinstance(item, dict) and self._path_allowed_by_read_scope(str(item.get("path") or ""))
            ]
        filtered["readPaths"] = read_paths
        filtered["readScopeFiltered"] = True
        return filtered

    def _write_scope_error(self, path: str) -> Optional[Dict[str, Any]]:
        step_scope_error = self._step_write_scope_error(path)
        if step_scope_error:
            return step_scope_error
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
        required_tool_by_name = {
            "read_dependency_manifest": "workspace.read",
            "list_files": "workspace.read",
            "scan_workspace": "workspace.read",
            "read_workspace_file": "workspace.read",
            "read_file": "workspace.read",
            "import_workspace_file": "workspace.write",
            "write_file": "workspace.write",
            "setup_environment": "environment.setup",
            "run_command": "command.run",
            "validate_command": "command.run",
        }
        required_tool = required_tool_by_name.get(name)
        if required_tool and not agent_has_tool(self.agent, required_tool):
            return {
                "ok": False,
                "status": "agent_tool_not_authorized",
                "error": f"当前 Agent 未启用 {required_tool}，不能调用 {name}",
                "tool": name,
                "requiredTool": required_tool,
            }
        mutating_tools = {"setup_environment", "run_command", "validate_command", "write_file", "import_workspace_file"}
        dynamic_workspace_tools = {"setup_environment", "run_command", "validate_command"}
        if step_write_tool_only(self.step) and name in dynamic_workspace_tools:
            return {
                "ok": False,
                "status": "dynamic_workspace_tool_blocked",
                "error": "writeToolOnly step 只能使用 write_file/import_workspace_file 写入声明的 targetPaths，不能执行命令或环境安装",
                "tool": name,
            }
        if self.run_mode == "read" and name in mutating_tools:
            return {
                "ok": False,
                "status": "read_only_blocked",
                "error": "read run 不允许执行写入或命令类工具",
                "tool": name,
            }
        if self.run_mode in {"write", "deploy"} and name in mutating_tools and self.workspace_id:
            if not is_workspace_mutation_lock_current(
                self.workspace_id,
                "run",
                self.run_id,
                int(self.lock_fencing_token or 0),
            ):
                return {
                    "ok": False,
                    "status": "mutation_lock_lost",
                    "error": "workspace mutation lock 已失效，禁止继续写入或执行命令",
                    "tool": name,
                }
        if name == "inspect_environment":
            result = await self._inspect_environment()
        elif name == "read_dependency_manifest":
            result = self._read_dependency_manifest()
            read_paths = self._read_scope_paths()
            if read_paths and isinstance(result.get("manifests"), dict):
                result = {
                    **result,
                    "manifests": {
                        path: manifest
                        for path, manifest in result["manifests"].items()
                        if self._path_allowed_by_read_scope(str(path))
                    },
                    "readPaths": read_paths,
                    "readScopeFiltered": True,
                }
        elif name == "setup_environment":
            before = capture_workspace_snapshot(self.sandbox, self.run_id) if self._command_write_validation_enabled() else None
            result = await self._setup_environment(arguments)
            validation_error = self._validate_declared_snapshot_changes(
                before,
                "环境安装产生了超出当前 step targetPaths 的文件变更",
                result,
            )
            if validation_error:
                result = validation_error
        elif name == "list_files":
            result = {"ok": True, "files": self._filter_read_scoped_file_list(list_sandbox_files(self.run_id))}
        elif name == "scan_workspace":
            result = self._scan_workspace()
            if isinstance(result.get("workspaceScan"), dict):
                result = {**result, "workspaceScan": self._filter_read_scoped_scan(result["workspaceScan"])}
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
        scope_error = self._read_scope_error(path)
        if scope_error:
            return scope_error
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
        scope_error = self._read_scope_error(path)
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
        office_block_reason = office_write_block_reason(path)
        if office_block_reason:
            return {
                "ok": False,
                "status": "blocked_office_text_import",
                "error": "Office 文件不能通过 import_workspace_file 导入文本版本；请 scan_workspace 后在 finish.changedFiles 中说明路径",
                "path": path,
            }
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
        office_block_reason = office_write_block_reason(path)
        if office_block_reason:
            return {
                "ok": False,
                "status": "blocked_office_text_write",
                "error": office_block_reason,
                "path": path,
            }
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
        before_snapshot = capture_workspace_snapshot(self.sandbox, self.run_id) if self._command_write_validation_enabled() else None
        result = await self._execute_backend_command(
            command,
            timeout_seconds=timeout_seconds or settings.SANDBOX_COMMAND_TIMEOUT_SECONDS,
        )
        changed_paths: List[str] = []
        outside_paths: List[str] = []
        if before_snapshot is not None:
            after = capture_workspace_snapshot(self.sandbox, self.run_id)
            changed_paths = self._changed_paths_between(before_snapshot, after)
            outside_paths = self._outside_declared_targets(changed_paths)
        if outside_paths:
            return self._outside_declared_target_result(
                changed_paths,
                outside_paths,
                "命令产生了超出当前 step targetPaths 的文件变更",
                {"command": result},
            )
        payload: Dict[str, Any] = {"ok": int(result.get("exitCode") or 0) == 0, "command": result}
        if changed_paths:
            payload["changedFiles"] = changed_paths
        return payload

    async def _validate_command(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        validation_arguments = dict(arguments)
        if validation_arguments.get("timeoutSeconds") is None:
            validation_arguments["timeoutSeconds"] = settings.SANDBOX_VALIDATION_TIMEOUT_SECONDS
        command_result = await self._run_command(validation_arguments)
        result = command_result.get("command") if isinstance(command_result.get("command"), dict) else {}
        validation = {
            "id": create_id("validation"),
            "command": result.get("command") or str(arguments.get("command") or ""),
            "success": bool(command_result.get("ok")),
            "result": result,
            "createdAt": now_text(),
        }
        payload = {
            "ok": validation["success"],
            "validationId": validation["id"],
            "validation": validation,
            "command": result,
        }
        for key in ("status", "error", "changedFiles", "targetPaths", "extraChangedFile", "extraChangedFiles"):
            if key in command_result:
                payload[key] = command_result[key]
        return payload

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
