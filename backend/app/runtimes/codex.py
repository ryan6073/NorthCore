import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import settings
from app.database import get_workspace, update_agent_run_step
from app.model_providers.service import resolve_model_config, resolve_model_secret
from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter
from app.runtimes.cli_utils import ensure_workspace_path, extract_json_object, safe_config_name, validate_http_base_url
from app.runtimes.native import NativeRuntimeAdapter
from app.services.workspace_agents_service import write_workspace_agents_file
from app.services.workspace_sync_service import sync_workspace_files


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


def _is_official_openai(config: Dict[str, Any]) -> bool:
    provider = str(config.get("provider") or "").strip().lower()
    base_url = str(config.get("baseUrl") or "").strip().rstrip("/")
    return provider == "openai" and base_url in {"", "https://api.openai.com/v1"}


def _needs_codex_provider_config(config: Dict[str, Any]) -> bool:
    return not _is_official_openai(config) or bool(_codex_wire_api(config) or _codex_http_headers(config))


def _write_codex_provider_config(codex_home: str, provider_name: str, base_url: str, api_key: str, wire_api: str, headers: Dict[str, str]) -> None:
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


def _codex_home_for_agent(agent: Optional[Dict[str, Any]], provider_name: str) -> str:
    root = str(settings.CODEX_HOME_ROOT or "").strip()
    if not root:
        root = str(Path.home() / ".northcore" / "codex")
    owner = safe_config_name(str((agent or {}).get("ownerUserId") or "default"), "owner")
    return str(Path(root) / owner / provider_name)


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
        for line in str(stdout or "").splitlines():
            clean_line = line.strip()
            if not clean_line:
                continue
            try:
                event = json.loads(clean_line)
            except json.JSONDecodeError:
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
        secret = resolve_model_secret(model_config, owner_user_id=owner_user_id)
        base_url = validate_http_base_url(str(model_config.get("baseUrl") or ""), "模型配置 baseUrl")
        provider_name = safe_config_name(model_config.get("provider") or model_config.get("id") or "northcore", "northcore")
        provider_name = f"northcore_{provider_name}"
        model_name = str(model_config.get("modelName") or "").strip()
        command = [codex_bin, "exec", "--skip-git-repo-check"]
        command.extend(_codex_third_party_compat_args(model_config))
        if no_tools:
            command.extend(_codex_no_tool_args())
        codex_home = _codex_home_for_agent(agent, provider_name)
        if _needs_codex_provider_config(model_config):
            _write_codex_provider_config(
                codex_home=codex_home,
                provider_name=provider_name,
                base_url=base_url,
                api_key=secret,
                wire_api=_codex_wire_api(model_config),
                headers=_codex_http_headers(model_config),
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
        write_workspace_agents_file(workspace["id"])
        result = await self._run_codex(agent, ensure_workspace_path(workspace["workspacePath"]), user_input)
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
            result = await self._run_codex(agent, ensure_workspace_path(sandbox["workspacePath"]), step.get("task") or "")
            display_output = result["text"] or result["stdout"]
            logs = f"$ {' '.join(result['command'])}\n{display_output}\n{result['stderr']}".strip()
            synced_files = sync_workspace_files(sandbox, run_id, created_by_step_id=step["id"])
            status = "completed" if result["returnCode"] == 0 else "failed"
            update_agent_run_step(
                step["id"],
                status=status,
                output={"runtime": "codex", "command": result["command"], "text": result["text"], "files": synced_files},
                append_log=logs,
                error=None if status == "completed" else _codex_failure_message(result["stdout"], result["stderr"]),
                mark_finished=True,
                runtime_metadata={"codex": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}}},
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
