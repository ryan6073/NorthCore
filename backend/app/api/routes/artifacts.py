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

@router.get("/conversations/{conversation_id}/artifacts")
async def api_list_artifacts(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_artifacts(conversation_id))


@router.get("/artifacts/{artifact_id}")
async def api_get_artifact(artifact_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not artifact or not get_conversation(artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    return ok(artifact)


@router.get("/artifacts/{artifact_id}/versions")
async def api_list_artifact_versions(artifact_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not artifact or not get_conversation(artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    return ok(list_artifact_versions(artifact_id))


@router.get("/artifacts/{artifact_id}/versions/{version_id}")
async def api_get_artifact_version(artifact_id: str, version_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not artifact or not get_conversation(artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    version = get_artifact_version(version_id)
    if not version or version["artifactId"] != artifact_id:
        return fail(40001, "产物版本不存在")
    return ok(version)


@router.put("/artifacts/{artifact_id}")
async def api_update_artifact(artifact_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    existing_artifact = get_artifact(artifact_id)
    if not existing_artifact or not get_conversation(existing_artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    content = str(payload.get("content", ""))
    change_summary = str(payload.get("changeSummary") or "").strip() or None
    artifact = update_artifact(
        artifact_id,
        content,
        change_summary=change_summary,
        created_by="user",
        created_by_type="user",
    )
    if not artifact:
        return fail(40001, "产物不存在")
    return ok(artifact, message="产物更新成功")
