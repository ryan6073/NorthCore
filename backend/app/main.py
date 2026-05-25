import asyncio
import json
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

from app.config import settings
from app.core.orchestrator import AGENT_CONFIGS, generate_pipeline_plan
from app.database import (
    create_artifact,
    create_conversation,
    create_id,
    create_message,
    delete_conversation,
    get_agent,
    get_artifact,
    get_context_messages,
    get_conversation,
    init_db,
    list_agents,
    list_artifacts,
    list_conversations,
    list_messages,
    update_agent,
    update_artifact,
    update_conversation,
    update_conversation_activity,
)
from app.websocket.handler import handle_websocket_message

# 初始化工业级 FastAPI 实例
app = FastAPI(
    title="AgentHub API Platform",
    description="多 Agent 协作平台后端核心中枢 - 支持多会话、混合记忆与实时沙箱 HMR",
    version="1.0.0"
)

# 配置大厂规范的跨域资源共享 (CORS) 策略
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=settings.ARK_API_KEY, base_url=settings.ARK_BASE_URL)
API_PREFIX = "/api/v1"


@app.on_event("startup")
async def startup_event():
    init_db()


def ok(data: Any = None, message: str = "success") -> Dict[str, Any]:
    return {"code": 0, "message": message, "data": data}


def fail(code: int, message: str, data: Any = None) -> Dict[str, Any]:
    return {"code": code, "message": message, "data": data}


def parse_enabled(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    return value.lower() in {"1", "true", "yes", "on"}


def choose_agent_for_conversation(conversation: Dict[str, Any]) -> Dict[str, Any]:
    agent_ids = conversation.get("agentIds", [])
    if conversation.get("mode") == "group" and "agent-orchestrator" in agent_ids:
        return get_agent("agent-orchestrator") or get_agent(agent_ids[0])
    if agent_ids:
        return get_agent(agent_ids[0])
    return get_agent("agent-claude-code")


def system_prompt_for_agent(agent: Optional[Dict[str, Any]]) -> str:
    if not agent:
        return AGENT_CONFIGS["Claude Code"]["system"]
    if agent.get("systemPrompt"):
        return agent["systemPrompt"]
    return AGENT_CONFIGS.get(agent["name"], AGENT_CONFIGS["Claude Code"])["system"]


async def call_agent_once(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
) -> str:
    history = get_context_messages(conversation_id, exclude_message_id=exclude_message_id)
    messages = [{"role": "system", "content": system_prompt_for_agent(agent)}] + history
    messages.append({"role": "user", "content": user_input})
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model=settings.MODEL_EP,
        messages=messages,
        stream=False,
    )
    return response.choices[0].message.content or ""


async def stream_agent_reply(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
):
    history = get_context_messages(conversation_id, exclude_message_id=exclude_message_id)
    messages = [{"role": "system", "content": system_prompt_for_agent(agent)}] + history
    messages.append({"role": "user", "content": user_input})
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model=settings.MODEL_EP,
        messages=messages,
        stream=True,
    )
    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


def format_model_error(error: Exception) -> str:
    details = str(error).strip()
    if not details:
        details = repr(error)
    status_code = getattr(error, "status_code", None) or getattr(error, "code", None)
    if status_code and str(status_code) not in details:
        details = f"{status_code}: {details}"
    return details


def fallback_reply(agent: Optional[Dict[str, Any]], user_input: str, error: Optional[Exception] = None) -> str:
    agent_name = agent["name"] if agent else "Agent"
    if error:
        error_summary = format_model_error(error)
        print(f"❌ [Model Call Error] agent={agent_name} error={error_summary}")
        return (
            f"{agent_name} 暂时无法完成模型调用，但消息已保存。"
            f"\n\n错误摘要：{error_summary}"
        )
    return f"{agent_name} 已收到你的需求：{user_input}"


