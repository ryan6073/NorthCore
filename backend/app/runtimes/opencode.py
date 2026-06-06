import asyncio
import json
import os
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Dict, Optional

from app.config import settings
from app.database import get_agent_run_detail, get_workspace, update_agent_run_step
from app.model_providers.service import resolve_model_config, resolve_model_secret
from app.runtimes.base import RuntimeAdapter, RuntimeEventEmitter
from app.runtimes.cli_utils import (
    READONLY_CHAT_MUTATION_MESSAGE,
    apply_isolated_runtime_home_env,
    finalize_readonly_chat_workspace,
    prepare_readonly_chat_workspace,
    readonly_chat_prompt,
    runtime_home_for_agent,
)
from app.services.platform_runtime_context_service import (
    build_platform_runtime_context,
    platform_output_requests_clarification,
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
        texts: list[str] = []

        def add_text(value: Any) -> None:
            if isinstance(value, str) and value.strip():
                texts.append(value.strip())

        def collect_from_content(value: Any) -> None:
            if isinstance(value, str):
                add_text(value)
                return
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        add_text(item.get("text"))
                        add_text(item.get("content"))
                    else:
                        add_text(item)

        control_types = {
            "step_start",
            "step_finish",
            "step-start",
            "step-finish",
            "session",
            "tool",
            "tool_call",
            "tool_result",
        }
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
            event_type = str(event.get("type") or "").strip()
            part = event.get("part") if isinstance(event.get("part"), dict) else {}
            part_type = str(part.get("type") or "").strip()
            if event_type in control_types or part_type in control_types:
                continue
            add_text(event.get("text"))
            add_text(event.get("result"))
            collect_from_content(event.get("content"))
            part = event.get("part") if isinstance(event.get("part"), dict) else {}
            add_text(part.get("text"))
            collect_from_content(part.get("content"))
            message = event.get("message") if isinstance(event.get("message"), dict) else {}
            add_text(message.get("text"))
            collect_from_content(message.get("content"))

        deduped = []
        for text in texts:
            if text not in deduped:
                deduped.append(text)
        return "\n".join(deduped).strip()

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
            return apply_isolated_runtime_home_env(
                env,
                runtime_home_for_agent(agent, "opencode", config),
            )
        if provider == "anthropic":
            env["ANTHROPIC_API_KEY"] = secret
        else:
            env["OPENAI_API_KEY"] = secret
            if config.get("baseUrl"):
                env["OPENAI_BASE_URL"] = self._validated_base_url(str(config["baseUrl"]))
        return apply_isolated_runtime_home_env(
            env,
            runtime_home_for_agent(agent, "opencode", config),
        )

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
        if not shutil.which(opencode_bin) and not Path(opencode_bin).exists():
            raise RuntimeError(f"opencode CLI 不存在或不在 PATH：{opencode_bin}。请配置 OPENCODE_BIN 为绝对路径。")
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
        workspace_context = read_workspace_agents_context(workspace["id"])
        audit = prepare_readonly_chat_workspace(workspace, workspace_context)
        try:
            result = await self._run_opencode(
                agent,
                audit["workspacePath"],
                readonly_chat_prompt(user_input, workspace_context),
            )
        finally:
            audit = finalize_readonly_chat_workspace(audit)
        if audit.get("tempWorkspaceMutated"):
            return READONLY_CHAT_MUTATION_MESSAGE
        if result["returnCode"] != 0:
            return f"OpenCode 执行失败。\n\n{result['stderr'] or result['stdout']}"
        return result["text"] or "我已收到。当前普通聊天不会直接修改工作区；如果需要改文件，请发起沙箱任务。"

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
        audit: Optional[Dict[str, Any]] = None
        workspace_context = read_workspace_agents_context(workspace["id"]) if workspace else ""
        if workspace:
            audit = prepare_readonly_chat_workspace(workspace, workspace_context)
            workspace_path = audit["workspacePath"]
        else:
            workspace_path = str((context or {}).get("workspacePath") or ".")
        prompt = (
            f"{readonly_chat_prompt('', workspace_context)}\n\n"
            f"{system_prompt}\n\n"
            "你必须只输出一个 JSON 对象，不要输出 Markdown，不要输出解释文本。\n\n"
            f"{user_content}"
        )
        try:
            result = await self._run_opencode(agent, workspace_path, prompt)
        finally:
            if audit:
                audit = finalize_readonly_chat_workspace(audit)
        if audit and audit.get("tempWorkspaceMutated"):
            raise ValueError("OpenCode JSON 调用尝试修改临时工作区，已丢弃改动")
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
            run = get_agent_run_detail(run_id) or {}
            permission_error = validate_platform_runtime_permissions(agent, run, step)
            if permission_error:
                raise RuntimeError(permission_error)
            task = _step_execution_task(step)
            context_payload = build_platform_runtime_context(run_id, step, agent, task)
            snapshot = capture_workspace_snapshot(sandbox, run_id)
            result = await self._run_opencode(agent, sandbox["workspacePath"], context_payload["prompt"])
            display_output = result["text"] or result["stdout"]
            logs = f"$ {' '.join(result['command'])}\n{display_output}\n{result['stderr']}".strip()
            sync_result = sync_platform_workspace_changes(
                sandbox,
                run_id,
                snapshot,
                created_by_step_id=step["id"],
            )
            synced_files = sync_result["files"]
            conflicts = sync_result["conflicts"]
            if conflicts:
                update_agent_run_step(
                    step["id"],
                    status="conflict",
                    output={
                        "runtime": "opencode",
                        "command": result["command"],
                        "text": result["text"],
                        "files": synced_files,
                        "conflicts": conflicts,
                        "agenthubContext": context_payload["metadata"],
                    },
                    append_log=logs,
                    error="文件冲突",
                    mark_finished=True,
                    runtime_metadata={
                        "opencode": result,
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
                error = result["stderr"] or result["stdout"] or "opencode 执行失败"
            update_agent_run_step(
                step["id"],
                status=status,
                output={
                    "runtime": "opencode",
                    "command": result["command"],
                    "text": result["text"],
                    "files": synced_files,
                    "agenthubContext": context_payload["metadata"],
                },
                append_log=logs,
                error=error,
                mark_finished=True,
                runtime_metadata={
                    "opencode": result,
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
                runtime_metadata={"runtime": "opencode", "error": str(exc)},
            )
            await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "error": str(exc)})
        return True
