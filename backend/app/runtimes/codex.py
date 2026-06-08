import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import settings
from app.database import get_agent_run_detail, get_workspace, update_agent_run_step
from app.model_providers.service import resolve_model_config, resolve_model_secret, validate_model_config_for_runtime
from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter
from app.runtimes.cli_utils import (
    READONLY_CHAT_MUTATION_MESSAGE,
    ensure_workspace_path,
    extract_json_object,
    finalize_readonly_chat_workspace,
    prepare_readonly_chat_workspace,
    readonly_chat_prompt,
    runtime_home_for_agent,
    safe_config_name,
    validate_http_base_url,
)
from app.runtimes.native import NativeRuntimeAdapter
from app.services.platform_runtime_context_service import (
    build_platform_runtime_context,
    platform_output_requests_clarification,
    platform_runtime_allows_workspace_write,
    platform_step_needs_write,
    validate_platform_runtime_permissions,
)
from app.services.workspace_agents_service import read_workspace_agents_context
from app.services.workspace_sync_service import (
    capture_workspace_snapshot,
    meaningful_workspace_changes,
    sync_platform_workspace_changes,
)


def _step_execution_task(step: Dict[str, Any]) -> str:
    metadata = step.get("runtimeMetadata") if isinstance(step.get("runtimeMetadata"), dict) else {}
    return str(metadata.get("executionTask") or step.get("task") or "")


def _extra_config(config: Dict[str, Any]) -> Dict[str, Any]:
    return config.get("extraConfig") if isinstance(config.get("extraConfig"), dict) else {}


def _nested_extra(config: Dict[str, Any], key: str) -> Dict[str, Any]:
    extra = _extra_config(config)
    return extra.get(key) if isinstance(extra.get(key), dict) else {}


def _codex_wire_api(config: Dict[str, Any]) -> str:
    extra = _extra_config(config)
    codex = _nested_extra(config, "codex")
    return str(
        codex.get("wireApi")
        or codex.get("wire_api")
        or extra.get("codexWireApi")
        or extra.get("wireApi")
        or extra.get("wire_api")
        or ""
    ).strip()


def _codex_http_headers(config: Dict[str, Any]) -> Dict[str, str]:
    extra = _extra_config(config)
    codex = _nested_extra(config, "codex")
    raw_headers = (
        codex.get("httpHeaders")
        or codex.get("http_headers")
        or extra.get("codexHttpHeaders")
        or extra.get("httpHeaders")
        or extra.get("http_headers")
        or {}
    )
    if not isinstance(raw_headers, dict):
        return {}
    return {
        str(key).strip(): str(value)
        for key, value in raw_headers.items()
        if str(key).strip()
    }


def _codex_requires_openai_auth(config: Dict[str, Any]) -> Optional[bool]:
    extra = _extra_config(config)
    codex = _nested_extra(config, "codex")
    value = (
        codex.get("requiresOpenAIAuth")
        if "requiresOpenAIAuth" in codex
        else codex.get("requires_openai_auth")
        if "requires_openai_auth" in codex
        else extra.get("codexRequiresOpenAIAuth")
        if "codexRequiresOpenAIAuth" in extra
        else extra.get("requiresOpenAIAuth")
        if "requiresOpenAIAuth" in extra
        else extra.get("requires_openai_auth")
    )
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _is_official_openai(config: Dict[str, Any]) -> bool:
    provider = str(config.get("provider") or "").strip().lower()
    base_url = str(config.get("baseUrl") or "").strip().rstrip("/")
    return provider == "openai" and base_url in {"", "https://api.openai.com/v1"}


def _needs_codex_provider_config(config: Dict[str, Any]) -> bool:
    return not _is_official_openai(config) or bool(_codex_wire_api(config) or _codex_http_headers(config))


