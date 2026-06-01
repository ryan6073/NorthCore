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

@router.get("/agents")
async def api_list_agents(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    provider: Optional[str] = None,
    keyword: Optional[str] = None,
    enabled: Optional[str] = None,
    includeDisabled: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    include_disabled = str(includeDisabled or "").strip().lower() in {"1", "true", "yes", "on"}
    return ok(list_agents(
        page=page,
        page_size=pageSize,
        category=category,
        provider=provider,
        keyword=keyword,
        enabled=None if include_disabled else (True if enabled is None else parse_enabled(enabled)),
        owner_user_id=current_user["id"],
    ))


@router.post("/agents")
async def api_create_agent(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    security_error = validate_agent_payload_security(payload)
    if security_error:
        return fail(40000, security_error)
    name = str(payload.get("name", "")).strip()
    if not name:
        return fail(40000, "Agent 名称不能为空")
    agent = create_agent(payload, owner_user_id=current_user["id"])
    return ok(agent, message="Agent 创建成功")


@router.get("/agents/{agent_id}")
async def api_get_agent(agent_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(agent)


@router.get("/agents/{agent_id}/conversation")
async def api_get_agent_contact_conversation(agent_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if not agent:
        return fail(40001, "Agent 不存在")
    if agent_id == ORCHESTRATOR_AGENT_ID:
        return fail(40002, "Orchestrator 是群聊调度器，不提供长期联系人会话")
    if not agent.get("enabled") or agent.get("status") == "disabled":
        return fail(40002, "Agent 已禁用，无法打开联系人会话")
    try:
        conversation = ensure_contact_conversation(current_user["id"], agent_id)
    except ValueError:
        return fail(40002, "Agent 已禁用，无法打开联系人会话")
    return ok(attach_context_usage(conversation))


@router.get("/users/{user_id}/agents/{agent_id}/contact")
async def api_get_user_agent_contact_id(
    user_id: str,
    agent_id: str,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if current_user.get("role") != "admin" and current_user["id"] != user_id:
        return fail(40101, "无权访问该用户的联系人会话")
    if not get_user(user_id):
        return fail(40001, "用户不存在")

    agent = get_agent(agent_id, owner_user_id=user_id)
    if not agent:
        return fail(40001, "Agent 不存在")
    if agent_id == ORCHESTRATOR_AGENT_ID:
        return fail(40002, "Orchestrator 是群聊调度器，不提供长期联系人会话")
    if not agent_is_callable(agent):
        return fail(40002, "Agent 已禁用，无法打开联系人会话")

    try:
        conversation = ensure_contact_conversation(user_id, agent_id)
    except ValueError:
        return fail(40002, "Agent 已禁用，无法打开联系人会话")

    contact_id = conversation["id"]
    return ok({
        "contactId": contact_id,
        "conversationId": contact_id,
        "conversation": attach_context_usage(conversation),
    })


@router.put("/agents/{agent_id}")
async def api_update_agent(agent_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if "systemPrompt" in payload:
        prompt_preview = str(payload.get("systemPrompt") or "").strip().replace("\n", "\\n")
        print(
            "AGENT SYSTEM PROMPT UPDATE:",
            {
                "agentId": agent_id,
                "userId": current_user["id"],
                "promptLength": len(str(payload.get("systemPrompt") or "")),
                "promptPreview": prompt_preview[:120],
            },
        )
    security_error = validate_agent_payload_security(payload)
    if security_error:
        return fail(40000, security_error)
    existing_agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if existing_agent and existing_agent.get("ownerUserId") is None and current_user.get("role") != "admin":
        agent = upsert_agent_user_override(
            current_user["id"],
            agent_id,
            payload,
        )
        if not agent:
            return fail(40001, "Agent 不存在")
        if "systemPrompt" in payload:
            print(
                "AGENT USER OVERRIDE SAVED:",
                {
                    "agentId": agent_id,
                    "userId": current_user["id"],
                    "savedPromptLength": len(agent.get("systemPrompt") or ""),
                    "savedPromptPreview": str(agent.get("systemPrompt") or "").strip().replace("\n", "\\n")[:120],
                },
            )
        return ok(agent, message="Agent 配置更新成功")
    agent = update_agent(agent_id, payload, owner_user_id=current_user["id"])
    if not agent:
        return fail(40001, "Agent 不存在")
    if "systemPrompt" in payload:
        print(
            "AGENT SYSTEM PROMPT UPDATE SAVED:",
            {
                "agentId": agent_id,
                "userId": current_user["id"],
                "savedPromptLength": len(agent.get("systemPrompt") or ""),
                "savedPromptPreview": str(agent.get("systemPrompt") or "").strip().replace("\n", "\\n")[:120],
            },
        )
    return ok(agent, message="Agent 配置更新成功")


@router.delete("/agents/{agent_id}")
async def api_delete_agent(agent_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    existing_agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if not existing_agent:
        return fail(40001, "Agent 不存在")
    if existing_agent.get("ownerUserId") is None and current_user.get("role") != "admin":
        agent = upsert_agent_user_override(
            current_user["id"],
            agent_id,
            {"enabled": False, "status": "disabled"},
        )
        if not agent:
            return fail(40001, "Agent 不存在")
        return ok(True, message="Agent 已禁用")
    disabled = disable_agent(agent_id, owner_user_id=current_user["id"])
    if not disabled:
        return fail(40001, "Agent 不存在")
    return ok(True, message="Agent 已禁用")
