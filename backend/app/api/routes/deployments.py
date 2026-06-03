from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Header, Query, Request

from app.api.deps import current_user_or_default
from app.api.responses import fail, ok
from app.database import (
    create_workspace_deployment,
    get_workspace,
    get_workspace_deployment,
    list_workspace_deployments,
)
from app.services.deployment_service import (
    collect_workspace_deployment_logs,
    run_workspace_deployment,
    stop_workspace_deployment,
)


router = APIRouter(prefix="/api/v1")


def _request_base_url(request: Request) -> str:
    hostname = request.url.hostname or "localhost"
    return f"{request.url.scheme}://{hostname}"


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
    config = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    config = {
        **config,
        "publicBaseUrl": str(payload.get("publicBaseUrl") or config.get("publicBaseUrl") or _request_base_url(request)).rstrip("/"),
    }
    deployment = create_workspace_deployment(
        workspace_id=workspace_id,
        owner_user_id=current_user["id"],
        conversation_id=str(payload.get("conversationId") or "").strip() or None,
        run_id=str(payload.get("runId") or "").strip() or None,
        deploy_type="local_docker",
        config=config,
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
