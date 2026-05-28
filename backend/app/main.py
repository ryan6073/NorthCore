import asyncio
import json
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, Header, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

from app.config import settings
from app.core.orchestrator import AGENT_CONFIGS, analyze_orchestrator_intent
from app.database import (
    create_artifact,
    create_agent,
    create_conversation,
    create_id,
    create_memory,
    create_message,
    create_user,
    create_user_session,
    disable_agent,
    ensure_contact_conversation,
    ensure_user_contact_conversations,
    delete_conversation,
    delete_memory,
    get_agent,
    get_artifact,
    get_artifact_version,
    get_context_messages,
    get_conversation,
    get_conversation_summary,
    get_default_user,
    get_message_in_conversation,
    get_or_create_guest_user,
    get_pinned_message_ids,
    get_user,
    get_user_by_session_token,
    init_db,
    is_effective_message_content,
    list_active_memories,
    list_agents,
    list_artifacts,
    list_artifact_versions,
    list_conversations,
    list_effective_messages,
    list_messages,
    list_pins,
    pin_message,
    revoke_user_session,
    unpin_message,
    update_agent,
    update_artifact,
    update_conversation,
    update_conversation_activity,
    upsert_conversation_summary,
    verify_user_credentials,
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
CONTEXT_CHAR_THRESHOLD = 8000
CONTEXT_RETAIN_MESSAGE_COUNT = 12
CONTEXT_CAPACITY_CHARS = 200_000
MEMORY_EXTRACT_SYSTEM_PROMPT = """你是 AgentHub 的长期记忆提取器。
请判断本轮群聊是否包含值得长期保存的信息。

应该保存：
- 用户偏好，例如技术栈、交互方式、开发习惯
- 项目事实，例如项目名称、模块边界、当前目标
- 长期约束，例如端口、部署地址、职责分工
- 用户画像，例如用户主要负责后端

不要保存：
- 问候、感谢、闲聊
- 一次性报错、API key 错误、Unauthorized、模型调用失败提示
- 重复或无长期价值的信息

你必须只输出 JSON：
{
  "shouldRecord": true,
  "reason": "这是长期项目约束",
  "memories": [
    {
      "category": "preference | project | profile | constraint",
      "content": "后端端口固定为 9007",
      "confidence": 0.9
    }
  ]
}
"""
CONTEXT_SUMMARY_SYSTEM_PROMPT = """你是 AgentHub 的会话压缩器。
请把给定历史压缩成一段对后续多 Agent 协作有用的中文摘要。

要求：
- 保留用户目标、项目事实、技术约束、关键决策、已完成事项、未完成事项
- 保留重要代码/产物的结论，不要逐字复制长代码
- 忽略 API key 错误、Unauthorized、模型调用失败等临时错误提示
- 摘要要紧凑、结构清晰，可直接作为后续模型上下文
"""


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


def auth_payload(user: Dict[str, Any], session: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user": user,
        "token": session["token"],
        "tokenType": session["tokenType"],
        "expiresAt": session["expiresAt"],
    }


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def validate_enabled_agent_ids(agent_ids: List[str], owner_user_id: Optional[str] = None) -> Optional[str]:
    for agent_id in agent_ids:
        agent = get_agent(agent_id, owner_user_id=owner_user_id)
        if not agent:
            return f"Agent 不存在: {agent_id}"
        if not agent_is_callable(agent):
            return f"Agent 已禁用: {agent.get('name', agent_id)}"
    return None


def agent_is_callable(agent: Optional[Dict[str, Any]]) -> bool:
    return bool(agent and agent.get("enabled") and agent.get("status") != "disabled")


def choose_agent_for_conversation(conversation: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    agent_ids = conversation.get("agentIds", [])
    if conversation.get("mode") == "group" and "agent-orchestrator" in agent_ids:
        orchestrator = get_agent("agent-orchestrator")
        if agent_is_callable(orchestrator):
            return orchestrator
    for agent_id in agent_ids:
        agent = get_agent(agent_id)
        if agent_is_callable(agent):
            return agent
    fallback = get_agent("agent-claude-code")
    return fallback if agent_is_callable(fallback) else None


def choose_target_agent(conversation: Dict[str, Any], target_agent_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not target_agent_id:
        return None
    if target_agent_id not in conversation.get("agentIds", []):
        return None
    agent = get_agent(target_agent_id)
    return agent if agent_is_callable(agent) else None


def infer_mentioned_agent(conversation: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    return mentioned_agent if agent_is_callable(mentioned_agent) else None


def infer_any_mentioned_agent(conversation: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
    agents = [
        agent
        for agent_id in conversation.get("agentIds", [])
        if (agent := get_agent(agent_id))
    ]
    agents.sort(key=lambda item: len(item.get("name", "")), reverse=True)
    for agent in agents:
        name = agent.get("name", "")
        if not name:
            continue
        if f"@{name}" in content or f"＠{name}" in content:
            return agent
    return None


def get_enabled_orchestrator(conversation: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if "agent-orchestrator" not in conversation.get("agentIds", []):
        return None
    agent = get_agent("agent-orchestrator")
    return agent if agent_is_callable(agent) else None


def system_prompt_for_agent(agent: Optional[Dict[str, Any]]) -> str:
    if not agent:
        return AGENT_CONFIGS["Claude Code"]["system"]
    if agent.get("systemPrompt"):
        return agent["systemPrompt"]
    return AGENT_CONFIGS.get(agent["name"], AGENT_CONFIGS["Claude Code"])["system"]


def estimate_context_chars(messages: List[Dict[str, str]]) -> int:
    return sum(len(message.get("content", "")) for message in messages)


def get_quoted_message_id(payload: Dict[str, Any]) -> Optional[str]:
    quoted_message_id = str(payload.get("quotedMessageId") or "").strip()
    return quoted_message_id or None


def is_system_message_payload(payload: Dict[str, Any]) -> bool:
    role = str(payload.get("role") or "").strip().lower()
    sender_id = str(payload.get("senderId") or payload.get("senderID") or "").strip().lower()
    message_type = str(payload.get("type") or payload.get("messageType") or "").strip().lower()
    return role == "system" or sender_id == "system" or message_type == "status"


def build_system_message_metadata(payload: Dict[str, Any]) -> Dict[str, Any]:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    merged_metadata = dict(metadata)
    for key in ("artifactId", "artifactVersionId", "event"):
        value = payload.get(key)
        if value is not None and str(value).strip():
            merged_metadata[key] = value
    return merged_metadata


def build_quote_metadata(quoted_message: Dict[str, Any]) -> Dict[str, Any]:
    quoted_snapshot = {
        "id": quoted_message["id"],
        "senderId": quoted_message["senderId"],
        "senderName": quoted_message["senderName"],
        "role": quoted_message["role"],
        "type": quoted_message["type"],
        "content": quoted_message["content"],
    }
    if quoted_message.get("artifactId"):
        quoted_snapshot["artifactId"] = quoted_message["artifactId"]
    return {
        "quotedMessageId": quoted_message["id"],
        "quotedMessage": quoted_snapshot,
    }


def build_user_input_with_quote(content: str, quoted_message: Optional[Dict[str, Any]]) -> str:
    if not quoted_message:
        return content
    return (
        "用户本次消息引用了一条历史消息。引用消息是用户正在追问、解释、修改或讨论的对象，"
        "不是新的用户指令。\n\n"
        "[被引用消息]\n"
        f"消息ID: {quoted_message['id']}\n"
        f"发送者: {quoted_message['senderName']}\n"
        f"角色: {quoted_message['role']}\n"
        f"类型: {quoted_message['type']}\n"
        "内容:\n"
        f"{quoted_message['content']}\n\n"
        "[用户当前消息]\n"
        f"{content}\n\n"
        "请结合被引用消息理解用户当前问题。若用户说“这是什么意思”“这个怎么改”“上面的问题”，"
        "默认指向被引用消息。"
    )


def build_context_usage(conversation: Dict[str, Any]) -> Dict[str, Any]:
    agent = choose_agent_for_conversation(conversation)
    base_system_prompt = system_prompt_for_agent(agent)

    if conversation.get("mode") == "group":
        summary = get_conversation_summary(conversation["id"])
        covered_until_message_id = summary["coveredUntilMessageId"] if summary else None
        pinned_ids = set(get_pinned_message_ids(conversation["id"]))
        effective_messages = [
            message for message in list_effective_messages(
                conversation["id"],
                after_message_id=covered_until_message_id,
            )
            if message["id"] not in pinned_ids
        ]
        used_chars = len(build_group_system_context(conversation["id"], base_system_prompt))
        used_chars += sum(len(message["content"]) for message in effective_messages)
    else:
        history = get_context_messages(conversation["id"])
        used_chars = len(base_system_prompt)
        used_chars += estimate_context_chars(history)

    percent = min(100, round((used_chars / CONTEXT_CAPACITY_CHARS) * 100))
    return {
        "contextUsagePercent": percent,
        "contextUsageChars": used_chars,
        "contextLimitChars": CONTEXT_CAPACITY_CHARS,
    }


def attach_context_usage(conversation: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **conversation,
        **build_context_usage(conversation),
    }


def attach_context_usage_to_page(page_data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **page_data,
        "list": [
            attach_context_usage(conversation)
            for conversation in page_data.get("list", [])
        ],
    }


def render_context_message(message: Dict[str, Any]) -> str:
    role_label = "用户" if message["role"] == "user" else message.get("senderName", "Agent")
    return f"{role_label}: {message['content']}"


def parse_json_object(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))


def fallback_summary(messages: List[Dict[str, Any]], previous_summary: str = "") -> str:
    snippets = [render_context_message(message) for message in messages[:8]]
    if len(messages) > 8:
        snippets.append(f"... 其余 {len(messages) - 8} 条历史已省略")
    parts = []
    if previous_summary:
        parts.append(f"上一版摘要：{previous_summary}")
    parts.append("本次压缩摘要（规则兜底）：\n" + "\n".join(snippets))
    return "\n\n".join(parts)


async def summarize_messages(
    previous_summary: str,
    messages_to_compress: List[Dict[str, Any]],
) -> str:
    if not messages_to_compress:
        return previous_summary
    history_text = "\n\n".join(render_context_message(message) for message in messages_to_compress)
    user_content = (
        f"已有摘要：\n{previous_summary or '无'}\n\n"
        f"需要压缩的历史消息：\n{history_text}"
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": CONTEXT_SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            stream=False,
        )
        summary = (response.choices[0].message.content or "").strip()
        return summary or fallback_summary(messages_to_compress, previous_summary)
    except Exception as exc:
        print(f"❌ [Context Summary Error]: {format_model_error(exc)}")
        return fallback_summary(messages_to_compress, previous_summary)


async def compress_conversation_context(
    conversation_id: str,
    manual: bool = False,
    exclude_message_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    summary = get_conversation_summary(conversation_id)
    previous_summary = summary["summary"] if summary else ""
    covered_until_message_id = summary["coveredUntilMessageId"] if summary else None
    effective_messages = list_effective_messages(
        conversation_id,
        after_message_id=covered_until_message_id,
        exclude_message_id=exclude_message_id,
    )
    pinned_ids = set(get_pinned_message_ids(conversation_id))
    compressible_messages = [
        message for message in effective_messages
        if message["id"] not in pinned_ids
    ]
    if not compressible_messages:
        return summary

    if len(compressible_messages) > CONTEXT_RETAIN_MESSAGE_COUNT:
        messages_to_compress = compressible_messages[:-CONTEXT_RETAIN_MESSAGE_COUNT]
    elif manual:
        messages_to_compress = compressible_messages
    else:
        return summary

    if not messages_to_compress:
        return summary

    new_summary = await summarize_messages(previous_summary, messages_to_compress)
    covered_until = messages_to_compress[-1]["id"]
    covered_count = (summary["coveredMessageCount"] if summary else 0) + len(messages_to_compress)
    return upsert_conversation_summary(
        conversation_id=conversation_id,
        summary=new_summary,
        covered_until_message_id=covered_until,
        covered_message_count=covered_count,
    )


def build_group_system_context(conversation_id: str, base_system_prompt: str) -> str:
    sections = [base_system_prompt]
    memories = list_active_memories(conversation_id)
    if memories:
        sections.append(
            "[长期记忆]\n" + "\n".join(
                f"- ({memory['category']}, {memory['confidence']:.2f}) {memory['content']}"
                for memory in memories
            )
        )

    summary = get_conversation_summary(conversation_id)
    if summary and summary["summary"].strip():
        sections.append("[会话摘要]\n" + summary["summary"].strip())

    pins = list_pins(conversation_id)
    if pins:
        sections.append(
            "[Pinned Messages]\n" + "\n".join(
                f"- {render_context_message(pin['message'])}"
                for pin in pins
            )
        )
    return "\n\n".join(sections)


async def maybe_auto_compress_context(
    conversation: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
) -> None:
    if conversation.get("mode") != "group":
        return
    summary = get_conversation_summary(conversation["id"])
    covered_until_message_id = summary["coveredUntilMessageId"] if summary else None
    effective_messages = list_effective_messages(
        conversation["id"],
        after_message_id=covered_until_message_id,
        exclude_message_id=exclude_message_id,
    )
    pinned_ids = set(get_pinned_message_ids(conversation["id"]))
    non_pinned_messages = [
        message for message in effective_messages
        if message["id"] not in pinned_ids
    ]
    if len(non_pinned_messages) <= CONTEXT_RETAIN_MESSAGE_COUNT:
        return
    context_chars = len(user_input)
    context_chars += len(summary["summary"]) if summary else 0
    context_chars += sum(len(memory["content"]) for memory in list_active_memories(conversation["id"]))
    context_chars += sum(len(pin["message"]["content"]) for pin in list_pins(conversation["id"]))
    context_chars += sum(len(message["content"]) for message in effective_messages)
    if context_chars < CONTEXT_CHAR_THRESHOLD:
        return
    await compress_conversation_context(conversation["id"], manual=False, exclude_message_id=exclude_message_id)


async def build_model_messages(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
) -> List[Dict[str, str]]:
    conversation = get_conversation(conversation_id)
    base_system_prompt = system_prompt_for_agent(agent)
    if not conversation or conversation.get("mode") != "group":
        history = get_context_messages(conversation_id, exclude_message_id=exclude_message_id)
        return [{"role": "system", "content": base_system_prompt}] + history + [
            {"role": "user", "content": user_input}
        ]

    await maybe_auto_compress_context(conversation, user_input, exclude_message_id)
    summary = get_conversation_summary(conversation_id)
    covered_until_message_id = summary["coveredUntilMessageId"] if summary else None
    pinned_ids = set(get_pinned_message_ids(conversation_id))
    effective_messages = [
        message for message in list_effective_messages(
            conversation_id,
            after_message_id=covered_until_message_id,
            exclude_message_id=exclude_message_id,
        )
        if message["id"] not in pinned_ids
    ]
    messages = [{"role": "system", "content": build_group_system_context(conversation_id, base_system_prompt)}]
    for message in effective_messages:
        role = "assistant" if message["role"] in ("agent", "orchestrator", "system") else "user"
        messages.append({"role": role, "content": message["content"]})
    messages.append({"role": "user", "content": user_input})
    return messages


async def call_agent_once(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
) -> str:
    messages = await build_model_messages(conversation_id, agent, user_input, exclude_message_id)
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
    messages = await build_model_messages(conversation_id, agent, user_input, exclude_message_id)
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


async def extract_long_term_memories(
    conversation_id: str,
    source_message_id: str,
    user_content: str,
    agent_messages: List[Dict[str, Any]],
) -> None:
    useful_agent_messages = [
        message for message in agent_messages
        if message.get("type") in {"text", "code", "task-plan"}
        and is_effective_message_content(message.get("content", ""))
    ]
    if not is_effective_message_content(user_content) and not useful_agent_messages:
        return

    round_text = f"用户：{user_content}"
    if useful_agent_messages:
        round_text += "\n\n" + "\n\n".join(render_context_message(message) for message in useful_agent_messages)
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": MEMORY_EXTRACT_SYSTEM_PROMPT},
                {"role": "user", "content": round_text},
            ],
            stream=False,
        )
        payload = parse_json_object(response.choices[0].message.content or "")
        if not payload.get("shouldRecord"):
            return
        memories = payload.get("memories") or []
        for memory in memories:
            if not isinstance(memory, dict):
                continue
            category = str(memory.get("category") or "project").strip()
            if category not in {"preference", "project", "profile", "constraint"}:
                category = "project"
            content = str(memory.get("content") or "").strip()
            if not content or not is_effective_message_content(content):
                continue
            try:
                confidence = float(memory.get("confidence") or 0.7)
            except (TypeError, ValueError):
                confidence = 0.7
            create_memory(
                conversation_id=conversation_id,
                category=category,
                content=content,
                confidence=max(0.0, min(confidence, 1.0)),
                source_message_id=source_message_id,
            )
    except Exception as exc:
        print(f"❌ [Memory Extract Error]: {format_model_error(exc)}")


def schedule_memory_extraction(
    conversation: Dict[str, Any],
    user_message: Dict[str, Any],
    agent_messages: List[Dict[str, Any]],
) -> None:
    if conversation.get("mode") != "group":
        return
    asyncio.create_task(
        extract_long_term_memories(
            conversation_id=conversation["id"],
            source_message_id=user_message["id"],
            user_content=user_message["content"],
            agent_messages=agent_messages,
        )
    )


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


def infer_artifact_base_name(artifact_type: str, content: str) -> str:
    lowered = content.lower()
    if artifact_type == "html":
        title_match = re.search(r"<title[^>]*>\s*([^<]+?)\s*</title>", content, re.IGNORECASE)
        if title_match:
            title = sanitize_artifact_name(title_match.group(1))
            if title:
                return title
        if "login" in lowered or "登录" in content:
            return "login-page"
        if "dashboard" in lowered or "仪表盘" in content:
            return "dashboard"
        if "profile" in lowered or "个人" in content:
            return "profile-page"
        if "landing" in lowered or "首页" in content:
            return "landing-page"
        return "html-page"
    if artifact_type == "markdown":
        heading_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if heading_match:
            heading = sanitize_artifact_name(heading_match.group(1))
            if heading:
                return heading
        return "document"
    if "tsx" in lowered or "jsx" in lowered or "export default" in lowered:
        return "component"
    return "code"


def sanitize_artifact_name(raw_name: str) -> str:
    ascii_name = raw_name.strip().lower().encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return ascii_name[:48].strip("-")


def artifact_extension(payload: Dict[str, str]) -> str:
    if payload["type"] == "html":
        return "html"
    if payload["type"] == "markdown":
        return "md"
    title = payload.get("title", "")
    if "." in title:
        ext = title.rsplit(".", 1)[-1].lower()
        if re.fullmatch(r"[a-z0-9_+-]{1,12}", ext):
            return ext
    return "txt"


def build_artifact_title(conversation_id: str, artifact_payload: Dict[str, str]) -> str:
    extension = artifact_extension(artifact_payload)
    base_name = infer_artifact_base_name(artifact_payload["type"], artifact_payload["content"])
    existing_titles = {artifact["title"] for artifact in list_artifacts(conversation_id)}
    candidate = f"{base_name}.{extension}"
    if candidate not in existing_titles:
        return candidate
    index = 2
    while True:
        candidate = f"{base_name}-{index}.{extension}"
        if candidate not in existing_titles:
            return candidate
        index += 1


def format_task_plan_content(task_plan: List[Dict[str, Any]]) -> str:
    if not task_plan:
        return "任务拆解：\n1. Claude Code 负责生成方案或代码。\n2. Codex 负责审查与优化建议。"
    return "任务拆解：\n" + "\n".join(
        f"{index + 1}. {step.get('agentName') or step.get('agent') or 'Agent'} - {step.get('task', '')}"
        for index, step in enumerate(task_plan)
    )


def create_artifact_message(
    conversation_id: str,
    sender_id: str,
    sender_name: str,
    role: str,
    artifact: Dict[str, Any],
) -> Dict[str, Any]:
    return create_message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        sender_name=sender_name,
        role=role,
        msg_type="artifact",
        content=f"生成产物 {artifact['title']}",
        artifact_id=artifact["id"],
    )


def list_mentionable_agents(conversation: Dict[str, Any], keyword: str = "") -> List[Dict[str, Any]]:
    normalized_keyword = keyword.strip().lower()
    agents: List[Dict[str, Any]] = []
    for agent_id in conversation.get("agentIds", []):
        if agent_id == "agent-orchestrator":
            continue
        agent = get_agent(agent_id)
        if not agent_is_callable(agent):
            continue
        if normalized_keyword:
            searchable = " ".join([
                agent.get("name", ""),
                agent.get("description", ""),
                " ".join(agent.get("tags") or []),
            ]).lower()
            if normalized_keyword not in searchable:
                continue
        agents.append({
            "id": agent["id"],
            "name": agent["name"],
            "avatar": agent.get("avatar", ""),
            "description": agent.get("description", ""),
            "tags": agent.get("tags") or [],
            "status": agent.get("status", "offline"),
        })
    return agents


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
    artifact_title = build_artifact_title(conversation_id, artifact_payload)
    artifact = create_artifact(
        conversation_id=conversation_id,
        message_id=message["id"],
        title=artifact_title,
        artifact_type=artifact_payload["type"],
        content=artifact_payload["content"],
        description=f"由 {message['senderName']} 生成",
        created_by=message["senderId"],
        created_by_type="orchestrator" if message["role"] == "orchestrator" else "agent",
    )
    artifact_meta = {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}
    await send_ws_event(
        websocket,
        "artifact.created",
        event_id,
        {"artifact": artifact_meta},
    )
    artifact_message = create_artifact_message(
        conversation_id=conversation_id,
        sender_id=message["senderId"],
        sender_name=message["senderName"],
        role=message["role"],
        artifact=artifact,
    )
    update_conversation_activity(conversation_id, artifact_message["content"])
    await send_message_completed(websocket, event_id, artifact_message)
    return {"artifact": artifact_meta, "message": artifact_message}


async def handle_ws_message_create(websocket: WebSocket, event: Dict[str, Any], current_user: Optional[Dict[str, Any]] = None) -> None:
    print("WS MESSAGE EVENT:", event)
    print("WS MESSAGE DATA:", event.get("data"))
    event_id = event.get("eventId")
    data = event.get("data") or {}
    conversation_id = str(data.get("conversationId", "")).strip()
    content = str(data.get("content", "")).strip()
    target_agent_id = str(data.get("targetAgentId") or data.get("targetAgentID") or "").strip() or None
    quoted_message_id = get_quoted_message_id(data)

    if not conversation_id:
        await send_ws_error(websocket, event_id, 40000, "conversationId 不能为空")
        return
    if not content:
        await send_ws_error(websocket, event_id, 40000, "消息内容不能为空")
        return

    current_user = current_user or get_default_user()
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        await send_ws_error(websocket, event_id, 40001, "会话不存在")
        return
    quoted_message = None
    message_metadata: Dict[str, Any] = {}
    if quoted_message_id:
        quoted_message = get_message_in_conversation(conversation_id, quoted_message_id)
        if not quoted_message:
            await send_ws_error(websocket, event_id, 40003, "引用消息不存在或不属于当前会话")
            return
        message_metadata = build_quote_metadata(quoted_message)
    model_user_input = build_user_input_with_quote(content, quoted_message)
    target_agent = choose_target_agent(conversation, target_agent_id)
    if target_agent_id and not target_agent:
        await send_ws_error(websocket, event_id, 40002, "指定 Agent 不存在、已禁用或不属于当前会话")
        return
    target_agent = target_agent or infer_mentioned_agent(conversation, content)
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    if mentioned_agent and not agent_is_callable(mentioned_agent):
        await send_ws_error(websocket, event_id, 40002, "指定 Agent 已禁用，无法继续对话")
        return
    if conversation["mode"] == "single" and not choose_agent_for_conversation(conversation):
        await send_ws_error(websocket, event_id, 40002, "当前 Agent 已禁用，无法继续对话")
        return
    if conversation["mode"] == "group" and not target_agent and not get_enabled_orchestrator(conversation):
        await send_ws_error(websocket, event_id, 40002, "Orchestrator 已禁用，无法自动调度；请 @ 一个可用 Agent")
        return

    user_message = create_message(
        conversation_id=conversation_id,
        sender_id="user",
        sender_name="用户",
        role="user",
        msg_type="text",
        content=content,
        metadata=message_metadata,
    )
    update_conversation_activity(conversation_id, content)
    await send_ws_event(
        websocket,
        "conversation.message.user_created",
        event_id,
        {"message": user_message},
    )

    total_artifacts = 0
    completed_messages: List[Dict[str, Any]] = []

    if conversation["mode"] == "group" and not target_agent:
        intent_result = analyze_orchestrator_intent(content)
        if intent_result["intent"] == "chat":
            orchestrator_content = intent_result["reply"]
            if quoted_message:
                orchestrator_agent = get_enabled_orchestrator(conversation) or choose_agent_for_conversation(conversation)
                try:
                    orchestrator_content = await call_agent_once(
                        conversation_id,
                        orchestrator_agent,
                        model_user_input,
                        exclude_message_id=user_message["id"],
                    )
                except Exception as exc:
                    orchestrator_content = fallback_reply(orchestrator_agent, content, exc)
            orchestrator_message = create_message(
                conversation_id=conversation_id,
                sender_id="agent-orchestrator",
                sender_name="Orchestrator",
                role="orchestrator",
                msg_type="text",
                content=orchestrator_content,
            )
            update_conversation_activity(conversation_id, orchestrator_content)
            await send_message_completed(websocket, event_id, orchestrator_message)
            schedule_memory_extraction(conversation, user_message, [orchestrator_message])
            await send_ws_event(
                websocket,
                "conversation.all_tasks.completed",
                event_id,
                {
                    "conversationId": conversation_id,
                    "summary": "闲聊回复已完成",
                    "totalMessages": 2,
                    "totalArtifacts": 0,
                    "contextUsage": build_context_usage(conversation),
                },
            )
            return

        plan_content = format_task_plan_content(intent_result["taskPlan"])
        orchestrator_message = create_message(
            conversation_id=conversation_id,
            sender_id="agent-orchestrator",
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="task-plan",
            content=plan_content,
        )
        completed_messages.append(orchestrator_message)
        await send_message_completed(websocket, event_id, orchestrator_message)

    agent = target_agent or choose_agent_for_conversation(conversation)
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
            model_user_input,
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
    completed_messages.append(agent_message)
    update_conversation_activity(conversation_id, full_response_text)
    await send_message_completed(websocket, event_id, agent_message, finish_reason)

    artifact_result = await maybe_create_and_send_artifact(websocket, event_id, conversation_id, agent_message)
    if artifact_result:
        total_artifacts += 1

    await send_agent_status(websocket, event_id, agent["id"], "online")
    await send_ws_event(
        websocket,
        "conversation.all_tasks.completed",
        event_id,
        {
            "conversationId": conversation_id,
            "summary": "任务已完成" if finish_reason == "stop" else "任务已结束，但模型调用失败，已保存错误提示",
            "totalMessages": 2 + (1 if conversation["mode"] == "group" else 0) + total_artifacts,
            "totalArtifacts": total_artifacts,
            "contextUsage": build_context_usage(conversation),
        },
    )
    schedule_memory_extraction(conversation, user_message, completed_messages)


@app.get(f"{API_PREFIX}/health")
async def health_check():
    return ok({
        "status": "healthy",
        "version": app.version,
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }, message="ok")


@app.post(f"{API_PREFIX}/auth/register")
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
    return ok(auth_payload(user, session), message="注册成功")


@app.post(f"{API_PREFIX}/auth/login")
async def api_login(payload: Dict[str, Any] = Body(...)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    user = verify_user_credentials(email, password)
    if not user:
        return fail(40005, "邮箱或密码错误")
    ensure_user_contact_conversations(user["id"])
    session = create_user_session(user["id"])
    return ok(auth_payload(user, session), message="登录成功")


@app.post(f"{API_PREFIX}/auth/guest")
async def api_guest_login():
    user = get_or_create_guest_user()
    session = create_user_session(user["id"])
    return ok(auth_payload(user, session), message="游客登录成功")


@app.get(f"{API_PREFIX}/auth/me")
async def api_auth_me(authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    if not token:
        return fail(40101, "未登录")
    user = get_user_by_session_token(token)
    if not user:
        return fail(40101, "登录已过期")
    return ok(user)


@app.post(f"{API_PREFIX}/auth/logout")
async def api_logout(authorization: Optional[str] = Header(None)):
    token = extract_bearer_token(authorization)
    if token:
        revoke_user_session(token)
    return ok(True, message="已退出登录")


@app.get(f"{API_PREFIX}/agents")
async def api_list_agents(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    provider: Optional[str] = None,
    keyword: Optional[str] = None,
    enabled: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    return ok(list_agents(
        page=page,
        page_size=pageSize,
        category=category,
        provider=provider,
        keyword=keyword,
        enabled=True if enabled is None else parse_enabled(enabled),
        owner_user_id=current_user["id"],
    ))


@app.post(f"{API_PREFIX}/agents")
async def api_create_agent(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    name = str(payload.get("name", "")).strip()
    if not name:
        return fail(40000, "Agent 名称不能为空")
    agent = create_agent(payload, owner_user_id=current_user["id"])
    return ok(agent, message="Agent 创建成功")


@app.get(f"{API_PREFIX}/agents/{{agent_id}}")
async def api_get_agent(agent_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(agent)


@app.get(f"{API_PREFIX}/agents/{{agent_id}}/conversation")
async def api_get_agent_contact_conversation(agent_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if not agent:
        return fail(40001, "Agent 不存在")
    if not agent.get("enabled") or agent.get("status") == "disabled":
        return fail(40002, "Agent 已禁用，无法打开联系人会话")
    try:
        conversation = ensure_contact_conversation(current_user["id"], agent_id)
    except ValueError:
        return fail(40002, "Agent 已禁用，无法打开联系人会话")
    return ok(attach_context_usage(conversation))


@app.get(f"{API_PREFIX}/users/{{user_id}}/agents/{{agent_id}}/contact")
async def api_get_user_agent_contact_id(
    user_id: str,
    agent_id: str,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if current_user.get("role") != "admin" and current_user["id"] != user_id:
        return fail(40101, "无权访问该用户的联系人会话")
    if not get_user(user_id):
        return fail(40001, "用户不存在")

    agent = get_agent(agent_id, owner_user_id=user_id)
    if not agent:
        return fail(40001, "Agent 不存在")
    if not agent_is_callable(agent):
        return fail(40002, "Agent 已禁用，无法打开联系人会话")

    try:
        conversation = ensure_contact_conversation(user_id, agent_id)
    except ValueError:
        return fail(40002, "Agent 已禁用，无法打开联系人会话")

    contact_id = conversation["id"]
    return ok({
        "contactId": contact_id,
        "conversationId": contact_id,
        "conversation": attach_context_usage(conversation),
    })


@app.put(f"{API_PREFIX}/agents/{{agent_id}}")
async def api_update_agent(agent_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    existing_agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if existing_agent and existing_agent.get("ownerUserId") is None and current_user.get("role") != "admin":
        return fail(40006, "系统预置 Agent 不允许修改")
    agent = update_agent(agent_id, payload, owner_user_id=current_user["id"])
    if not agent:
        return fail(40001, "Agent 不存在")
    return ok(agent, message="Agent 配置更新成功")


@app.delete(f"{API_PREFIX}/agents/{{agent_id}}")
async def api_delete_agent(agent_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    existing_agent = get_agent(agent_id, owner_user_id=current_user["id"])
    if not existing_agent:
        return fail(40001, "Agent 不存在")
    if existing_agent.get("ownerUserId") is None and current_user.get("role") != "admin":
        return fail(40006, "系统预置 Agent 不允许禁用")
    disabled = disable_agent(agent_id, owner_user_id=current_user["id"])
    if not disabled:
        return fail(40001, "Agent 不存在")
    return ok(True, message="Agent 已禁用")


@app.get(f"{API_PREFIX}/conversations")
async def api_list_conversations(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    mode: Optional[str] = None,
    keyword: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    conversations = list_conversations(
        page=page,
        page_size=pageSize,
        mode=mode,
        keyword=keyword,
        owner_user_id=current_user["id"],
    )
    return ok(attach_context_usage_to_page(conversations))


@app.post(f"{API_PREFIX}/conversations")
async def api_create_conversation(payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    title = str(payload.get("title", "")).strip()
    mode = payload.get("mode", "single")
    agent_ids = payload.get("agentIds", [])
    if not title:
        return fail(40000, "会话标题不能为空")
    if mode not in {"single", "group"}:
        return fail(40000, "mode 只支持 single 或 group")
    if not isinstance(agent_ids, list) or not agent_ids:
        return fail(40000, "agentIds 不能为空")
    agent_error = validate_enabled_agent_ids(agent_ids, owner_user_id=current_user["id"])
    if agent_error:
        return fail(40002, agent_error)
    conversation = create_conversation(
        title=title,
        mode=mode,
        agent_ids=agent_ids,
        owner_user_id=current_user["id"],
    )
    return ok(attach_context_usage(conversation), message="会话创建成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}")
async def api_get_conversation(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(conversation))


@app.put(f"{API_PREFIX}/conversations/{{conversation_id}}")
async def api_update_conversation(conversation_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    agent_ids = payload.get("agentIds")
    if agent_ids is not None:
        if not isinstance(agent_ids, list) or not agent_ids:
            return fail(40000, "agentIds 不能为空")
        agent_error = validate_enabled_agent_ids(agent_ids, owner_user_id=current_user["id"])
        if agent_error:
            return fail(40002, agent_error)
    conversation = update_conversation(conversation_id, payload, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(attach_context_usage(conversation), message="会话更新成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/context/usage")
async def api_get_context_usage(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    return ok(build_context_usage(conversation))


@app.delete(f"{API_PREFIX}/conversations/{{conversation_id}}")
async def api_delete_conversation(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在", False)
    if conversation.get("conversationType") == "contact":
        return fail(40007, "Agent 联系人会话不允许删除，请禁用对应 Agent")
    deleted = delete_conversation(conversation_id, owner_user_id=current_user["id"])
    if not deleted:
        return fail(40001, "会话不存在", False)
    return ok(True, message="会话删除成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/messages")
async def api_list_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    authorization: Optional[str] = Header(None),
):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_messages(conversation_id, page=page, page_size=pageSize))


@app.post(f"{API_PREFIX}/conversations/{{conversation_id}}/mention")
async def api_list_mention_agents(conversation_id: str, payload: Dict[str, Any] = Body(default={}), authorization: Optional[str] = Header(None)):
    print("MENTION PAYLOAD:", payload)
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])

    if not conversation:
        return fail(40001, "会话不存在")
    keyword = str(payload.get("keyword") or payload.get("query") or "").strip()
    return ok(list_mentionable_agents(conversation, keyword))


@app.post(f"{API_PREFIX}/conversations/{{conversation_id}}/context/compress")
async def api_compress_context(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    if conversation["mode"] != "group":
        return fail(40000, "当前阶段仅支持群聊上下文压缩")
    before = get_conversation_summary(conversation_id)
    summary = await compress_conversation_context(conversation_id, manual=True)
    if not summary:
        return ok({
            "summary": None,
            "compressed": False,
            "reason": "暂无可压缩的有效消息",
            "contextUsage": build_context_usage(conversation),
        }, message="暂无可压缩内容")
    return ok({
        "summary": summary,
        "compressed": not before or before.get("version") != summary.get("version"),
        "contextUsage": build_context_usage(conversation),
    }, message="上下文压缩完成")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/memories")
async def api_list_memories(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_active_memories(conversation_id, limit=100))


@app.delete(f"{API_PREFIX}/conversations/{{conversation_id}}/memories/{{memory_id}}")
async def api_delete_memory(conversation_id: str, memory_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    deleted = delete_memory(conversation_id, memory_id)
    if not deleted:
        return fail(40001, "记忆不存在")
    return ok(True, message="记忆已删除")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/pins")
async def api_list_pins(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_pins(conversation_id))


@app.post(f"{API_PREFIX}/conversations/{{conversation_id}}/messages/{{message_id}}/pin")
async def api_pin_message(conversation_id: str, message_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    pin = pin_message(conversation_id, message_id)
    if not pin:
        return fail(40001, "消息不存在")
    return ok(pin, message="消息已 pin")


@app.delete(f"{API_PREFIX}/conversations/{{conversation_id}}/messages/{{message_id}}/pin")
async def api_unpin_message(conversation_id: str, message_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    deleted = unpin_message(conversation_id, message_id)
    if not deleted:
        return fail(40001, "pin 记录不存在")
    return ok(True, message="消息已取消 pin")


@app.post(f"{API_PREFIX}/conversations/{{conversation_id}}/messages")
async def api_send_message(conversation_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        return fail(40001, "会话不存在")
    print("MESSAGE PAYLOAD:", payload)
    content = str(payload.get("content", "")).strip()
    print("MESSAGE CONTENT:", content)
    target_agent_id = str(payload.get("targetAgentId") or payload.get("targetAgentID") or "").strip() or None
    quoted_message_id = get_quoted_message_id(payload)
    if not content:
        return fail(40000, "消息内容不能为空")
    if is_system_message_payload(payload):
        artifact_id = str(payload.get("artifactId") or "").strip() or None
        system_message = create_message(
            conversation_id=conversation_id,
            sender_id="system",
            sender_name=str(payload.get("senderName") or "系统").strip() or "系统",
            role="system",
            msg_type="status",
            content=content,
            artifact_id=artifact_id,
            metadata=build_system_message_metadata(payload),
        )
        update_conversation_activity(conversation_id, content)
        return ok({
            "userMessage": None,
            "agentMessages": [system_message],
            "artifacts": [],
            "contextUsage": build_context_usage(conversation),
        }, message="系统消息已保存")

    quoted_message = None
    message_metadata: Dict[str, Any] = {}
    if quoted_message_id:
        quoted_message = get_message_in_conversation(conversation_id, quoted_message_id)
        if not quoted_message:
            return fail(40003, "引用消息不存在或不属于当前会话")
        message_metadata = build_quote_metadata(quoted_message)
    model_user_input = build_user_input_with_quote(content, quoted_message)
    target_agent = choose_target_agent(conversation, target_agent_id)
    if target_agent_id and not target_agent:
        return fail(40002, "指定 Agent 不存在、已禁用或不属于当前会话")
    target_agent = target_agent or infer_mentioned_agent(conversation, content)
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    if mentioned_agent and not agent_is_callable(mentioned_agent):
        return fail(40002, "指定 Agent 已禁用，无法继续对话")
    if conversation["mode"] == "single" and not choose_agent_for_conversation(conversation):
        return fail(40002, "当前 Agent 已禁用，无法继续对话")
    if conversation["mode"] == "group" and not target_agent and not get_enabled_orchestrator(conversation):
        return fail(40002, "Orchestrator 已禁用，无法自动调度；请 @ 一个可用 Agent")

    user_message = create_message(
        conversation_id=conversation_id,
        sender_id="user",
        sender_name="用户",
        role="user",
        msg_type="text",
        content=content,
        metadata=message_metadata,
    )
    update_conversation_activity(conversation_id, content)

    agent_messages: List[Dict[str, Any]] = []
    artifacts: List[Dict[str, Any]] = []

    if conversation["mode"] == "group" and not target_agent:
        intent_result = analyze_orchestrator_intent(content)
        if intent_result["intent"] == "chat":
            orchestrator_content = intent_result["reply"]
            if quoted_message:
                orchestrator_agent = get_enabled_orchestrator(conversation) or choose_agent_for_conversation(conversation)
                try:
                    orchestrator_content = await call_agent_once(
                        conversation_id,
                        orchestrator_agent,
                        model_user_input,
                        exclude_message_id=user_message["id"],
                    )
                except Exception as exc:
                    orchestrator_content = fallback_reply(orchestrator_agent, content, exc)
            orchestrator_message = create_message(
                conversation_id=conversation_id,
                sender_id="agent-orchestrator",
                sender_name="Orchestrator",
                role="orchestrator",
                msg_type="text",
                content=orchestrator_content,
            )
            agent_messages.append(orchestrator_message)
            update_conversation_activity(conversation_id, orchestrator_content)
            schedule_memory_extraction(conversation, user_message, agent_messages)
            return ok({
                "userMessage": user_message,
                "agentMessages": agent_messages,
                "artifacts": artifacts,
                "contextUsage": build_context_usage(conversation),
            }, message="消息发送成功")

        plan_content = format_task_plan_content(intent_result["taskPlan"])
        orchestrator_message = create_message(
            conversation_id=conversation_id,
            sender_id="agent-orchestrator",
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="task-plan",
            content=plan_content,
        )
        agent_messages.append(orchestrator_message)

    agent = target_agent or choose_agent_for_conversation(conversation)
    try:
        reply_content = await call_agent_once(
            conversation_id,
            agent,
            model_user_input,
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
        artifact_title = build_artifact_title(conversation_id, artifact_payload)
        artifact = create_artifact(
            conversation_id=conversation_id,
            message_id=agent_message["id"],
            title=artifact_title,
            artifact_type=artifact_payload["type"],
            content=artifact_payload["content"],
            description=f"由 {agent_message['senderName']} 生成",
            created_by=agent_message["senderId"],
            created_by_type="orchestrator" if agent_message["role"] == "orchestrator" else "agent",
        )
        artifacts.append({k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}})
        artifact_message = create_artifact_message(
            conversation_id=conversation_id,
            sender_id=agent_message["senderId"],
            sender_name=agent_message["senderName"],
            role=agent_message["role"],
            artifact=artifact,
        )
        agent_messages.append(artifact_message)
        update_conversation_activity(conversation_id, artifact_message["content"])

    schedule_memory_extraction(conversation, user_message, agent_messages)
    return ok({
        "userMessage": user_message,
        "agentMessages": agent_messages,
        "artifacts": artifacts,
        "contextUsage": build_context_usage(conversation),
    }, message="消息发送成功")


@app.get(f"{API_PREFIX}/conversations/{{conversation_id}}/artifacts")
async def api_list_artifacts(conversation_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    if not get_conversation(conversation_id, owner_user_id=current_user["id"]):
        return fail(40001, "会话不存在")
    return ok(list_artifacts(conversation_id))


@app.get(f"{API_PREFIX}/artifacts/{{artifact_id}}")
async def api_get_artifact(artifact_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not artifact or not get_conversation(artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    return ok(artifact)


@app.get(f"{API_PREFIX}/artifacts/{{artifact_id}}/versions")
async def api_list_artifact_versions(artifact_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not artifact or not get_conversation(artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    return ok(list_artifact_versions(artifact_id))


@app.get(f"{API_PREFIX}/artifacts/{{artifact_id}}/versions/{{version_id}}")
async def api_get_artifact_version(artifact_id: str, version_id: str, authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    artifact = get_artifact(artifact_id)
    if not artifact or not get_conversation(artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    version = get_artifact_version(version_id)
    if not version or version["artifactId"] != artifact_id:
        return fail(40001, "产物版本不存在")
    return ok(version)


@app.put(f"{API_PREFIX}/artifacts/{{artifact_id}}")
async def api_update_artifact(artifact_id: str, payload: Dict[str, Any] = Body(...), authorization: Optional[str] = Header(None)):
    current_user = current_user_or_default(authorization)
    existing_artifact = get_artifact(artifact_id)
    if not existing_artifact or not get_conversation(existing_artifact["conversationId"], owner_user_id=current_user["id"]):
        return fail(40001, "产物不存在")
    content = str(payload.get("content", ""))
    change_summary = str(payload.get("changeSummary") or "").strip() or None
    artifact = update_artifact(
        artifact_id,
        content,
        change_summary=change_summary,
        created_by="user",
        created_by_type="user",
    )
    if not artifact:
        return fail(40001, "产物不存在")
    return ok(artifact, message="产物更新成功")


@app.websocket("/ws")
async def websocket_root(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization")
        token = extract_bearer_token(auth_header)
    current_user = user_from_token_or_default(token)
    await websocket.accept()
    await websocket.send_json({
        "type": "connected",
        "sessionId": "agenthub-ws",
        "serverTime": __import__("datetime").datetime.now().isoformat(),
        "version": app.version,
        "user": current_user,
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