def _write_codex_provider_config(
    codex_home: str,
    provider_name: str,
    base_url: str,
    api_key: str,
    wire_api: str,
    headers: Dict[str, str],
    requires_openai_auth: Optional[bool],
) -> None:
    home = Path(codex_home)
    home.mkdir(parents=True, exist_ok=True)
    config_lines = [
        f"[model_providers.{provider_name}]",
        f'name = "{provider_name}"',
        'env_key = "OPENAI_API_KEY"',
    ]
    if base_url:
        config_lines.append(f'base_url = "{base_url}"')
    if wire_api:
        config_lines.append(f'wire_api = "{wire_api}"')
    if requires_openai_auth is not None:
        config_lines.append(f"requires_openai_auth = {str(requires_openai_auth).lower()}")
    if headers:
        config_lines.append("")
        config_lines.append(f"[model_providers.{provider_name}.http_headers]")
        for key, value in sorted(headers.items()):
            config_lines.append(f"{json.dumps(key)} = {json.dumps(value)}")
    (home / "config.toml").write_text("\n".join(config_lines) + "\n", encoding="utf-8")
    if api_key:
        (home / "auth.json").write_text(
            json.dumps({"OPENAI_API_KEY": api_key, "auth_mode": "apikey"}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(home / "auth.json", 0o600)


def _codex_home_for_agent(agent: Optional[Dict[str, Any]], provider_name: str, config: Dict[str, Any]) -> str:
    root = str(settings.CODEX_HOME_ROOT or "").strip()
    if root:
        owner = safe_config_name(str((agent or {}).get("ownerUserId") or "default"), "owner")
        config_identity = safe_config_name(str(config.get("id") or provider_name), provider_name)
        return str(Path(root).resolve() / owner / config_identity)
    return runtime_home_for_agent(agent, "codex", config)


def _codex_no_tool_args() -> list[str]:
    return [
        "--disable",
        "multi_agent",
        "--disable",
        "shell_tool",
        "-c",
        'web_search="disabled"',
    ]


def _codex_third_party_compat_args(config: Dict[str, Any]) -> list[str]:
    if _is_official_openai(config):
        return []
    return [
        "--disable",
        "multi_agent",
        "-c",
        'web_search="disabled"',
    ]


def _codex_failure_message(stdout: str, stderr: str) -> str:
    raw = f"{stderr}\n{stdout}".strip()
    if "client_metadata" in raw:
        return (
            "Codex CLI 与当前第三方模型接口不兼容：该接口拒绝了 Codex 请求中的 client_metadata 字段。"
            "这通常表示该 provider 只兼容普通 OpenAI Chat Completions，不支持 Codex CLI/Responses 请求格式。"
            "请改用 OpenCode runtime，或换用官方 OpenAI / 支持 Codex CLI 的网关。"
        )
    if "unknown tool type" in raw or "tool.type" in raw:
        return (
            "Codex CLI 与当前第三方模型接口不兼容：该接口不认识 Codex 发送的工具类型。"
            "请改用 OpenCode runtime，或换用官方 OpenAI / 支持 Codex CLI 工具格式的网关。"
        )
    return raw or "codex 执行失败"


class CodexRuntimeAdapter(RuntimeAdapter):
    runtime = "codex"

    def _runtime_config(self, agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return (agent or {}).get("runtimeConfig") if isinstance((agent or {}).get("runtimeConfig"), dict) else {}

    def _env_for_config(self, config: Dict[str, Any], secret: str, codex_home: Optional[str] = None) -> Dict[str, str]:
        env = os.environ.copy()
        if secret:
            env["OPENAI_API_KEY"] = secret
        if config.get("baseUrl"):
            env["OPENAI_BASE_URL"] = validate_http_base_url(str(config.get("baseUrl") or ""), "模型配置 baseUrl")
        if codex_home:
            env["CODEX_HOME"] = codex_home
        return env

    def _extract_text_output(self, stdout: str) -> str:
        texts = []
        decoder = json.JSONDecoder()
        raw = str(stdout or "")
        index = 0
        while index < len(raw):
            while index < len(raw) and raw[index].isspace():
                index += 1
            if index >= len(raw):
                break
            try:
                event, next_index = decoder.raw_decode(raw, index)
                index = next_index
            except json.JSONDecodeError:
                next_object = raw.find("{", index + 1)
                if next_object == -1:
                    break
                index = next_object
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") in {"agent_message", "message"}:
                item = event.get("item") if isinstance(event.get("item"), dict) else {}
                text = item.get("text") or item.get("content")
                if isinstance(text, str) and text.strip():
                    texts.append(text.strip())
            if event.get("type") == "item.completed":
                item = event.get("item") if isinstance(event.get("item"), dict) else {}
                if item.get("type") in {"agent_message", "message"}:
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        texts.append(text.strip())
                    content = item.get("content")
                    if isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and str(part.get("text") or "").strip():
                                texts.append(str(part["text"]).strip())
                    elif isinstance(content, str) and content.strip():
                        texts.append(content.strip())
            if event.get("type") == "turn.completed":
                usage = event.get("usage") if isinstance(event.get("usage"), dict) else {}
                output_text = usage.get("output_text")
                if isinstance(output_text, str) and output_text.strip():
                    texts.append(output_text.strip())
        return "\n".join(texts).strip()

    async def _run_codex(self, agent: Optional[Dict[str, Any]], workspace_path: str, prompt: str, no_tools: bool = False) -> Dict[str, Any]:
        runtime_config = self._runtime_config(agent)
        codex_bin = str(runtime_config.get("codex_bin") or settings.CODEX_BIN or "codex").strip() or "codex"
        if not shutil.which(codex_bin) and not Path(codex_bin).exists():
            raise RuntimeError(f"codex CLI 不存在或不在 PATH：{codex_bin}。请配置 CODEX_BIN 为绝对路径。")

        owner_user_id = (agent or {}).get("ownerUserId")
        model_config = resolve_model_config(agent, owner_user_id=owner_user_id)
        config_error = validate_model_config_for_runtime(model_config, "codex")
        if config_error:
            raise RuntimeError(config_error)
        secret = resolve_model_secret(model_config, owner_user_id=owner_user_id)
        base_url = validate_http_base_url(str(model_config.get("baseUrl") or ""), "模型配置 baseUrl")
        provider_name = safe_config_name(model_config.get("provider") or model_config.get("id") or "northcore", "northcore")
        provider_name = f"northcore_{provider_name}"
        model_name = str(model_config.get("modelName") or "").strip()
        sandbox_mode = str(runtime_config.get("sandbox_mode") or runtime_config.get("sandboxMode") or "workspace-write").strip()
        if sandbox_mode not in {"read-only", "workspace-write", "danger-full-access"}:
            sandbox_mode = "workspace-write"
        command = [
            codex_bin,
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            sandbox_mode,
            "--add-dir",
            workspace_path,
            "--add-dir",
            "/tmp",
        ]
        command.extend(_codex_third_party_compat_args(model_config))
        if no_tools:
            command.extend(_codex_no_tool_args())
        codex_home = _codex_home_for_agent(agent, provider_name, model_config)
        if _needs_codex_provider_config(model_config):
            _write_codex_provider_config(
                codex_home=codex_home,
                provider_name=provider_name,
                base_url=base_url,
                api_key=secret,
                wire_api=_codex_wire_api(model_config),
                headers=_codex_http_headers(model_config),
                requires_openai_auth=_codex_requires_openai_auth(model_config),
            )
            command.extend(["-c", f'model_provider="{provider_name}"'])
        else:
            Path(codex_home).mkdir(parents=True, exist_ok=True)
        if model_name:
            command.extend(["--model", model_name])
        if base_url:
            command.extend(["-c", f'openai_base_url="{base_url}"'])
        command.extend(["--json", "--cd", workspace_path, "-"])
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self._env_for_config(model_config, secret, codex_home),
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(str(prompt or "").encode("utf-8")),
                timeout=int(runtime_config.get("timeout_seconds") or settings.CODEX_TIMEOUT_SECONDS),
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError("codex 执行超时")

        stdout_text = stdout.decode("utf-8", errors="replace")
        stderr_text = stderr.decode("utf-8", errors="replace")
        return {
            "command": command,
            "returnCode": proc.returncode,
            "stdout": stdout_text,
            "stderr": stderr_text,
            "text": self._extract_text_output(stdout_text) or stdout_text.strip(),
            "modelConfigId": model_config.get("id"),
            "provider": model_config.get("provider"),
            "modelName": model_name,
        }

    async def execute_chat(self, agent: Dict[str, Any], conversation: Dict[str, Any], user_input: str, context: Optional[Dict[str, Any]] = None) -> str:
        if conversation.get("mode") == "agent":
            return "Codex Agent 需要在 single/group 会话中选择或新建工作区后才能执行。"
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=conversation.get("ownerUserId")) if workspace_id else None
        if not workspace:
            return "Codex Agent 需要在 single/group 会话中选择或新建工作区后才能执行。"
        workspace_context = read_workspace_agents_context(workspace["id"])
        audit = prepare_readonly_chat_workspace(workspace, workspace_context)
        try:
            result = await self._run_codex(
                agent,
                ensure_workspace_path(audit["workspacePath"]),
                readonly_chat_prompt(user_input, workspace_context),
            )
        finally:
            audit = finalize_readonly_chat_workspace(audit)
        if audit.get("tempWorkspaceMutated"):
            return READONLY_CHAT_MUTATION_MESSAGE
        if result["returnCode"] != 0:
            return f"Codex 执行失败。\n\n{_codex_failure_message(result['stdout'], result['stderr'])}"
        return result["text"] or "Codex 执行完成。"

    async def complete_json(self, agent: Dict[str, Any], conversation: Dict[str, Any], system_prompt: str, user_content: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return await NativeRuntimeAdapter().complete_json(agent, conversation, system_prompt, user_content, context)

    async def create_run(self, agent: Optional[Dict[str, Any]], current_user: Dict[str, Any], conversation_id: str, prompt: str, payload: Optional[Dict[str, Any]] = None, emit: Optional[RuntimeEventEmitter] = None) -> Dict[str, Any]:
        from app.services.run_service import create_run_for_conversation

        return await create_run_for_conversation(
            current_user=current_user,
            conversation_id=conversation_id,
            prompt=prompt,
            payload=payload,
            emit=emit,
            runtime_agent=agent,
        )

    async def execute_run_step(self, run_id: str, sandbox: Dict[str, Any], container_id: str, step: Dict[str, Any], agent: Optional[Dict[str, Any]], send: RuntimeEventEmitter, context: Optional[Dict[str, Any]] = None) -> bool:
        try:
            run = get_agent_run_detail(run_id) or {}
            permission_error = validate_platform_runtime_permissions(agent, run, step)
            if permission_error:
                raise RuntimeError(permission_error)
            task = _step_execution_task(step)
            context_payload = build_platform_runtime_context(run_id, step, agent, task)
            snapshot = capture_workspace_snapshot(sandbox, run_id)
            result = await self._run_codex(agent, ensure_workspace_path(sandbox["workspacePath"]), context_payload["prompt"])
            display_output = result["text"] or result["stdout"]
            logs = f"$ {' '.join(result['command'])}\n{display_output}\n{result['stderr']}".strip()
            allow_write = platform_runtime_allows_workspace_write(agent, run, step)
            sync_result = sync_platform_workspace_changes(
                sandbox,
                run_id,
                snapshot,
                created_by_step_id=step["id"],
                allow_write=allow_write,
            )
            synced_files = sync_result["files"]
            conflicts = sync_result["conflicts"]
            rejected_files = sync_result.get("rejectedFiles") or []
            skipped_files = sync_result.get("skippedFiles") or []
            if sync_result.get("writeRejected"):
                error = "只读 platform runtime 产生了 workspace 修改，已拒绝提交"
                update_agent_run_step(
                    step["id"],
                    status="failed",
                    output={
                        "runtime": "codex",
                        "command": result["command"],
                        "text": result["text"],
                        "files": synced_files,
                        "rejectedFiles": rejected_files,
                        "skippedFiles": skipped_files,
                        "agenthubContext": context_payload["metadata"],
                    },
                    append_log=f"{logs}\n{error}",
                    error=error,
                    mark_finished=True,
                    runtime_metadata={
                        "codex": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}},
                        **context_payload["metadata"],
                        "workspaceSnapshotId": sync_result.get("snapshotId"),
                    },
                )
                await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "error": error, "rejectedFiles": rejected_files})
                return True
            if conflicts:
                update_agent_run_step(
                    step["id"],
                    status="conflict",
                    output={
                        "runtime": "codex",
                        "command": result["command"],
                        "text": result["text"],
                        "files": synced_files,
                        "conflicts": conflicts,
                        "skippedFiles": skipped_files,
                        "agenthubContext": context_payload["metadata"],
                    },
                    append_log=logs,
                    error="文件冲突",
                    mark_finished=True,
                    runtime_metadata={
                        "codex": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}},
                        **context_payload["metadata"],
                        "workspaceSnapshotId": sync_result.get("snapshotId"),
                    },
                )
                await send("run.step.conflict", {"runId": run_id, "stepId": step["id"], "conflicts": conflicts})
                return True
            meaningful_files = meaningful_workspace_changes(synced_files)
            no_effective_changes = result["returnCode"] == 0 and platform_step_needs_write(step, run) and not meaningful_files
            needs_clarification = no_effective_changes and platform_output_requests_clarification(display_output)
            status = "completed" if result["returnCode"] == 0 and not no_effective_changes else ("blocked" if needs_clarification else "failed")
            error = None
            if needs_clarification:
                error = display_output or "需要补充任务条件"
            elif no_effective_changes:
                error = "Platform Agent 没有生成或修改任何有效工作区文件"
            elif status == "failed":
                error = _codex_failure_message(result["stdout"], result["stderr"])
            update_agent_run_step(
                step["id"],
                status=status,
                output={
                    "runtime": "codex",
                    "command": result["command"],
                    "text": result["text"],
                    "files": synced_files,
                    "skippedFiles": skipped_files,
                    "agenthubContext": context_payload["metadata"],
                },
                append_log=logs,
                error=error,
                mark_finished=True,
                runtime_metadata={
                    "codex": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}},
                    **context_payload["metadata"],
                    "workspaceSnapshotId": sync_result.get("snapshotId"),
                },
            )
            await send(
                "run.step.completed" if status == "completed" else "run.step.failed",
                {"runId": run_id, "stepId": step["id"], "step": {**step, "status": status}, "files": synced_files},
            )
        except Exception as exc:
            update_agent_run_step(
                step["id"],
                status="failed",
                error=str(exc),
                mark_finished=True,
                runtime_metadata={"runtime": "codex", "error": str(exc)},
            )
            await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "error": str(exc)})
        return True
