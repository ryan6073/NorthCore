from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Header, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from app.api.deps import current_user_or_default, extract_bearer_token
from app.api.responses import ok, fail
from app.database import *
from app.services.agent_service import *
from app.services.artifact_service import *
from app.services.context_service import *
from app.services.memory_service import *
from app.services.message_service import *
from app.services.run_service import *
from app.services.ws_service import *

router = APIRouter(prefix="/api/v1")

@router.post("/conversations/{conversation_id}/messages")
async def api_send_message(conversation_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    print("MESSAGE PAYLOAD:", payload)
    content = str(payload.get("content", "")).strip()
    attachments = normalize_message_attachments(payload)
    if not content and attachments:
        content = attachment_summary_content(attachments)
    print("MESSAGE CONTENT:", content)
    target_agent_id = str(payload.get("targetAgentId") or payload.get("targetAgentID") or "").strip() or None
    quoted_message_id = get_quoted_message_id(payload)
    if not content and not attachments:
        return fail(40000, "消息内容不能为空")
    if is_system_message_payload(payload):
        artifact_id = str(payload.get("artifactId") or "").strip() or None
        system_message = create_message(
            conversation_id=conversation_id,
            sender_id="system",
            sender_name=str(payload.get("senderName") or "系统").strip() or "系统",
            role="system",
            msg_type="status",
            content=content,
            artifact_id=artifact_id,
            metadata=build_system_message_metadata(payload),
        )
        update_conversation_activity(conversation_id, content)
        return ok({
            "userMessage": None,
            "agentMessages": [system_message],
            "artifacts": [],
            "contextUsage": build_context_usage(conversation),
        }, message="系统消息已保存")

    quoted_message = None
    message_metadata: Dict[str, Any] = {}
    if quoted_message_id:
        quoted_message = get_message_in_conversation(conversation_id, quoted_message_id)
        if not quoted_message:
            return fail(40003, "引用消息不存在或不属于当前会话")
        message_metadata = build_quote_metadata(quoted_message)
    artifact_ref, artifact_ref_error = build_artifact_ref_context(payload, conversation_id, current_user["id"])
    if artifact_ref_error:
        return fail(40003, artifact_ref_error)
    if artifact_ref:
        message_metadata["artifactRef"] = artifact_ref
    if attachments:
        message_metadata["attachments"] = attachments
    model_user_input = build_user_input_with_references(content, quoted_message, artifact_ref)
    target_agent = choose_target_agent(conversation, target_agent_id)
    if target_agent_id and not target_agent:
        return fail(40002, "指定 Agent 不存在、已禁用或不属于当前会话")
    target_agent = target_agent or infer_mentioned_agent(conversation, content)
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    if mentioned_agent and not agent_is_callable(mentioned_agent):
        return fail(40002, "指定 Agent 已禁用，无法继续对话")
    if conversation["mode"] in {"agent", "single"} and not choose_agent_for_conversation(conversation):
        return fail(40002, "当前 Agent 已禁用，无法继续对话")
    if conversation["mode"] == "group" and not target_agent and not get_enabled_orchestrator(conversation):
        return fail(40002, "Orchestrator 已禁用，无法自动调度；请 @ 一个可用 Agent")

    user_message = create_message(
        conversation_id=conversation_id,
        sender_id="user",
        sender_name="用户",
        role="user",
        msg_type="text",
        content=content,
        metadata=message_metadata,
    )
    if attachments:
        user_message["attachments"] = create_message_attachments(
            conversation_id,
            user_message["id"],
            attachments,
        )
    update_conversation_activity(conversation_id, content)

    agent_messages: List[Dict[str, Any]] = []
    artifacts: List[Dict[str, Any]] = []

    if conversation["mode"] == "group" and not target_agent:
        intent_result = analyze_orchestrator_intent(content)
        if intent_result["intent"] == "chat":
            orchestrator_content = intent_result["reply"]
            if quoted_message or artifact_ref:
                orchestrator_agent = get_enabled_orchestrator(conversation) or choose_agent_for_conversation(conversation)
                try:
                    orchestrator_content = await call_agent_once(
                        conversation_id,
                        orchestrator_agent,
                        model_user_input,
                        exclude_message_id=user_message["id"],
                    )
                except Exception as exc:
                    orchestrator_content = fallback_reply(orchestrator_agent, content, exc)
            orchestrator_message = create_message(
                conversation_id=conversation_id,
                sender_id="agent-orchestrator",
                sender_name="Orchestrator",
                role="orchestrator",
                msg_type="text",
                content=orchestrator_content,
            )
            agent_messages.append(orchestrator_message)
            update_conversation_activity(conversation_id, orchestrator_content)
            schedule_memory_extraction(conversation, user_message, agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
            }, message="消息发送成功")

        plan_content = format_task_plan_content(intent_result["taskPlan"])
        orchestrator_message = create_message(
            conversation_id=conversation_id,
            sender_id="agent-orchestrator",
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="task-plan",
            content=plan_content,
        )
        agent_messages.append(orchestrator_message)

    agent = target_agent or choose_agent_for_conversation(conversation)
    try:
        reply_content = await call_agent_once(
            conversation_id,
            agent,
            model_user_input,
            exclude_message_id=user_message["id"],
        )
    except Exception as exc:
        reply_content = fallback_reply(agent, content, exc)

    role = "orchestrator" if agent and agent["id"] == "agent-orchestrator" else "agent"
    agent_message = create_message(
        conversation_id=conversation_id,
        sender_id=agent["id"] if agent else "agent-unknown",
        sender_name=agent["name"] if agent else "Agent",
        role=role,
        msg_type="text",
        content=reply_content,
    )
    agent_messages.append(agent_message)
    update_conversation_activity(conversation_id, reply_content)

    artifact_result = persist_artifact_from_message(conversation_id, agent_message, artifact_ref)
    if artifact_result:
        artifacts.append({
            **artifact_result["artifact"],
            "action": artifact_result["action"],
        })
        artifact_message = artifact_result["message"]
        agent_messages.append(artifact_message)
        update_conversation_activity(conversation_id, artifact_message["content"])

    schedule_memory_extraction(conversation, user_message, agent_messages)
    return ok({
        "userMessage": user_message,
        "agentMessages": agent_messages,
        "artifacts": artifacts,
        "contextUsage": build_context_usage(conversation),
    }, message="消息发送成功")
