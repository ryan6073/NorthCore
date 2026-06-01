import asyncio
import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import WebSocket

from app.api.deps import current_user_or_default, extract_bearer_token, user_from_token_or_default
from app.api.responses import fail, ok
from app.config import settings
from app.core.llm_client import client
from app.core.orchestrator import AGENT_CONFIGS, analyze_orchestrator_intent
from app.database import *
from app.services.file_version_service import FileVersionService
from app.services.run_scheduler import RunScheduler, generate_dag
from app.services.sandbox_service import SandboxService

API_PREFIX = "/api/v1"
CONTEXT_CHAR_THRESHOLD = 8000
CONTEXT_RETAIN_MESSAGE_COUNT = 12
CONTEXT_CAPACITY_CHARS = 200_000
MEMORY_EXTRACT_SYSTEM_PROMPT = """你是 AgentHub 的长期记忆提取器。
请判断本轮持久会话是否包含值得长期保存的信息。

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
请把给定历史压缩成一段对后续 Agent 协作或长期会话有用的中文摘要。

要求：
- 保留用户目标、项目事实、技术约束、关键决策、已完成事项、未完成事项
- 保留重要代码/产物的结论，不要逐字复制长代码
- 忽略 API key 错误、Unauthorized、模型调用失败等临时错误提示
- 摘要要紧凑、结构清晰，可直接作为后续模型上下文
"""


class WebSocketConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[WebSocket, str] = {}
        self._rooms: Dict[Tuple[str, str], Set[WebSocket]] = {}

    def connect(self, websocket: WebSocket, user_id: str) -> None:
        self._connections[websocket] = user_id

    def disconnect(self, websocket: WebSocket) -> None:
        user_id = self._connections.pop(websocket, None)
        if not user_id:
            return
        for room_key in list(self._rooms.keys()):
            sockets = self._rooms[room_key]
            sockets.discard(websocket)
            if not sockets:
                self._rooms.pop(room_key, None)

    def subscribe(self, websocket: WebSocket, user_id: str, conversation_id: str) -> None:
        if self._connections.get(websocket) != user_id:
            self.connect(websocket, user_id)
        self._rooms.setdefault((user_id, conversation_id), set()).add(websocket)

    def unsubscribe(self, websocket: WebSocket, user_id: str, conversation_id: str) -> None:
        room_key = (user_id, conversation_id)
        sockets = self._rooms.get(room_key)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._rooms.pop(room_key, None)

    async def broadcast(self, user_id: str, conversation_id: str, payload: Dict[str, Any]) -> None:
        sockets = list(self._rooms.get((user_id, conversation_id), set()))
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                self.disconnect(socket)


ws_manager = WebSocketConnectionManager()






def parse_enabled(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"all", "*"}:
        return None
    return normalized in {"1", "true", "yes", "on"}


from app.api.deps import current_user_or_default, extract_bearer_token, user_from_token_or_default
from app.api.responses import ok, fail


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


SENSITIVE_CONFIG_KEYS = {"apikey", "api_key", "secret", "token", "authorization", "headers"}
CONVERSATION_AGENT_CONFIG_FIELDS = {
    "name",
    "avatar",
    "description",
    "tags",
    "status",
    "category",
    "provider",
    "enabled",
    "lastUsedAt",
    "systemPrompt",
    "modelConfig",
    "tools",
    "permissions",
}
CONVERSATION_AGENT_IDENTITY_FIELDS = {
    "id",
    "ownerUserId",
    "conversationId",
    "baseAgentId",
    "overrideSource",
    "systemPromptSource",
}


def find_sensitive_model_config_key(value: Any, path: str = "modelConfig") -> Optional[str]:
    if isinstance(value, dict):
        for key, nested_value in value.items():
            normalized_key = str(key).replace("-", "_").lower()
            if normalized_key in SENSITIVE_CONFIG_KEYS:
                return f"{path}.{key}"
            nested_path = find_sensitive_model_config_key(nested_value, f"{path}.{key}")
            if nested_path:
                return nested_path
    elif isinstance(value, list):
        for index, item in enumerate(value):
            nested_path = find_sensitive_model_config_key(item, f"{path}[{index}]")
            if nested_path:
                return nested_path
    return None


