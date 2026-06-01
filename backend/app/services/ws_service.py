from typing import Any, Dict, Optional, Set, Tuple

from fastapi import WebSocket

from app.database import get_conversation
from app.services.message_service import (
    WebSocketConnectionManager,
    build_ws_payload,
    emit_conversation_event,
    send_agent_status,
    send_message_completed,
    send_ws_error,
    send_ws_event,
    ws_manager,
)
from app.services.run_service import build_run_event_payload, latest_active_run_for_conversation

async def handle_ws_conversation_subscribe(
    websocket: WebSocket,
    event: Dict[str, Any],
    current_user: Dict[str, Any],
) -> None:
    event_id = event.get("eventId")
    data = event.get("data") or {}
    conversation_id = str(data.get("conversationId") or "").strip()
    if not conversation_id:
        await send_ws_error(websocket, event_id, 40000, "conversationId 不能为空")
        return
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        await send_ws_error(websocket, event_id, 40001, "会话不存在")
        return
    ws_manager.subscribe(websocket, current_user["id"], conversation_id)
    await send_ws_event(
        websocket,
        "conversation.subscribed",
        event_id,
        {"conversationId": conversation_id},
    )
    active_run = latest_active_run_for_conversation(conversation_id, current_user["id"])
    if active_run:
        await send_ws_event(
            websocket,
            "run.created",
            None,
            build_run_event_payload(active_run["id"], {"run": active_run}),
        )


async def handle_ws_conversation_unsubscribe(
    websocket: WebSocket,
    event: Dict[str, Any],
    current_user: Dict[str, Any],
) -> None:
    event_id = event.get("eventId")
    data = event.get("data") or {}
    conversation_id = str(data.get("conversationId") or "").strip()
    if not conversation_id:
        await send_ws_error(websocket, event_id, 40000, "conversationId 不能为空")
        return
    ws_manager.unsubscribe(websocket, current_user["id"], conversation_id)
    await send_ws_event(
        websocket,
        "conversation.unsubscribed",
        event_id,
        {"conversationId": conversation_id},
    )


