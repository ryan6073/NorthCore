from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Header, Query, Request

from app.api.deps import current_user_or_default
from app.api.responses import fail, ok
from app.database import (
    get_agent,
    get_conversation,
    get_conversation_agent_config,
    get_workspace,
    get_workspace_deployment,
    list_workspace_deployments,
)
from app.services.agent_tool_catalog_service import agent_has_tool
from app.services.deployment_service import (
    collect_workspace_deployment_logs,
    create_deployment_status_message,
    create_workspace_deployment_request,
    deployment_status_message_exists,
    request_base_url_from_request,
    run_workspace_deployment,
    stop_workspace_deployment,
)
from app.services.message_service import send_message_completed


router = APIRouter(prefix="/api/v1")


@router.post("/workspaces/{workspace_id}/deployments")
async def api_create_workspace_deployment(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    payload: Dict[str, Any] = Body(default={}),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace = get_workspace(workspace_id, owner_user_id=current_user["id"])
    if not workspace:
        return fail(40001, "Workspace 不存在")
    agent_id = str(payload.get("targetAgentId") or payload.get("agentId") or "").strip()
    if agent_id:
        conversation_id = str(payload.get("conversationId") or "").strip()
        conversation = get_conversation(conversation_id, owner_user_id=current_user["id"]) if conversation_id else None
        agent = (
            get_conversation_agent_config(conversation_id, agent_id, owner_user_id=current_user["id"])
            if conversation and agent_id in (conversation.get("agentIds") or [])
            else get_agent(agent_id, owner_user_id=current_user["id"])
        )
        if not agent_has_tool(agent, "deploy.run"):
            return fail(40002, "当前 Agent 未启用 deploy.run，不能发起部署")
    config = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    public_base_url = str(payload.get("publicBaseUrl") or config.get("publicBaseUrl") or request_base_url_from_request(request)).rstrip("/")
    deployment = create_workspace_deployment_request(
        workspace_id=workspace_id,
        owner_user_id=current_user["id"],
        conversation_id=str(payload.get("conversationId") or "").strip() or None,
        run_id=str(payload.get("runId") or "").strip() or None,
        config=config,
        public_base_url=public_base_url,
    )
    background_tasks.add_task(run_workspace_deployment, deployment["id"])
    return ok(deployment, message="部署任务已创建")


@router.get("/workspaces/{workspace_id}/deployments")
async def api_list_workspace_deployments(
    workspace_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace = get_workspace(workspace_id, owner_user_id=current_user["id"])
    if not workspace:
        return fail(40001, "Workspace 不存在")
    return ok(list_workspace_deployments(workspace_id, current_user["id"], page=page, page_size=pageSize))


@router.get("/deployments/{deployment_id}")
async def api_get_workspace_deployment(deployment_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    deployment = get_workspace_deployment(deployment_id, owner_user_id=current_user["id"])
    if not deployment:
        return fail(40001, "Deployment 不存在")
    return ok(deployment)


@router.post("/deployments/{deployment_id}/stop")
async def api_stop_workspace_deployment(deployment_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    deployment = get_workspace_deployment(deployment_id, owner_user_id=current_user["id"])
    if not deployment:
        return fail(40001, "Deployment 不存在")
    stopped = stop_workspace_deployment(deployment_id)
    if not stopped:
        return fail(40001, "Deployment 不存在")
    conversation_id = str(stopped.get("conversationId") or "").strip()
    message = (
        create_deployment_status_message(stopped, "stopped")
        if conversation_id and not deployment_status_message_exists(conversation_id, deployment_id, "stopped")
        else None
    )
    if message:
        await send_message_completed(current_user, conversation_id, None, message)
    return ok(stopped, message="部署已停止")


@router.get("/deployments/{deployment_id}/logs")
async def api_get_workspace_deployment_logs(deployment_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    deployment = get_workspace_deployment(deployment_id, owner_user_id=current_user["id"])
    if not deployment:
        return fail(40001, "Deployment 不存在")
    logs = collect_workspace_deployment_logs(deployment_id)
    if not logs:
        return fail(40001, "Deployment 不存在")
    return ok(logs)
