from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, File, Header, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.api.deps import current_user_or_default
from app.api.responses import ok, fail
from app.database import (
    active_workspace_name_exists,
    create_id,
    create_workspace,
    get_workspace,
    list_workspaces,
    mark_workspace_deleted,
    now_text,
    purge_workspace_record,
    rename_workspace,
    release_workspace_mutation_lock,
    restore_workspace_record,
    try_acquire_workspace_mutation_lock,
    workspace_active_mutation_summary,
)
from app.services.workspace_file_service import WorkspaceConflictError, WorkspaceFileService
from app.services.workspace_agents_service import ensure_workspace_agents_file

router = APIRouter(prefix="/api/v1")


def conflict(message: str, data: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(status_code=409, content=fail(40900, message, data))


def bad_request(message: str, data: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(status_code=400, content=fail(40000, message, data))


def _active_workspace_or_error(workspace_id: str, owner_user_id: str):
    workspace = get_workspace(workspace_id, owner_user_id=owner_user_id)
    if not workspace:
        return None, fail(40001, "Workspace 不存在")
    if workspace.get("status") != "active":
        return None, fail(40001, "Workspace 不可用")
    return workspace, None


def _mutation_block_response(workspace_id: str):
    summary = workspace_active_mutation_summary(workspace_id)
    if not summary.get("blocked"):
        return None
    return conflict(
        "Workspace 正在被任务使用，请先取消或等待任务结束",
        {
            "error": "workspace_busy",
            "lock": summary.get("lock"),
            "runs": summary.get("runs"),
            "deployments": summary.get("deployments"),
        },
    )


def _acquire_management_lock(workspace_id: str, action: str):
    owner_id = f"workspace-{action}-{create_id('management')}"
    lock_result = try_acquire_workspace_mutation_lock(
        workspace_id=workspace_id,
        owner_type="management",
        owner_id=owner_id,
        mode="manage",
        lease_seconds=300,
    )
    if not lock_result.get("acquired"):
        return None, None, conflict(
            "Workspace 正在被任务使用，请先取消或等待任务结束",
            {"error": "workspace_busy", "lock": lock_result.get("lock")},
        )
    token = int((lock_result.get("lock") or {}).get("fencingToken") or 0)
    return owner_id, token, None


def _release_management_lock(workspace_id: str, owner_id: Optional[str], token: Optional[int]) -> None:
    if owner_id and token:
        release_workspace_mutation_lock(workspace_id, "management", owner_id, token)


@router.get("/workspaces")
async def api_list_workspaces(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status: str = Query("active"),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    normalized_status = str(status or "active").strip().lower()
    if normalized_status not in {"active", "deleted", "all"}:
        return fail(40000, "status 只支持 active/deleted/all")
    return ok(list_workspaces(current_user["id"], page=page, page_size=pageSize, status=normalized_status))


@router.post("/workspaces")
async def api_create_workspace(
    payload: Dict[str, Any] = Body(default={}),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    name = str(payload.get("name") or "").strip() or None
    try:
        workspace = create_workspace(owner_user_id=current_user["id"], name=name)
    except ValueError as exc:
        return conflict(str(exc), {"error": "workspace_name_conflict"})
    ensure_workspace_agents_file(workspace)
    return ok(workspace, message="Workspace 创建成功")


@router.get("/workspaces/{workspace_id}")
async def api_get_workspace(workspace_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    workspace = get_workspace(workspace_id, owner_user_id=current_user["id"])
    if not workspace:
        return fail(40001, "Workspace 不存在")
    return ok(workspace)


@router.patch("/workspaces/{workspace_id}")
async def api_rename_workspace(
    workspace_id: str,
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    name = str(payload.get("name") or "").strip()
    if not name:
        return fail(40000, "Workspace 名称不能为空")
    try:
        workspace = rename_workspace(workspace_id, current_user["id"], name)
    except ValueError as exc:
        return conflict(str(exc), {"error": "workspace_name_conflict"})
    if not workspace:
        return fail(40001, "Workspace 不存在")
    return ok(workspace, message="Workspace 重命名成功")


@router.delete("/workspaces/{workspace_id}")
async def api_delete_workspace(workspace_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    workspace, error = _active_workspace_or_error(workspace_id, current_user["id"])
    if error:
        return error
    blocked = _mutation_block_response(workspace_id)
    if blocked:
        return blocked
    owner_id, token, lock_error = _acquire_management_lock(workspace_id, "delete")
    if lock_error:
        return lock_error
    service = WorkspaceFileService()
    deleted_at = now_text()
    deleted_path = None
    try:
        deleted_path = service.move_to_trash(workspace, deleted_at)
        updated = mark_workspace_deleted(workspace_id, current_user["id"], str(deleted_path))
        if not updated:
            service.move_trash_back_to_active(workspace, deleted_path)
            return fail(40001, "Workspace 不存在")
        return ok(updated, message="Workspace 已删除")
    except WorkspaceConflictError as exc:
        return conflict(str(exc), exc.data)
    except Exception:
        if deleted_path is not None:
            service.move_trash_back_to_active(workspace, deleted_path)
        raise
    finally:
        _release_management_lock(workspace_id, owner_id, token)


@router.post("/workspaces/{workspace_id}/restore")
async def api_restore_workspace(workspace_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    workspace = get_workspace(workspace_id, owner_user_id=current_user["id"])
    if not workspace:
        return fail(40001, "Workspace 不存在")
    if workspace.get("status") != "deleted":
        return bad_request("只能恢复已删除的 Workspace")
    blocked = _mutation_block_response(workspace_id)
    if blocked:
        return blocked
    if active_workspace_name_exists(current_user["id"], workspace["name"], exclude_workspace_id=workspace_id):
        return conflict("Workspace 名称已存在", {"error": "workspace_name_conflict"})
    owner_id, token, lock_error = _acquire_management_lock(workspace_id, "restore")
    if lock_error:
        return lock_error
    service = WorkspaceFileService()
    deleted_root = service.deleted_workspace_root(workspace)
    try:
        service.restore_from_trash(workspace)
        restored = restore_workspace_record(workspace_id, current_user["id"])
        if not restored:
            if deleted_root is not None:
                service.move_active_back_to_trash(workspace, deleted_root)
            return fail(40001, "Workspace 不存在")
    except WorkspaceConflictError as exc:
        return conflict(str(exc), exc.data)
    except FileNotFoundError as exc:
        return fail(40001, str(exc))
    except ValueError as exc:
        if deleted_root is not None:
            service.move_active_back_to_trash(workspace, deleted_root)
        return conflict(str(exc), {"error": "workspace_name_conflict"})
    except Exception:
        if deleted_root is not None:
            service.move_active_back_to_trash(workspace, deleted_root)
        raise
    finally:
        _release_management_lock(workspace_id, owner_id, token)
    return ok(restored, message="Workspace 已恢复")


@router.delete("/workspaces/{workspace_id}/purge")
async def api_purge_workspace(workspace_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    workspace = get_workspace(workspace_id, owner_user_id=current_user["id"])
    if not workspace:
        return fail(40001, "Workspace 不存在")
    if workspace.get("status") != "deleted":
        return bad_request("只能彻底删除已删除的 Workspace")
    blocked = _mutation_block_response(workspace_id)
    if blocked:
        return blocked
    owner_id, token, lock_error = _acquire_management_lock(workspace_id, "purge")
    if lock_error:
        return lock_error
    service = WorkspaceFileService()
    try:
        service.purge_deleted_workspace(workspace)
        purged = purge_workspace_record(workspace_id, current_user["id"])
    except ValueError as exc:
        return bad_request(str(exc))
    finally:
        _release_management_lock(workspace_id, owner_id, token)
    return ok(purged, message="Workspace 已彻底删除")


@router.get("/workspaces/{workspace_id}/files/tree")
async def api_workspace_file_tree(
    workspace_id: str,
    maxDepth: Optional[int] = Query(None, ge=1, le=20),
    maxEntries: Optional[int] = Query(None, ge=1, le=10000),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace, error = _active_workspace_or_error(workspace_id, current_user["id"])
    if error:
        return error
    tree = WorkspaceFileService().build_tree(workspace, max_depth=maxDepth, max_entries=maxEntries)
    return ok(tree)


@router.get("/workspaces/{workspace_id}/files/content")
async def api_read_workspace_file(
    workspace_id: str,
    path: str = Query(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace, error = _active_workspace_or_error(workspace_id, current_user["id"])
    if error:
        return error
    try:
        return ok(WorkspaceFileService().read_content(workspace, path))
    except ValueError:
        return fail(40000, "非法文件路径")
    except FileNotFoundError:
        return fail(40001, "文件不存在")


@router.put("/workspaces/{workspace_id}/files/content")
async def api_write_workspace_file(
    workspace_id: str,
    payload: Dict[str, Any] = Body(...),
    path: str = Query(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace, error = _active_workspace_or_error(workspace_id, current_user["id"])
    if error:
        return error
    content_value = payload.get("content")
    base_sha256 = str(payload.get("baseSha256") or "")
    if content_value is None:
        return fail(40000, "content 不能为空")
    try:
        saved = WorkspaceFileService().write_content(workspace, path, str(content_value), base_sha256)
    except WorkspaceConflictError as exc:
        return conflict(str(exc), exc.data)
    except ValueError as exc:
        return fail(40000, str(exc))
    except FileNotFoundError:
        return fail(40001, "文件不存在")
    return ok(saved, message="文件已保存")


@router.get("/workspaces/{workspace_id}/files/download")
async def api_download_workspace_file(
    workspace_id: str,
    path: str = Query(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace, error = _active_workspace_or_error(workspace_id, current_user["id"])
    if error:
        return error
    service = WorkspaceFileService()
    try:
        target = service.download_path(workspace, path)
    except ValueError:
        return fail(40000, "非法文件路径")
    except FileNotFoundError:
        return fail(40001, "文件不存在")
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type=service._mime_type(target),
    )


@router.post("/workspaces/{workspace_id}/files/upload")
async def api_upload_workspace_file(
    workspace_id: str,
    dir: str = Query("", alias="dir"),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    workspace, error = _active_workspace_or_error(workspace_id, current_user["id"])
    if error:
        return error
    data = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > settings.WORKSPACE_UPLOAD_MAX_BYTES:
            return fail(40000, "上传文件超过大小限制")
    try:
        uploaded = WorkspaceFileService().upload_file(workspace, dir, file.filename or "", bytes(data))
    except WorkspaceConflictError as exc:
        return conflict(str(exc), exc.data)
    except ValueError as exc:
        return fail(40000, str(exc))
    return ok(uploaded, message="文件已上传")
