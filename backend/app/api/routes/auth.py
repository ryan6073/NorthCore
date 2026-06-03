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


def _auth_payload(user: Dict[str, Any], session: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user": user,
        "token": session.get("token"),
        "tokenType": session.get("tokenType", "Bearer"),
        "expiresAt": session.get("expiresAt"),
    }


@router.post("/auth/register")
async def api_register(payload: Dict[str, Any] = Body(...)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    name = str(payload.get("name") or payload.get("nickname") or "").strip()
    avatar = str(payload.get("avatar") or "").strip()
    if not is_valid_email(email):
        return fail(40000, "邮箱格式不正确")
    if len(password) < 6:
        return fail(40000, "密码至少 6 位")
    user = create_user(email=email, password=password, name=name, avatar=avatar)
    if not user:
        return fail(40004, "邮箱已注册")
    session = create_user_session(user["id"])
    return ok(_auth_payload(user, session), message="注册成功")


@router.post("/auth/login")
async def api_login(payload: Dict[str, Any] = Body(...)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    user = verify_user_credentials(email, password)
    if not user:
        return fail(40005, "邮箱或密码错误")
    ensure_user_contact_conversations(user["id"])
    session = create_user_session(user["id"])
    return ok(_auth_payload(user, session), message="登录成功")


@router.post("/auth/guest")
async def api_guest_login():
    user = get_or_create_guest_user()
    session = create_user_session(user["id"])
    return ok(_auth_payload(user, session), message="游客登录成功")


@router.get("/auth/me")
async def api_auth_me(authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    if not token:
        return fail(40101, "未登录")
    user = get_user_by_session_token(token)
    if not user:
        return fail(40101, "登录已过期")
    return ok(user)


@router.put("/auth/profile")
async def api_update_profile(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    if not token:
        return fail(40101, "未登录")
    current_user = get_user_by_session_token(token)
    if not current_user:
        return fail(40101, "登录已过期")

    name = payload.get("name")
    email = payload.get("email")
    avatar = payload.get("avatar")
    if name is not None and not str(name).strip():
        return fail(40000, "昵称不能为空")
    if email is not None:
        normalized_email = str(email).strip().lower()
        if not is_valid_email(normalized_email):
            return fail(40000, "邮箱格式不正确")
        existing_user = get_user_by_email(normalized_email)
        if existing_user and existing_user["id"] != current_user["id"]:
            return fail(40004, "邮箱已注册")

    updated_user = update_user_profile(
        user_id=current_user["id"],
        name=str(name) if name is not None else None,
        email=str(email) if email is not None else None,
        avatar=str(avatar) if avatar is not None else None,
    )
    if not updated_user:
        return fail(40001, "用户不存在")
    return ok(updated_user, message="资料更新成功")


@router.post("/auth/logout")
async def api_logout(authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    if token:
        revoke_user_session(token)
    return ok(True, message="已退出登录")
