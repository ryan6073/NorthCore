import asyncio
import json
import os
import re
import shutil
from urllib.parse import urlparse
from typing import Any, Dict, Optional

from app.config import settings
from app.database import get_workspace, update_agent_run_step
from app.model_providers.service import resolve_model_config, resolve_model_secret
from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter
from app.services.workspace_agents_service import write_workspace_agents_file
from app.services.workspace_sync_service import sync_workspace_files


def _extract_json_object(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))


class OpenCodeRuntimeAdapter(RuntimeAdapter):
    runtime = "opencode"

    def _runtime_config(self, agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return (agent or {}).get("runtimeConfig") if isinstance((agent or {}).get("runtimeConfig"), dict) else {}

    def _custom_provider_id(self, config: Dict[str, Any]) -> str:
        base_url = str(config.get("baseUrl") or "").strip()
        provider = str(config.get("provider") or "").strip()
        if provider == "anthropic":
            return ""
        if provider == "openai" and not base_url:
            return ""
        return "northcore"

    def _model_arg(self, config: Dict[str, Any]) -> str:
        custom_provider_id = self._custom_provider_id(config)
        if custom_provider_id:
            model_name = str(config.get("modelName") or "").strip()
            return f"{custom_provider_id}/{model_name}" if model_name else custom_provider_id
        provider = str(config.get("provider") or "openai_compatible").strip()
        provider_arg = "anthropic" if provider == "anthropic" else "openai"
        model_name = str(config.get("modelName") or "").strip()
        return f"{provider_arg}/{model_name}" if model_name else provider_arg

    def _validated_base_url(self, base_url: str) -> str:
        clean_url = str(base_url or "").strip()
        if not clean_url:
            return ""
        parsed = urlparse(clean_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise RuntimeError(
                f"模型配置 baseUrl 无效：{clean_url}。请填写包含 http(s):// 的完整地址，或留空使用官方 OpenAI。"
            )
        return clean_url.rstrip("/")

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
            if not isinstance(event, dict) or event.get("type") != "text":
                continue
            part = event.get("part") if isinstance(event.get("part"), dict) else {}
            text = str(part.get("text") or "").strip()
            if text:
                texts.append(text)
        return "\n".join(texts).strip()

    def _env_for_agent(self, agent: Optional[Dict[str, Any]]) -> Dict[str, str]:
        owner_user_id = (agent or {}).get("ownerUserId")
        config = resolve_model_config(agent, owner_user_id=owner_user_id)
        secret = resolve_model_secret(config, owner_user_id=owner_user_id)
        env = os.environ.copy()
        provider = str(config.get("provider") or "")
        custom_provider_id = self._custom_provider_id(config)
        if custom_provider_id:
            model_name = str(config.get("modelName") or "").strip()
            base_url = self._validated_base_url(str(config.get("baseUrl") or ""))
            env["NORTHCORE_OPENCODE_API_KEY"] = secret
            env["OPENCODE_CONFIG_CONTENT"] = json.dumps(
                {
                    "provider": {
                        custom_provider_id: {
                            "npm": "@ai-sdk/openai-compatible",
                            "name": str(config.get("name") or "NorthCore OpenAI Compatible"),
                            "options": {
                                "baseURL": base_url,
                                "apiKey": "{env:NORTHCORE_OPENCODE_API_KEY}",
                            },
                            "models": {
                                model_name: {
                                    "name": model_name,
                                }
                            },
                        }
                    },
                },
                ensure_ascii=False,
            )
            return env
        if provider == "anthropic":
            env["ANTHROPIC_API_KEY"] = secret
        else:
            env["OPENAI_API_KEY"] = secret
            if config.get("baseUrl"):
                env["OPENAI_BASE_URL"] = self._validated_base_url(str(config["baseUrl"]))
        return env

    async def _run_opencode(
        self,
        agent: Optional[Dict[str, Any]],
        workspace_path: str,
        prompt: str,
    ) -> Dict[str, Any]:
        runtime_config = self._runtime_config(agent)
        configured_bin = str(runtime_config.get("opencode_bin") or "").strip()
        settings_bin = str(settings.OPENCODE_BIN or "").strip()
        opencode_bin = configured_bin or settings_bin or "opencode"
        if opencode_bin == "opencode" and settings_bin and settings_bin != "opencode":
            opencode_bin = settings_bin
        if not shutil.which(opencode_bin) and settings_bin and settings_bin != opencode_bin:
            opencode_bin = settings_bin
        owner_user_id = (agent or {}).get("ownerUserId")
        model_config = resolve_model_config(agent, owner_user_id=owner_user_id)
        command = [
            opencode_bin,
            "run",
            "--model",
            self._model_arg(model_config),
            "--format",
            "json",
            "--dir",
            workspace_path,
            prompt,
        ]
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self._env_for_agent(agent),
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=int(runtime_config.get("timeout_seconds") or settings.OPENCODE_TIMEOUT_SECONDS),
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError("opencode 执行超时")
        return {
            "command": command,
            "returnCode": proc.returncode,
            "stdout": stdout.decode("utf-8", errors="replace"),
            "stderr": stderr.decode("utf-8", errors="replace"),
            "text": self._extract_text_output(stdout.decode("utf-8", errors="replace")),
            "modelConfigId": model_config.get("id"),
        }

    async def execute_chat(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        user_input: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        if conversation.get("mode") == "agent":
            return "OpenCode Agent 需要在 single/group 会话中选择或新建工作区后才能执行。"
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=conversation.get("ownerUserId")) if workspace_id else None
        if not workspace:
            return "OpenCode Agent 需要在 single/group 会话中选择或新建工作区后才能执行。"
        write_workspace_agents_file(workspace["id"])
        result = await self._run_opencode(agent, workspace["workspacePath"], user_input)
        if result["returnCode"] != 0:
            return f"OpenCode 执行失败。\n\n{result['stderr'] or result['stdout']}"
        return result["text"] or result["stdout"] or "OpenCode 执行完成。"

    async def complete_json(
        self,
        agent: Dict[str, Any],
        conversation: Dict[str, Any],
        system_prompt: str,
        user_content: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=conversation.get("ownerUserId")) if workspace_id else None
        if workspace:
            write_workspace_agents_file(workspace["id"])
            workspace_path = workspace["workspacePath"]
        else:
            workspace_path = str((context or {}).get("workspacePath") or ".")
        prompt = (
            f"{system_prompt}\n\n"
            "你必须只输出一个 JSON 对象，不要输出 Markdown，不要输出解释文本。\n\n"
            f"{user_content}"
        )
        result = await self._run_opencode(agent, workspace_path, prompt)
        raw_output = result["text"] or result["stdout"]
        if result["returnCode"] != 0:
            raise ValueError(result["stderr"] or raw_output or "OpenCode JSON 调用失败")
        try:
            return _extract_json_object(raw_output)
        except Exception as exc:
            raise ValueError(f"OpenCode 未返回有效 JSON: {exc}") from exc

    async def create_run(
        self,
        agent: Optional[Dict[str, Any]],
        current_user: Dict[str, Any],
        conversation_id: str,
        prompt: str,
        payload: Optional[Dict[str, Any]] = None,
        emit: Optional[RuntimeEventEmitter] = None,
    ) -> Dict[str, Any]:
        from app.services.run_service import create_run_for_conversation

        return await create_run_for_conversation(
            current_user=current_user,
            conversation_id=conversation_id,
            prompt=prompt,
            payload=payload,
            emit=emit,
            runtime_agent=agent,
        )

    async def execute_run_step(
        self,
        run_id: str,
        sandbox: Dict[str, Any],
        container_id: str,
        step: Dict[str, Any],
        agent: Optional[Dict[str, Any]],
        send: RuntimeEventEmitter,
        context: Optional[Dict[str, Any]] = None,
    ) -> bool:
        await send("run.step.started", {"runId": run_id, "stepId": step["id"], "step": step})
        try:
            result = await self._run_opencode(agent, sandbox["workspacePath"], step.get("task") or "")
            display_output = result["text"] or result["stdout"]
            logs = f"$ {' '.join(result['command'])}\n{display_output}\n{result['stderr']}".strip()
            synced_files = sync_workspace_files(sandbox, run_id, created_by_step_id=step["id"])
            status = "completed" if result["returnCode"] == 0 else "failed"
            update_agent_run_step(
                step["id"],
                status=status,
                output={"runtime": "opencode", "command": result["command"], "text": result["text"], "files": synced_files},
                append_log=logs,
                error=None if status == "completed" else result["stderr"] or result["stdout"] or "opencode 执行失败",
                mark_finished=True,
                runtime_metadata={"opencode": result},
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
                runtime_metadata={"runtime": "opencode", "error": str(exc)},
            )
            await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "error": str(exc)})
        return True
