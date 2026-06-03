from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Header, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from app.app_metadata import APP_VERSION
from app.api.deps import extract_bearer_token, user_from_token_or_default
from app.api.responses import ok, fail
from app.database import *
from app.services.agent_service import *
from app.services.artifact_service import *
from app.services.context_service import *
from app.services.memory_service import *
from app.services.message_service import *
from app.services.run_service import *
from app.services.ws_service import *

router = APIRouter()

@router.websocket("/ws")
async def websocket_root(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization")
        token = extract_bearer_token(auth_header)
    current_user = user_from_token_or_default(token)
    await websocket.accept()
    ws_manager.connect(websocket, current_user["id"])
    try:
        await websocket.send_json({
            "type": "connected",
            "sessionId": "agenthub-ws",
            "serverTime": __import__("datetime").datetime.now().isoformat(),
            "version": APP_VERSION,
            "user": current_user,
        })
        while True:
            raw = await websocket.receive_text()
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            if event.get("type") == "ping":
                await websocket.send_json({"type": "pong", "timestamp": int(__import__("time").time() * 1000)})
            elif event.get("type") == "conversation.subscribe":
                await handle_ws_conversation_subscribe(websocket, event, current_user)
            elif event.get("type") == "conversation.unsubscribe":
                await handle_ws_conversation_unsubscribe(websocket, event, current_user)
            elif event.get("type") == "conversation.message.create":
                await handle_ws_message_create(websocket, event, current_user)

            else:
                await send_ws_error(
                    websocket,
                    event.get("eventId"),
                    40000,
                    f"不支持的 WebSocket 事件: {event.get('type')}",
                )
    except WebSocketDisconnect:
        print("💡 [WebSocket System]: /ws 客户端连接已安全断开")
    finally:
        ws_manager.disconnect(websocket)


@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    """旧 Demo WebSocket 入口已弃用，正式协议统一使用 /ws。"""
    await websocket.accept()
    await websocket.send_json({
        "type": "error",
        "data": {
            "code": 41000,
            "message": "/ws/chat 已弃用，请使用 /ws",
        },
    })
    await websocket.close(code=1008)

# =====================================================================
#  MVP 阶段后端运行状态页
# =====================================================================

@router.get("/", response_class=HTMLResponse)
async def get_index():
    """根路径仅返回后端运行状态，不托管本地静态文件。"""
    return (
        "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'>"
        "<h1>🚀 AgentHub Backend 运行成功</h1>"
        "<p style='color:#666;'>请使用前端开发服务访问应用界面</p>"
        "</div>"
    )

@router.get('/favicon.ico', include_in_schema=False)
async def favicon():
    """浏览器默认请求 favicon 时返回空响应。"""
    return Response(status_code=204)
