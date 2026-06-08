from typing import Any, Dict, Optional

from fastapi import Header, Query

from app.database import (
    ensure_user_contact_conversations,
    get_default_user,
    get_user_by_session_token,
)


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None
    return authorization[len(prefix):].strip() or None


def extract_token(
    authorization: Optional[str] = Header(None),
    token_query: Optional[str] = Query(None, alias="token"),
) -> Optional[str]:
    """
    从 Authorization Header 或者 URL 查询参数 token 中提取 token
    用于图片、文件等无法自定义请求头的场景
    """
    token = extract_bearer_token(authorization)
    if token:
        return token
    if token_query:
        return token_query.strip() or None
    return None


def current_user_or_default(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None, alias="token"),
) -> Dict[str, Any]:
    final_token = extract_bearer_token(authorization) or token
    if final_token:
        user = get_user_by_session_token(final_token)
        if user:
            ensure_user_contact_conversations(user["id"])
            return user
    user = get_default_user()
    ensure_user_contact_conversations(user["id"])
    return user


def user_from_token_or_default(token: Optional[str]) -> Dict[str, Any]:
    if token:
        user = get_user_by_session_token(token)
        if user:
            ensure_user_contact_conversations(user["id"])
            return user
    user = get_default_user()
    ensure_user_contact_conversations(user["id"])
    return user
