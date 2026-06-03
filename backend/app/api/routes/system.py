from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Header, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from app.app_metadata import APP_VERSION
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

@router.get("/health")
async def health_check():
    return ok({
        "status": "healthy",
        "version": APP_VERSION,
        "timestamp": now_iso(),
    }, message="ok")
