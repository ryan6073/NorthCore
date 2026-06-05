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


def _can_access_artifact(artifact: Optional[Dict[str, Any]], owner_user_id: str) -> bool:
    if not artifact:
        return False
    workspace_id = str(artifact.get("workspaceId") or "").strip()
    if workspace_id:
        return bool(get_workspace(workspace_id, owner_user_id=owner_user_id))
    return bool(get_conversation(artifact["conversationId"], owner_user_id=owner_user_id))


def _resolve_artifact_source_conversation(
    artifact: Dict[str, Any],
    conversation_id: Optional[str],
    owner_user_id: str,
) -> Optional[Dict[str, Any]]:
    if not conversation_id:
        return None
    conversation = get_conversation(conversation_id, owner_user_id=owner_user_id)
    if not conversation:
        return None
    artifact_workspace_id = str(artifact.get("workspaceId") or "").strip()
    if artifact_workspace_id:
        return conversation if conversation.get("workspaceId") == artifact_workspace_id else None
    return conversation if conversation.get("id") == artifact.get("conversationId") else None


@router.get("/conversations/{conversation_id}/artifacts")
async def api_list_artifacts(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_artifacts(conversation_id))


@router.get("/workspaces/{workspace_id}/artifacts")
async def api_list_workspace_artifacts(workspace_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_workspace(workspace_id, owner_user_id=current_user["id"]):
        return fail(40001, "Workspace 不存在")
    return ok(list_artifacts_for_workspace(workspace_id))


@router.get("/artifacts/{artifact_id}")
async def api_get_artifact(artifact_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not _can_access_artifact(artifact, current_user["id"]):
        return fail(40001, "产物不存在")
    return ok(artifact)


@router.get("/artifacts/{artifact_id}/versions")
async def api_list_artifact_versions(artifact_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not _can_access_artifact(artifact, current_user["id"]):
        return fail(40001, "产物不存在")
    return ok(list_artifact_versions(artifact_id))


@router.get("/artifacts/{artifact_id}/versions/{version_id}")
async def api_get_artifact_version(artifact_id: str, version_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not _can_access_artifact(artifact, current_user["id"]):
        return fail(40001, "产物不存在")
    version = get_artifact_version(version_id)
    if not version or version["artifactId"] != artifact_id:
        return fail(40001, "产物版本不存在")
    return ok(version)


@router.put("/artifacts/{artifact_id}")
async def api_update_artifact(artifact_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    existing_artifact = get_artifact(artifact_id)
    if not _can_access_artifact(existing_artifact, current_user["id"]):
        return fail(40001, "产物不存在")
    content = str(payload.get("content", ""))
    change_summary = str(payload.get("changeSummary") or "").strip() or None
    source_conversation = _resolve_artifact_source_conversation(
        existing_artifact,
        str(payload.get("conversationId") or "").strip() or None,
        current_user["id"],
    )
    if payload.get("conversationId") and not source_conversation:
        return fail(40002, "会话不存在或不属于该产物的 Workspace")
    artifact = update_artifact(
        artifact_id,
        content,
        change_summary=change_summary,
        created_by="user",
        created_by_type="user",
        source_conversation_id=(source_conversation or {}).get("id"),
        source_workspace_id=existing_artifact.get("workspaceId"),
    )
    if not artifact:
        return fail(40001, "产物不存在")
    if source_conversation:
        message_content = f"更新产物 {artifact['title']} 到 v{artifact['latestVersion']}"
        create_message(
            conversation_id=source_conversation["id"],
            sender_id="user",
            sender_name="用户",
            role="user",
            msg_type="artifact",
            content=message_content,
            artifact_id=artifact["id"],
            metadata={
                "source": "artifact.update",
                "action": "updated",
                "artifactId": artifact["id"],
            },
        )
        update_conversation_activity(source_conversation["id"], message_content)
    return ok(artifact, message="产物更新成功")
