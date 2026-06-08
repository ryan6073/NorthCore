from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Header, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse

from app.api.deps import current_user_or_default, extract_bearer_token
from app.api.responses import ok, fail
from app.database import *
from app.services.agent_service import *
from app.services.artifact_service import *
from app.services.context_service import *
from app.services.memory_service import *
from app.services.message_service import *
from app.services.sandbox_preview_service import build_sandbox_html_preview
from app.services.run_service import *
from app.services.ws_service import *
from app.runtimes.router import runtime_router

router = APIRouter(prefix="/api/v1")

@router.post("/conversations/{conversation_id}/runs")
async def api_create_run(conversation_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if conversation.get("mode") not in {"agent", "single", "group"}:
        return fail(40000, "Sandbox Run 仅支持 agent、single 或 group 会话")
    prompt = str(payload.get("prompt") or payload.get("content") or "").strip()
    if not prompt:
        return fail(40000, "prompt 不能为空")
    print(
        f"[SandboxRun] create requested conversation={conversation_id} "
        f"user={current_user['id']} prompt={prompt[:120]!r}",
        flush=True,
    )

    async def emit(event_type: str, data: Dict[str, Any]) -> None:
        await emit_run_event(current_user, conversation_id, event_type, data)

    try:
        target_agent_id = str(payload.get("targetAgentId") or "").strip() or None
        run_agent = choose_target_agent(conversation, target_agent_id) if target_agent_id else None
        if target_agent_id and not run_agent:
            return fail(40002, "指定 Agent 不存在、已禁用或不属于当前会话")
        run_agent = run_agent or choose_agent_for_conversation(conversation)
        detail = await runtime_router.create_run(
            run_agent,
            current_user=current_user,
            conversation_id=conversation_id,
            prompt=prompt,
            payload=payload,
            emit=emit,
        )
    except ValueError as exc:
        return fail(40000, str(exc))
    return ok(detail, message="沙箱任务已创建")


@router.get("/conversations/{conversation_id}/runs")
async def api_list_conversation_runs(
    conversation_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    page_data = list_agent_runs_for_conversation(
        conversation_id,
        owner_user_id=current_user["id"],
        page=page,
        page_size=pageSize,
    )
    for item in page_data.get("items") or []:
        if item.get("status") == "running":
            await recover_orphaned_finished_run(item["id"], owner_user_id=current_user["id"])
    return ok(
        list_agent_runs_for_conversation(
            conversation_id,
            owner_user_id=current_user["id"],
            page=page,
            page_size=pageSize,
        )
    )


@router.get("/runs/{run_id}")
async def api_get_run(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    detail = await recover_orphaned_finished_run(run_id, owner_user_id=current_user["id"]) or detail
    return ok(detail)


@router.post("/runs/{run_id}/retry")
async def api_retry_run(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    original = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not original:
        return fail(40001, "Run 不存在")

    async def emit(event_type: str, data: Dict[str, Any]) -> None:
        await emit_run_event(current_user, original["conversationId"], event_type, data)

    try:
        result = await retry_agent_run(current_user, run_id, emit=emit)
    except ValueError as exc:
        message = str(exc)
        if message == "Run 不存在":
            return fail(40001, message)
        return fail(40000, message)
    return ok(result, message="Run 重试已创建")


@router.get("/runs/{run_id}/files")
async def api_list_run_files(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    return ok(list_sandbox_files(run_id))


@router.get("/runs/{run_id}/files/tree")
async def api_list_run_files_tree(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    return ok(build_files_tree(list_sandbox_files(run_id)))


@router.get("/runs/{run_id}/files/{file_path:path}/download")
async def api_download_run_file(run_id: str, file_path: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    try:
        resolved_path = FileVersionService().download_file_path(detail, file_path)
    except ValueError:
        return fail(40000, "非法文件路径")
    if not resolved_path:
        return fail(40001, "文件不存在或已被清理")
    file_meta = get_sandbox_file(run_id, file_path)
    return FileResponse(
        path=str(resolved_path),
        filename=resolved_path.name,
        media_type=(file_meta or {}).get("mimeType") or "application/octet-stream",
    )


@router.get("/runs/{run_id}/files/{file_path:path}")
async def api_get_run_file(run_id: str, file_path: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    try:
        file_detail = FileVersionService().read_file(run_id, file_path)
    except ValueError:
        return fail(40000, "非法文件路径")
    if not file_detail:
        return fail(40001, "文件不存在")
    return ok(file_detail)


@router.get("/runs/{run_id}/preview/{file_path:path}")
async def api_get_run_html_preview(run_id: str, file_path: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    try:
        preview = build_sandbox_html_preview(run_id, file_path)
    except ValueError:
        return fail(40000, "非法文件路径")
    except FileNotFoundError:
        return fail(40001, "文件不存在")
    return ok(preview)


@router.get("/runs/{run_id}/conflicts")
async def api_list_run_conflicts(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    return ok(list_sandbox_conflicts(run_id))


@router.post("/runs/{run_id}/conflicts/{conflict_id}/resolve")
async def api_resolve_run_conflict(
    run_id: str,
    conflict_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    resolution = str(payload.get("resolution") or "").strip()
    if resolution not in {"current", "incoming", "manual"}:
        return fail(40000, "resolution 只支持 current/incoming/manual")
    manual_content = str(payload.get("content") or "") if resolution == "manual" else None
    try:
        conflict = FileVersionService().resolve_conflict(
            run_id=run_id,
            conflict_id=conflict_id,
            resolution=resolution,
            manual_content=manual_content,
            sandbox=detail.get("sandbox"),
        )
    except ValueError as exc:
        return fail(40000, str(exc))
    if not conflict:
        return fail(40001, "冲突不存在或已解决")

    async def emit(event_type: str, data: Dict[str, Any]) -> None:
        await emit_run_event(current_user, detail["conversationId"], event_type, data)

    finalized = await finalize_run_if_conflicts_resolved(current_user, run_id, emit=emit)
    return ok(
        {
            **conflict,
            "run": finalized,
        },
        message="冲突已解决",
    )


@router.post("/runs/{run_id}/cancel")
async def api_cancel_run(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    try:
        result = await cancel_retry_chain_for_run(current_user, run_id)
    except ValueError:
        return fail(40001, "Run 不存在")
    detail = result.get("run") or {}
    payload = build_run_event_payload(
        run_id,
        {
            "status": "cancelled",
            "summary": "用户已取消",
            "artifactChanges": [],
            "retryRootRunId": result.get("retryRootRunId"),
            "cancelledRunIds": result.get("cancelledRunIds", []),
            "autoRetryCancelled": True,
        },
    )
    await emit_run_event(
        current_user,
        detail["conversationId"],
        "run.cancelled",
        payload,
    )
    await emit_run_event(
        current_user,
        detail["conversationId"],
        "run.failed",
        payload,
    )
    await emit_run_event(
        current_user,
        detail["conversationId"],
        "conversation.all_tasks.completed",
        payload,
    )
    return ok({**detail, **result}, message="Run 已取消")


@router.post("/runs/{run_id}/rollback")
async def api_rollback_run(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    try:
        result = rollback_run_workspace_changes(run_id, owner_user_id=current_user["id"])
    except ValueError as exc:
        message = str(exc)
        if message == "Run 不存在":
            return fail(40001, message)
        return fail(40000, message)

    payload = build_run_event_payload(
        run_id,
        {
            "status": "cancelled",
            "summary": "用户已撤销本次文件改动",
            "artifactChanges": result.get("artifactChanges", []),
            "artifacts": result.get("artifacts", []),
            "rollbackChanges": result.get("rollbackChanges", []),
        },
    )
    await emit_run_event(
        current_user,
        result["run"]["conversationId"],
        "run.failed",
        payload,
    )
    await emit_run_event(
        current_user,
        result["run"]["conversationId"],
        "conversation.all_tasks.completed",
        payload,
    )
    return ok(result, message="Run 文件改动已撤销")
