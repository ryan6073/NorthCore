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


def conversation_contains_agent(conversation: Dict[str, Any], agent_id: str) -> bool:
    if conversation.get("mode") == "agent":
        return conversation.get("contactAgentId") == agent_id or agent_id in conversation.get("agentIds", [])
    return agent_id in conversation.get("agentIds", [])


def mark_agent_config_scope(agent: Dict[str, Any], conversation_id: str, scope: str) -> Dict[str, Any]:
    return {
        **agent,
        "conversationId": conversation_id,
        "configScope": scope,
        "overrideSource": agent.get("overrideSource") or ("conversation" if scope == "conversation" else "global"),
    }

@router.get("/conversations")
async def api_list_conversations(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    mode: Optional[str] = None,
    keyword: Optional[str] = None,
    isArchived: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversations = list_conversations(
        page=page,
        page_size=pageSize,
        mode=mode,
        keyword=keyword,
        is_archived=parse_archived_filter(isArchived),
        owner_user_id=current_user["id"],
    )
    return ok(attach_context_usage_to_page(conversations))


@router.post("/conversations")
async def api_create_conversation(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    title = str(payload.get("title", "")).strip()
    mode = payload.get("mode", "single")
    agent_ids = payload.get("agentIds", [])
    system_prompt = str(payload.get("systemPrompt") or "").strip()
    workspace_id = str(payload.get("workspaceId") or "").strip() or None
    if not title:
        return fail(40000, "会话标题不能为空")
    if mode not in {"single", "group"}:
        return fail(40000, "mode 只支持 single 或 group；agent 会话由 Agent 联系人接口自动创建")
    if not isinstance(agent_ids, list) or not agent_ids:
        return fail(40000, "agentIds 不能为空")
    agent_ids = ensure_orchestrator_for_group(mode, agent_ids)
    agent_error = validate_enabled_agent_ids(agent_ids, owner_user_id=current_user["id"])
    if agent_error:
        return fail(40002, agent_error)
    if workspace_id and not get_workspace(workspace_id, owner_user_id=current_user["id"]):
        return fail(40001, "Workspace 不存在")
    conversation = create_conversation(
        title=title,
        mode=mode,
        agent_ids=agent_ids,
        owner_user_id=current_user["id"],
        system_prompt=system_prompt,
        workspace_id=workspace_id,
    )
    return ok(attach_context_usage(conversation), message="会话创建成功")


@router.get("/conversations/{conversation_id}")
async def api_get_conversation(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if conversation.get("mode") == "agent":
        contact_agent = get_agent(
            str(conversation.get("contactAgentId") or ""),
            owner_user_id=current_user["id"],
        )
        if not agent_is_callable(contact_agent):
            return fail(40002, "当前 Agent 已隐藏或删除，无法打开联系人会话")
    return ok({
        **attach_context_usage(conversation),
        "latestActiveRun": latest_active_run_for_conversation(conversation_id, current_user["id"]),
    })


@router.get("/conversations/{conversation_id}/agents/{agent_id}/config")
async def api_get_conversation_agent_config(
    conversation_id: str,
    agent_id: str,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if not conversation_contains_agent(conversation, agent_id):
        return fail(40002, "Agent 不属于当前会话")
    if conversation.get("mode") != "group":
        agent = get_agent(agent_id, owner_user_id=current_user["id"])
        if not agent:
            return fail(40001, "Agent 不存在")
        return ok(mark_agent_config_scope(agent, conversation_id, "user"))
    if agent_id == ORCHESTRATOR_AGENT_ID:
        agent = get_agent(agent_id, owner_user_id=current_user["id"])
        if not agent:
            return fail(40001, "Agent 不存在")
        return ok({**mark_agent_config_scope(agent, conversation_id, "conversation"), "readonly": True})
    agent = get_conversation_agent_config(
        conversation_id,
        agent_id,
        owner_user_id=current_user["id"],
    )
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(mark_agent_config_scope(agent, conversation_id, "conversation"))


@router.put("/conversations/{conversation_id}/agents/{agent_id}/config")
async def api_update_conversation_agent_config(
    conversation_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if not conversation_contains_agent(conversation, agent_id):
        return fail(40002, "Agent 不属于当前会话")
    if agent_id == ORCHESTRATOR_AGENT_ID:
        return fail(40002, "Orchestrator 是群聊调度器，不支持配置")

    if conversation.get("mode") != "group":
        security_error = validate_agent_payload_security(payload)
        if security_error:
            return fail(40000, security_error)
        existing_agent = get_agent(agent_id, owner_user_id=current_user["id"])
        if not existing_agent:
            return fail(40001, "Agent 不存在")
        if existing_agent.get("ownerUserId") is None and current_user.get("role") != "admin":
            agent = upsert_agent_user_override(current_user["id"], agent_id, payload)
        else:
            agent = update_agent(agent_id, payload, owner_user_id=current_user["id"])
        if not agent:
            return fail(40001, "Agent 不存在")
        return ok(mark_agent_config_scope(agent, conversation_id, "user"), message="Agent 配置更新成功")

    sanitized_payload, payload_error = sanitize_conversation_agent_config_payload(payload)
    if payload_error:
        return fail(40000, payload_error)
    agent = upsert_conversation_agent_config(
        conversation_id,
        agent_id,
        sanitized_payload or {},
        owner_user_id=current_user["id"],
    )
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(mark_agent_config_scope(agent, conversation_id, "conversation"), message="群聊 Agent 配置更新成功")


@router.post("/conversations/{conversation_id}/agents")
async def api_add_conversation_agent(
    conversation_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if conversation.get("mode") != "group":
        return fail(40002, "仅群聊支持添加成员智能体")
    agent_id = str(payload.get("agentId") or "").strip()
    if not agent_id:
        return fail(40000, "agentId 不能为空")
    if agent_id == ORCHESTRATOR_AGENT_ID:
        return ok(attach_context_usage(conversation), message="群聊调度器已存在")
    agent_error = validate_enabled_agent_ids([agent_id], owner_user_id=current_user["id"])
    if agent_error:
        return fail(40002, agent_error)
    updated_conversation = add_conversation_agent(
        conversation_id,
        agent_id,
        owner_user_id=current_user["id"],
    )
    if not updated_conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(updated_conversation), message="群聊成员已更新")


@router.delete("/conversations/{conversation_id}/agents/{agent_id}")
async def api_remove_conversation_agent(
    conversation_id: str,
    agent_id: str,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if conversation.get("mode") != "group":
        return fail(40002, "仅群聊支持删除成员智能体")
    if agent_id == ORCHESTRATOR_AGENT_ID:
        return fail(40002, "Orchestrator 是群聊调度器，不能从群聊中删除")
    if agent_id not in conversation.get("agentIds", []):
        return ok(attach_context_usage(conversation), message="群聊成员已更新")
    updated_conversation = remove_conversation_agent(
        conversation_id,
        agent_id,
        owner_user_id=current_user["id"],
    )
    if not updated_conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(updated_conversation), message="群聊成员已更新")


@router.put("/conversations/{conversation_id}")
async def api_update_conversation(conversation_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    current_conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not current_conversation:
        return fail(40001, "会话不存在")
    if "systemPrompt" in payload:
        prompt_preview = str(payload.get("systemPrompt") or "").strip().replace("\n", "\\n")
        print(
            "CONVERSATION SYSTEM PROMPT UPDATE:",
            {
                "conversationId": conversation_id,
                "mode": current_conversation["mode"],
                "userId": current_user["id"],
                "promptLength": len(str(payload.get("systemPrompt") or "")),
                "promptPreview": prompt_preview[:120],
            },
        )
    agent_ids = payload.get("agentIds")
    if agent_ids is not None:
        if not isinstance(agent_ids, list) or not agent_ids:
            return fail(40000, "agentIds 不能为空")
        agent_ids = ensure_orchestrator_for_group(current_conversation["mode"], agent_ids)
        payload = {**payload, "agentIds": agent_ids}
        agent_error = validate_enabled_agent_ids(agent_ids, owner_user_id=current_user["id"])
        if agent_error:
            return fail(40002, agent_error)
    if "workspaceId" in payload:
        workspace_id = str(payload.get("workspaceId") or "").strip() or None
        if workspace_id and not get_workspace(workspace_id, owner_user_id=current_user["id"]):
            return fail(40001, "Workspace 不存在")
        payload = {**payload, "workspaceId": workspace_id}
    conversation = update_conversation(conversation_id, payload, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(conversation), message="会话更新成功")


@router.put("/conversations/{conversation_id}/pin")
async def api_update_conversation_pin(
    conversation_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if "isPinned" not in payload:
        return fail(40000, "isPinned 不能为空")
    conversation = update_conversation_pin(
        conversation_id,
        bool(payload.get("isPinned")),
        owner_user_id=current_user["id"],
    )
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(conversation), message="会话置顶状态已更新")


@router.put("/conversations/{conversation_id}/archive")
async def api_update_conversation_archive(
    conversation_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if "isArchived" not in payload:
        return fail(40000, "isArchived 不能为空")
    conversation = update_conversation_archive(
        conversation_id,
        bool(payload.get("isArchived")),
        owner_user_id=current_user["id"],
    )
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(conversation), message="会话归档状态已更新")


@router.get("/conversations/{conversation_id}/context/usage")
async def api_get_context_usage(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(build_context_usage(conversation))


@router.post("/conversations/{conversation_id}/show")
async def api_show_conversation(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = show_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(conversation), message="会话已显示")


@router.delete("/conversations/{conversation_id}")
async def api_delete_conversation(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在", False)
    if conversation.get("mode") == "agent" or conversation.get("conversationType") == "contact":
        hidden = hide_agent_conversation(conversation_id, owner_user_id=current_user["id"])
        if not hidden:
            return fail(40001, "会话不存在", False)
        return ok(True, message="Agent 联系人会话已隐藏")
    deleted = delete_conversation(conversation_id, owner_user_id=current_user["id"])
    if not deleted:
        return fail(40001, "会话不存在", False)
    return ok(True, message="会话删除成功")


@router.get("/conversations/{conversation_id}/messages")
async def api_list_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_messages(conversation_id, page=page, page_size=pageSize))


@router.post("/conversations/{conversation_id}/mention")
async def api_list_mention_agents(conversation_id: str, payload: Dict[str, Any] = Body(default={}), authorization: Optional[str] = Header(None)):
    print("MENTION PAYLOAD:", payload)
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])

    if not conversation:
        return fail(40001, "会话不存在")
    keyword = str(payload.get("keyword") or payload.get("query") or "").strip()
    return ok(list_mentionable_agents(conversation, keyword))


@router.post("/conversations/{conversation_id}/context/compress")
async def api_compress_context(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if not supports_persistent_context(conversation):
        return fail(40000, "当前阶段仅支持群聊和 Agent 长期会话上下文压缩")
    before = get_conversation_summary(conversation_id)
    summary = await compress_conversation_context(conversation_id, manual=True)
    if not summary:
        return ok({
            "summary": None,
            "compressed": False,
            "reason": "暂无可压缩的有效消息",
            "contextUsage": build_context_usage(conversation),
        }, message="暂无可压缩内容")
    return ok({
        "summary": summary,
        "compressed": not before or before.get("version") != summary.get("version"),
        "contextUsage": build_context_usage(conversation),
    }, message="上下文压缩完成")


@router.get("/conversations/{conversation_id}/memories")
async def api_list_memories(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_active_memories(conversation_id, limit=100))


@router.put("/conversations/{conversation_id}/memories/{memory_id}")
async def api_update_memory(
    conversation_id: str,
    memory_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    allowed_categories = {"preference", "project", "profile", "constraint"}
    if "category" in payload and str(payload.get("category") or "").strip() not in allowed_categories:
        return fail(40000, "category 只支持 preference/project/profile/constraint")
    if "content" in payload and not str(payload.get("content") or "").strip():
        return fail(40000, "content 不能为空")
    memory = update_memory(conversation_id, memory_id, payload)
    if not memory:
        return fail(40001, "记忆不存在")
    return ok(memory, message="记忆已更新")


@router.delete("/conversations/{conversation_id}/memories/{memory_id}")
async def api_delete_memory(conversation_id: str, memory_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    deleted = delete_memory(conversation_id, memory_id)
    if not deleted:
        return fail(40001, "记忆不存在")
    return ok(True, message="记忆已删除")


@router.get("/conversations/{conversation_id}/pins")
async def api_list_pins(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_pins(conversation_id))


@router.post("/conversations/{conversation_id}/messages/{message_id}/pin")
async def api_pin_message(conversation_id: str, message_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    pin = pin_message(conversation_id, message_id)
    if not pin:
        return fail(40001, "消息不存在")
    return ok(pin, message="消息已 pin")


@router.delete("/conversations/{conversation_id}/messages/{message_id}/pin")
async def api_unpin_message(conversation_id: str, message_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    deleted = unpin_message(conversation_id, message_id)
    if not deleted:
        return fail(40001, "pin 记录不存在")
    return ok(True, message="消息已取消 pin")
