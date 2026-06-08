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
    apply_isolated_runtime_home_env,
    ensure_workspace_path,
    extract_json_object,
    finalize_readonly_chat_workspace,
    prepare_readonly_chat_workspace,
    readonly_chat_prompt,
    runtime_home_for_agent,
    validate_http_base_url,
)
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


class ClaudeCodeRuntimeAdapter(RuntimeAdapter):
    runtime = "claude_code"

    def _runtime_config(self, agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return (agent or {}).get("runtimeConfig") if isinstance((agent or {}).get("runtimeConfig"), dict) else {}

    def _resolve_claude_config(self, agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        owner_user_id = (agent or {}).get("ownerUserId")
        config = resolve_model_config(agent, owner_user_id=owner_user_id)
        config_error = validate_model_config_for_runtime(config, "claude_code")
        if config_error:
            raise RuntimeError(config_error)
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
            env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = model_name
            env["ANTHROPIC_DEFAULT_OPUS_MODEL"] = model_name
            env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = model_name
            env["ANTHROPIC_REASONING_MODEL"] = model_name
        env["CLAUDE_CODE_ATTRIBUTION_HEADER"] = "0"
        env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
        env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
        return apply_isolated_runtime_home_env(
            env,
            runtime_home_for_agent(agent, "claude_code", resolved["config"]),
        )

    def _extract_text_output(self, stdout: str) -> str:
        result_texts = []
        stream_texts = []
        fallback = ""
        raw = str(stdout or "")
        decoder = json.JSONDecoder()
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
                    fallback += raw[index:].strip()
                    break
                fallback += raw[index:next_object].strip()
                index = next_object
                continue
            if not isinstance(event, dict):
                continue
            if isinstance(event.get("result"), str) and event["result"].strip():
                result_texts.append(event["result"].strip())
            if isinstance(event.get("text"), str) and event["text"].strip():
                stream_texts.append(event["text"].strip())
            message = event.get("message") if isinstance(event.get("message"), dict) else {}
            content = message.get("content") or event.get("content")
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and str(item.get("text") or "").strip():
                        stream_texts.append(str(item["text"]).strip())
            elif isinstance(content, str) and content.strip():
                stream_texts.append(content.strip())
            delta = event.get("delta") if isinstance(event.get("delta"), dict) else {}
            if isinstance(delta.get("text"), str) and delta["text"].strip():
                stream_texts.append(delta["text"].strip())
        texts = result_texts or stream_texts
        deduped = []
        for text in texts:
            if text not in deduped:
                deduped.append(text)
        return "\n".join(deduped).strip() or fallback.strip()

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
            "--verbose",
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
        workspace_context = read_workspace_agents_context(workspace["id"])
        audit = prepare_readonly_chat_workspace(workspace, workspace_context)
        try:
            result = await self._run_claude_code(
                agent,
                ensure_workspace_path(audit["workspacePath"]),
                readonly_chat_prompt(user_input, workspace_context),
            )
        finally:
            audit = finalize_readonly_chat_workspace(audit)
        if audit.get("tempWorkspaceMutated"):
            return READONLY_CHAT_MUTATION_MESSAGE
        if result["returnCode"] != 0:
            return f"Claude Code 执行失败。\n\n{result['stderr'] or result['stdout']}"
        return result["text"] or result["stdout"] or "Claude Code 执行完成。"

    async def complete_json(self, agent: Dict[str, Any], conversation: Dict[str, Any], system_prompt: str, user_content: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=conversation.get("ownerUserId")) if workspace_id else None
        audit: Optional[Dict[str, Any]] = None
        workspace_context = read_workspace_agents_context(workspace["id"]) if workspace else ""
        if workspace:
            audit = prepare_readonly_chat_workspace(workspace, workspace_context)
            workspace_path = ensure_workspace_path(audit["workspacePath"])
        else:
            workspace_path = ensure_workspace_path(str((context or {}).get("workspacePath") or "."))
        prompt = (
            f"{readonly_chat_prompt('', workspace_context)}\n\n"
            f"{system_prompt}\n\n"
            "你必须只输出一个 JSON 对象，不要输出 Markdown，不要输出解释文本。\n\n"
            f"{user_content}"
        )
        try:
            result = await self._run_claude_code(agent, workspace_path, prompt)
        finally:
            if audit:
                audit = finalize_readonly_chat_workspace(audit)
        if audit and audit.get("tempWorkspaceMutated"):
            raise ValueError("Claude Code JSON 调用尝试修改临时工作区，已丢弃改动")
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
            run = get_agent_run_detail(run_id) or {}
            permission_error = validate_platform_runtime_permissions(agent, run, step)
            if permission_error:
                raise RuntimeError(permission_error)
            task = _step_execution_task(step)
            context_payload = build_platform_runtime_context(run_id, step, agent, task)
            snapshot = capture_workspace_snapshot(sandbox, run_id)
            result = await self._run_claude_code(agent, ensure_workspace_path(sandbox["workspacePath"]), context_payload["prompt"])
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
                        "runtime": "claude_code",
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
                        "claudeCode": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}},
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
                        "runtime": "claude_code",
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
                        "claudeCode": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}},
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
                error = result["stderr"] or result["stdout"] or "Claude Code 执行失败"
            update_agent_run_step(
                step["id"],
                status=status,
                output={
                    "runtime": "claude_code",
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
                    "claudeCode": {k: v for k, v in result.items() if k not in {"stdout", "stderr"}},
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
                runtime_metadata={"runtime": "claude_code", "error": str(exc)},
            )
            await send("run.step.failed", {"runId": run_id, "stepId": step["id"], "error": str(exc)})
        return True
