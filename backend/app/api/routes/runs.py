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
from app.services.sandbox_preview_service import build_sandbox_html_preview
from app.services.run_service import *
from app.services.ws_service import *

router = APIRouter(prefix="/api/v1")

@router.post("/conversations/{conversation_id}/runs")
async def api_create_run(conversation_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if conversation.get("mode") not in {"agent", "group"}:
        return fail(40000, "Sandbox Run 仅支持 agent 或 group 会话")
    prompt = str(payload.get("prompt") or payload.get("content") or "").strip()
    if not prompt:
        return fail(40000, "prompt 不能为空")
    print(
        f"[SandboxRun] create requested conversation={conversation_id} "
        f"user={current_user['id']} prompt={prompt[:120]!r}",
        flush=True,
    )
    environment_profile = payload.get("environmentProfile")
    if not isinstance(environment_profile, dict):
        environment_profile = {}
    package_manager = str(environment_profile.get("packageManager") or "uv").strip() or "uv"
    allow_network = environment_profile.get("allowNetwork")
    if allow_network is None:
        allow_network = settings.SANDBOX_ALLOW_NETWORK
    environment_profile = {
        **environment_profile,
        "packageManager": package_manager,
        "allowNetwork": bool(allow_network),
    }

    sandbox_network = settings.SANDBOX_NETWORK if environment_profile["allowNetwork"] else "none"
    sandbox_service = SandboxService(network=sandbox_network)
    environment_profile["allowNetwork"] = sandbox_service.network != "none"

    allowed_agent_ids = run_allowed_agent_ids(conversation)
    run_id = create_id("run")
    dag_payload = await generate_dag(prompt, allowed_agent_ids=allowed_agent_ids)
    dag_payload["environmentProfile"] = environment_profile
    dag = namespace_run_dag(run_id, dag_payload)
    print(
        f"[SandboxRun] dag generated run={run_id} steps={len(dag.get('steps', []))} "
        f"agents={allowed_agent_ids}",
        flush=True,
    )
    workspace_path = sandbox_service.prepare_workspace(run_id)
    sandbox = create_sandbox(
        owner_user_id=current_user["id"],
        conversation_id=conversation_id,
        image=settings.SANDBOX_IMAGE,
        network=sandbox_service.network,
        workspace_path=str(workspace_path),
    )
    run = create_agent_run(
        owner_user_id=current_user["id"],
        conversation_id=conversation_id,
        sandbox_id=sandbox["id"],
        prompt=prompt,
        dag=dag,
        run_id=run_id,
    )
    create_agent_run_steps(run_id, dag.get("steps", []))
    print(
        f"[SandboxRun] created run={run_id} sandbox={sandbox['id']} "
        f"workspace={workspace_path} network={sandbox_service.network}",
        flush=True,
    )
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])

    async def emit(event_type: str, data: Dict[str, Any]) -> None:
        await emit_run_event(current_user, conversation_id, event_type, data)

    await emit("run.created", build_run_event_payload(run_id, {"run": detail}))
    asyncio.create_task(RunScheduler(sandbox_service=sandbox_service).run(run_id, emit=emit))
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
    return ok(detail)


@router.get("/runs/{run_id}/files")
async def api_list_run_files(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    return ok(list_sandbox_files(run_id))


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
    return ok(conflict, message="冲突已解决")


@router.post("/runs/{run_id}/cancel")
async def api_cancel_run(run_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])
    if not detail:
        return fail(40001, "Run 不存在")
    sandbox = detail.get("sandbox") or get_sandbox(detail["sandboxId"], owner_user_id=current_user["id"])
    update_agent_run(run_id, status="cancelled", summary="用户已取消", mark_finished=True)
    if sandbox:
        sandbox_service = SandboxService()
        await sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId"))
        sandbox_service.maybe_cleanup_workspace(sandbox["workspacePath"], "cancelled")
        update_sandbox(sandbox["id"], status="cancelled")
    await emit_run_event(
        current_user,
        detail["conversationId"],
        "run.failed",
        build_run_event_payload(run_id, {"status": "cancelled"}),
    )
    return ok(get_agent_run_detail(run_id, owner_user_id=current_user["id"]), message="Run 已取消")