def extract_artifact_payload(content: str) -> Optional[Dict[str, str]]:
    html_match = re.search(r"```html\s*([\s\S]*?)```", content, re.IGNORECASE)
    if html_match:
        return {"title": "artifact.html", "type": "html", "content": html_match.group(1).strip()}
    if "<!DOCTYPE html" in content or "<html" in content:
        start = content.find("<!DOCTYPE html")
        if start == -1:
            start = content.find("<html")
        return {"title": "artifact.html", "type": "html", "content": content[start:].strip()}
    code_match = re.search(r"```([a-zA-Z0-9_+-]*)\s*([\s\S]*?)```", content)
    if code_match:
        language = code_match.group(1).strip() or "code"
        return {
            "title": f"artifact.{language}",
            "type": "code",
            "content": code_match.group(2).strip(),
        }
    return None


async def send_ws_event(websocket: WebSocket, event_type: str, event_id: Optional[str], data: Dict[str, Any]) -> None:
    payload: Dict[str, Any] = {"type": event_type, "data": data}
    if event_id:
        payload["eventId"] = event_id
    await websocket.send_json(payload)


async def send_ws_error(websocket: WebSocket, event_id: Optional[str], code: int, message: str) -> None:
    await send_ws_event(
        websocket,
        "error",
        event_id,
        {"code": code, "message": message},
    )


def ws_now() -> str:
    return __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S")


async def send_agent_status(
    websocket: WebSocket,
    event_id: Optional[str],
    agent_id: str,
    status: str,
) -> None:
    await send_ws_event(
        websocket,
        "agent.status.changed",
        event_id,
        {
            "agentId": agent_id,
            "newStatus": status,
            "timestamp": ws_now(),
        },
    )


async def send_message_completed(
    websocket: WebSocket,
    event_id: Optional[str],
    message: Dict[str, Any],
    finish_reason: str = "stop",
) -> None:
    await send_ws_event(
        websocket,
        "conversation.message.completed",
        event_id,
        {
            "messageId": message["id"],
            "finishReason": finish_reason,
            "fullMessage": message,
        },
    )


