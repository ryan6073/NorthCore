import json
from typing import Any, Dict, List, Optional

from app.database import (
    get_agent_run_detail,
    get_conversation,
    get_conversation_summary,
    get_pinned_message_ids,
    list_active_memories,
    list_effective_messages,
    list_pins,
    update_agent_run,
)
from app.services.agent_tool_catalog_service import agent_has_tool
from app.services.workspace_agents_service import read_workspace_agents_context


MUTATION_MARKERS = (
    "修改", "改", "更新", "修复", "实现", "生成", "创建", "写", "删除", "替换",
    "优化", "完善", "调整", "保存", "应用", "build", "create", "write", "edit",
    "modify", "update", "fix", "implement", "delete", "replace", "generate",
)
NO_WRITE_TASK_MARKERS = (
    "只做 review", "轻量 review", "review", "只检查", "检查", "审查", "确认",
    "验证", "建议", "不要修改", "不能修改", "不修改", "不要大改", "不运行命令",
    "只读", "read-only", "readonly", "no write", "do not modify", "do not edit",
)
COMMAND_MARKERS = (
    "运行", "执行", "测试", "验证", "构建", "安装", "启动", "部署",
    "run", "test", "build", "install", "start", "deploy", "verify",
)
CLARIFICATION_MARKERS = (
    "请提供", "请补充", "请回答", "请确认", "请先", "需要你", "需要您",
    "请选择", "告诉我", "主题", "要点", "clarify", "provide", "confirm", "choose",
)


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def _supports_persistent_context(conversation: Optional[Dict[str, Any]]) -> bool:
    return bool(conversation and conversation.get("mode") in {"agent", "single", "group"})


def _system_prompt_for_conversation(
    conversation: Optional[Dict[str, Any]],
    agent: Optional[Dict[str, Any]],
) -> str:
    if (
        conversation
        and conversation.get("mode") == "group"
        and agent
        and agent.get("systemPromptSource") == "conversation_override"
        and str(agent.get("systemPrompt") or "").strip()
    ):
        return str(agent["systemPrompt"]).strip()
    if conversation and str(conversation.get("systemPrompt") or "").strip():
        return str(conversation["systemPrompt"]).strip()
    return str((agent or {}).get("systemPrompt") or "").strip()


def _render_message_for_context(message: Dict[str, Any]) -> str:
    role_label = "用户" if message.get("role") == "user" else message.get("senderName", "Agent")
    content = str(message.get("content") or "")
    metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
    artifact_ref = metadata.get("artifactRef") if isinstance(metadata.get("artifactRef"), dict) else None
    attachment_context = metadata.get("attachmentContext") if isinstance(metadata.get("attachmentContext"), dict) else None
    extras: List[str] = []
    if artifact_ref:
        extras.append("[artifactRef] " + _json_text(artifact_ref))
    if attachment_context and attachment_context.get("context"):
        extras.append("[attachmentContext]\n" + str(attachment_context.get("context")))
    return f"{role_label}: " + "\n".join([content, *extras]).strip()


def platform_step_needs_write(step: Dict[str, Any], run: Dict[str, Any]) -> bool:
    step_text = str(step.get("task") or "").lower()
    text = step_text or str(run.get("prompt") or "").lower()
    if step_text and any(marker in step_text for marker in NO_WRITE_TASK_MARKERS):
        return False
    action_context = (run.get("dag") or {}).get("workspaceActionContext") if isinstance(run.get("dag"), dict) else {}
    if isinstance(action_context, dict) and action_context.get("action") in {"modify_existing", "create_new"}:
        return True
    return any(marker in text for marker in MUTATION_MARKERS)


def platform_step_needs_command(step: Dict[str, Any], run: Dict[str, Any]) -> bool:
    text = f"{run.get('prompt') or ''}\n{step.get('task') or ''}".lower()
    return any(marker in text for marker in COMMAND_MARKERS)


def platform_output_requests_clarification(output: str) -> bool:
    text = str(output or "").strip()
    lowered = text.lower()
    if not text:
        return False
    has_question_shape = "？" in text or "?" in text or "请" in text or "需要" in text
    return has_question_shape and any(marker in lowered or marker in text for marker in CLARIFICATION_MARKERS)


def validate_platform_runtime_permissions(
    agent: Optional[Dict[str, Any]],
    run: Dict[str, Any],
    step: Dict[str, Any],
) -> Optional[str]:
    if not agent_has_tool(agent, "workspace.read"):
        return "当前 Platform Agent 未启用 workspace.read，不能执行工作区任务"
    if platform_step_needs_write(step, run) and not agent_has_tool(agent, "platform.runtime_write"):
        return "当前 Platform Agent 未启用 platform.runtime_write，不能自由修改 workspace"
    if platform_step_needs_command(step, run) and not agent_has_tool(agent, "command.run"):
        return "当前 Platform Agent 未启用 command.run，不能执行需要运行命令的任务"
    return None


