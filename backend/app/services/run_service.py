import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.config import settings
from app.database import *
from app.services.agent_tool_catalog_service import agent_has_tool
from app.services.attachment_context_service import materialize_attachments_to_workspace
from app.services.file_version_service import FileVersionService
from app.services.message_service import (
    agent_is_callable,
    choose_agent_for_conversation,
    emit_conversation_event,
    get_effective_agent_for_conversation,
    latest_active_run_for_conversation,
)
from app.services.run_scheduler import RunScheduler
from app.services.planning_service import plan_run_for_conversation
from app.services.sandbox_service import SandboxService
from app.services.workspace_agents_service import ensure_workspace_agents_file, read_workspace_agents_context
from app.services.workspace_index_service import rebuild_workspace_index_for_run, resolve_workspace_action

RunEventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]
ORPHANED_RUN_RECOVERY_GRACE_SECONDS = 30
ACTIVE_RUN_STEP_STATUSES = {"pending", "running"}
RECOVERABLE_FINALIZATION_ERRORS = {
    "FOREIGN KEY constraint failed",
}


class WorkspaceActionDecision(Exception):
    def __init__(self, action_context: Dict[str, Any]) -> None:
        super().__init__(action_context.get("clarificationQuestion") or action_context.get("reason") or "Workspace action decision")
        self.action_context = action_context

def run_allowed_agent_ids(conversation: Dict[str, Any]) -> List[str]:
    agent_ids = [
        agent_id for agent_id in conversation.get("agentIds", [])
        if agent_id != ORCHESTRATOR_AGENT_ID
    ]
    callable_ids = []
    for agent_id in agent_ids:
        agent = get_effective_agent_for_conversation(conversation, agent_id)
        if agent_is_callable(agent):
            callable_ids.append(agent_id)
    if callable_ids:
        return callable_ids
    fallback = choose_agent_for_conversation(conversation)
    return [fallback["id"]] if fallback else ["agent-claude-code"]


def _render_planning_message(message: Dict[str, Any]) -> str:
    role = "用户" if message.get("role") == "user" else str(message.get("senderName") or "Agent")
    content = str(message.get("content") or "").strip()
    return f"{role}: {content}"


def _conversation_planning_context(
    conversation: Dict[str, Any],
    agent: Optional[Dict[str, Any]] = None,
    exclude_message_ids: Optional[set[str]] = None,
) -> str:
    conversation_id = str(conversation.get("id") or "")
    if not conversation_id or conversation.get("mode") not in {"agent", "single", "group"}:
        return ""
    exclude_message_ids = exclude_message_ids or set()
    sections: List[str] = []

    summary = get_conversation_summary(conversation_id)
    if summary and str(summary.get("summary") or "").strip():
        sections.append("[会话摘要]\n" + str(summary["summary"]).strip())

    memories = list_active_memories(conversation_id, limit=20) if agent_has_tool(agent, "memory.use") else []
    if memories:
        sections.append(
            "[长期记忆]\n" + "\n".join(
                f"- ({memory['category']}, {memory['confidence']:.2f}) {memory['content']}"
                for memory in memories
            )
        )

    pins = list_pins(conversation_id)
    if pins:
        sections.append(
            "[Pinned Messages]\n" + "\n".join(
                f"- {_render_planning_message(pin['message'])}"
                for pin in pins
                if pin.get("message")
            )
        )

    pinned_ids = set(get_pinned_message_ids(conversation_id))
    recent_messages = [
        message for message in list_effective_messages(conversation_id)
        if message.get("id") not in pinned_ids and message.get("id") not in exclude_message_ids
    ][-8:]
    if recent_messages:
        sections.append(
            "[最近有效消息]\n" + "\n".join(
                f"- {_render_planning_message(message)}"
                for message in recent_messages
            )
        )

    if not sections:
        return ""
    return (
        "[AgentHub Planning Context]\n"
        "以下内容用于理解用户连续多轮意图、成员分工和约束；不要把它当成要执行的文件内容。\n"
        + "\n\n".join(sections)
    )


