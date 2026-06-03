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
from app.runtimes.cli_utils import ensure_workspace_path, extract_json_object, validate_http_base_url
from app.services.workspace_agents_service import write_workspace_agents_file
from app.services.workspace_sync_service import sync_workspace_files


class ClaudeCodeRuntimeAdapter(RuntimeAdapter):
    runtime = "claude_code"

    def _runtime_config(self, agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return (agent or {}).get("runtimeConfig") if isinstance((agent or {}).get("runtimeConfig"), dict) else {}

    def _resolve_claude_config(self, agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        owner_user_id = (agent or {}).get("ownerUserId")
        config = resolve_model_config(agent, owner_user_id=owner_user_id)
        secret = resolve_model_secret(config, owner_user_id=owner_user_id)
        provider = str(config.get("provider") or "").strip().lower()
        protocol = str(config.get("protocol") or "").strip().lower()
        base_url = validate_http_base_url(str(config.get("baseUrl") or ""), "模型配置 baseUrl")
        if protocol != "anthropic_messages" and provider not in {"anthropic", "anthropic_compatible"}:
            raise RuntimeError(
                "Claude Code runtime 需要 Anthropic 官方配置或 anthropic_compatible 网关。"
                "当前模型配置是 OpenAI-compatible，不能直接用于 Claude Code；请先配置 Claude Code Router / Anthropic-compatible 网关。"
            )
        if provider == "anthropic_compatible" and not base_url:
            raise RuntimeError("anthropic_compatible 模型配置必须填写 Claude Code Router / Anthropic-compatible 网关 baseUrl。")
        return {
            "config": config,
            "secret": secret,
            "provider": provider,
            "baseUrl": base_url,
            "modelName": str(config.get("modelName") or "").strip(),
        }

    def _env_for_agent(self, agent: Optional[Dict[str, Any]]) -> Dict[str, str]:
        resolved = self._resolve_claude_config(agent)
        env = os.environ.copy()
        secret = resolved["secret"]
        provider = resolved["provider"]
        base_url = resolved["baseUrl"]
        model_name = resolved["modelName"]
        official_base_urls = {"", "https://api.anthropic.com", "https://api.anthropic.com/v1"}
        if provider == "anthropic" and base_url in official_base_urls:
            if secret:
                env["ANTHROPIC_API_KEY"] = secret
            env.pop("ANTHROPIC_AUTH_TOKEN", None)
        else:
            if secret:
                env["ANTHROPIC_AUTH_TOKEN"] = secret
            env.pop("ANTHROPIC_API_KEY", None)
            env["ANTHROPIC_BASE_URL"] = base_url
            env["NO_PROXY"] = ",".join(filter(None, [env.get("NO_PROXY", ""), "127.0.0.1", "localhost"]))
        if model_name:
            env["ANTHROPIC_MODEL"] = model_name
        return env

    def _extract_text_output(self, stdout: str) -> str:
        texts = []
        fallback = ""
        for line in str(stdout or "").splitlines():
            clean_line = line.strip()
            if not clean_line:
                continue
            try:
                event = json.loads(clean_line)
            except json.JSONDecodeError:
                fallback += clean_line + "\n"
                continue
            if not isinstance(event, dict):
                continue
            if isinstance(event.get("result"), str) and event["result"].strip():
                texts.append(event["result"].strip())
            if isinstance(event.get("text"), str) and event["text"].strip():
                texts.append(event["text"].strip())
            message = event.get("message") if isinstance(event.get("message"), dict) else {}
            content = message.get("content") or event.get("content")
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and str(item.get("text") or "").strip():
                        texts.append(str(item["text"]).strip())
            elif isinstance(content, str) and content.strip():
                texts.append(content.strip())
            delta = event.get("delta") if isinstance(event.get("delta"), dict) else {}
            if isinstance(delta.get("text"), str) and delta["text"].strip():
                texts.append(delta["text"].strip())
        return "\n".join(texts).strip() or fallback.strip()

    async def _run_claude_code(self, agent: Optional[Dict[str, Any]], workspace_path: str, prompt: str) -> Dict[str, Any]:
        runtime_config = self._runtime_config(agent)
        claude_bin = str(runtime_config.get("claude_code_bin") or settings.CLAUDE_CODE_BIN or "claude").strip() or "claude"
        if not shutil.which(claude_bin) and not Path(claude_bin).exists():
            raise RuntimeError(f"claude CLI 不存在或不在 PATH：{claude_bin}。请配置 CLAUDE_CODE_BIN 为绝对路径。")
        resolved = self._resolve_claude_config(agent)
        permission_mode = str(runtime_config.get("permission_mode") or runtime_config.get("mode") or "bypassPermissions").strip()
        command = [
            claude_bin,
            "-p",
            "--output-format",
            "stream-json",
            "--permission-mode",
            permission_mode,
            str(prompt or ""),
        ]
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=workspace_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self._env_for_agent(agent),
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=int(runtime_config.get("timeout_seconds") or settings.CLAUDE_CODE_TIMEOUT_SECONDS),
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError("Claude Code 执行超时")
        stdout_text = stdout.decode("utf-8", errors="replace")
        stderr_text = stderr.decode("utf-8", errors="replace")
        return {
            "command": command,
            "returnCode": proc.returncode,
            "stdout": stdout_text,
            "stderr": stderr_text,
            "text": self._extract_text_output(stdout_text),
            "modelConfigId": resolved["config"].get("id"),
            "provider": resolved["provider"],
            "modelName": resolved["modelName"],
            "baseUrl": resolved["baseUrl"],
        }

    async def execute_chat(self, agent: Dict[str, Any], conversation: Dict[str, Any], user_input: str, context: Optional[Dict[str, Any]] = None) -> str:
        if conversation.get("mode") == "agent":
            return "Claude Code Agent 需要在 single/group 会话中选择或新建工作区后才能执行。"
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=conversation.get("ownerUserId")) if workspace_id else None
        if not workspace:
            return "Claude Code Agent 需要在 single/group 会话中选择或新建工作区后才能执行。"
        write_workspace_agents_file(workspace["id"])
        result = await self._run_claude_code(agent, ensure_workspace_path(workspace["workspacePath"]), user_input)
        if result["returnCode"] != 0:
            return f"Claude Code 执行失败。\n\n{result['stderr'] or result['stdout']}"
        return result["text"] or result["stdout"] or "Claude Code 执行完成。"

    async def complete_json(self, agent: Dict[str, Any], conversation: Dict[str, Any], system_prompt: str, user_content: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=conversation.get("ownerUserId")) if workspace_id else None
        workspace_path = ensure_workspace_path(workspace["workspacePath"] if workspace else str((context or {}).get("workspacePath") or "."))
        prompt = (
            f"{system_prompt}\n\n"
            "你必须只输出一个 JSON 对象，不要输出 Markdown，不要输出解释文本。\n\n"
            f"{user_content}"
        )
        result = await self._run_claude_code(agent, workspace_path, prompt)
        raw_output = result["text"] or result["stdout"]
        if result["returnCode"] != 0:
            raise ValueError(result["stderr"] or raw_output or "Claude Code JSON 调用失败")
        try:
            return extract_json_object(raw_output)
        except Exception as exc:
            raise ValueError(f"Claude Code 未返回有效 JSON: {exc}") from exc

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
            result = await self._run_claude_code(agent, ensure_workspace_path(sandbox["workspacePath"]), step.get("task") or "")
            display_output = result["text"] or result["stdout"]
            logs = f"$ {' '.join(result['command'])}\n{display_output}\n{result['stderr']}".strip()
            synced_files = sync_workspace_files(sandbox, run_id, created_by_step_id=step["id"])
            status = "completed" if result["returnCode"] == 0 else "failed"
            update_agent_run_step(
                step["id"],
                status=status,
                output={"runtime": "claude_code", "command": result["command"], "text": result["text"], "files": synced_files},
                append_log=logs,
                error=None if status == "completed" else result["stderr"] or result["stdout"] or "Claude Code 执行失败",
                mark_finished=True,
                runtime_metadata={"claudeCode": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}}},
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
                runtime_metadata={"runtime": "claude_code", "error": str(exc)},
            )
            await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "error": str(exc)})
        return True