def _conversation_history_section(conversation_id: str, exclude_ids: Optional[set[str]] = None) -> List[str]:
    exclude_ids = exclude_ids or set()
    messages = [
        message for message in list_effective_messages(conversation_id)
        if message.get("id") not in exclude_ids
    ][-8:]
    if not messages:
        return []
    lines = ["[最近有效消息]"]
    lines.extend(f"- {_render_message_for_context(message)}" for message in messages)
    return ["\n".join(lines)]


def build_platform_runtime_context(
    run_id: str,
    step: Dict[str, Any],
    agent: Optional[Dict[str, Any]],
    user_task: str,
) -> Dict[str, Any]:
    run = get_agent_run_detail(run_id)
    if not run:
        return {
            "prompt": user_task,
            "sources": [],
            "metadata": {"agenthubContextInjected": False, "contextSources": []},
        }
    conversation = get_conversation(str(run.get("conversationId") or ""), owner_user_id=run.get("ownerUserId")) or {}
    conversation_id = str(run.get("conversationId") or "")
    sources: List[str] = []
    sections: List[str] = []

    system_prompt = _system_prompt_for_conversation(conversation, agent) if conversation else str((agent or {}).get("systemPrompt") or "")
    if system_prompt.strip():
        sources.append("agent_system_prompt")
        sections.append("[AgentHub Agent System Prompt]\n" + system_prompt.strip())

    sections.append("[本轮任务]\n" + str(user_task or run.get("prompt") or "").strip())
    sources.append("run_prompt")

    dag = run.get("dag") if isinstance(run.get("dag"), dict) else {}
    action_context = dag.get("workspaceActionContext") if isinstance(dag.get("workspaceActionContext"), dict) else None
    if action_context:
        sources.append("workspace_action_context")
        sections.append("[Workspace Action Context]\n" + _json_text(action_context))

    runtime_metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
    uploaded = runtime_metadata.get("uploadedAttachments") if isinstance(runtime_metadata.get("uploadedAttachments"), list) else []
    if uploaded:
        sources.append("uploaded_attachments")
        sections.append("[上传附件]\n" + _json_text(uploaded))

    workspace_context = read_workspace_agents_context(run.get("workspaceId")) if agent_has_tool(agent, "workspace.read") else ""
    if workspace_context:
        sources.append("workspace_agents_context")
        sections.append(workspace_context)

    if _supports_persistent_context(conversation):
        summary = get_conversation_summary(conversation_id)
        if summary and str(summary.get("summary") or "").strip():
            sources.append("conversation_summary")
            sections.append("[会话摘要]\n" + str(summary["summary"]).strip())

        memories = list_active_memories(conversation_id) if agent_has_tool(agent, "memory.use") else []
        if memories:
            sources.append("long_term_memories")
            sections.append(
                "[长期记忆]\n" + "\n".join(
                    f"- ({memory['category']}, {memory['confidence']:.2f}) {memory['content']}"
                    for memory in memories
                )
            )

        pins = list_pins(conversation_id)
        if pins:
            sources.append("pinned_messages")
            sections.append(
                "[Pinned Messages]\n" + "\n".join(
                    f"- {_render_message_for_context(pin['message'])}"
                    for pin in pins
                )
            )

        pinned_ids = set(get_pinned_message_ids(conversation_id))
        history = _conversation_history_section(conversation_id, exclude_ids=pinned_ids)
        if history:
            sources.append("recent_messages")
            sections.extend(history)

    permissions = (agent or {}).get("permissions") if isinstance((agent or {}).get("permissions"), dict) else {}
    sources.append("agenthub_permissions")
    sections.append("[AgentHub 权限与约束]\n" + _json_text({
        "permissions": permissions,
        "workspaceId": run.get("workspaceId"),
        "runtime": (agent or {}).get("runtime") or step.get("runtime"),
        "policy": "必须遵守 AgentHub 权限；不要依赖 CLI 自带记忆作为唯一上下文；所有文件修改会由 AgentHub 做版本审计和冲突检测。",
    }))

    prompt = "\n\n".join(section for section in sections if section.strip()).strip()
    metadata = {
        "agenthubContextInjected": True,
        "contextSources": sources,
    }
    current_runtime_metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
    update_agent_run(run_id, runtime_metadata={**current_runtime_metadata, **metadata})
    return {"prompt": prompt or user_task, "sources": sources, "metadata": metadata}