def resolve_conversation_workspace(
    conversation: Dict[str, Any],
    owner_user_id: str,
    requested_workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    workspace_id = (requested_workspace_id or conversation.get("workspaceId") or "").strip() or None
    return ensure_conversation_workspace(
        conversation["id"],
        owner_user_id,
        workspace_id=workspace_id,
    )


def build_files_tree(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    root: Dict[str, Any] = {
        "name": "workspace",
        "type": "directory",
        "children": [],
    }
    directory_index: Dict[str, Dict[str, Any]] = {"": root}
    for file_meta in sorted(files, key=lambda item: str(item.get("path") or "")):
        path = str(file_meta.get("path") or "").strip().replace("\\", "/")
        if not path or path.startswith("/") or ".." in path.split("/"):
            continue
        current_path = ""
        parent = root
        parts = [part for part in path.split("/") if part]
        for part in parts[:-1]:
            current_path = f"{current_path}/{part}" if current_path else part
            node = directory_index.get(current_path)
            if not node:
                node = {
                    "name": part,
                    "type": "directory",
                    "path": current_path,
                    "children": [],
                }
                parent["children"].append(node)
                directory_index[current_path] = node
            parent = node
        parent["children"].append({
            "name": parts[-1],
            "type": "file",
            "path": path,
            "file": file_meta,
        })

    def sort_children(node: Dict[str, Any]) -> None:
        children = node.get("children") or []
        children.sort(key=lambda item: (item.get("type") != "directory", item.get("name", "")))
        for child in children:
            if child.get("type") == "directory":
                sort_children(child)

    sort_children(root)
    return root


async def emit_run_event(
    current_user: Dict[str, Any],
    conversation_id: str,
    event_type: str,
    data: Dict[str, Any],
) -> None:
    await emit_conversation_event(current_user, conversation_id, event_type, None, data)


def build_run_event_payload(run_id: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    run = get_agent_run_detail(run_id)
    payload: Dict[str, Any] = {"runId": run_id}
    if run:
        payload.update({
            "conversationId": run.get("conversationId"),
            "workspaceId": run.get("workspaceId"),
            "status": run.get("status"),
            "run": run,
            "sandbox": run.get("sandbox"),
            "workspace": run.get("workspace"),
            "steps": run.get("steps", []),
            "files": run.get("files", []),
            "conflicts": run.get("conflicts", []),
            "artifacts": list_artifacts_for_run(run_id),
        })
    if extra:
        payload.update(extra)
    return payload


async def start_queued_agent_run(run_id: str) -> None:
    run = get_agent_run(run_id)
    if not run or run.get("status") != "queued":
        return
    user = get_user(run["ownerUserId"])
    if not user:
        update_agent_run(run_id, status="failed", error="Run owner 不存在", mark_finished=True)
        return
    runtime_metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
    queue_payload = runtime_metadata.get("queuePayload") if isinstance(runtime_metadata.get("queuePayload"), dict) else {}

    async def queued_emit(event_type: str, data: Dict[str, Any]) -> None:
        await emit_run_event(user, run["conversationId"], event_type, data)

    try:
        await create_run_for_conversation(
            user,
            run["conversationId"],
            run["prompt"],
            payload=queue_payload,
            emit=queued_emit,
            existing_run_id=run_id,
        )
    except Exception as exc:
        current = get_agent_run(run_id)
        if current and current.get("status") not in TERMINAL_RUN_STATUSES:
            update_agent_run(run_id, status="failed", error=str(exc), mark_finished=True)
        await queued_emit("run.failed", build_run_event_payload(run_id, {"error": str(exc)}))


async def schedule_next_workspace_mutation_owner(next_owner: Optional[Dict[str, Any]]) -> None:
    if not next_owner:
        return
    owner_type = next_owner.get("ownerType")
    owner_id = str(next_owner.get("ownerId") or "")
    if not owner_id:
        return
    if owner_type == "run":
        asyncio.create_task(start_queued_agent_run(owner_id))
    elif owner_type == "deployment":
        from app.services.deployment_service import run_workspace_deployment

        asyncio.create_task(asyncio.to_thread(run_workspace_deployment, owner_id))


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(value)[:19], fmt)
        except ValueError:
            continue
    return None


def _latest_step_timestamp(steps: List[Dict[str, Any]]) -> Optional[datetime]:
    timestamps = [
        _parse_timestamp(step.get("finishedAt") or step.get("updatedAt") or step.get("startedAt"))
        for step in steps
    ]
    timestamps = [item for item in timestamps if item]
    return max(timestamps) if timestamps else None


async def recover_orphaned_finished_run(
    run_id: str,
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    detail = get_agent_run_detail(run_id, owner_user_id=owner_user_id)
    if not detail:
        return detail
    current_status = detail.get("status")
    current_error = str(detail.get("error") or "").strip()
    is_recoverable_failed_run = (
        current_status == "failed"
        and current_error in RECOVERABLE_FINALIZATION_ERRORS
    )
    if current_status != "running" and not is_recoverable_failed_run:
        return detail
    steps = detail.get("steps") or []
    if not steps or any(step.get("status") in ACTIVE_RUN_STEP_STATUSES for step in steps):
        return detail
    latest_step_at = _latest_step_timestamp(steps)
    if latest_step_at and (now_datetime() - latest_step_at).total_seconds() < ORPHANED_RUN_RECOVERY_GRACE_SECONDS:
        return detail

    failed_steps = [step for step in steps if step.get("status") in {"failed", "blocked"}]
    conflicts = [item for item in detail.get("conflicts") or [] if item.get("status") == "open"]
    if failed_steps:
        status = "failed"
        summary = "任务部分步骤失败"
    elif conflicts:
        status = "conflict"
        summary = "任务完成但存在文件冲突"
    else:
        status = "completed"
        summary = "沙箱任务完成"

    update_agent_run(run_id, status=status, summary=summary, error="", mark_finished=True)
    sandbox = detail.get("sandbox")
    if sandbox:
        try:
            await SandboxService().stop_container(
                sandbox["id"],
                sandbox.get("containerId"),
                final_status=status,
            )
            update_sandbox(sandbox["id"], status=status, error="")
        except Exception as exc:
            print(f"❌ [RunRecovery] stop sandbox failed run={run_id} error={exc}", flush=True)
            update_sandbox(sandbox["id"], status=status, error="")
    print(
        f"[RunRecovery] finalized orphaned run={run_id} status={status} steps={len(steps)}",
        flush=True,
    )
    return get_agent_run_detail(run_id, owner_user_id=owner_user_id)


def _restore_rollback_changes_to_workspace(
    sandbox: Optional[Dict[str, Any]],
    changes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    raw_workspace_path = str((sandbox or {}).get("workspacePath") or "").strip()
    if not raw_workspace_path:
        return [{key: value for key, value in item.items() if key != "content"} for item in changes]

    workspace_root = Path(raw_workspace_path).resolve()
    for item in changes:
        relative_path = str(item.get("path") or "").strip()
        if not relative_path:
            continue
        file_path = (workspace_root / relative_path).resolve()
        if workspace_root not in file_path.parents and file_path != workspace_root:
            continue
        if item.get("action") == "deleted":
            if file_path.exists() and file_path.is_file():
                file_path.unlink()
            continue
        content = item.get("content")
        if isinstance(content, str):
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")

    return [{key: value for key, value in item.items() if key != "content"} for item in changes]


def rollback_run_workspace_changes(
    run_id: str,
    owner_user_id: str,
) -> Dict[str, Any]:
    run = get_agent_run_detail(run_id, owner_user_id=owner_user_id)
    if not run:
        raise ValueError("Run 不存在")
    if run.get("status") in {"pending", "running"}:
        raise ValueError("Run 仍在执行中，暂不能撤销文件改动")

    changes = rollback_sandbox_files_for_run(run_id)
    rollback_changes = _restore_rollback_changes_to_workspace(run.get("sandbox"), changes)
    if run.get("workspaceId"):
        mark_workspace_index_stale(
            run["workspaceId"],
            "Run 文件改动已撤销",
            last_run_id=run_id,
        )
    update_agent_run(
        run_id,
        status="cancelled",
        summary="用户已撤销本次文件改动",
        mark_finished=True,
    )
    sandbox = run.get("sandbox")
    if sandbox:
        update_sandbox(sandbox["id"], status="cancelled")

    detail = get_agent_run_detail(run_id, owner_user_id=owner_user_id)
    return {
        "run": detail,
        "rollbackChanges": rollback_changes,
    }


async def finalize_run_if_conflicts_resolved(
    current_user: Dict[str, Any],
    run_id: str,
    emit: Optional[RunEventEmitter] = None,
) -> Optional[Dict[str, Any]]:
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail or detail.get("status") != "conflict":
        return detail
    open_conflicts = [
        conflict for conflict in detail.get("conflicts") or []
        if conflict.get("status") == "open"
    ]
    if open_conflicts:
        return detail

    sandbox = detail.get("sandbox")
    if not sandbox:
        return detail

    async def send(event_type: str, data: Dict[str, Any]) -> None:
        if emit:
            await emit(event_type, {"runId": run_id, **data})

    for step in detail.get("steps") or []:
        if step.get("status") == "conflict":
            output = step.get("output") if isinstance(step.get("output"), dict) else {}
            update_agent_run_step(
                step["id"],
                status="completed",
                output={**output, "conflictResolved": True},
                error="",
                mark_finished=True,
            )

    scheduler = RunScheduler()
    artifact_changes = await scheduler._sync_artifacts(run_id, sandbox, send)
    await rebuild_workspace_index_for_run(run_id, artifact_changes)
    summary = "冲突已解决，沙箱任务完成"
    update_agent_run(run_id, status="completed", summary=summary, error="", mark_finished=True)
    update_sandbox(sandbox["id"], status="completed", error="")
    payload = build_run_event_payload(
        run_id,
        {
            "status": "completed",
            "summary": summary,
            "artifactChanges": artifact_changes,
            "artifacts": list_artifacts_for_run(run_id),
        },
    )
    await scheduler._send_run_summary_message(run_id, "completed", summary, artifact_changes, [], [], send)
    await send("run.completed", payload)
    await send("conversation.all_tasks.completed", payload)
    return get_agent_run_detail(run_id, owner_user_id=current_user["id"])


def _shorten_retry_text(value: Any, max_chars: int = 1200) -> str:
    text = str(value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "..."


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _retry_root_run_id(run: Dict[str, Any]) -> str:
    metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
    return str(metadata.get("retryRootRunId") or run.get("id") or "").strip()


def _retry_attempt(run: Dict[str, Any]) -> int:
    metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
    return max(0, _safe_int(metadata.get("retryAttempt"), 0))


def _build_retry_prompt(original_run: Dict[str, Any]) -> str:
    prompt = str(original_run.get("prompt") or "").strip()
    status = str(original_run.get("status") or "")
    summary = _shorten_retry_text(original_run.get("summary") or original_run.get("error") or "无摘要")
    failed_steps = [
        step for step in original_run.get("steps") or []
        if step.get("status") in {"failed", "blocked", "conflict"}
    ]
    lines = [
        prompt,
        "",
        "[Retry Context]",
        "这是对失败 Run 的重试。",
        f"retryOfRunId: {original_run.get('id')}",
        f"上次状态: {status}",
        f"上次摘要: {summary}",
    ]
    if failed_steps:
        lines.append("失败步骤:")
        for step in failed_steps[:8]:
            task = _shorten_retry_text(step.get("task"), 500)
            error = _shorten_retry_text(step.get("error") or step.get("logs"), 700)
            lines.append(
                "- "
                f"{step.get('id')} / {step.get('agentName') or step.get('agentId') or 'Agent'} "
                f"/ task: {task or '无任务描述'} "
                f"/ error: {error or '无错误详情'}"
            )
    else:
        lines.append("失败步骤: 无明确失败步骤，请参考上次状态和摘要。")
    lines.extend([
        "回滚说明:",
        "- 上次失败产生的文件改动已回滚，本次请从当前 workspace 状态重新执行。",
        "要求:",
        "- 优先规避上次失败原因。",
        "- 不要假设失败 Run 的中间文件仍然存在。",
    ])
    return "\n".join(lines).strip()


def _retry_chain(final_run: Dict[str, Any], owner_user_id: str) -> List[Dict[str, Any]]:
    chain: List[Dict[str, Any]] = []
    seen = set()
    current: Optional[Dict[str, Any]] = final_run
    while current and current.get("id") not in seen:
        seen.add(current["id"])
        chain.append(current)
        metadata = current.get("runtimeMetadata") if isinstance(current.get("runtimeMetadata"), dict) else {}
        previous_id = str(metadata.get("retryOfRunId") or "").strip()
        if not previous_id:
            break
        current = get_agent_run_detail(previous_id, owner_user_id=owner_user_id)
    return list(reversed(chain))


def _run_failure_lines(run: Dict[str, Any], max_steps: int = 6) -> List[str]:
    lines = []
    status = str(run.get("status") or "unknown")
    summary = _shorten_retry_text(run.get("summary") or run.get("error") or "无摘要", 500)
    metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
    attempt = _safe_int(metadata.get("retryAttempt"), 0)
    attempt_label = f"retryAttempt={attempt}" if attempt else "initial"
    lines.append(f"- {run.get('id')}: {status}, {attempt_label}, summary: {summary}")
    failed_steps = [
        step for step in run.get("steps") or []
        if step.get("status") in {"failed", "blocked", "conflict"}
    ]
    for step in failed_steps[:max_steps]:
        task = _shorten_retry_text(step.get("task"), 300)
        error = _shorten_retry_text(step.get("error") or step.get("logs"), 500)
        lines.append(
            f"  - step {step.get('id')} / {step.get('agentName') or step.get('agentId') or 'Agent'}"
            f" / task: {task or '无任务描述'}"
            f" / error: {error or '无错误详情'}"
        )
    return lines


def _build_retry_fallback_prompt(
    final_run: Dict[str, Any],
    chain: List[Dict[str, Any]],
    max_retry_attempts: int,
) -> str:
    root_run = chain[0] if chain else final_run
    original_prompt = str(root_run.get("prompt") or final_run.get("prompt") or "").strip()
    final_steps = [
        step for step in final_run.get("steps") or []
        if step.get("status") in {"failed", "blocked", "conflict"}
    ]
    lines = [
        "你正在为一个已经自动重试多次仍失败的 Sandbox 任务生成最终结果。",
        "",
        "原始需求:",
        original_prompt or "无原始需求",
        "",
        "重试链路:",
    ]
    for item in chain:
        lines.extend(_run_failure_lines(item, max_steps=3))
    lines.extend([
        "",
        "最后一次失败详情:",
        f"- finalRunId: {final_run.get('id')}",
        f"- status: {final_run.get('status')}",
        f"- summary: {_shorten_retry_text(final_run.get('summary') or final_run.get('error') or '无摘要', 800)}",
    ])
    if final_steps:
        lines.append("- failed steps:")
        for step in final_steps[:8]:
            lines.append(
                "  - "
                f"{step.get('id')} / {step.get('agentName') or step.get('agentId') or 'Agent'} "
                f"/ task: {_shorten_retry_text(step.get('task'), 500) or '无任务描述'} "
                f"/ error/logs: {_shorten_retry_text(step.get('error') or step.get('logs'), 1200) or '无错误详情'}"
            )
    else:
        lines.append("- failed steps: 无明确失败步骤，请参考状态、摘要和日志。")
    lines.extend([
        "",
        "重要约束:",
        f"- 系统已自动重试 {max_retry_attempts} 次，不要再要求用户点击重试。",
        "- 不要假设失败中间文件仍然存在，失败文件改动已 rollback。",
        "- 必须给出一个最终可读结果。",
        "- 如果不能完成原始目标，请明确说明原因，并给出最接近可交付的替代方案。",
        "- 对代码任务，请给出建议文件结构、关键代码片段、修复步骤或部署排查步骤。",
        "- 输出应当直接面向用户，避免内部事件名和数据库字段噪音。",
    ])
    return "\n".join(lines).strip()


def _fallback_message_content(final_run: Dict[str, Any], chain: List[Dict[str, Any]], error: Optional[Exception] = None) -> str:
    root_run = chain[0] if chain else final_run
    lines = [
        "沙箱任务已自动重试多次但仍未成功完成。",
        "",
        f"原始需求：{_shorten_retry_text(root_run.get('prompt') or final_run.get('prompt'), 800)}",
        "",
        f"最后状态：{final_run.get('status') or 'failed'}",
        f"失败摘要：{_shorten_retry_text(final_run.get('summary') or final_run.get('error') or '无摘要', 800)}",
    ]
    if error:
        lines.extend(["", f"兜底模型调用也失败：{_shorten_retry_text(error, 800)}"])
    lines.extend([
        "",
        "可执行的下一步：",
        "1. 查看最后一次 Run 的失败步骤和命令日志，优先处理其中最早出现的错误。",
        "2. 确认依赖文件、启动命令、端口和 Dockerfile/docker-compose 配置是否完整。",
        "3. 如果是代码生成任务，可以基于最后一次摘要重新发起一个更小范围的任务，让模型先完成核心文件，再逐步补齐验证和部署。",
    ])
    return "\n".join(lines)


def _fallback_agent_for_run(conversation: Dict[str, Any], final_run: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if conversation.get("mode") == "group":
        return get_effective_agent_for_conversation(conversation, ORCHESTRATOR_AGENT_ID) or get_agent(
            ORCHESTRATOR_AGENT_ID,
            owner_user_id=conversation.get("ownerUserId"),
        )
    steps = final_run.get("steps") or []
    for step in steps:
        agent_id = str(step.get("agentId") or "").strip()
        if agent_id and agent_id != ORCHESTRATOR_AGENT_ID:
            agent = get_effective_agent_for_conversation(conversation, agent_id)
            if agent:
                return agent
    return choose_agent_for_conversation(conversation)


async def retry_agent_run(
    current_user: Dict[str, Any],
    run_id: str,
    emit: Optional[RunEventEmitter] = None,
    *,
    auto_retry: bool = False,
    max_retry_attempts: Optional[int] = None,
) -> Dict[str, Any]:
    original_run = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not original_run:
        raise ValueError("Run 不存在")
    status = str(original_run.get("status") or "")
    if status in {"pending", "running"}:
        raise ValueError("Run 仍在执行中，不能重试")
    if status == "completed":
        raise ValueError("已完成 Run 不需要重试")
    if status not in {"failed", "conflict", "cancelled"}:
        raise ValueError(f"当前 Run 状态不支持重试: {status}")
    conversation_id = str(original_run.get("conversationId") or "").strip()
    if not conversation_id:
        raise ValueError("原 Run 缺少 conversation")
    if not original_run.get("workspaceId"):
        raise ValueError("原 Run 缺少 workspace")
    if not str(original_run.get("prompt") or "").strip():
        raise ValueError("原 Run 缺少 prompt")

    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        raise ValueError("原 Run 所属会话不存在")
    original_metadata = original_run.get("runtimeMetadata") if isinstance(original_run.get("runtimeMetadata"), dict) else {}
    root_run_id = str(original_metadata.get("retryRootRunId") or original_run.get("id") or "").strip()
    current_attempt = max(0, _safe_int(original_metadata.get("retryAttempt"), 0))
    next_attempt = current_attempt + 1
    retry_limit = max_retry_attempts or settings.SANDBOX_AUTO_RETRY_MAX_ATTEMPTS
    dag = original_run.get("dag") if isinstance(original_run.get("dag"), dict) else {}
    workspace_action_context = dag.get("workspaceActionContext") if isinstance(dag.get("workspaceActionContext"), dict) else None
    payload = {
        "workspaceId": original_run.get("workspaceId"),
        "retryOfRunId": run_id,
        "retryRootRunId": root_run_id,
        "retryAttempt": next_attempt,
        "maxRetryAttempts": retry_limit,
        "autoRetry": bool(auto_retry),
        "environmentProfile": dag.get("environmentProfile") or {},
    }
    if workspace_action_context:
        payload["workspaceActionContext"] = workspace_action_context
    retry_prompt = _build_retry_prompt(original_run)
    run_agent = choose_agent_for_conversation(conversation)
    detail = await create_run_for_conversation(
        current_user=current_user,
        conversation_id=conversation_id,
        prompt=retry_prompt,
        payload=payload,
        emit=emit,
        runtime_agent=run_agent,
    )
    runtime_metadata = {
        **(detail.get("runtimeMetadata") or {}),
        "retryOfRunId": run_id,
        "retryRootRunId": root_run_id,
        "retryAttempt": next_attempt,
        "maxRetryAttempts": retry_limit,
        "autoRetry": bool(auto_retry),
    }
    updated = update_agent_run(detail["id"], runtime_metadata=runtime_metadata)
    return {
        "run": get_agent_run_detail(detail["id"], owner_user_id=current_user["id"]) or updated or detail,
        "retryOfRunId": run_id,
        "retryRootRunId": root_run_id,
        "retryAttempt": next_attempt,
        "maxRetryAttempts": retry_limit,
    }


async def create_retry_fallback_message(
    current_user: Dict[str, Any],
    final_run_id: str,
    emit: Optional[RunEventEmitter] = None,
    *,
    max_retry_attempts: Optional[int] = None,
) -> Dict[str, Any]:
    final_run = get_agent_run_detail(final_run_id, owner_user_id=current_user["id"])
    if not final_run:
        raise ValueError("Run 不存在")
    conversation_id = str(final_run.get("conversationId") or "").strip()
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        raise ValueError("Run 所属会话不存在")
    retry_limit = max_retry_attempts or settings.SANDBOX_AUTO_RETRY_MAX_ATTEMPTS
    chain = _retry_chain(final_run, current_user["id"])
    root_run = chain[0] if chain else final_run
    root_run_id = _retry_root_run_id(root_run) or root_run.get("id") or final_run.get("id")
    fallback_agent = _fallback_agent_for_run(conversation, final_run)
    sender_id = (fallback_agent or {}).get("id") or "system"
    sender_name = (fallback_agent or {}).get("name") or "系统"
    role = "orchestrator" if conversation.get("mode") == "group" else ("agent" if fallback_agent else "system")
    fallback_prompt = _build_retry_fallback_prompt(final_run, chain, retry_limit)
    content = ""
    model_error: Optional[Exception] = None
    if fallback_agent:
        try:
            from app.services.message_service import call_agent_once

            content = (await call_agent_once(conversation["id"], fallback_agent, fallback_prompt)).strip()
        except Exception as exc:
            model_error = exc
            content = ""
    if not content:
        content = _fallback_message_content(final_run, chain, model_error)
    metadata = {
        "source": "sandboxRetryFallback",
        "retryRootRunId": root_run_id,
        "finalRunId": final_run_id,
        "retryExhausted": True,
        "maxRetryAttempts": retry_limit,
        "retryRunIds": [item.get("id") for item in chain],
        "modelError": str(model_error) if model_error else None,
    }
    message = create_message(
        conversation_id=conversation["id"],
        sender_id=sender_id,
        sender_name=sender_name,
        role=role,
        msg_type="text",
        content=content,
        metadata=metadata,
    )
    update_conversation_activity(conversation["id"], content)
    if emit:
        await emit(
            "conversation.message.completed",
            {
                "conversationId": conversation["id"],
                "messageId": message["id"],
                "finishReason": "stop",
                "fullMessage": message,
                "metadata": metadata,
            },
        )
        await emit(
            "conversation.all_tasks.completed",
            {
                "conversationId": conversation["id"],
                "runId": final_run_id,
                "status": "failed",
                "retryExhausted": True,
                "message": message,
            },
        )
    return message


def namespace_run_dag(run_id: str, dag: Dict[str, Any]) -> Dict[str, Any]:
    steps = dag.get("steps") if isinstance(dag.get("steps"), list) else []
    id_map = {
        str(step.get("id") or f"step-{index + 1}"): f"{run_id}-step-{index + 1}"
        for index, step in enumerate(steps)
        if isinstance(step, dict)
    }
    namespaced_steps = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        original_id = str(step.get("id") or f"step-{index + 1}")
        depends_on = step.get("dependsOn") if isinstance(step.get("dependsOn"), list) else []
        namespaced_steps.append({
            **step,
            "id": id_map.get(original_id, f"{run_id}-step-{index + 1}"),
            "dependsOn": [
                id_map[dep]
                for dep in [str(item) for item in depends_on]
                if dep in id_map
            ],
        })
    return {**dag, "steps": namespaced_steps}


def _safe_materialized_filename(title: str, artifact_id: str) -> str:
    name = Path(str(title or "")).name.strip() or f"{artifact_id}.txt"
    name = re.sub(r"[^A-Za-z0-9._+-]+", "-", name).strip(".-") or f"{artifact_id}.txt"
    if "." not in name:
        name += ".txt"
    return name[:120]


def _materialize_target_artifacts(
    sandbox: Dict[str, Any],
    run_id: str,
    action_context: Dict[str, Any],
    file_service: FileVersionService,
) -> Dict[str, Any]:
    if action_context.get("action") != "modify_existing":
        return action_context
    target_files = list(action_context.get("targetFiles") or [])
    existing_target_paths = {item.get("path") for item in target_files if isinstance(item, dict)}
    for artifact_id in list(action_context.get("targetArtifacts") or []):
        if any(item.get("artifactId") == artifact_id for item in target_files if isinstance(item, dict)):
            continue
        artifact = get_artifact(artifact_id)
        if not artifact or not artifact.get("content"):
            continue
        filename = _safe_materialized_filename(artifact.get("title") or "", artifact_id)
        path = f"artifacts/{artifact_id}/{filename}"
        existing = get_sandbox_file(run_id, path)
        if existing and existing.get("artifactId") not in {None, "", artifact_id}:
            raise ValueError(f"Artifact materialize 路径已被其他产物占用: {path}")
        if existing and existing.get("currentVersion"):
            if existing.get("artifactId") == artifact_id:
                target_files.append({
                    "path": existing["path"],
                    "baseVersion": int(existing.get("currentVersion") or 0),
                    "contentHash": existing.get("contentHash") or "",
                    "artifactId": artifact_id,
                    "materialized": True,
                })
                continue
            raise ValueError(f"Artifact materialize 路径已存在: {path}")
        result = file_service.write_file(
            sandbox=sandbox,
            run_id=run_id,
            path=path,
            content=str(artifact.get("content") or ""),
            base_version=0,
            step_id=None,
        )
        if result.get("status") != "saved":
            raise ValueError(f"Artifact materialize 失败: {path}")
        file_meta = result["file"]
        set_sandbox_file_artifact(file_meta["id"], artifact_id)
        target_files.append({
            "path": file_meta["path"],
            "baseVersion": int(file_meta.get("currentVersion") or 0),
            "contentHash": file_meta.get("contentHash") or "",
            "artifactId": artifact_id,
            "materialized": True,
        })
        existing_target_paths.add(file_meta["path"])
    action_context = {**action_context, "targetFiles": target_files}
    return action_context


def _format_dag_task_plan_content(dag_payload: Dict[str, Any]) -> str:
    steps = dag_payload.get("steps") if isinstance(dag_payload.get("steps"), list) else []
    if not steps:
        return "Orchestrator 已完成规划，但没有生成可执行步骤。"
    lines = ["Orchestrator 已完成规划："]
    for index, step in enumerate(steps[:8], start=1):
        agent_name = str(step.get("agentName") or step.get("agentId") or "Agent")
        task = str(step.get("task") or "").strip()
        lines.append(f"{index}. {agent_name} - {task}")
    return "\n".join(lines)


def _group_available_agent_summaries(conversation: Dict[str, Any]) -> List[Dict[str, Any]]:
    if conversation.get("mode") != "group":
        return []
    summaries: List[Dict[str, Any]] = []
    for agent_id in run_allowed_agent_ids(conversation):
        agent = get_effective_agent_for_conversation(conversation, agent_id)
        if not agent:
            continue
        summaries.append({
            "agentId": agent.get("id"),
            "name": agent.get("name"),
            "runtime": agent.get("runtime") or "native",
            "description": agent.get("description") or "",
        })
    return summaries


async def _emit_group_planning_status(
    conversation: Dict[str, Any],
    run_id: str,
    event_type: str,
    content: str,
    emit: Optional[RunEventEmitter],
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if conversation.get("mode") != "group":
        return None
    message = create_message(
        conversation_id=conversation["id"],
        sender_id=ORCHESTRATOR_AGENT_ID,
        sender_name="Orchestrator",
        role="orchestrator",
        msg_type="task-plan" if event_type == "orchestrator.planning.completed" else "status",
        content=content,
        metadata={
            "event": event_type,
            "runId": run_id,
            **(metadata or {}),
        },
    )
    update_conversation_activity(conversation["id"], content)
    if emit:
        await emit(event_type, {
            "runId": run_id,
            "conversationId": conversation["id"],
            "message": message,
            **(metadata or {}),
        })
    return message


async def create_run_for_conversation(
    current_user: Dict[str, Any],
    conversation_id: str,
    prompt: str,
    payload: Optional[Dict[str, Any]] = None,
    emit: Optional[RunEventEmitter] = None,
    runtime_agent: Optional[Dict[str, Any]] = None,
    existing_run_id: Optional[str] = None,
) -> Dict[str, Any]:
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        raise ValueError("会话不存在")
    if conversation.get("mode") == "agent":
        raise ValueError("Agent 联系人会话不支持沙箱任务，请创建 single/group 会话并选择工作区")
    if conversation.get("mode") not in {"agent", "single", "group"}:
        raise ValueError("Sandbox Run 仅支持 agent、single 或 group 会话")
    if conversation.get("mode") in {"agent", "single"} and not choose_agent_for_conversation(conversation):
        raise ValueError("当前 Agent 已隐藏或删除，无法创建 Sandbox Run")
    clean_prompt = str(prompt or "").strip()
    if not clean_prompt:
        raise ValueError("prompt 不能为空")
    payload = payload or {}
    run_runtime_metadata = payload.get("runtimeMetadata") if isinstance(payload.get("runtimeMetadata"), dict) else {}
    retry_metadata_keys = (
        "retryOfRunId",
        "retryRootRunId",
        "retryAttempt",
        "maxRetryAttempts",
        "autoRetry",
    )
    run_runtime_metadata = {
        **run_runtime_metadata,
        **{key: payload[key] for key in retry_metadata_keys if key in payload},
    }
    environment_profile = payload.get("environmentProfile")
    if not isinstance(environment_profile, dict):
        environment_profile = {}
    package_manager = str(environment_profile.get("packageManager") or "uv").strip() or "uv"
    allow_network = environment_profile.get("allowNetwork")
    if allow_network is None:
        allow_network = settings.SANDBOX_ALLOW_NETWORK
    environment_profile = {
        **environment_profile,
        "packageManager": package_manager,
        "allowNetwork": bool(allow_network),
    }

    sandbox_network = settings.SANDBOX_NETWORK if environment_profile["allowNetwork"] else "none"
    sandbox_service = SandboxService(network=sandbox_network)
    environment_profile["allowNetwork"] = sandbox_service.network != "none"

    requested_workspace_id = str(payload.get("workspaceId") or "").strip() or None
    workspace = resolve_conversation_workspace(
        conversation,
        current_user["id"],
        requested_workspace_id=requested_workspace_id,
    )
    if not workspace:
        raise ValueError("请先选择或新建工作区")

    existing_run = get_agent_run(existing_run_id, owner_user_id=current_user["id"]) if existing_run_id else None
    run_id = existing_run["id"] if existing_run else create_id("run")
    selected_runtime_agent = runtime_agent or choose_agent_for_conversation(conversation)
    if not agent_has_tool(selected_runtime_agent, "workspace.read"):
        raise ValueError("当前 Agent 未启用 workspace.read，不能创建工作区沙箱任务")
    run_runtime_metadata = {
        **run_runtime_metadata,
        "queuePayload": payload,
    }
    if not existing_run:
        create_agent_run(
            owner_user_id=current_user["id"],
            conversation_id=conversation_id,
            sandbox_id=None,
            prompt=clean_prompt,
            dag={},
            run_id=run_id,
            workspace_id=workspace["id"],
            status="queued",
            run_mode="write",
            queued_reason="workspace_mutation_lock_pending",
            runtime=(selected_runtime_agent or {}).get("runtime", "native"),
            model_config_id=(selected_runtime_agent or {}).get("modelConfigId"),
            runtime_metadata=run_runtime_metadata,
        )
    lock_result = try_acquire_workspace_mutation_lock(
        workspace_id=workspace["id"],
        owner_type="run",
        owner_id=run_id,
        mode="write",
        acquired_status="planning",
    )
    if not lock_result.get("acquired"):
        update_agent_run(run_id, queued_reason="workspace_mutation_lock_held")
        detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
        if detail is not None:
            detail["queuePosition"] = lock_result.get("queuePosition") or mutation_queue_position(workspace["id"], "run", run_id)
        if emit:
            await emit("run.queued", build_run_event_payload(run_id, {"run": detail, "queuePosition": (detail or {}).get("queuePosition")}))
        return detail or get_agent_run(run_id)

    if emit:
        await emit("workspace.mutation_lock.acquired", build_run_event_payload(run_id, {"lock": lock_result.get("lock")}))
        started_payload = build_run_event_payload(run_id, {"runMode": "write"})
        await emit("run.started", started_payload)
        await emit("run.updated", started_payload)

    lock_token = int((lock_result.get("lock") or {}).get("fencingToken") or 0)
    planning_heartbeat_stop = asyncio.Event()

    async def planning_heartbeat_loop() -> None:
        while not planning_heartbeat_stop.is_set():
            try:
                await asyncio.wait_for(planning_heartbeat_stop.wait(), timeout=30)
                break
            except asyncio.TimeoutError:
                current = get_agent_run(run_id)
                if not current or current.get("status") not in {"queued", "planning"}:
                    break
                ok = heartbeat_workspace_mutation_lock(
                    workspace["id"],
                    "run",
                    run_id,
                    lock_token,
                )
                if not ok:
                    update_agent_run(
                        run_id,
                        status="failed",
                        error="workspace mutation lock lost during planning",
                        mark_finished=True,
                    )
                    break

    planning_heartbeat_task = asyncio.create_task(planning_heartbeat_loop())

    def ensure_current_lock(stage: str) -> None:
        if not is_workspace_mutation_lock_current(workspace["id"], "run", run_id, lock_token):
            update_agent_run(
                run_id,
                status="failed",
                error=f"workspace mutation lock lost before {stage}",
                mark_finished=True,
            )
            raise RuntimeError(f"workspace mutation lock lost before {stage}")

    try:
        ensure_workspace_agents_file(workspace)
    except Exception as exc:
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        release_result = release_workspace_mutation_lock(workspace["id"], "run", run_id, lock_token)
        update_agent_run(
            run_id,
            status="failed",
            error=str(exc),
            queued_reason="",
            lock_owner_id="",
            lock_fencing_token=0,
            mark_finished=True,
        )
        await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))
        raise

    explicit_artifact_ref = payload.get("artifactRef") if isinstance(payload.get("artifactRef"), dict) else None
    workspace_action_context = payload.get("workspaceActionContext") if isinstance(payload.get("workspaceActionContext"), dict) else None
    if not workspace_action_context:
        workspace_action_context = await resolve_workspace_action(
            conversation_id=conversation_id,
            workspace_id=workspace["id"],
            user_content=clean_prompt,
            explicit_artifact_ref=explicit_artifact_ref,
        )
    action = workspace_action_context.get("action")
    if action in {"clarify", "answer_only"}:
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        release_result = release_workspace_mutation_lock(
            workspace["id"],
            "run",
            run_id,
            (lock_result.get("lock") or {}).get("fencingToken"),
        )
        update_agent_run(
            run_id,
            status="completed" if action == "answer_only" else "failed",
            summary="Workspace action downgraded",
            queued_reason="",
            lock_owner_id="",
            lock_fencing_token=0,
            mark_finished=True,
        )
        await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))
        raise WorkspaceActionDecision(workspace_action_context)

    try:
        ensure_current_lock("attachment materialization")
        uploaded_attachments = payload.get("attachments") if isinstance(payload.get("attachments"), list) else []
        materialized_attachments: List[Dict[str, Any]] = []
        if uploaded_attachments:
            materialized_attachments = materialize_attachments_to_workspace(
                uploaded_attachments,
                str(workspace["workspacePath"]),
            )
            run_runtime_metadata = {
                **run_runtime_metadata,
                "uploadedAttachments": materialized_attachments,
            }
    except Exception as exc:
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        release_result = release_workspace_mutation_lock(workspace["id"], "run", run_id, lock_token)
        current = get_agent_run(run_id)
        if current and current.get("status") not in TERMINAL_RUN_STATUSES:
            update_agent_run(
                run_id,
                status="failed",
                error=str(exc),
                queued_reason="",
                lock_owner_id="",
                lock_fencing_token=0,
                mark_finished=True,
            )
        await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))
        raise

    try:
        workspace_agents_context = read_workspace_agents_context(workspace["id"])
    except Exception as exc:
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        release_result = release_workspace_mutation_lock(workspace["id"], "run", run_id, lock_token)
        current = get_agent_run(run_id)
        if current and current.get("status") not in TERMINAL_RUN_STATUSES:
            update_agent_run(
                run_id,
                status="failed",
                error=str(exc),
                queued_reason="",
                lock_owner_id="",
                lock_fencing_token=0,
                mark_finished=True,
            )
        await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))
        raise
    if workspace_agents_context:
        print(
            f"[WorkspaceAgentsContext] stage=run.create workspace={workspace['id']}\n{workspace_agents_context}",
            flush=True,
        )
    dag_prompt = clean_prompt
    planning_context = _conversation_planning_context(conversation, agent=runtime_agent)
    if planning_context:
        dag_prompt += "\n\n" + planning_context
    if workspace_agents_context:
        dag_prompt += "\n\n" + workspace_agents_context
    if materialized_attachments:
        lines = ["[Uploaded Attachments]"]
        for item in materialized_attachments:
            if item.get("status") == "materialized":
                if item.get("archive") and item.get("extractDir"):
                    lines.append(
                        f"- {item.get('name')} zip={item.get('path')} extractedDir={item.get('extractDir')} "
                        f"({item.get('mimeType')}, {item.get('size')} bytes, sha256={item.get('sha256')}, "
                        f"extractStatus={item.get('extractStatus')}, skipped={len(item.get('skipped') or [])})"
                    )
                else:
                    lines.append(
                        f"- {item.get('path')} ({item.get('name')}, {item.get('mimeType')}, "
                        f"{item.get('size')} bytes, sha256={item.get('sha256')})"
                    )
            else:
                lines.append(f"- {item.get('name')} 未复制到工作区：{item.get('reason')}")
        lines.append("只有当用户明确要求修改、转换、导出或生成文件时，才操作这些原始附件。")
        dag_prompt += "\n\n" + "\n".join(lines)
    if workspace_action_context:
        dag_prompt += "\n\n[Workspace Action Context]\n" + json.dumps(workspace_action_context, ensure_ascii=False)

    planning_messages: List[Dict[str, Any]] = []

    async def emit_group_planning(
        event_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        message = await _emit_group_planning_status(
            conversation,
            run_id,
            event_type,
            content,
            emit,
            metadata,
        )
        if message:
            planning_messages.append(message)

    await emit_group_planning(
        "orchestrator.planning.started",
        "Orchestrator 正在分析需求并规划群聊任务...",
        {"phase": "started"},
    )
    await emit_group_planning(
        "orchestrator.planning.context_ready",
        "Orchestrator 已读取工作区上下文和任务目标。",
        {
            "phase": "context_ready",
            "workspaceId": workspace["id"],
            "hasWorkspaceAgentsContext": bool(workspace_agents_context),
            "workspaceAction": workspace_action_context.get("action"),
        },
    )
    available_agents = _group_available_agent_summaries(conversation)
    await emit_group_planning(
        "orchestrator.planning.agents_selected",
        f"Orchestrator 已确认 {len(available_agents)} 个可调度成员 Agent。",
        {
            "phase": "agents_selected",
            "availableAgents": available_agents,
        },
    )
    await emit_group_planning(
        "orchestrator.planning.model_started",
        "Orchestrator 正在生成任务分派计划...",
        {"phase": "model_started"},
    )
    try:
        dag_payload = await plan_run_for_conversation(
            conversation=conversation,
            prompt=clean_prompt,
            selected_agent=selected_runtime_agent,
            planner_prompt=dag_prompt,
        )
    except Exception as exc:
        await emit_group_planning(
            "orchestrator.planning.failed",
            f"Orchestrator 规划失败：{exc}",
            {"phase": "failed", "error": str(exc)},
        )
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        release_result = release_workspace_mutation_lock(
            workspace["id"],
            "run",
            run_id,
            (lock_result.get("lock") or {}).get("fencingToken"),
        )
        update_agent_run(
            run_id,
            status="failed",
            error=str(exc),
            queued_reason="",
            lock_owner_id="",
            lock_fencing_token=0,
            mark_finished=True,
        )
        await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))
        raise
    await emit_group_planning(
        "orchestrator.planning.model_completed",
        "Orchestrator 已生成初步任务计划。",
        {
            "phase": "model_completed",
            "strategy": dag_payload.get("strategy") or dag_payload.get("planningStrategy"),
            "stepCount": len(dag_payload.get("steps") or []),
        },
    )
    dag_payload["environmentProfile"] = environment_profile
    dag_payload["workspaceActionContext"] = workspace_action_context
    if workspace_agents_context:
        dag_payload["workspaceAgentsContext"] = workspace_agents_context
    dag = namespace_run_dag(run_id, dag_payload)
    enriched_steps = []
    for step in dag.get("steps", []):
        step_agent = get_effective_agent_for_conversation(conversation, step.get("agentId")) or selected_runtime_agent
        enriched_steps.append({
            **step,
            "runtime": (step_agent or {}).get("runtime", "native"),
            "modelConfigId": (step_agent or {}).get("modelConfigId"),
            "runtimeMetadata": {
                "agentRuntime": (step_agent or {}).get("runtime", "native"),
                "agentModelConfigId": (step_agent or {}).get("modelConfigId"),
                "displayTask": clean_prompt,
            },
        })
    dag = {**dag, "steps": enriched_steps}
    await emit_group_planning(
        "orchestrator.planning.normalized",
        "Orchestrator 已完成计划规范化，准备创建沙箱任务。",
        {
            "phase": "normalized",
            "strategy": dag.get("strategy") or dag.get("planningStrategy"),
            "stepCount": len(dag.get("steps") or []),
            "dagPreview": dag,
        },
    )
    await emit_group_planning(
        "orchestrator.planning.completed",
        _format_dag_task_plan_content(dag),
        {
            "phase": "completed",
            "strategy": dag.get("strategy") or dag.get("planningStrategy"),
            "stepCount": len(dag.get("steps") or []),
            "dagPreview": dag,
        },
    )
    print(
        f"[SandboxRun] dag generated run={run_id} steps={len(dag.get('steps', []))} "
        f"strategy={dag.get('strategy') or dag.get('planningStrategy')}",
        flush=True,
    )
    try:
        ensure_current_lock("sandbox creation")
        sandbox = create_sandbox(
            owner_user_id=current_user["id"],
            conversation_id=conversation_id,
            image=settings.SANDBOX_IMAGE,
            network=sandbox_service.network,
            workspace_path=str(workspace["workspacePath"]),
            workspace_id=workspace["id"],
        )
        update_sandbox(sandbox["id"], run_id=run_id)
        update_agent_run(
            run_id,
            sandbox_id=sandbox["id"],
            queued_reason="",
            runtime_metadata=run_runtime_metadata,
        )
        update_agent_run_dag(run_id, dag)
        if workspace_action_context.get("action") == "modify_existing" and workspace_action_context.get("targetArtifacts"):
            ensure_current_lock("target artifact materialization")
            workspace_action_context = _materialize_target_artifacts(
                sandbox=sandbox,
                run_id=run_id,
                action_context=workspace_action_context,
                file_service=FileVersionService(sandbox_service),
            )
            dag = {
                **dag,
                "workspaceActionContext": workspace_action_context,
            }
            update_agent_run_dag(run_id, dag)
        create_agent_run_steps(run_id, dag.get("steps", []))
        print(
            f"[SandboxRun] created run={run_id} sandbox={sandbox['id']} "
            f"workspace={workspace['workspacePath']} network={sandbox_service.network}",
            flush=True,
        )
        detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
        if detail is not None:
            detail["planningMessages"] = planning_messages

        async def scheduler_emit(event_type: str, data: Dict[str, Any]) -> None:
            if emit:
                await emit(event_type, data)

        if emit:
            await emit("run.created", build_run_event_payload(run_id, {
                "run": detail,
                "planningMessages": planning_messages,
            }))
        ensure_current_lock("scheduler start")
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        asyncio.create_task(RunScheduler(sandbox_service=sandbox_service).run(run_id, emit=scheduler_emit))
        return detail
    except Exception as exc:
        planning_heartbeat_stop.set()
        await planning_heartbeat_task
        release_result = release_workspace_mutation_lock(
            workspace["id"],
            "run",
            run_id,
            lock_token,
        )
        current = get_agent_run(run_id)
        if current and current.get("status") not in TERMINAL_RUN_STATUSES:
            update_agent_run(
                run_id,
                status="failed",
                error=str(exc),
                queued_reason="",
                lock_owner_id="",
                lock_fencing_token=0,
                mark_finished=True,
            )
        await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))
        raise
