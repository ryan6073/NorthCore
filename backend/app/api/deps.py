from typing import Any, Dict, Optional

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


def current_user_or_default(authorization: Optional[str]) -> Dict[str, Any]:
    token = extract_bearer_token(authorization)
    if token:
        user = get_user_by_session_token(token)
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
