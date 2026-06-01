from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Header, Query

from app.api.deps import current_user_or_default
from app.api.responses import ok, fail
from app.database import create_workspace, get_workspace, list_workspaces

router = APIRouter(prefix="/api/v1")


@router.get("/workspaces")
async def api_list_workspaces(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    return ok(list_workspaces(current_user["id"], page=page, page_size=pageSize))


@router.post("/workspaces")
async def api_create_workspace(
    payload: Dict[str, Any] = Body(default={}),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    name = str(payload.get("name") or "").strip() or None
    workspace = create_workspace(owner_user_id=current_user["id"], name=name)
    return ok(workspace, message="Workspace 创建成功")


@router.get("/workspaces/{workspace_id}")
async def api_get_workspace(workspace_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    workspace = get_workspace(workspace_id, owner_user_id=current_user["id"])
    if not workspace:
        return fail(40001, "Workspace 不存在")
    return ok(workspace)