async def maybe_create_and_send_artifact(
    websocket: WebSocket,
    event_id: Optional[str],
    conversation_id: str,
    message: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    artifact_payload = extract_artifact_payload(message["content"])
    if not artifact_payload:
        return None
    artifact = create_artifact(
        conversation_id=conversation_id,
        message_id=message["id"],
        title=artifact_payload["title"],
        artifact_type=artifact_payload["type"],
        content=artifact_payload["content"],
        description=f"由 {message['senderName']} 生成",
    )
    artifact_meta = {k: v for k, v in artifact.items() if k != "content"}
    await send_ws_event(
        websocket,
        "artifact.created",
        event_id,
        {"artifact": artifact_meta},
    )
    return artifact_meta


async def handle_ws_message_create(websocket: WebSocket, event: Dict[str, Any]) -> None:
    event_id = event.get("eventId")
    data = event.get("data") or {}
    conversation_id = str(data.get("conversationId", "")).strip()
    content = str(data.get("content", "")).strip()

    if not conversation_id:
        await send_ws_error(websocket, event_id, 40000, "conversationId 不能为空")
        return
    if not content:
        await send_ws_error(websocket, event_id, 40000, "消息内容不能为空")
        return

    conversation = get_conversation(conversation_id)
    if not conversation:
        await send_ws_error(websocket, event_id, 40001, "会话不存在")
        return

    user_message = create_message(
        conversation_id=conversation_id,
        sender_id="user",
        sender_name="用户",
        role="user",
        msg_type="text",
        content=content,
    )
    update_conversation_activity(conversation_id, content)
    await send_ws_event(
        websocket,
        "conversation.message.user_created",
        event_id,
        {"message": user_message},
    )

    total_artifacts = 0

    if conversation["mode"] == "group":
        plan_content = "任务拆解：\n1. Claude Code 负责生成方案或代码。\n2. Codex 负责审查与优化建议。"
        try:
            plan = generate_pipeline_plan(content)
            plan_content = "任务拆解：\n" + "\n".join(
                f"{index + 1}. {step.get('agent', 'Agent')} - {step.get('task', '')}"
                for index, step in enumerate(plan)
            )
        except Exception:
            pass
        orchestrator_message = create_message(
            conversation_id=conversation_id,
            sender_id="agent-orchestrator",
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="task-plan",
            content=plan_content,
        )
        await send_message_completed(websocket, event_id, orchestrator_message)

    agent = choose_agent_for_conversation(conversation)
    role = "orchestrator" if agent and agent["id"] == "agent-orchestrator" else "agent"
    message_id = create_id("msg")
    full_response_text = ""
    finish_reason = "stop"

    await send_agent_status(websocket, event_id, agent["id"], "thinking")
    await send_ws_event(
        websocket,
        "agent.thinking.started",
        event_id,
        {
            "conversationId": conversation_id,
            "agentId": agent["id"],
            "agentName": agent["name"],
        },
    )

    try:
        sequence = 0
        async for token in stream_agent_reply(
            conversation_id,
            agent,
            content,
            exclude_message_id=user_message["id"],
        ):
            sequence += 1
            full_response_text += token
            await send_ws_event(
                websocket,
                "conversation.message.chunk",
                event_id,
                {
                    "messageId": message_id,
                    "conversationId": conversation_id,
                    "senderId": agent["id"],
                    "senderName": agent["name"],
                    "role": role,
                    "messageType": "text",
                    "chunk": token,
                    "sequence": sequence,
                    "isFullContent": False,
                },
            )
            await asyncio.sleep(0)
    except Exception as exc:
        full_response_text = fallback_reply(agent, content, exc)
        finish_reason = "error"

    agent_message = create_message(
        conversation_id=conversation_id,
        sender_id=agent["id"],
        sender_name=agent["name"],
        role=role,
        msg_type="text",
        content=full_response_text,
        message_id=message_id,
    )
    update_conversation_activity(conversation_id, full_response_text)
    await send_message_completed(websocket, event_id, agent_message, finish_reason)

    artifact = await maybe_create_and_send_artifact(websocket, event_id, conversation_id, agent_message)
    if artifact:
        total_artifacts += 1

    await send_agent_status(websocket, event_id, agent["id"], "online")
    await send_ws_event(
        websocket,
        "conversation.all_tasks.completed",
        event_id,
        {
            "conversationId": conversation_id,
            "summary": "任务已完成" if finish_reason == "stop" else "任务已结束，但模型调用失败，已保存错误提示",
            "totalMessages": 2 + (1 if conversation["mode"] == "group" else 0),
            "totalArtifacts": total_artifacts,
        },
    )


@app.get(f"{API_PREFIX}/health")
async def health_check():
    return ok({
        "status": "healthy",
        "version": app.version,
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }, message="ok")


@app.get(f"{API_PREFIX}/agents")
async def api_list_agents(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    provider: Optional[str] = None,
    keyword: Optional[str] = None,
    enabled: Optional[str] = None,
):
    return ok(list_agents(
        page=page,
        page_size=pageSize,
        category=category,
        provider=provider,
        keyword=keyword,
        enabled=parse_enabled(enabled),
    ))


@app.get(f"{API_PREFIX}/agents/{{agent_id}}")
async def api_get_agent(agent_id: str):
    agent = get_agent(agent_id)
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(agent)


@app.put(f"{API_PREFIX}/agents/{{agent_id}}")
async def api_update_agent(agent_id: str, payload: Dict[str, Any] = Body(...)):
    agent = update_agent(agent_id, payload)
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(agent, message="Agent 配置更新成功")


@app.get(f"{API_PREFIX}/conversations")
async def api_list_conversations(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    mode: Optional[str] = None,
    keyword: Optional[str] = None,
):
    return ok(list_conversations(page=page, page_size=pageSize, mode=mode, keyword=keyword))


@app.post(f"{API_PREFIX}/conversations")
async def api_create_conversation(payload: Dict[str, Any] = Body(...)):
    title = str(payload.get("title", "")).strip()
    mode = payload.get("mode", "single")
    agent_ids = payload.get("agentIds", [])
    if not title:
        return fail(40000, "会话标题不能为空")
    if mode not in {"single", "group"}:
        return fail(40000, "mode 只支持 single 或 group")
    if not isinstance(agent_ids, list) or not agent_ids:
        return fail(40000, "agentIds 不能为空")
    conversation = create_conversation(title=title, mode=mode, agent_ids=agent_ids)
    return ok(conversation, message="会话创建成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}")
async def api_get_conversation(conversation_id: str):
    conversation = get_conversation(conversation_id)
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(conversation)


@app.put(f"{API_PREFIX}/conversations/{{conversation_id}}")
async def api_update_conversation(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    conversation = update_conversation(conversation_id, payload)
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(conversation, message="会话更新成功")


@app.delete(f"{API_PREFIX}/conversations/{{conversation_id}}")
async def api_delete_conversation(conversation_id: str):
    deleted = delete_conversation(conversation_id)
    if not deleted:
        return fail(40001, "会话不存在", False)
    return ok(True, message="会话删除成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/messages")
async def api_list_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
):
    if not get_conversation(conversation_id):
        return fail(40001, "会话不存在")
    return ok(list_messages(conversation_id, page=page, page_size=pageSize))


@app.post(f"{API_PREFIX}/conversations/{{conversation_id}}/messages")
async def api_send_message(conversation_id: str, payload: Dict[str, Any] = Body(...)):
    conversation = get_conversation(conversation_id)
    if not conversation:
        return fail(40001, "会话不存在")

    content = str(payload.get("content", "")).strip()
    if not content:
        return fail(40000, "消息内容不能为空")

    user_message = create_message(
        conversation_id=conversation_id,
        sender_id="user",
        sender_name="用户",
        role="user",
        msg_type="text",
        content=content,
    )
    update_conversation_activity(conversation_id, content)

    agent_messages: List[Dict[str, Any]] = []
    artifacts: List[Dict[str, Any]] = []

    if conversation["mode"] == "group":
        plan_content = "任务拆解：\n1. Claude Code 负责生成方案或代码。\n2. Codex 负责审查与优化建议。"
        try:
            plan = generate_pipeline_plan(content)
            plan_content = "任务拆解：\n" + "\n".join(
                f"{index + 1}. {step.get('agent', 'Agent')} - {step.get('task', '')}"
                for index, step in enumerate(plan)
            )
        except Exception:
            pass
        orchestrator_message = create_message(
            conversation_id=conversation_id,
            sender_id="agent-orchestrator",
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="task-plan",
            content=plan_content,
        )
        agent_messages.append(orchestrator_message)

    agent = choose_agent_for_conversation(conversation)
    try:
        reply_content = await call_agent_once(
            conversation_id,
            agent,
            content,
            exclude_message_id=user_message["id"],
        )
    except Exception as exc:
        reply_content = fallback_reply(agent, content, exc)

    role = "orchestrator" if agent and agent["id"] == "agent-orchestrator" else "agent"
    agent_message = create_message(
        conversation_id=conversation_id,
        sender_id=agent["id"] if agent else "agent-unknown",
        sender_name=agent["name"] if agent else "Agent",
        role=role,
        msg_type="text",
        content=reply_content,
    )
    agent_messages.append(agent_message)
    update_conversation_activity(conversation_id, reply_content)

    artifact_payload = extract_artifact_payload(reply_content)
    if artifact_payload:
        artifact = create_artifact(
            conversation_id=conversation_id,
            message_id=agent_message["id"],
            title=artifact_payload["title"],
            artifact_type=artifact_payload["type"],
            content=artifact_payload["content"],
            description=f"由 {agent_message['senderName']} 生成",
        )
        artifacts.append({k: v for k, v in artifact.items() if k != "content"})

    return ok({
        "userMessage": user_message,
        "agentMessages": agent_messages,
        "artifacts": artifacts,
    }, message="消息发送成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/artifacts")
async def api_list_artifacts(conversation_id: str):
    if not get_conversation(conversation_id):
        return fail(40001, "会话不存在")
    return ok(list_artifacts(conversation_id))


@app.get(f"{API_PREFIX}/artifacts/{{artifact_id}}")
async def api_get_artifact(artifact_id: str):
    artifact = get_artifact(artifact_id)
    if not artifact:
        return fail(40001, "产物不存在")
    return ok(artifact)


@app.put(f"{API_PREFIX}/artifacts/{{artifact_id}}")
async def api_update_artifact(artifact_id: str, payload: Dict[str, Any] = Body(...)):
    content = str(payload.get("content", ""))
    artifact = update_artifact(artifact_id, content)
    if not artifact:
        return fail(40001, "产物不存在")
    return ok(artifact, message="产物更新成功")


@app.websocket("/ws")
async def websocket_root(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({
        "type": "connected",
        "sessionId": "agenthub-ws",
        "serverTime": __import__("datetime").datetime.now().isoformat(),
        "version": app.version,
    })
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            if event.get("type") == "ping":
                await websocket.send_json({"type": "pong", "timestamp": int(__import__("time").time() * 1000)})
            elif event.get("type") == "conversation.message.create":
                await handle_ws_message_create(websocket, event)
            else:
                await send_ws_error(
                    websocket,
                    event.get("eventId"),
                    40000,
                    f"不支持的 WebSocket 事件: {event.get('type')}",
                )
    except WebSocketDisconnect:
        print("💡 [WebSocket System]: /ws 客户端连接已安全断开")


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket 实时交互长连接端点
    接管全流式单聊 (1v1) 与 Orchestrator 群聊分布式状态编排
    """
    await websocket.accept()
    try:
        while True:
            # 接收前端打包传送过来的复杂 JSON 数据
            data_text = await websocket.receive_text()
            
            # 分流并路由至专职的业务处理器，由其完成关系映射、上下文组装及流式吞吐
            await handle_websocket_message(websocket, data_text)
            
    except WebSocketDisconnect:
        # 优雅捕获客户端安全断开状态，避免控制台溢出错误堆栈
        print("💡 [WebSocket System]: 客户端连接已安全断开")
    except Exception as e:
        print(f"❌ [WebSocket System Error]: 运行时捕获异常: {str(e)}")

# =====================================================================
#  MVP 阶段前端静态沙箱与视图就地挂载 (适配你的本地项目调试)
# =====================================================================

@app.get("/", response_class=HTMLResponse)
async def get_index():
    """根路径默认返回单页应用骨架 index.html"""
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    return (
        "<div style='text-align:center; margin-top:20%; font-family:sans-serif;'>"
        "<h1>🚀 AgentHub Backend 运行成功</h1>"
        "<p style='color:#666;'>未检测到 index.html，请确保前端静态资源放置在根目录下</p>"
        "</div>"
    )

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    """修复浏览器默认请求 favicon 导致的 502/404 挂起隐患"""
    if os.path.exists("favicon.ico"):
        return FileResponse("favicon.ico")
    return Response(status_code=204)

# 动态挂载根目录下所有的静态资产 (如 main.js, css 等) 
# 这允许你在本地以单一服务形式流畅跑通全栈应用
app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    # 通过统一配置中心加载 HOST 和 PORT，与 .env 变量强绑定
    print(f"🚀 AgentHub 正在拉起服务，监听地址: http://{settings.HOST}:{settings.PORT}")
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