def validate_agent_payload_security(payload: Dict[str, Any]) -> Optional[str]:
    if "modelConfig" not in payload:
        return None
    sensitive_path = find_sensitive_model_config_key(payload.get("modelConfig"))
    if sensitive_path:
        return f"当前版本不支持提交模型密钥或敏感鉴权字段: {sensitive_path}"
    return None


def sanitize_conversation_agent_config_payload(payload: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    blocked_fields = sorted(key for key in payload if key in CONVERSATION_AGENT_IDENTITY_FIELDS)
    if blocked_fields:
        return None, f"会话级 Agent 配置不允许修改身份字段: {', '.join(blocked_fields)}"
    unsupported_fields = sorted(key for key in payload if key not in CONVERSATION_AGENT_CONFIG_FIELDS)
    if unsupported_fields:
        return None, f"会话级 Agent 配置包含不支持字段: {', '.join(unsupported_fields)}"
    security_error = validate_agent_payload_security(payload)
    if security_error:
        return None, security_error
    return {key: payload[key] for key in CONVERSATION_AGENT_CONFIG_FIELDS if key in payload}, None


def parse_archived_filter(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return False
    normalized = value.strip().lower()
    if normalized in {"all", "*"}:
        return None
    return normalized in {"1", "true", "yes", "on"}


def validate_enabled_agent_ids(agent_ids: List[str], owner_user_id: Optional[str] = None) -> Optional[str]:
    for agent_id in agent_ids:
        agent = get_agent(agent_id, owner_user_id=owner_user_id)
        if not agent:
            return f"Agent 不存在: {agent_id}"
        if not agent_is_callable(agent):
            return f"Agent 已禁用: {agent.get('name', agent_id)}"
    return None


def ensure_orchestrator_for_group(mode: str, agent_ids: List[str]) -> List[str]:
    if mode != "group":
        return agent_ids
    normalized: List[str] = []
    for agent_id in [ORCHESTRATOR_AGENT_ID, *agent_ids]:
        if agent_id not in normalized:
            normalized.append(agent_id)
    return normalized


def agent_is_callable(agent: Optional[Dict[str, Any]]) -> bool:
    return bool(agent and agent.get("enabled") and agent.get("status") != "disabled")


def get_effective_agent_for_conversation(
    conversation: Dict[str, Any],
    agent_id: str,
) -> Optional[Dict[str, Any]]:
    owner_user_id = conversation.get("ownerUserId")
    if (
        conversation.get("mode") == "group"
        and agent_id != ORCHESTRATOR_AGENT_ID
        and agent_id in conversation.get("agentIds", [])
    ):
        return get_conversation_agent_config(
            conversation["id"],
            agent_id,
            owner_user_id=owner_user_id,
        )
    return get_agent(agent_id, owner_user_id=owner_user_id)


def choose_agent_for_conversation(conversation: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    agent_ids = conversation.get("agentIds", [])
    owner_user_id = conversation.get("ownerUserId")
    if conversation.get("mode") == "group" and "agent-orchestrator" in agent_ids:
        orchestrator = get_agent("agent-orchestrator")
        if agent_is_callable(orchestrator):
            return orchestrator
    for agent_id in agent_ids:
        agent = get_effective_agent_for_conversation(conversation, agent_id)
        if agent_is_callable(agent):
            return agent
    fallback = get_agent("agent-claude-code", owner_user_id=owner_user_id)
    return fallback if agent_is_callable(fallback) else None


def choose_target_agent(conversation: Dict[str, Any], target_agent_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not target_agent_id:
        return None
    if target_agent_id not in conversation.get("agentIds", []):
        return None
    agent = get_effective_agent_for_conversation(conversation, target_agent_id)
    return agent if agent_is_callable(agent) else None


def infer_mentioned_agent(conversation: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    return mentioned_agent if agent_is_callable(mentioned_agent) else None


def infer_any_mentioned_agent(conversation: Dict[str, Any], content: str) -> Optional[Dict[str, Any]]:
    agents = [
        agent
        for agent_id in conversation.get("agentIds", [])
        if (agent := get_effective_agent_for_conversation(conversation, agent_id))
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


def system_prompt_for_conversation(
    conversation: Optional[Dict[str, Any]],
    agent: Optional[Dict[str, Any]],
) -> str:
    if (
        conversation
        and conversation.get("mode") == "group"
        and agent
        and agent.get("systemPromptSource") == "conversation_override"
        and str(agent.get("systemPrompt") or "").strip()
    ):
        return str(agent["systemPrompt"]).strip()
    if conversation and str(conversation.get("systemPrompt") or "").strip():
        return str(conversation["systemPrompt"]).strip()
    return system_prompt_for_agent(agent)


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


def normalize_message_attachments(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_attachments = payload.get("attachments")
    if not isinstance(raw_attachments, list):
        return []
    attachments: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_attachments):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        url = str(item.get("url") or "").strip()
        kind = str(item.get("type") or item.get("kind") or "").strip().lower()
        if not name and not url:
            continue
        if not kind and name and "." in name:
            kind = name.rsplit(".", 1)[-1].lower()
        try:
            size = int(item.get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        attachments.append({
            "id": str(item.get("id") or create_id("attach")).strip() or create_id("attach"),
            "name": name or f"attachment-{index + 1}",
            "kind": kind or "file",
            "type": kind or "file",
            "mimeType": str(item.get("mimeType") or item.get("mime_type") or kind or "application/octet-stream"),
            "size": max(size, 0),
            "url": url,
            "storagePath": str(item.get("storagePath") or item.get("storage_path") or url or ""),
            "meta": item.get("meta") if isinstance(item.get("meta"), dict) else {},
        })
    return attachments


def attachment_summary_content(attachments: List[Dict[str, Any]]) -> str:
    if not attachments:
        return ""
    names = [str(item.get("name") or "附件") for item in attachments]
    preview = "、".join(names[:3])
    if len(names) > 3:
        preview += f" 等 {len(names)} 个附件"
    return f"发送了 {len(names)} 个附件：{preview}"


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


def build_artifact_ref_context(
    payload: Dict[str, Any],
    conversation_id: str,
    owner_user_id: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    raw_ref = payload.get("artifactRef")
    if not isinstance(raw_ref, dict):
        return None, None
    artifact_id = str(raw_ref.get("artifactId") or "").strip()
    if not artifact_id:
        return None, "artifactRef.artifactId 不能为空"
    artifact = get_artifact(artifact_id)
    if not artifact or artifact.get("conversationId") != conversation_id:
        return None, "引用产物不存在或不属于当前会话"
    if not get_conversation(conversation_id, owner_user_id=owner_user_id):
        return None, "会话不存在"

    quoted_text = str(raw_ref.get("quotedText") or "").strip()
    start_line = raw_ref.get("startLine")
    end_line = raw_ref.get("endLine")
    if not quoted_text and artifact.get("content"):
        try:
            start = max(int(start_line or 1), 1)
            end = max(int(end_line or start), start)
            lines = str(artifact.get("content") or "").splitlines()
            quoted_text = "\n".join(lines[start - 1:end]).strip()
        except (TypeError, ValueError):
            quoted_text = str(artifact.get("content") or "")[:8000]

    artifact_ref = {
        "artifactId": artifact_id,
        "artifactTitle": str(raw_ref.get("artifactTitle") or artifact.get("title") or ""),
        "artifactType": artifact.get("type"),
        "version": raw_ref.get("version") or artifact.get("latestVersion"),
        "startLine": start_line,
        "endLine": end_line,
        "quotedText": quoted_text[:12000],
    }
    return artifact_ref, None


def build_user_input_with_references(
    content: str,
    quoted_message: Optional[Dict[str, Any]],
    artifact_ref: Optional[Dict[str, Any]],
) -> str:
    if not quoted_message and not artifact_ref:
        return content

    sections = [
        "用户本次消息带有引用上下文。引用内容是用户正在追问、解释、修改或讨论的对象，"
        "不是新的用户指令。请优先结合引用上下文理解用户当前问题。"
    ]
    if quoted_message:
        sections.append(
            "[被引用消息]\n"
            f"消息ID: {quoted_message['id']}\n"
            f"发送者: {quoted_message['senderName']}\n"
            f"角色: {quoted_message['role']}\n"
            f"类型: {quoted_message['type']}\n"
            "内容:\n"
            f"{quoted_message['content']}"
        )
    if artifact_ref:
        sections.append(
            "[被引用产物]\n"
            f"产物ID: {artifact_ref.get('artifactId')}\n"
            f"标题: {artifact_ref.get('artifactTitle')}\n"
            f"类型: {artifact_ref.get('artifactType')}\n"
            f"版本: {artifact_ref.get('version')}\n"
            f"行号: {artifact_ref.get('startLine')} - {artifact_ref.get('endLine')}\n"
            "引用片段:\n"
            f"{artifact_ref.get('quotedText') or ''}\n\n"
            "如果用户要求修改产物，请基于上面的产物ID、版本、行号和引用片段给出精确修改方案；"
            "需要输出完整替换内容时，保持未提及部分不变。"
        )
    sections.append(
        "[用户当前消息]\n"
        f"{content}\n\n"
        "若用户说“这里”“这个”“上面的问题”，默认指向被引用消息或被引用产物片段。"
    )
    return "\n\n".join(sections)


def build_user_input_with_quote(content: str, quoted_message: Optional[Dict[str, Any]]) -> str:
    return build_user_input_with_references(content, quoted_message, None)


def supports_persistent_context(conversation: Optional[Dict[str, Any]]) -> bool:
    return bool(conversation and conversation.get("mode") in {"agent", "group"})


def build_context_usage(conversation: Dict[str, Any]) -> Dict[str, Any]:
    agent = choose_agent_for_conversation(conversation)
    base_system_prompt = system_prompt_for_conversation(conversation, agent)

    if supports_persistent_context(conversation):
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
        used_chars = len(build_persistent_system_context(conversation["id"], base_system_prompt))
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


RUN_ACTIVE_STATUSES = {"pending", "running", "conflict"}
RUN_STALE_AFTER = timedelta(minutes=10)


def parse_db_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def run_is_stale(run: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    if run.get("status") not in RUN_ACTIVE_STATUSES:
        return False
    started_at = parse_db_time(run.get("startedAt") or run.get("createdAt"))
    if not started_at:
        return False
    return (now or datetime.now()) - started_at > RUN_STALE_AFTER


def mark_run_stale(run: Dict[str, Any], reason: str = "沙箱任务超时未完成，已自动标记为失败") -> None:
    for step in run.get("steps", []):
        if step.get("status") == "running":
            update_agent_run_step(step["id"], status="failed", error=reason, mark_finished=True)
        elif step.get("status") == "pending":
            update_agent_run_step(step["id"], status="blocked", error=reason, mark_finished=True)
    update_agent_run(run["id"], status="failed", summary=reason, error=reason, mark_finished=True)
    sandbox = run.get("sandbox")
    if sandbox:
        update_sandbox(sandbox["id"], status="failed", error=reason)


def cleanup_stale_runs_for_conversation(conversation_id: str, owner_user_id: str) -> None:
    page = list_agent_runs_for_conversation(
        conversation_id,
        owner_user_id=owner_user_id,
        page=1,
        page_size=20,
    )
    now = datetime.now()
    for run in page.get("list", []):
        if run_is_stale(run, now):
            mark_run_stale(run)


def latest_active_run_for_conversation(
    conversation_id: str,
    owner_user_id: str,
) -> Optional[Dict[str, Any]]:
    cleanup_stale_runs_for_conversation(conversation_id, owner_user_id)
    page = list_agent_runs_for_conversation(
        conversation_id,
        owner_user_id=owner_user_id,
        page=1,
        page_size=5,
    )
    for run in page.get("list", []):
        if run.get("status") in {"pending", "running", "conflict"}:
            return run
    return None


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


def build_persistent_system_context(conversation_id: str, base_system_prompt: str) -> str:
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
    if not supports_persistent_context(conversation):
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
    base_system_prompt = system_prompt_for_conversation(conversation, agent)
    if not supports_persistent_context(conversation):
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
    messages = [{"role": "system", "content": build_persistent_system_context(conversation_id, base_system_prompt)}]
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
    print(
        "[Memory] extract.start",
        {
            "conversationId": conversation_id,
            "sourceMessageId": source_message_id,
            "userContent": user_content[:120],
            "agentMessageCount": len(agent_messages),
        },
    )
    useful_agent_messages = [
        message for message in agent_messages
        if message.get("type") in {"text", "code", "task-plan"}
        and is_effective_message_content(message.get("content", ""))
    ]
    if not is_effective_message_content(user_content) and not useful_agent_messages:
        print(
            "[Memory] extract.skip",
            {
                "conversationId": conversation_id,
                "sourceMessageId": source_message_id,
                "reason": "no_effective_content",
            },
        )
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
        raw_content = response.choices[0].message.content or ""
        print(
            "[Memory] extract.model_response",
            {
                "conversationId": conversation_id,
                "sourceMessageId": source_message_id,
                "raw": raw_content[:1000],
            },
        )
        payload = parse_json_object(raw_content)
        if not payload.get("shouldRecord"):
            print(
                "[Memory] extract.skip",
                {
                    "conversationId": conversation_id,
                    "sourceMessageId": source_message_id,
                    "reason": payload.get("reason") or "model_should_record_false",
                },
            )
            return
        memories = payload.get("memories") or []
        created_count = 0
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
            created_count += 1
            print(
                "[Memory] extract.saved",
                {
                    "conversationId": conversation_id,
                    "sourceMessageId": source_message_id,
                    "category": category,
                    "confidence": max(0.0, min(confidence, 1.0)),
                    "content": content,
                },
            )
        print(
            "[Memory] extract.done",
            {
                "conversationId": conversation_id,
                "sourceMessageId": source_message_id,
                "createdCount": created_count,
            },
        )
    except Exception as exc:
        print(f"❌ [Memory Extract Error]: {format_model_error(exc)}")


def schedule_memory_extraction(
    conversation: Dict[str, Any],
    user_message: Dict[str, Any],
    agent_messages: List[Dict[str, Any]],
) -> None:
    if not supports_persistent_context(conversation):
        print(
            "[Memory] schedule.skip",
            {
                "conversationId": conversation.get("id"),
                "mode": conversation.get("mode"),
                "reason": "unsupported_conversation_mode",
            },
        )
        return
    print(
        "[Memory] schedule",
        {
            "conversationId": conversation["id"],
            "mode": conversation.get("mode"),
            "sourceMessageId": user_message["id"],
            "agentMessageCount": len(agent_messages),
        },
    )
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
        if language.lower() in {"mermaid", "mmd"}:
            return {
                "title": "diagram.mmd",
                "type": "mermaid",
                "content": code_match.group(2).strip(),
            }
        if language.lower() in {"markdown", "md"}:
            return {
                "title": "document.md",
                "type": "markdown",
                "content": code_match.group(2).strip(),
            }
        if language.lower() in {"pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "csv", "txt"}:
            type_by_language = {
                "pdf": "pdf",
                "ppt": "ppt",
                "pptx": "ppt",
                "doc": "document",
                "docx": "document",
                "xls": "spreadsheet",
                "xlsx": "spreadsheet",
                "csv": "spreadsheet",
                "txt": "text",
            }
            return {
                "title": f"artifact.{language.lower()}",
                "type": type_by_language[language.lower()],
                "content": code_match.group(2).strip(),
            }
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
    if artifact_type == "mermaid":
        if "sequencediagram" in lowered or "sequenceDiagram" in content:
            return "sequence-diagram"
        if "flowchart" in lowered or "graph " in lowered:
            return "flowchart"
        return "diagram"
    if artifact_type == "pdf":
        return "pdf-document"
    if artifact_type == "ppt":
        return "presentation"
    if artifact_type == "document":
        return "document"
    if artifact_type == "spreadsheet":
        return "spreadsheet"
    if artifact_type == "text":
        return "text"
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
    if payload["type"] == "mermaid":
        return "mmd"
    if payload["type"] == "pdf":
        return "pdf"
    if payload["type"] == "ppt":
        return "pptx"
    if payload["type"] == "document":
        return "docx"
    if payload["type"] == "spreadsheet":
        return "xlsx"
    if payload["type"] == "text":
        return "txt"
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
    content: Optional[str] = None,
) -> Dict[str, Any]:
    return create_message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        sender_name=sender_name,
        role=role,
        msg_type="artifact",
        content=content or f"生成产物 {artifact['title']}",
        artifact_id=artifact["id"],
    )


def persist_artifact_from_message(
    conversation_id: str,
    message: Dict[str, Any],
    artifact_ref: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    artifact_payload = extract_artifact_payload(message["content"])
    if not artifact_payload:
        return None

    referenced_artifact_id = artifact_ref.get("artifactId") if artifact_ref else None
    if referenced_artifact_id:
        artifact = update_artifact(
            referenced_artifact_id,
            artifact_payload["content"],
            change_summary=f"由 {message['senderName']} 更新",
            created_by=message["senderId"],
            created_by_type="orchestrator" if message["role"] == "orchestrator" else "agent",
            metadata={
                "sourceMessageId": message["id"],
                "source": "artifactRef",
            },
        )
        if not artifact:
            return None
        action = "updated"
        artifact_message_content = f"更新产物 {artifact['title']} 到 v{artifact['latestVersion']}"
    else:
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
        action = "created"
        artifact_message_content = f"生成产物 {artifact['title']}"

    artifact_meta = {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}
    artifact_message = create_artifact_message(
        conversation_id=conversation_id,
        sender_id=message["senderId"],
        sender_name=message["senderName"],
        role=message["role"],
        artifact=artifact,
        content=artifact_message_content,
    )
    return {"artifact": artifact_meta, "message": artifact_message, "action": action}


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


def build_ws_payload(event_type: str, event_id: Optional[str], data: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"type": event_type, "data": data}
    if event_id:
        payload["eventId"] = event_id
    return payload


async def emit_conversation_event(
    current_user: Dict[str, Any],
    conversation_id: str,
    event_type: str,
    event_id: Optional[str],
    data: Dict[str, Any],
) -> None:
    await ws_manager.broadcast(
        current_user["id"],
        conversation_id,
        build_ws_payload(event_type, event_id, data),
    )


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
    current_user: Dict[str, Any],
    conversation_id: str,
    event_id: Optional[str],
    agent_id: str,
    status: str,
) -> None:
    await emit_conversation_event(
        current_user,
        conversation_id,
        "agent.status.changed",
        event_id,
        {
            "conversationId": conversation_id,
            "agentId": agent_id,
            "newStatus": status,
            "timestamp": ws_now(),
        },
    )


async def send_message_completed(
    current_user: Dict[str, Any],
    conversation_id: str,
    event_id: Optional[str],
    message: Dict[str, Any],
    finish_reason: str = "stop",
) -> None:
    await emit_conversation_event(
        current_user,
        conversation_id,
        "conversation.message.completed",
        event_id,
        {
            "conversationId": conversation_id,
            "messageId": message["id"],
            "finishReason": finish_reason,
            "fullMessage": message,
        },
    )


async def maybe_create_and_send_artifact(
    current_user: Dict[str, Any],
    event_id: Optional[str],
    conversation_id: str,
    message: Dict[str, Any],
    artifact_ref: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    artifact_result = persist_artifact_from_message(conversation_id, message, artifact_ref)
    if not artifact_result:
        return None
    await emit_conversation_event(
        current_user,
        conversation_id,
        "artifact.created",
        event_id,
        {
            "conversationId": conversation_id,
            "artifact": artifact_result["artifact"],
            "action": artifact_result["action"],
        },
    )
    artifact_message = artifact_result["message"]
    update_conversation_activity(conversation_id, artifact_message["content"])
    await send_message_completed(current_user, conversation_id, event_id, artifact_message)
    return artifact_result


async def handle_ws_message_create(websocket: WebSocket, event: Dict[str, Any], current_user: Optional[Dict[str, Any]] = None) -> None:
    print("WS MESSAGE EVENT:", event)
    print("WS MESSAGE DATA:", event.get("data"))
    event_id = event.get("eventId")
    data = event.get("data") or {}
    conversation_id = str(data.get("conversationId", "")).strip()
    content = str(data.get("content", "")).strip()
    attachments = normalize_message_attachments(data)
    if not content and attachments:
        content = attachment_summary_content(attachments)
    target_agent_id = str(data.get("targetAgentId") or data.get("targetAgentID") or "").strip() or None
    quoted_message_id = get_quoted_message_id(data)

    if not conversation_id:
        await send_ws_error(websocket, event_id, 40000, "conversationId 不能为空")
        return
    if not content and not attachments:
        await send_ws_error(websocket, event_id, 40000, "消息内容不能为空")
        return

    current_user = current_user or get_default_user()
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        await send_ws_error(websocket, event_id, 40001, "会话不存在")
        return
    ws_manager.subscribe(websocket, current_user["id"], conversation_id)
    quoted_message = None
    message_metadata: Dict[str, Any] = {}
    if quoted_message_id:
        quoted_message = get_message_in_conversation(conversation_id, quoted_message_id)
        if not quoted_message:
            await send_ws_error(websocket, event_id, 40003, "引用消息不存在或不属于当前会话")
            return
        message_metadata = build_quote_metadata(quoted_message)
    artifact_ref, artifact_ref_error = build_artifact_ref_context(data, conversation_id, current_user["id"])
    if artifact_ref_error:
        await send_ws_error(websocket, event_id, 40003, artifact_ref_error)
        return
    if artifact_ref:
        message_metadata["artifactRef"] = artifact_ref
    if attachments:
        message_metadata["attachments"] = attachments
    model_user_input = build_user_input_with_references(content, quoted_message, artifact_ref)
    target_agent = choose_target_agent(conversation, target_agent_id)
    if target_agent_id and not target_agent:
        await send_ws_error(websocket, event_id, 40002, "指定 Agent 不存在、已禁用或不属于当前会话")
        return
    target_agent = target_agent or infer_mentioned_agent(conversation, content)
    mentioned_agent = infer_any_mentioned_agent(conversation, content)
    if mentioned_agent and not agent_is_callable(mentioned_agent):
        await send_ws_error(websocket, event_id, 40002, "指定 Agent 已禁用，无法继续对话")
        return
    if conversation["mode"] in {"agent", "single"} and not choose_agent_for_conversation(conversation):
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
    if attachments:
        user_message["attachments"] = create_message_attachments(
            conversation_id,
            user_message["id"],
            attachments,
        )
    update_conversation_activity(conversation_id, content)
    await emit_conversation_event(
        current_user,
        conversation_id,
        "conversation.message.user_created",
        event_id,
        {"conversationId": conversation_id, "message": user_message},
    )

    total_artifacts = 0
    completed_messages: List[Dict[str, Any]] = []

    if conversation["mode"] == "group" and not target_agent:
        intent_result = analyze_orchestrator_intent(content)
        if intent_result["intent"] == "chat":
            orchestrator_content = intent_result["reply"]
            if quoted_message or artifact_ref:
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
            await send_message_completed(current_user, conversation_id, event_id, orchestrator_message)
            schedule_memory_extraction(conversation, user_message, [orchestrator_message])
            await emit_conversation_event(
                current_user,
                conversation_id,
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
        await send_message_completed(current_user, conversation_id, event_id, orchestrator_message)

    agent = target_agent or choose_agent_for_conversation(conversation)
    role = "orchestrator" if agent and agent["id"] == "agent-orchestrator" else "agent"
    message_id = create_id("msg")
    full_response_text = ""
    finish_reason = "stop"

    await send_agent_status(current_user, conversation_id, event_id, agent["id"], "thinking")
    await emit_conversation_event(
        current_user,
        conversation_id,
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
            await emit_conversation_event(
                current_user,
                conversation_id,
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
    await send_message_completed(current_user, conversation_id, event_id, agent_message, finish_reason)

    artifact_result = await maybe_create_and_send_artifact(
        current_user,
        event_id,
        conversation_id,
        agent_message,
        artifact_ref=artifact_ref,
    )
    if artifact_result:
        total_artifacts += 1

    await send_agent_status(current_user, conversation_id, event_id, agent["id"], "online")
    await emit_conversation_event(
        current_user,
        conversation_id,
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
