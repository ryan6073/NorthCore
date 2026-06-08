import asyncio
import json
import re
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

from fastapi import WebSocket

from app.api.deps import current_user_or_default, extract_bearer_token, user_from_token_or_default
from app.api.responses import fail, ok
from app.config import settings
from app.core.llm_client import client
from app.core.orchestrator import AGENT_CONFIGS, analyze_orchestrator_intent
from app.database import *
from app.model_providers.service import create_openai_client_for_agent, model_name_for_agent, validate_model_config_for_runtime
from app.runtimes.router import runtime_router
from app.services.agent_tool_catalog_service import agent_has_tool, normalize_agent_tools
from app.services.conversation_agent_config_service import (
    get_effective_agent_for_conversation as resolve_conversation_agent_config,
)
from app.services.attachment_context_service import (
    append_attachment_context_to_input,
    attachment_read_only_intent,
    build_attachment_full_context,
    build_attachment_context,
    build_vision_user_content,
    has_vision_attachments,
    maybe_force_attachment_chat,
    resolve_message_attachments,
)
from app.services.file_version_service import FileVersionService
from app.services.intent_service import classify_for_conversation
from app.services.sandbox_service import SandboxService
from app.services.deployment_service import create_workspace_deployment_request, run_workspace_deployment
from app.services.web_search_service import prepare_web_search_for_chat
from app.services.workspace_agents_service import read_workspace_agents_context

API_PREFIX = "/api/v1"
CONTEXT_CHAR_THRESHOLD = 8000
CONTEXT_RETAIN_MESSAGE_COUNT = 12
CONTEXT_CAPACITY_CHARS = 200_000
ARTIFACT_CONTEXT_MAX_CHARS = 12_000
ARTIFACT_RESOLUTION_CONFIDENCE_THRESHOLD = 0.78
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
MEMORY_RESOLUTION_SYSTEM_PROMPT = """你是 AgentHub 的长期记忆冲突判断器。
请判断一条新候选记忆与同一会话中已有 active 记忆的关系。

关系只能是：
- duplicate：新记忆与某条已有记忆语义相同或明显重复
- conflict：新记忆与某条或多条已有记忆属于同一事实/偏好/约束槽位，但取值冲突，应以新记忆为准
- independent：新记忆与已有记忆可以并存

规则：
- 同一偏好槽位的不同取值是 conflict，例如喜欢绿色 -> 喜欢蓝色。
- 同一约束槽位的不同取值是 conflict，例如后端端口 9007 -> 9008。
- 不同维度偏好是 independent，例如喜欢蓝色 + 喜欢简洁风格。
- 语义重复是 duplicate，例如“用户喜欢蓝色”和“用户偏好的颜色为蓝色”。

你必须只输出 JSON：
{
  "relationship": "duplicate | conflict | independent",
  "duplicateMemoryId": "memory-id 或空字符串",
  "conflictingMemoryIds": ["memory-id"],
  "reason": "简短原因"
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
ARTIFACT_RESOLVER_SYSTEM_PROMPT = """你是 AgentHub 的产物引用解析器。
你的任务是在用户没有显式 artifactRef 时，判断当前消息是否需要加载某个已存在的 Artifact。

要求：
- 只根据用户当前消息、最近上下文占位符和候选 Artifact 列表判断。
- 不要编造 artifactId。
- 如果不确定，返回 shouldLoadArtifact=false，并设置 needsClarification=true。
- 只输出 JSON，不要输出解释性正文。

JSON 格式：
{
  "shouldLoadArtifact": true,
  "confidence": 0.0,
  "artifactId": "artifact-xxx",
  "loadScope": {
    "mode": "full | lines | preview",
    "startLine": null,
    "endLine": null
  },
  "reason": "简短原因",
  "needsClarification": false
}
"""

AUTO_ARTIFACT_REFERENCE_MARKERS = (
    "刚才", "之前", "前面", "上面", "这个", "那个", "这里", "这段", "原文",
    "文件", "代码", "产物", "python", ".py", "html", "artifact",
    "修改", "改", "替换", "换成", "不要", "给我", "修复", "更新",
)

TARGET_CLARIFICATION_MARKERS = (
    "刚才", "之前", "前面", "上面", "这个", "那个", "原文", "文件", "代码",
    "python", ".py", "html", "产物", "artifact",
)


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
BLOCKED_RUNTIME_CONFIG_KEYS = {"claude_code_bin", "codex_bin", "opencode_bin"}
PLATFORM_AGENT_RUNTIMES = {"opencode", "codex", "claude_code", "claude-code"}
CONVERSATION_AGENT_CONFIG_FIELDS = {
    "name",
    "avatar",
    "description",
    "tags",
    "status",
    "category",
    "provider",
    "runtime",
    "modelConfigId",
    "runtimeConfig",
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
CONVERSATION_AGENT_RESPONSE_ONLY_FIELDS = {
    *CONVERSATION_AGENT_IDENTITY_FIELDS,
    "configScope",
    "readonly",
    "fallbackBaseOverrideSource",
    "requiresWorkspace",
    "supportsContactConversation",
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


def find_blocked_runtime_config_key(value: Any, path: str = "runtimeConfig") -> Optional[str]:
    if isinstance(value, dict):
        for key, nested_value in value.items():
            normalized_key = str(key).replace("-", "_").lower()
            if normalized_key in BLOCKED_RUNTIME_CONFIG_KEYS:
                return f"{path}.{key}"
            nested_path = find_blocked_runtime_config_key(nested_value, f"{path}.{key}")
            if nested_path:
                return nested_path
    elif isinstance(value, list):
        for index, item in enumerate(value):
            nested_path = find_blocked_runtime_config_key(item, f"{path}[{index}]")
            if nested_path:
                return nested_path
    return None


def sanitize_runtime_config(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for key, nested_value in value.items():
            normalized_key = str(key).replace("-", "_").lower()
            if normalized_key in BLOCKED_RUNTIME_CONFIG_KEYS:
                continue
            sanitized[key] = sanitize_runtime_config(nested_value)
        return sanitized
    if isinstance(value, list):
        return [sanitize_runtime_config(item) for item in value]
    return value


def sanitize_agent_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if "runtimeConfig" not in payload:
        return payload
    sanitized_runtime_config = sanitize_runtime_config(payload.get("runtimeConfig"))
    return {**payload, "runtimeConfig": sanitized_runtime_config if isinstance(sanitized_runtime_config, dict) else {}}


def is_platform_agent(agent: Optional[Dict[str, Any]]) -> bool:
    runtime = str((agent or {}).get("runtime") or "native").strip().lower()
    return runtime in PLATFORM_AGENT_RUNTIMES


def platform_agent_contact_error(agent: Optional[Dict[str, Any]] = None) -> str:
    runtime = str((agent or {}).get("runtime") or "platform").strip() or "platform"
    return f"{runtime} Agent 需要在绑定 Workspace 的 single/group 会话中使用，不提供长期联系人会话"


def validate_agent_payload_security(
    payload: Dict[str, Any],
    owner_user_id: Optional[str] = None,
    existing_agent: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    payload = sanitize_agent_payload(payload)
    if "modelConfig" in payload:
        sensitive_path = find_sensitive_model_config_key(payload.get("modelConfig"))
        if sensitive_path:
            return f"当前版本不支持提交模型密钥或敏感鉴权字段: {sensitive_path}"
    if "runtimeConfig" in payload:
        sensitive_path = find_sensitive_model_config_key(payload.get("runtimeConfig"), "runtimeConfig")
        if sensitive_path:
            return f"runtimeConfig 不允许提交模型密钥或敏感鉴权字段: {sensitive_path}"
    merged_agent = {**(existing_agent or {}), **payload}
    runtime = str(merged_agent.get("runtime") or "native").strip().lower() or "native"
    if "tools" in payload:
        _, tools_error = normalize_agent_tools(
            payload.get("tools"),
            runtime=runtime,
            agent_id=merged_agent.get("id"),
            category=merged_agent.get("category"),
            strict=True,
        )
        if tools_error:
            return tools_error
    model_config_id = str(merged_agent.get("modelConfigId") or merged_agent.get("model_config_id") or "").strip()
    if runtime in {"claude_code", "claude-code", "codex"}:
        model_config = get_model_config(model_config_id, owner_user_id=owner_user_id) if model_config_id else None
        config_error = validate_model_config_for_runtime(model_config, runtime)
        if config_error:
            return config_error
    return None


def sanitize_conversation_agent_config_payload(
    payload: Dict[str, Any],
    owner_user_id: Optional[str] = None,
    existing_agent: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    payload = sanitize_agent_payload(payload)
    payload = {
        key: value
        for key, value in payload.items()
        if key not in CONVERSATION_AGENT_RESPONSE_ONLY_FIELDS
    }
    unsupported_fields = sorted(key for key in payload if key not in CONVERSATION_AGENT_CONFIG_FIELDS)
    if unsupported_fields:
        return None, f"会话级 Agent 配置包含不支持字段: {', '.join(unsupported_fields)}"
    security_error = validate_agent_payload_security(payload, owner_user_id=owner_user_id, existing_agent=existing_agent)
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
    return resolve_conversation_agent_config(conversation, agent_id)


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


def callable_group_member_agents(conversation: Dict[str, Any]) -> List[Dict[str, Any]]:
    if conversation.get("mode") != "group":
        return []
    agents: List[Dict[str, Any]] = []
    for agent_id in conversation.get("agentIds") or []:
        if agent_id == ORCHESTRATOR_AGENT_ID:
            continue
        agent = get_effective_agent_for_conversation(conversation, agent_id)
        if agent_is_callable(agent):
            agents.append(agent)
    return agents


def conversation_allows_agent_tool(
    conversation: Dict[str, Any],
    tool_id: str,
    target_agent_id: Optional[str] = None,
) -> bool:
    if target_agent_id:
        target_agent = choose_target_agent(conversation, target_agent_id)
        if target_agent:
            return agent_has_tool(target_agent, tool_id)
        return False
    if conversation.get("mode") == "group":
        return False
    return agent_has_tool(choose_agent_for_conversation(conversation), tool_id)


def resolve_deploy_agent_for_conversation(
    conversation: Dict[str, Any],
    target_agent_id: Optional[str] = None,
    allow_single_candidate_fallback: bool = False,
) -> Dict[str, Any]:
    requested_agent_id = str(target_agent_id or "").strip()
    if requested_agent_id:
        if requested_agent_id == ORCHESTRATOR_AGENT_ID:
            return {
                "ok": False,
                "error": "Orchestrator 是系统协调器，不能直接发起部署。请指定一个启用 deploy.run 的成员 Agent。",
                "reason": "orchestrator_not_executable",
            }
        target_agent = choose_target_agent(conversation, requested_agent_id)
        if not target_agent:
            return {
                "ok": False,
                "error": "指定的 Agent 不存在或不可用，不能发起部署。",
                "reason": "target_agent_unavailable",
            }
        if not agent_has_tool(target_agent, "deploy.run"):
            if allow_single_candidate_fallback and conversation.get("mode") == "group":
                candidates = [
                    agent
                    for agent in callable_group_member_agents(conversation)
                    if str(agent.get("id") or "") != requested_agent_id and agent_has_tool(agent, "deploy.run")
                ]
                if len(candidates) == 1:
                    return {
                        "ok": True,
                        "agent": candidates[0],
                        "selectionMode": "auto_single",
                        "requestedAgentId": requested_agent_id,
                        "fallbackReason": "requested_agent_missing_deploy_tool",
                    }
            return {
                "ok": False,
                "error": f"{target_agent.get('name') or '当前 Agent'} 未启用 deploy.run，不能发起部署。",
                "reason": "target_agent_missing_deploy_tool",
                "agent": target_agent,
            }
        return {
            "ok": True,
            "agent": target_agent,
            "selectionMode": "explicit",
        }

    if conversation.get("mode") == "group":
        candidates = [
            agent
            for agent in callable_group_member_agents(conversation)
            if agent_has_tool(agent, "deploy.run")
        ]
        if not candidates:
            return {
                "ok": False,
                "error": "群聊中没有启用 deploy.run 的可执行成员 Agent，不能发起部署。",
                "reason": "no_group_deploy_agent",
            }
        if len(candidates) > 1:
            return {
                "ok": False,
                "error": "群聊中有多个启用 deploy.run 的成员 Agent，请指定一个后再部署。",
                "reason": "multiple_group_deploy_agents",
                "candidates": candidates,
            }
        return {
            "ok": True,
            "agent": candidates[0],
            "selectionMode": "auto_single",
        }

    agent = choose_agent_for_conversation(conversation)
    if not agent or not agent_has_tool(agent, "deploy.run"):
        return {
            "ok": False,
            "error": "当前 Agent 未启用 deploy.run，不能发起部署。",
            "reason": "agent_missing_deploy_tool",
            "agent": agent,
        }
    return {
        "ok": True,
        "agent": agent,
        "selectionMode": "explicit",
    }


def deployment_agent_metadata(selection: Dict[str, Any]) -> Dict[str, Any]:
    agent = selection.get("agent") if isinstance(selection, dict) else None
    if not agent:
        return {}
    return {
        "deploymentAgentId": agent.get("id"),
        "deploymentAgentName": agent.get("name"),
        "deploymentAgentSelection": selection.get("selectionMode") or "unknown",
        "requestedDeploymentAgentId": selection.get("requestedAgentId"),
        "deploymentAgentFallbackReason": selection.get("fallbackReason"),
    }


def agent_messages_allow_tool(
    conversation: Dict[str, Any],
    agent_messages: List[Dict[str, Any]],
    tool_id: str,
) -> bool:
    for message in agent_messages or []:
        sender_id = str(message.get("senderId") or "").strip()
        if not sender_id or sender_id in {"system", "user"}:
            continue
        agent = get_effective_agent_for_conversation(conversation, sender_id)
        if agent_has_tool(agent, tool_id):
            return True
    return False


def _score_agent_for_task(agent: Dict[str, Any], task_text: str) -> int:
    text = (
        f"{agent.get('name') or ''} "
        f"{agent.get('description') or ''} "
        f"{' '.join(agent.get('tags') or [])}"
    ).lower()
    task = task_text.lower()
    score = 0
    if any(marker in task_text or marker in task for marker in ("图表", "流程图", "时序图", "架构图", "mermaid", "diagram")):
        score += 5 if any(marker in text for marker in ("图表", "mermaid", "diagram")) else 0
    if any(marker in task_text or marker in task for marker in ("文档", "markdown", "docx", "ppt", "汇报", "总结")):
        score += 5 if any(marker in text for marker in ("文档", "markdown", "ppt", "document")) else 0
    if any(marker in task_text or marker in task for marker in ("review", "审查", "bug", "修复", "代码", "实现", "开发")):
        score += 4 if any(marker in text for marker in ("codex", "代码", "code", "开发", "工程", "bug")) else 0
    return score


def normalize_group_task_plan_for_conversation(
    conversation: Dict[str, Any],
    task_plan: List[Dict[str, Any]],
    user_input: str,
) -> List[Dict[str, Any]]:
    agents = callable_group_member_agents(conversation)
    if not agents:
        return []
    by_id = {str(agent["id"]): agent for agent in agents}
    by_name = {str(agent.get("name") or ""): agent for agent in agents if agent.get("name")}
    normalized: List[Dict[str, Any]] = []
    for step in task_plan or []:
        if not isinstance(step, dict):
            continue
        task = str(step.get("task") or user_input).strip()
        if not task:
            continue
        raw_agent_id = str(step.get("agentId") or "").strip()
        raw_agent_name = str(step.get("agentName") or step.get("agent") or "").strip()
        agent = by_id.get(raw_agent_id) or by_name.get(raw_agent_name)
        if not agent:
            agent = max(agents, key=lambda item: _score_agent_for_task(item, task))
        normalized.append({
            "agentId": agent["id"],
            "agentName": agent.get("name") or "Agent",
            "task": task,
        })
    if normalized:
        return normalized[:4]
    fallback = max(agents, key=lambda item: _score_agent_for_task(item, user_input))
    return [{
        "agentId": fallback["id"],
        "agentName": fallback.get("name") or "Agent",
        "task": user_input,
    }]


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
    # Prompt precedence is intentional: group member override first,
    # then conversation.systemPrompt as a full conversation-level override,
    # then the user/base Agent prompt.
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
    conversation = get_conversation(conversation_id, owner_user_id=owner_user_id)
    if not conversation:
        return None, "会话不存在"
    artifact_workspace_id = str((artifact or {}).get("workspaceId") or "").strip()
    conversation_workspace_id = str(conversation.get("workspaceId") or "").strip()
    if not artifact:
        return None, "引用产物不存在或不属于当前会话"
    if artifact_workspace_id:
        if not conversation_workspace_id or artifact_workspace_id != conversation_workspace_id:
            return None, "引用产物不存在或不属于当前 Workspace"
    elif artifact.get("conversationId") != conversation_id:
        return None, "引用产物不存在或不属于当前会话"

    quoted_text = str(raw_ref.get("quotedText") or "").strip()
    start_line = raw_ref.get("startLine")
    end_line = raw_ref.get("endLine")
    if not quoted_text and artifact.get("content"):
        content = str(artifact.get("content") or "")
        if start_line is None and end_line is None:
            quoted_text = content[:ARTIFACT_CONTEXT_MAX_CHARS]
        else:
            try:
                start = max(int(start_line or 1), 1)
                end = max(int(end_line or start), start)
                lines = content.splitlines()
                quoted_text = "\n".join(lines[start - 1:end]).strip()
            except (TypeError, ValueError):
                quoted_text = content[:ARTIFACT_CONTEXT_MAX_CHARS]

    artifact_ref = {
        "artifactId": artifact_id,
        "artifactTitle": str(raw_ref.get("artifactTitle") or artifact.get("title") or ""),
        "artifactType": artifact.get("type"),
        "workspaceId": artifact.get("workspaceId"),
        "version": raw_ref.get("version") or artifact.get("latestVersion"),
        "startLine": start_line,
        "endLine": end_line,
        "quotedText": quoted_text[:ARTIFACT_CONTEXT_MAX_CHARS],
    }
    return artifact_ref, None


def artifact_meta_from_detail(artifact: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}


def render_artifact_placeholder(artifact: Dict[str, Any]) -> str:
    title = artifact.get("title") or artifact.get("artifactTitle") or "untitled"
    artifact_id = artifact.get("id") or artifact.get("artifactId")
    artifact_type = artifact.get("type") or artifact.get("artifactType") or "unknown"
    version = artifact.get("latestVersion") or artifact.get("version") or "unknown"
    return (
        f"[Artifact: {title} | id={artifact_id} | type={artifact_type} "
        f"| version={version} | url={API_PREFIX}/artifacts/{artifact_id}]"
    )


def related_artifact_placeholders_for_message(message: Dict[str, Any]) -> List[str]:
    placeholders: List[str] = []
    seen: Set[str] = set()
    artifact_id = message.get("artifactId")
    if artifact_id:
        artifact = get_artifact(artifact_id)
        if artifact:
            seen.add(artifact["id"])
            placeholders.append(render_artifact_placeholder(artifact_meta_from_detail(artifact)))
    message_id = message.get("id")
    if message_id:
        for artifact in list_artifacts_for_message(message_id):
            if artifact["id"] in seen:
                continue
            seen.add(artifact["id"])
            placeholders.append(render_artifact_placeholder(artifact))
    metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
    artifact_ref = metadata.get("artifactRef") if isinstance(metadata.get("artifactRef"), dict) else None
    if artifact_ref and artifact_ref.get("artifactId") not in seen:
        placeholders.append(render_artifact_placeholder(artifact_ref))
    return placeholders


def render_message_for_model_context(message: Dict[str, Any]) -> str:
    role_label = "用户" if message.get("role") == "user" else message.get("senderName", "Agent")
    placeholders = related_artifact_placeholders_for_message(message)
    if placeholders:
        metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
        if message.get("role") == "user" and isinstance(metadata.get("artifactRef"), dict):
            return f"{role_label}: {message.get('content', '')}\n" + "\n".join(placeholders)
        return f"{role_label}: " + "\n".join(placeholders)
    return f"{role_label}: {message.get('content', '')}"


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


def should_attempt_auto_artifact_resolution(content: str) -> bool:
    normalized = (content or "").strip().lower()
    if not normalized:
        return False
    return any(marker in content or marker in normalized for marker in AUTO_ARTIFACT_REFERENCE_MARKERS)


def payload_with_resolved_artifact_ref(payload: Dict[str, Any], artifact_ref: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not artifact_ref:
        return payload
    if isinstance(payload.get("artifactRef"), dict):
        return payload
    return {**payload, "artifactRef": artifact_ref}


def latest_pending_workspace_clarification(conversation_id: str) -> Optional[Dict[str, Any]]:
    messages = list_effective_messages(conversation_id)[-12:]
    for index in range(len(messages) - 1, -1, -1):
        message = messages[index]
        metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
        action_context = metadata.get("workspaceActionContext") if isinstance(metadata.get("workspaceActionContext"), dict) else None
        if not action_context or action_context.get("action") != "clarify":
            continue
        if metadata.get("event") != "workspace.action.decision":
            continue
        original_user = None
        for previous in reversed(messages[:index]):
            if previous.get("role") == "user":
                original_user = previous
                break
        if not original_user:
            return None
        return {
            "clarificationMessage": message,
            "originalUserMessage": original_user,
            "workspaceActionContext": action_context,
        }
    return None


def looks_like_target_clarification(content: str, artifact_ref: Optional[Dict[str, Any]]) -> bool:
    if not artifact_ref:
        return False
    normalized = (content or "").strip().lower()
    if not normalized:
        return False
    return any(marker in content or marker in normalized for marker in TARGET_CLARIFICATION_MARKERS)


def build_execution_input_for_workspace_action(
    content: str,
    model_user_input: str,
    pending_clarification: Optional[Dict[str, Any]],
    artifact_ref: Optional[Dict[str, Any]],
) -> str:
    if not pending_clarification or not looks_like_target_clarification(content, artifact_ref):
        return model_user_input
    original = pending_clarification.get("originalUserMessage") or {}
    original_content = str(original.get("content") or "").strip()
    if not original_content:
        return model_user_input
    return (
        "[用户先前的修改需求]\n"
        f"{original_content}\n\n"
        "[用户本轮补充的目标文件/产物]\n"
        f"{model_user_input}"
    )


async def resolve_artifact_context_with_model(
    content: str,
    conversation_id: str,
    owner_user_id: str,
) -> Optional[Dict[str, Any]]:
    conversation = get_conversation(conversation_id, owner_user_id=owner_user_id)
    workspace_id = str((conversation or {}).get("workspaceId") or "").strip()
    artifacts = list_artifacts_for_workspace(workspace_id) if workspace_id else list_artifacts(conversation_id)
    if not artifacts:
        return None
    candidate_artifacts = artifacts[:20]
    candidate_ids = {artifact["id"] for artifact in candidate_artifacts}
    recent_messages = list_effective_messages(conversation_id)[-8:]
    recent_context = "\n".join(render_message_for_model_context(message) for message in recent_messages)
    candidates_text = "\n".join(
        f"- id={artifact['id']} title={artifact['title']} type={artifact['type']} "
        f"version={artifact.get('latestVersion')}"
        for artifact in candidate_artifacts
    )
    user_prompt = (
        f"用户当前消息：\n{content}\n\n"
        f"最近上下文（Artifact 只以占位符出现）：\n{recent_context or '无'}\n\n"
        f"候选 Artifact：\n{candidates_text}\n\n"
        "请判断是否需要加载某个 Artifact 内容供正式回答使用。"
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": ARTIFACT_RESOLVER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            stream=False,
        )
        raw_content = response.choices[0].message.content or ""
        payload = parse_json_object(raw_content)
    except Exception as exc:
        print(f"❌ [Artifact Resolver Error]: {format_model_error(exc)}")
        return None

    if not payload.get("shouldLoadArtifact"):
        return None
    try:
        confidence = float(payload.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0
    artifact_id = str(payload.get("artifactId") or "").strip()
    if confidence < ARTIFACT_RESOLUTION_CONFIDENCE_THRESHOLD or artifact_id not in candidate_ids:
        return None

    load_scope = payload.get("loadScope") if isinstance(payload.get("loadScope"), dict) else {}
    mode = str(load_scope.get("mode") or "full").strip().lower()
    raw_ref: Dict[str, Any] = {"artifactId": artifact_id}
    if mode == "lines":
        raw_ref["startLine"] = load_scope.get("startLine")
        raw_ref["endLine"] = load_scope.get("endLine")
    artifact_ref, error = build_artifact_ref_context(
        {"artifactRef": raw_ref},
        conversation_id,
        owner_user_id,
    )
    if error:
        print(f"❌ [Artifact Resolver Load Error]: {error}")
        return None
    if artifact_ref:
        artifact_ref["resolution"] = {
            "source": "model",
            "confidence": confidence,
            "reason": str(payload.get("reason") or ""),
            "needsClarification": bool(payload.get("needsClarification")),
        }
    return artifact_ref


async def resolve_artifact_context_for_message(
    payload: Dict[str, Any],
    conversation_id: str,
    owner_user_id: str,
    content: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    # Artifact references are manual-only. Do not infer artifactRef from recent
    # context, otherwise the UI shows an implicit quote card that the user did
    # not choose. Workspace targeting is handled by workspace_index_context.
    artifact_ref, artifact_ref_error = build_artifact_ref_context(payload, conversation_id, owner_user_id)
    return artifact_ref, artifact_ref_error


def build_user_input_with_quote(content: str, quoted_message: Optional[Dict[str, Any]]) -> str:
    return build_user_input_with_references(content, quoted_message, None)


def supports_persistent_context(conversation: Optional[Dict[str, Any]]) -> bool:
    return bool(conversation and conversation.get("mode") in {"agent", "single", "group"})


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
        used_chars += sum(len(render_message_for_model_context(message)) for message in effective_messages)
    else:
        history = list_effective_messages(conversation["id"])[-12:]
        used_chars = len(base_system_prompt)
        used_chars += sum(len(render_message_for_model_context(message)) for message in history)

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
RUN_STALE_TIMEOUT_REASON = "沙箱任务超时未完成，已自动标记为失败"
RUN_STALE_LOCK_LOST_REASON = "沙箱执行进程已中断或服务重启，任务已自动标记为失败"


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
    if (
        run.get("runMode") in {"write", "deploy"}
        and run.get("workspaceId")
        and run.get("lockFencingToken")
        and is_workspace_mutation_lock_current(
            str(run.get("workspaceId") or ""),
            "run",
            str(run.get("id") or ""),
            int(run.get("lockFencingToken") or 0),
        )
    ):
        return False
    started_at = parse_db_time(run.get("startedAt") or run.get("createdAt"))
    if not started_at:
        return False
    return (now or now_datetime()) - started_at > RUN_STALE_AFTER


def stale_run_reason(run: Dict[str, Any]) -> str:
    if run.get("runMode") in {"write", "deploy"} and run.get("workspaceId") and run.get("lockFencingToken"):
        return RUN_STALE_LOCK_LOST_REASON
    return RUN_STALE_TIMEOUT_REASON


def mark_run_stale(run: Dict[str, Any], reason: str = RUN_STALE_TIMEOUT_REASON) -> None:
    for step in run.get("steps", []):
        if step.get("status") == "running":
            update_agent_run_step(step["id"], status="failed", error=reason, mark_finished=True)
        elif step.get("status") == "pending":
            update_agent_run_step(step["id"], status="blocked", error=reason, mark_finished=True)
    update_agent_run(run["id"], status="failed", summary=reason, error=reason, mark_finished=True)
    if run.get("workspaceId") and run.get("lockFencingToken"):
        release_workspace_mutation_lock(
            str(run.get("workspaceId") or ""),
            "run",
            str(run.get("id") or ""),
            int(run.get("lockFencingToken") or 0),
        )
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
    now = now_datetime()
    for run in page.get("list", []):
        if run_is_stale(run, now):
            mark_run_stale(run, stale_run_reason(run))


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


def latest_run_for_conversation(
    conversation_id: str,
    owner_user_id: str,
) -> Optional[Dict[str, Any]]:
    cleanup_stale_runs_for_conversation(conversation_id, owner_user_id)
    page = list_agent_runs_for_conversation(
        conversation_id,
        owner_user_id=owner_user_id,
        page=1,
        page_size=1,
    )
    runs = page.get("list") or []
    return runs[0] if runs else None


def attach_context_usage_to_page(page_data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **page_data,
        "list": [
            attach_context_usage(conversation)
            for conversation in page_data.get("list", [])
        ],
    }


def render_context_message(message: Dict[str, Any]) -> str:
    return render_message_for_model_context(message)


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


def build_persistent_system_context(
    conversation_id: str,
    base_system_prompt: str,
    agent: Optional[Dict[str, Any]] = None,
) -> str:
    sections = [base_system_prompt]
    conversation = get_conversation(conversation_id)
    workspace_context = (
        read_workspace_agents_context(conversation.get("workspaceId") if conversation else None)
        if agent_has_tool(agent, "workspace.read")
        else ""
    )
    if workspace_context:
        sections.append(workspace_context)
    memories = list_active_memories(conversation_id) if agent_has_tool(agent, "memory.use") else []
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
    agent: Optional[Dict[str, Any]] = None,
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
    if agent_has_tool(agent, "memory.use"):
        context_chars += sum(len(memory["content"]) for memory in list_active_memories(conversation["id"]))
    context_chars += sum(len(render_message_for_model_context(pin["message"])) for pin in list_pins(conversation["id"]))
    context_chars += sum(len(render_message_for_model_context(message)) for message in effective_messages)
    if context_chars < CONTEXT_CHAR_THRESHOLD:
        return
    await compress_conversation_context(conversation["id"], manual=False, exclude_message_id=exclude_message_id)


async def build_model_messages(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
    vision_attachments: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    conversation = get_conversation(conversation_id)
    base_system_prompt = system_prompt_for_conversation(conversation, agent)
    user_message_content = build_vision_user_content(user_input, vision_attachments or [])
    workspace_context = (
        read_workspace_agents_context(conversation.get("workspaceId") if conversation else None)
        if agent_has_tool(agent, "workspace.read")
        else ""
    )
    if workspace_context:
        print(
            f"[WorkspaceAgentsContext] stage=chat conversation={conversation_id} workspace={conversation.get('workspaceId') if conversation else '-'}\n{workspace_context}",
            flush=True,
        )
    if not supports_persistent_context(conversation):
        if workspace_context:
            base_system_prompt = base_system_prompt + "\n\n" + workspace_context
        history = list_effective_messages(conversation_id, exclude_message_id=exclude_message_id)[-12:]
        rendered_history = [
            {
                "role": "assistant" if message["role"] in ("agent", "orchestrator", "system") else "user",
                "content": render_message_for_model_context(message),
            }
            for message in history
        ]
        return [{"role": "system", "content": base_system_prompt}] + rendered_history + [
            {"role": "user", "content": user_message_content}
        ]

    await maybe_auto_compress_context(conversation, user_input, exclude_message_id, agent=agent)
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
    messages = [{"role": "system", "content": build_persistent_system_context(conversation_id, base_system_prompt, agent=agent)}]
    for message in effective_messages:
        role = "assistant" if message["role"] in ("agent", "orchestrator", "system") else "user"
        messages.append({"role": role, "content": render_message_for_model_context(message)})
    messages.append({"role": "user", "content": user_message_content})
    return messages


async def call_agent_once(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
    vision_attachments: Optional[List[Dict[str, Any]]] = None,
) -> str:
    messages = await build_model_messages(
        conversation_id,
        agent,
        user_input,
        exclude_message_id,
        vision_attachments=vision_attachments,
    )
    owner_user_id = agent.get("ownerUserId") if agent else None
    agent_client = create_openai_client_for_agent(agent, owner_user_id=owner_user_id)
    try:
        response = await asyncio.to_thread(
            agent_client.chat.completions.create,
            model=model_name_for_agent(agent, owner_user_id=owner_user_id),
            messages=messages,
            stream=False,
        )
    except Exception as exc:
        if not vision_attachments:
            raise
        print(f"⚠️ [Vision Chat Fallback] retry text-only: {format_model_error(exc)}")
        messages = await build_model_messages(
            conversation_id,
            agent,
            user_input,
            exclude_message_id,
            vision_attachments=None,
        )
        response = await asyncio.to_thread(
            agent_client.chat.completions.create,
            model=model_name_for_agent(agent, owner_user_id=owner_user_id),
            messages=messages,
            stream=False,
        )
    return response.choices[0].message.content or ""


async def stream_agent_reply(
    conversation_id: str,
    agent: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
    vision_attachments: Optional[List[Dict[str, Any]]] = None,
):
    messages = await build_model_messages(
        conversation_id,
        agent,
        user_input,
        exclude_message_id,
        vision_attachments=vision_attachments,
    )
    owner_user_id = agent.get("ownerUserId") if agent else None
    agent_client = create_openai_client_for_agent(agent, owner_user_id=owner_user_id)
    try:
        response = await asyncio.to_thread(
            agent_client.chat.completions.create,
            model=model_name_for_agent(agent, owner_user_id=owner_user_id),
            messages=messages,
            stream=True,
        )
    except Exception as exc:
        if not vision_attachments:
            raise
        print(f"⚠️ [Vision Stream Fallback] retry text-only: {format_model_error(exc)}")
        messages = await build_model_messages(
            conversation_id,
            agent,
            user_input,
            exclude_message_id,
            vision_attachments=None,
        )
        response = await asyncio.to_thread(
            agent_client.chat.completions.create,
            model=model_name_for_agent(agent, owner_user_id=owner_user_id),
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
            saved_memory = await upsert_memory_with_resolution(
                conversation_id=conversation_id,
                category=category,
                content=content,
                confidence=max(0.0, min(confidence, 1.0)),
                source_message_id=source_message_id,
            )
            if saved_memory:
                created_count += 1
            print(
                "[Memory] extract.saved",
                {
                    "conversationId": conversation_id,
                    "sourceMessageId": source_message_id,
                    "category": category,
                    "confidence": max(0.0, min(confidence, 1.0)),
                    "content": content,
                    "memoryId": saved_memory.get("id") if saved_memory else None,
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


COLOR_WORDS = (
    "红色", "橙色", "黄色", "绿色", "青色", "蓝色", "紫色", "粉色", "黑色", "白色", "灰色",
    "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink", "black", "white", "gray", "grey",
)
COLOR_CANONICALS = {
    "红色": "红色",
    "red": "红色",
    "橙色": "橙色",
    "orange": "橙色",
    "黄色": "黄色",
    "yellow": "黄色",
    "绿色": "绿色",
    "green": "绿色",
    "青色": "青色",
    "cyan": "青色",
    "蓝色": "蓝色",
    "blue": "蓝色",
    "紫色": "紫色",
    "purple": "紫色",
    "粉色": "粉色",
    "pink": "粉色",
    "黑色": "黑色",
    "black": "黑色",
    "白色": "白色",
    "white": "白色",
    "灰色": "灰色",
    "gray": "灰色",
    "grey": "灰色",
}


def _mentioned_memory_colors(content: Any) -> Set[str]:
    text = str(content or "").lower()
    return {
        canonical
        for color, canonical in COLOR_CANONICALS.items()
        if color in text
    }


def _memory_semantic_slot(memory: Dict[str, Any]) -> str:
    category = str(memory.get("category") or "").strip()
    content = str(memory.get("content") or "")
    lowered = content.lower()
    if category == "preference" and _mentioned_memory_colors(content):
        return "preference:color"
    if category == "constraint" and ("端口" in content or "port" in lowered) and re.search(r"\d{2,5}", content):
        return "constraint:port"
    return ""


def _memory_source_created_at(conversation_id: str, source_message_id: Optional[str]) -> str:
    if not source_message_id:
        return ""
    message = get_message_in_conversation(conversation_id, source_message_id)
    return str((message or {}).get("createdAt") or "")


def _candidate_is_older_than_memory(
    conversation_id: str,
    source_message_id: Optional[str],
    memory: Dict[str, Any],
) -> bool:
    candidate_created_at = _memory_source_created_at(conversation_id, source_message_id)
    existing_created_at = _memory_source_created_at(conversation_id, memory.get("sourceMessageId"))
    return bool(candidate_created_at and existing_created_at and candidate_created_at < existing_created_at)


def _fallback_memory_relationship(candidate: Dict[str, Any], existing_memories: List[Dict[str, Any]]) -> Dict[str, Any]:
    candidate_content = str(candidate.get("content") or "").lower()
    candidate_slot = _memory_semantic_slot(candidate)
    candidate_colors = _mentioned_memory_colors(candidate.get("content"))
    for memory in existing_memories:
        memory_content = str(memory.get("content") or "").lower()
        if memory_content == candidate_content:
            return {
                "relationship": "duplicate",
                "duplicateMemoryId": memory.get("id") or "",
                "conflictingMemoryIds": [],
                "reason": "内容完全重复",
            }
    if candidate_slot:
        duplicate_id = ""
        conflicts: List[str] = []
        for memory in existing_memories:
            if _memory_semantic_slot(memory) != candidate_slot:
                continue
            memory_colors = _mentioned_memory_colors(memory.get("content"))
            if candidate_colors and memory_colors and candidate_colors == memory_colors:
                duplicate_id = str(memory.get("id") or "")
                break
            if memory.get("id"):
                conflicts.append(str(memory["id"]))
        if duplicate_id:
            return {
                "relationship": "duplicate",
                "duplicateMemoryId": duplicate_id,
                "conflictingMemoryIds": [],
                "reason": "同一记忆槽位重复表达",
            }
        if conflicts:
            return {
                "relationship": "conflict",
                "duplicateMemoryId": "",
                "conflictingMemoryIds": conflicts,
                "reason": f"{candidate_slot} 以最新表达为准",
            }
    return {
        "relationship": "independent",
        "duplicateMemoryId": "",
        "conflictingMemoryIds": [],
        "reason": "未发现明确重复或冲突",
    }


async def resolve_memory_relationship(
    candidate: Dict[str, Any],
    existing_memories: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if not existing_memories:
        return {
            "relationship": "independent",
            "duplicateMemoryId": "",
            "conflictingMemoryIds": [],
            "reason": "无现有同类记忆",
        }
    deterministic = _fallback_memory_relationship(candidate, existing_memories)
    if deterministic.get("relationship") in {"duplicate", "conflict"}:
        return deterministic
    prompt = json.dumps(
        {
            "candidate": {
                "category": candidate.get("category"),
                "content": candidate.get("content"),
                "confidence": candidate.get("confidence"),
            },
            "existingMemories": [
                {
                    "id": memory.get("id"),
                    "category": memory.get("category"),
                    "content": memory.get("content"),
                    "confidence": memory.get("confidence"),
                }
                for memory in existing_memories[:50]
            ],
        },
        ensure_ascii=False,
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": MEMORY_RESOLUTION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            stream=False,
        )
        payload = parse_json_object(response.choices[0].message.content or "")
        relationship = str(payload.get("relationship") or "independent").strip()
        if relationship not in {"duplicate", "conflict", "independent"}:
            relationship = "independent"
        return {
            "relationship": relationship,
            "duplicateMemoryId": str(payload.get("duplicateMemoryId") or ""),
            "conflictingMemoryIds": [
                str(item)
                for item in payload.get("conflictingMemoryIds") or []
                if str(item or "").strip()
            ],
            "reason": str(payload.get("reason") or ""),
        }
    except Exception as exc:
        print(f"❌ [Memory Resolution Error]: {format_model_error(exc)}")
        return _fallback_memory_relationship(candidate, existing_memories)


async def upsert_memory_with_resolution(
    conversation_id: str,
    category: str,
    content: str,
    confidence: float,
    source_message_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    existing_memories = [
        memory for memory in list_active_memories(conversation_id, limit=100)
        if memory.get("category") == category
    ]
    candidate = {
        "category": category,
        "content": content,
        "confidence": confidence,
    }
    relationship = await resolve_memory_relationship(candidate, existing_memories)
    relation_type = relationship["relationship"]
    reason = relationship.get("reason") or relation_type
    if relation_type == "duplicate" and relationship.get("duplicateMemoryId"):
        duplicate_memory = next(
            (
                memory for memory in existing_memories
                if memory.get("id") == relationship["duplicateMemoryId"]
            ),
            None,
        )
        if duplicate_memory and _candidate_is_older_than_memory(conversation_id, source_message_id, duplicate_memory):
            print(
                "[Memory] upsert.skip_older_duplicate",
                {
                    "conversationId": conversation_id,
                    "sourceMessageId": source_message_id,
                    "duplicateMemoryId": duplicate_memory.get("id"),
                },
            )
            return duplicate_memory
        return refresh_memory(
            conversation_id=conversation_id,
            memory_id=relationship["duplicateMemoryId"],
            confidence=confidence,
            source_message_id=source_message_id,
            resolution_reason=f"duplicate: {reason}",
        )
    conflict_ids = [
        memory_id for memory_id in relationship.get("conflictingMemoryIds", [])
        if str(memory_id or "").strip()
    ]
    if relation_type == "conflict":
        conflicting_memories = [
            memory for memory in existing_memories
            if memory.get("id") in conflict_ids
        ]
        newer_conflicts = [
            memory for memory in conflicting_memories
            if _candidate_is_older_than_memory(conversation_id, source_message_id, memory)
        ]
        if newer_conflicts:
            print(
                "[Memory] upsert.skip_older_conflict",
                {
                    "conversationId": conversation_id,
                    "sourceMessageId": source_message_id,
                    "newerMemoryIds": [memory.get("id") for memory in newer_conflicts],
                    "reason": reason,
                },
            )
            return newer_conflicts[0]
        conflict_ids = [
            memory.get("id") for memory in conflicting_memories
            if memory.get("id") and not _candidate_is_older_than_memory(conversation_id, source_message_id, memory)
        ]
    created = create_memory(
        conversation_id=conversation_id,
        category=category,
        content=content,
        confidence=confidence,
        source_message_id=source_message_id,
    )
    if created and relation_type == "conflict":
        supersede_memories(
            conversation_id=conversation_id,
            memory_ids=[memory_id for memory_id in conflict_ids if memory_id != created["id"]],
            superseded_by_memory_id=created["id"],
            resolution_reason=f"conflict: {reason}",
        )
    if created:
        await consolidate_active_memories(conversation_id, category, preferred_memory_id=created["id"])
    return created


async def consolidate_active_memories(
    conversation_id: str,
    category: Optional[str] = None,
    preferred_memory_id: Optional[str] = None,
) -> None:
    memories = list_active_memories(conversation_id, limit=100)
    if category:
        memories = [memory for memory in memories if memory.get("category") == category]
    if len(memories) < 2:
        return
    latest = next((memory for memory in memories if memory.get("id") == preferred_memory_id), memories[0])
    for memory in memories:
        if memory.get("id") == latest.get("id"):
            continue
        relationship = await resolve_memory_relationship(latest, [memory])
        relation_type = relationship.get("relationship")
        reason = relationship.get("reason") or relation_type or "consolidate"
        if relation_type == "duplicate":
            supersede_memories(
                conversation_id=conversation_id,
                memory_ids=[memory["id"]],
                superseded_by_memory_id=latest["id"],
                resolution_reason=f"consolidate duplicate: {reason}",
            )
        elif relation_type == "conflict":
            supersede_memories(
                conversation_id=conversation_id,
                memory_ids=[memory["id"]],
                superseded_by_memory_id=latest["id"],
                resolution_reason=f"consolidate conflict: {reason}",
            )


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
    if not agent_messages_allow_tool(conversation, agent_messages, "memory.use"):
        print(
            "[Memory] schedule.skip",
            {
                "conversationId": conversation.get("id"),
                "mode": conversation.get("mode"),
                "reason": "agent_tool_not_authorized",
                "requiredTool": "memory.use",
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


def build_artifact_title(
    conversation_id: str,
    artifact_payload: Dict[str, str],
    workspace_id: Optional[str] = None,
) -> str:
    extension = artifact_extension(artifact_payload)
    base_name = infer_artifact_base_name(artifact_payload["type"], artifact_payload["content"])
    artifacts = list_artifacts_for_workspace(workspace_id) if workspace_id else list_artifacts(conversation_id)
    existing_titles = {artifact["title"] for artifact in artifacts}
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
    conversation = get_conversation(conversation_id)
    sender_id = str(message.get("senderId") or "").strip()
    sender_agent = get_effective_agent_for_conversation(conversation, sender_id) if conversation and sender_id else None
    if not agent_has_tool(sender_agent, "artifact.generate"):
        print(
            "[Artifact] persist.skip",
            {
                "conversationId": conversation_id,
                "senderId": sender_id,
                "reason": "agent_tool_not_authorized",
                "requiredTool": "artifact.generate",
            },
        )
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
            source_conversation_id=conversation_id,
            source_workspace_id=(conversation or {}).get("workspaceId"),
        )
        if not artifact:
            return None
        action = "updated"
        artifact_message_content = f"更新产物 {artifact['title']} 到 v{artifact['latestVersion']}"
    else:
        artifact_title = build_artifact_title(
            conversation_id,
            artifact_payload,
            workspace_id=(conversation or {}).get("workspaceId"),
        )
        artifact = create_artifact(
            conversation_id=conversation_id,
            message_id=message["id"],
            title=artifact_title,
            artifact_type=artifact_payload["type"],
            content=artifact_payload["content"],
            description=f"由 {message['senderName']} 生成",
            created_by=message["senderId"],
            created_by_type="orchestrator" if message["role"] == "orchestrator" else "agent",
            workspace_id=(conversation or {}).get("workspaceId"),
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
    return now_text()


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


READONLY_COLLABORATION_SOURCE = "groupChatCollaboration"
READONLY_CONTEXT_MAX_CHARS = 18000
READONLY_FILE_MAX_CHARS = 6000
READONLY_ARTIFACT_MAX_CHARS = 6000
CollaborationEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]


def _unique_ordered(values: List[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in values:
        clean_value = str(value or "").strip()
        if not clean_value or clean_value in seen:
            continue
        seen.add(clean_value)
        result.append(clean_value)
    return result


def should_run_group_chat_collaboration(
    conversation: Dict[str, Any],
    target_agent: Optional[Dict[str, Any]],
    execution_decision: Dict[str, Any],
) -> bool:
    return (
        conversation.get("mode") == "group"
        and not target_agent
        and execution_decision.get("executionMode") == "chat"
    )


def _agent_name_mentioned(content: str, agent: Dict[str, Any]) -> bool:
    name = str(agent.get("name") or "").strip()
    if not name:
        return False
    lowered = (content or "").lower()
    return name.lower() in lowered or f"@{name}" in content or f"＠{name}" in content


def _ensure_explicitly_named_agents_in_plan(
    conversation: Dict[str, Any],
    content: str,
    task_plan: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    existing_ids = {str(step.get("agentId") or "") for step in task_plan if isinstance(step, dict)}
    enriched_plan = list(task_plan)
    for agent in callable_group_member_agents(conversation):
        if str(agent.get("id")) in existing_ids or not _agent_name_mentioned(content, agent):
            continue
        enriched_plan.append({
            "agentId": agent["id"],
            "agentName": agent.get("name") or "Agent",
            "task": f"请基于用户需求给出你的分析和建议：{content}",
        })
        existing_ids.add(str(agent.get("id")))
    return enriched_plan[:4]


def _workspace_file_content(path: str, workspace_files: List[Dict[str, Any]]) -> Optional[str]:
    file_meta = next((item for item in workspace_files if item.get("path") == path), None)
    if not file_meta:
        return None
    version = get_sandbox_file_version(file_meta["id"])
    if not version:
        return str(file_meta.get("contentPreview") or "").strip() or None
    return str(version.get("content") or "")


def _build_readonly_context(
    conversation: Dict[str, Any],
    workspace_action_context: Optional[Dict[str, Any]],
    artifact_ref: Optional[Dict[str, Any]],
    allow_workspace_context: bool = False,
) -> str:
    sections = [
        "[只读协作约束]",
        "- 本轮是群聊 chat 协作，不是 sandbox run。",
        "- 只能分析、解释、review、给建议；不要声明已经修改文件。",
        "- 不要输出需要后端自动应用的 patch；如需修改，请建议用户后续发起执行任务。",
    ]
    workspace_id = str(conversation.get("workspaceId") or "").strip()
    if workspace_id and allow_workspace_context:
        workspace_context = read_workspace_agents_context(workspace_id)
        if workspace_context:
            sections.append("[Workspace Agents Context]\n" + workspace_context[:4000])
        try:
            from app.services.workspace_index_service import workspace_index_brief

            index_brief = workspace_index_brief(workspace_id)
            if index_brief:
                sections.append("[Workspace Index Brief]\n" + index_brief[:6000])
        except Exception:
            pass
    if workspace_action_context:
        safe_action_context = {
            key: value
            for key, value in workspace_action_context.items()
            if key not in {"rawModelOutput"}
        }
        sections.append("[Workspace Action Context]\n" + json.dumps(safe_action_context, ensure_ascii=False))
        target_paths = [
            str(item.get("path") or "")
            for item in workspace_action_context.get("targetFiles") or []
            if isinstance(item, dict) and item.get("path")
        ]
        related_paths = [
            str(path or "")
            for path in workspace_action_context.get("allowedRelatedFiles") or []
            if str(path or "").strip()
        ]
        if workspace_id and (target_paths or related_paths):
            workspace_files = list_sandbox_files_for_workspace(workspace_id)
            file_sections = []
            for path in _unique_ordered([*target_paths, *related_paths])[:8]:
                content = _workspace_file_content(path, workspace_files)
                if content is None:
                    continue
                clipped = content[:READONLY_FILE_MAX_CHARS]
                if len(content) > READONLY_FILE_MAX_CHARS:
                    clipped += "\n...（内容已截断）"
                file_sections.append(f"--- {path} ---\n{clipped}")
            if file_sections:
                sections.append("[只读文件内容]\n" + "\n\n".join(file_sections))
        artifact_ids = [
            str(item or "").strip()
            for item in workspace_action_context.get("targetArtifacts") or []
            if str(item or "").strip()
        ]
        artifact_sections = []
        for artifact_id in artifact_ids[:6]:
            artifact = get_artifact(artifact_id)
            if not artifact:
                continue
            content = str(artifact.get("content") or "")
            clipped = content[:READONLY_ARTIFACT_MAX_CHARS]
            if len(content) > READONLY_ARTIFACT_MAX_CHARS:
                clipped += "\n...（内容已截断）"
            artifact_sections.append(
                f"--- {artifact.get('title') or artifact_id} ({artifact_id}) ---\n{clipped}"
            )
        if artifact_sections:
            sections.append("[只读 Artifact 内容]\n" + "\n\n".join(artifact_sections))
    if artifact_ref:
        sections.append("[用户显式引用产物]\n" + json.dumps(artifact_ref, ensure_ascii=False))
    context = "\n\n".join(sections)
    return context[:READONLY_CONTEXT_MAX_CHARS]


def _build_collaboration_agent_input(
    user_input: str,
    step: Dict[str, Any],
    readonly_context: str,
    prior_outputs: List[Dict[str, str]],
) -> str:
    sections = [
        readonly_context,
        "[用户原始需求]\n" + user_input,
        "[你负责的子任务]\n" + str(step.get("task") or user_input),
    ]
    if prior_outputs:
        sections.append(
            "[前序 Agent 回复]\n"
            + "\n\n".join(
                f"{item['agentName']}：\n{item['content'][:3000]}"
                for item in prior_outputs
            )
        )
    sections.append(
        "请只输出你的分析和建议。不要修改文件，不要说你已经执行了命令，"
        "不要生成可自动应用的 diff。"
    )
    return "\n\n".join(section for section in sections if section)


async def execute_readonly_agent_chat(
    agent: Dict[str, Any],
    conversation: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
) -> str:
    readonly_agent = _readonly_agent_config(agent)
    return await call_agent_once(
        conversation["id"],
        readonly_agent,
        user_input,
        exclude_message_id=exclude_message_id,
    )


def _readonly_agent_config(agent: Dict[str, Any]) -> Dict[str, Any]:
    readonly_system_prompt = (
        system_prompt_for_agent(agent)
        + "\n\n[只读协作模式]\n"
        "你只能基于上下文分析、review 和给建议。不要修改文件，不要声称已经执行命令，"
        "不要输出可自动应用的 diff。"
    )
    # Force all runtimes through the native model chat path for read-only
    # collaboration. Platform CLI runtimes may edit files when used normally.
    return {**agent, "runtime": "native", "systemPrompt": readonly_system_prompt}


async def stream_readonly_agent_chat(
    agent: Dict[str, Any],
    conversation: Dict[str, Any],
    user_input: str,
    exclude_message_id: Optional[str] = None,
):
    readonly_agent = _readonly_agent_config(agent)
    async for chunk in stream_agent_reply(
        conversation["id"],
        readonly_agent,
        user_input,
        exclude_message_id=exclude_message_id,
    ):
        yield chunk


async def _emit_collaboration_event(
    emit: Optional[CollaborationEmitter],
    event_type: str,
    payload: Dict[str, Any],
) -> None:
    if emit:
        await emit(event_type, payload)


async def _emit_collaboration_completed(
    emit: Optional[CollaborationEmitter],
    conversation_id: str,
    message: Dict[str, Any],
    finish_reason: str = "stop",
) -> None:
    await _emit_collaboration_event(
        emit,
        "conversation.message.completed",
        {
            "conversationId": conversation_id,
            "messageId": message["id"],
            "finishReason": finish_reason,
            "fullMessage": message,
        },
    )


async def _emit_collaboration_status(
    emit: Optional[CollaborationEmitter],
    conversation_id: str,
    agent: Dict[str, Any],
    status: str,
) -> None:
    await _emit_collaboration_event(
        emit,
        "agent.status.changed",
        {
            "conversationId": conversation_id,
            "agentId": agent["id"],
            "newStatus": status,
            "timestamp": ws_now(),
        },
    )


async def _execute_collaboration_agent_step(
    conversation: Dict[str, Any],
    user_message: Dict[str, Any],
    agent: Dict[str, Any],
    agent_input: str,
    role: str,
    metadata: Dict[str, Any],
    emit: Optional[CollaborationEmitter],
) -> Tuple[str, str, str]:
    conversation_id = conversation["id"]
    message_id = create_id("msg")
    if emit:
        await _emit_collaboration_status(emit, conversation_id, agent, "thinking")
        await _emit_collaboration_event(
            emit,
            "agent.thinking.started",
            {
                "conversationId": conversation_id,
                "agentId": agent["id"],
                "agentName": agent.get("name") or "Agent",
                "messageId": message_id,
                "taskPlanStep": metadata.get("taskPlanStep"),
                "source": READONLY_COLLABORATION_SOURCE,
                "readOnly": True,
            },
        )
    finish_reason = "stop"
    if emit:
        reply_parts: List[str] = []
        sequence = 0
        try:
            async for chunk in stream_readonly_agent_chat(
                agent,
                conversation,
                agent_input,
                exclude_message_id=user_message["id"],
            ):
                sequence += 1
                reply_parts.append(chunk)
                await _emit_collaboration_event(
                    emit,
                    "conversation.message.chunk",
                    {
                        "messageId": message_id,
                        "conversationId": conversation_id,
                        "senderId": agent["id"],
                        "senderName": agent.get("name") or "Agent",
                        "role": role,
                        "messageType": "text",
                        "chunk": chunk,
                        "sequence": sequence,
                        "isFullContent": False,
                        "source": READONLY_COLLABORATION_SOURCE,
                        "readOnly": True,
                        "taskPlanStep": metadata.get("taskPlanStep"),
                        "metadata": metadata,
                    },
                )
            reply_content = "".join(reply_parts).strip()
        except Exception as exc:
            reply_content = fallback_reply(agent, agent_input, exc)
            finish_reason = "error"
            await _emit_collaboration_event(
                emit,
                "conversation.message.chunk",
                {
                    "messageId": message_id,
                    "conversationId": conversation_id,
                    "senderId": agent["id"],
                    "senderName": agent.get("name") or "Agent",
                    "role": role,
                    "messageType": "text",
                    "chunk": reply_content,
                    "sequence": sequence + 1,
                    "isFullContent": True,
                    "source": READONLY_COLLABORATION_SOURCE,
                    "readOnly": True,
                    "taskPlanStep": metadata.get("taskPlanStep"),
                    "metadata": metadata,
                },
            )
        return message_id, reply_content, finish_reason
    try:
        reply_content = await execute_readonly_agent_chat(
            agent,
            conversation,
            agent_input,
            exclude_message_id=user_message["id"],
        )
    except Exception as exc:
        reply_content = fallback_reply(agent, agent_input, exc)
        finish_reason = "error"
    return message_id, reply_content, finish_reason


def _build_collaboration_summary_input(
    user_input: str,
    task_plan: List[Dict[str, Any]],
    readonly_context: str,
    prior_outputs: List[Dict[str, str]],
) -> str:
    sections = [
        readonly_context,
        "[用户原始需求]\n" + user_input,
        "[任务计划]\n" + json.dumps(task_plan, ensure_ascii=False),
        "[各 Agent 产出]\n"
        + "\n\n".join(
            f"{item['agentName']}：\n{item['content'][:4000]}"
            for item in prior_outputs
        ),
        "请作为 Orchestrator 做简短总结：概括每个 Agent 的核心意见、共识/分歧和下一步建议。"
        "不要声称已经修改文件或执行命令。",
    ]
    return "\n\n".join(section for section in sections if section)


def _fallback_collaboration_summary(prior_outputs: List[Dict[str, str]]) -> str:
    if not prior_outputs:
        return "群聊协作已完成，但没有可汇总的 Agent 产出。"
    lines = ["群聊协作已完成，核心结果如下："]
    for item in prior_outputs:
        content = re.sub(r"\s+", " ", item["content"]).strip()
        if len(content) > 220:
            content = content[:220] + "..."
        lines.append(f"- {item['agentName']}：{content}")
    return "\n".join(lines)


async def run_group_chat_collaboration(
    conversation: Dict[str, Any],
    user_message: Dict[str, Any],
    user_input: str,
    model_user_input: str,
    artifact_ref: Optional[Dict[str, Any]],
    web_search_metadata: Optional[Dict[str, Any]],
    web_search_model_user_input: str,
    execution_decision: Dict[str, Any],
    emit: Optional[CollaborationEmitter] = None,
) -> Optional[Dict[str, Any]]:
    try:
        from app.services.planning_service import plan_group_chat_collaboration

        intent_result = await plan_group_chat_collaboration(conversation, user_input)
    except Exception as exc:
        print(f"⚠️ [Group Chat Planner Fallback]: {format_model_error(exc)}")
        intent_result = analyze_orchestrator_intent(user_input)
    if intent_result.get("intent") != "task":
        return None

    task_plan = normalize_group_task_plan_for_conversation(
        conversation,
        intent_result.get("taskPlan") or [],
        user_input,
    )
    task_plan = _ensure_explicitly_named_agents_in_plan(conversation, user_input, task_plan)
    if not task_plan:
        return None

    workspace_action_context: Optional[Dict[str, Any]] = None
    workspace_id = str(conversation.get("workspaceId") or "").strip()
    if workspace_id:
        try:
            from app.services.workspace_index_service import resolve_workspace_action

            workspace_action_context = await resolve_workspace_action(
                conversation_id=conversation["id"],
                workspace_id=workspace_id,
                user_content=user_input,
                explicit_artifact_ref=artifact_ref,
            )
        except Exception as exc:
            workspace_action_context = {
                "action": "answer_only",
                "confidence": 0,
                "targetFiles": [],
                "allowedRelatedFiles": [],
                "targetArtifacts": [],
                "candidateTargets": [],
                "reason": f"只读目标解析失败，按聊天上下文继续: {format_model_error(exc)}",
            }

    agent_messages: List[Dict[str, Any]] = []
    artifacts: List[Dict[str, Any]] = []
    plan_content = format_task_plan_content(task_plan)
    plan_metadata = {
        "source": READONLY_COLLABORATION_SOURCE,
        "readOnly": True,
        "taskPlan": task_plan,
        "workspaceActionContext": workspace_action_context,
        "executionMode": execution_decision.get("executionMode"),
        "intent": execution_decision.get("intent"),
        "reason": execution_decision.get("reason"),
    }
    orchestrator_message = create_message(
        conversation_id=conversation["id"],
        sender_id=ORCHESTRATOR_AGENT_ID,
        sender_name="Orchestrator",
        role="orchestrator",
        msg_type="task-plan",
        content=plan_content,
        metadata=plan_metadata,
    )
    agent_messages.append(orchestrator_message)
    update_conversation_activity(conversation["id"], plan_content)
    await _emit_collaboration_completed(emit, conversation["id"], orchestrator_message)

    if workspace_action_context and workspace_action_context.get("action") == "clarify":
        clarification = (
            workspace_action_context.get("clarificationQuestion")
            or "请补充要分析的具体文件、页面或产物。"
        )
        clarify_message = create_message(
            conversation_id=conversation["id"],
            sender_id=ORCHESTRATOR_AGENT_ID,
            sender_name="Orchestrator",
            role="orchestrator",
            msg_type="status",
            content=clarification,
            metadata={
                "source": READONLY_COLLABORATION_SOURCE,
                "readOnly": True,
                "workspaceActionContext": workspace_action_context,
                "executionMode": "clarify",
            },
        )
        agent_messages.append(clarify_message)
        update_conversation_activity(conversation["id"], clarification)
        await _emit_collaboration_completed(emit, conversation["id"], clarify_message)
        return {
            "handled": True,
            "agentMessages": agent_messages,
            "artifacts": artifacts,
            "workspaceActionContext": workspace_action_context,
            "taskPlan": task_plan,
            "summary": clarification,
        }

    callable_task_agents = [
        agent
        for agent in [
        get_effective_agent_for_conversation(conversation, str(step.get("agentId") or ""))
        for step in task_plan
        ]
        if agent_is_callable(agent)
    ]
    allow_workspace_context = bool(callable_task_agents) and all(
        agent_has_tool(agent, "workspace.read")
        for agent in callable_task_agents
    )
    readonly_context = _build_readonly_context(
        conversation,
        workspace_action_context,
        artifact_ref,
        allow_workspace_context=allow_workspace_context,
    )
    prior_outputs: List[Dict[str, str]] = []
    for step in task_plan:
        agent = get_effective_agent_for_conversation(conversation, str(step.get("agentId") or ""))
        if not agent_is_callable(agent):
            continue
        agent_input = _build_collaboration_agent_input(
            web_search_model_user_input or model_user_input,
            step,
            readonly_context,
            prior_outputs,
        )
        metadata = {
            "source": READONLY_COLLABORATION_SOURCE,
            "readOnly": True,
            "taskPlan": task_plan,
            "taskPlanStep": step,
            "workspaceActionContext": workspace_action_context,
            "finishReason": "running",
        }
        if web_search_metadata:
            metadata["webSearch"] = web_search_metadata
        message_id, reply_content, finish_reason = await _execute_collaboration_agent_step(
            conversation=conversation,
            user_message=user_message,
            agent=agent,
            agent_input=agent_input,
            role="agent",
            metadata=metadata,
            emit=emit,
        )
        metadata["finishReason"] = finish_reason
        agent_message = create_message(
            conversation_id=conversation["id"],
            sender_id=agent["id"],
            sender_name=agent.get("name") or "Agent",
            role="agent",
            msg_type="text",
            content=reply_content,
            message_id=message_id,
            metadata=metadata,
        )
        agent_messages.append(agent_message)
        prior_outputs.append({"agentName": agent.get("name") or "Agent", "content": reply_content})
        update_conversation_activity(conversation["id"], reply_content)
        await _emit_collaboration_completed(emit, conversation["id"], agent_message, finish_reason)
        artifact_result = persist_artifact_from_message(conversation["id"], agent_message, artifact_ref)
        if artifact_result:
            artifact_payload = {**artifact_result["artifact"], "action": artifact_result["action"]}
            artifacts.append(artifact_payload)
            artifact_message = artifact_result["message"]
            agent_messages.append(artifact_message)
            update_conversation_activity(conversation["id"], artifact_message["content"])
            await _emit_collaboration_event(
                emit,
                "artifact.created",
                {
                    "conversationId": conversation["id"],
                    "artifact": artifact_result["artifact"],
                    "action": artifact_result["action"],
                },
            )
            await _emit_collaboration_completed(emit, conversation["id"], artifact_message)
        if emit:
            await _emit_collaboration_status(emit, conversation["id"], agent, "online")

    summary_content = _fallback_collaboration_summary(prior_outputs)
    if prior_outputs:
        orchestrator_agent = get_enabled_orchestrator(conversation) or get_agent(ORCHESTRATOR_AGENT_ID)
        if orchestrator_agent:
            summary_metadata = {
                "source": READONLY_COLLABORATION_SOURCE,
                "readOnly": True,
                "taskPlan": task_plan,
                "workspaceActionContext": workspace_action_context,
                "summary": True,
            }
            summary_input = _build_collaboration_summary_input(
                user_input,
                task_plan,
                readonly_context,
                prior_outputs,
            )
            try:
                message_id, summary_content, summary_finish_reason = await _execute_collaboration_agent_step(
                    conversation=conversation,
                    user_message=user_message,
                    agent=orchestrator_agent,
                    agent_input=summary_input,
                    role="orchestrator",
                    metadata=summary_metadata,
                    emit=emit,
                )
            except Exception as exc:
                message_id = create_id("msg")
                summary_finish_reason = "error"
                summary_content = _fallback_collaboration_summary(prior_outputs)
                print(f"⚠️ [Group Chat Summary Fallback]: {format_model_error(exc)}")
            summary_metadata["finishReason"] = summary_finish_reason
            summary_message = create_message(
                conversation_id=conversation["id"],
                sender_id=ORCHESTRATOR_AGENT_ID,
                sender_name="Orchestrator",
                role="orchestrator",
                msg_type="text",
                content=summary_content,
                message_id=message_id,
                metadata=summary_metadata,
            )
            agent_messages.append(summary_message)
            update_conversation_activity(conversation["id"], summary_content)
            await _emit_collaboration_completed(
                emit,
                conversation["id"],
                summary_message,
                summary_finish_reason,
            )
            if emit:
                await _emit_collaboration_status(
                    emit,
                    conversation["id"],
                    orchestrator_agent,
                    "online",
                )

    return {
        "handled": True,
        "agentMessages": agent_messages,
        "artifacts": artifacts,
        "workspaceActionContext": workspace_action_context,
        "taskPlan": task_plan,
        "summary": summary_content,
    }


async def handle_ws_message_create(websocket: WebSocket, event: Dict[str, Any], current_user: Optional[Dict[str, Any]] = None) -> None:
    print("WS MESSAGE EVENT:", event)
    print("WS MESSAGE DATA:", event.get("data"))
    event_id = event.get("eventId")
    data = event.get("data") or {}
    conversation_id = str(data.get("conversationId", "")).strip()
    original_content = str(data.get("content", "")).strip()
    content = original_content
    target_agent_id = str(data.get("targetAgentId") or data.get("targetAgentID") or "").strip() or None
    quoted_message_id = get_quoted_message_id(data)

    if not conversation_id:
        await send_ws_error(websocket, event_id, 40000, "conversationId 不能为空")
        return
    if is_system_message_payload(data):
        await send_ws_error(websocket, event_id, 40002, "客户端不允许创建 system/status 消息")
        return

    current_user = current_user or get_default_user()
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        await send_ws_error(websocket, event_id, 40001, "会话不存在")
        return
    ws_manager.subscribe(websocket, current_user["id"], conversation_id)
    resolved_attachments = resolve_message_attachments(data, conversation_id)
    attachments = resolved_attachments["public"]
    internal_attachments = resolved_attachments["internal"]
    attachment_summary = attachment_summary_content(attachments) if attachments else ""
    model_content = content or attachment_summary
    if not content and not attachments:
        await send_ws_error(websocket, event_id, 40000, "消息内容不能为空")
        return
    quoted_message = None
    message_metadata: Dict[str, Any] = {}
    if quoted_message_id:
        quoted_message = get_message_in_conversation(conversation_id, quoted_message_id)
        if not quoted_message:
            await send_ws_error(websocket, event_id, 40003, "引用消息不存在或不属于当前会话")
            return
        message_metadata = build_quote_metadata(quoted_message)
    artifact_ref, artifact_ref_error = await resolve_artifact_context_for_message(
        data,
        conversation_id,
        current_user["id"],
        model_content,
    )
    if artifact_ref_error:
        await send_ws_error(websocket, event_id, 40003, artifact_ref_error)
        return
    if artifact_ref:
        message_metadata["artifactRef"] = artifact_ref
    attachment_context = build_attachment_context(attachments) if attachments else {"items": [], "context": ""}
    if attachments:
        message_metadata["attachments"] = attachments
        message_metadata["attachmentContext"] = attachment_context
    model_user_input = build_user_input_with_references(model_content, quoted_message, artifact_ref)
    if original_content and attachments and attachment_read_only_intent(original_content):
        full_context = build_attachment_full_context(internal_attachments)
        if full_context:
            model_user_input = f"{model_user_input}\n\n[本轮临时加载的附件正文]\n{full_context}".strip()
    model_user_input = append_attachment_context_to_input(model_user_input, attachment_context)
    execution_payload = payload_with_resolved_artifact_ref(data, artifact_ref)
    if attachments:
        execution_payload = {
            **execution_payload,
            "attachments": internal_attachments,
            "attachmentPlaceholders": attachments,
            "attachmentContext": attachment_context,
        }
    pending_clarification = latest_pending_workspace_clarification(conversation_id) if artifact_ref else None
    if pending_clarification and looks_like_target_clarification(content, artifact_ref):
        execution_payload = {**execution_payload, "pendingWorkspaceClarification": True}
    execution_user_input = build_execution_input_for_workspace_action(
        model_content,
        model_user_input,
        pending_clarification,
        artifact_ref,
    )
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
    update_conversation_activity(conversation_id, content or attachment_summary)
    chat_context: Dict[str, Any] = {"excludeMessageId": user_message["id"]}
    if has_vision_attachments(internal_attachments):
        chat_context["visionAttachments"] = internal_attachments
    await emit_conversation_event(
        current_user,
        conversation_id,
        "conversation.message.user_created",
        event_id,
        {"conversationId": conversation_id, "message": user_message},
    )

    total_artifacts = 0
    completed_messages: List[Dict[str, Any]] = []
    raw_execution_mode = str(data.get("executionMode") or data.get("runMode") or "").strip().lower()
    if attachments and not original_content and raw_execution_mode not in {"deployment", "deploy"}:
        execution_decision = {
            "executionMode": "chat",
            "intent": "attachment_only",
            "confidence": 1.0,
            "reason": "用户只上传了附件，默认基于附件摘要走普通聊天",
        }
    else:
        execution_decision = None
    if execution_decision is None:
        classification_content = append_attachment_context_to_input(content, attachment_context)
        try:
            execution_decision = await classify_for_conversation(
                conversation=conversation,
                selected_agent=target_agent,
                content=classification_content,
                payload=execution_payload,
            )
        except Exception as exc:
            error_content = f"意图识别失败：{format_model_error(exc)}"
            error_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=error_content,
                metadata={"event": "execution.mode.failed"},
            )
            completed_messages.append(error_message)
            await send_message_completed(current_user, conversation_id, event_id, error_message)
            await emit_conversation_event(
                current_user,
                conversation_id,
                "conversation.all_tasks.completed",
                event_id,
                {
                    "conversationId": conversation_id,
                    "summary": "意图识别失败",
                    "totalMessages": 2,
                    "totalArtifacts": 0,
                    "contextUsage": build_context_usage(conversation),
                },
            )
            return
    execution_decision = maybe_force_attachment_chat(content, attachments, execution_decision)
    if execution_decision["executionMode"] == "sandbox" and artifact_ref:
        execution_decision = {**execution_decision, "suggestedRunPrompt": execution_user_input}
    await emit_conversation_event(
        current_user,
        conversation_id,
        "execution.mode.decided",
        event_id,
        {
            "conversationId": conversation_id,
            "executionMode": execution_decision["executionMode"],
            "intent": execution_decision["intent"],
            "confidence": execution_decision["confidence"],
            "reason": execution_decision["reason"],
        },
    )
    if execution_decision["executionMode"] == "deployment":
        deploy_agent_id = target_agent.get("id") if target_agent else target_agent_id
        deploy_agent_selection = resolve_deploy_agent_for_conversation(conversation, deploy_agent_id)
        if not deploy_agent_selection.get("ok"):
            status_content = deploy_agent_selection.get("error") or "当前 Agent 未启用 deploy.run，不能发起部署。"
            status_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=status_content,
                metadata={
                    "event": "agent.tool.rejected",
                    "requiredTool": "deploy.run",
                    "executionMode": "deployment",
                    "reason": deploy_agent_selection.get("reason"),
                },
            )
            completed_messages.append(status_message)
            update_conversation_activity(conversation_id, status_content)
            await send_message_completed(current_user, conversation_id, event_id, status_message)
            await emit_conversation_event(
                current_user,
                conversation_id,
                "conversation.all_tasks.completed",
                event_id,
                {
                    "conversationId": conversation_id,
                    "summary": status_content,
                    "totalMessages": 2,
                    "totalArtifacts": 0,
                    "contextUsage": build_context_usage(conversation),
                    "executionMode": "deployment",
                },
            )
            schedule_memory_extraction(conversation, user_message, completed_messages)
            return
        workspace_id = str(conversation.get("workspaceId") or "").strip()
        workspace = get_workspace(workspace_id, owner_user_id=current_user["id"]) if workspace_id else None
        if not workspace:
            status_content = "当前会话没有绑定 Workspace，无法部署。请先在带工作区的 single/group 会话中发起部署。"
            status_message = create_message(
                conversation_id=conversation_id,
                sender_id="system",
                sender_name="系统",
                role="system",
                msg_type="status",
                content=status_content,
                metadata={
                    "source": "chatDeployment",
                    "status": "requires_config",
                    "reason": "missing_workspace",
                },
            )
            completed_messages.append(status_message)
            update_conversation_activity(conversation_id, status_content)
            await send_message_completed(current_user, conversation_id, event_id, status_message)
            await emit_conversation_event(
                current_user,
                conversation_id,
                "conversation.all_tasks.completed",
                event_id,
                {
                    "conversationId": conversation_id,
                    "summary": status_content,
                    "totalMessages": 2,
                    "totalArtifacts": 0,
                    "contextUsage": build_context_usage(conversation),
                    "executionMode": "deployment",
                },
            )
            schedule_memory_extraction(conversation, user_message, completed_messages)
            return

        loop = asyncio.get_running_loop()
        deployment_message_futures: List[asyncio.Future] = []

        def deployment_message_callback(message: Dict[str, Any]) -> None:
            future = asyncio.run_coroutine_threadsafe(
                send_message_completed(current_user, conversation_id, event_id, message),
                loop,
            )
            deployment_message_futures.append(asyncio.wrap_future(future, loop=loop))

        explicit_public_base_url = str(data.get("publicBaseUrl") or "").strip().rstrip("/")
        if not explicit_public_base_url:
            forwarded_proto = websocket.headers.get("x-forwarded-proto")
            forwarded_host = websocket.headers.get("x-forwarded-host")
            host = forwarded_host or websocket.headers.get("host") or websocket.url.hostname or "localhost"
            scheme = forwarded_proto or ("https" if websocket.url.scheme == "wss" else "http")
            explicit_public_base_url = f"{scheme}://{host}".rstrip("/")

        deployment = create_workspace_deployment_request(
            workspace_id=workspace["id"],
            owner_user_id=current_user["id"],
            conversation_id=conversation_id,
            config={
                **(data.get("deploymentConfig") if isinstance(data.get("deploymentConfig"), dict) else {}),
                **deployment_agent_metadata(deploy_agent_selection),
            },
            public_base_url=explicit_public_base_url,
            chat_deployment=True,
            on_message=deployment_message_callback,
        )
        initial_message = deployment.get("initialMessage")
        if initial_message:
            completed_messages.append(initial_message)

        async def run_deployment_background() -> None:
            await asyncio.to_thread(run_workspace_deployment, deployment["id"], deployment_message_callback)
            if deployment_message_futures:
                await asyncio.gather(*deployment_message_futures, return_exceptions=True)
            final_deployment = get_workspace_deployment(deployment["id"], owner_user_id=current_user["id"])
            if final_deployment and final_deployment.get("status") == "queued":
                return
            await emit_conversation_event(
                current_user,
                conversation_id,
                "conversation.all_tasks.completed",
                event_id,
                {
                    "conversationId": conversation_id,
                    "summary": (
                        "部署已完成"
                        if final_deployment and final_deployment.get("status") == "deployed"
                        else "部署流程已结束"
                    ),
                    "totalMessages": len(deployment_message_futures) + (1 if initial_message else 0),
                    "totalArtifacts": 0,
                    "contextUsage": build_context_usage(conversation),
                    "executionMode": "deployment",
                    "deployment": final_deployment,
                },
            )

        asyncio.create_task(run_deployment_background())
        schedule_memory_extraction(conversation, user_message, completed_messages)
        return
    if execution_decision["executionMode"] == "sandbox":
        async def emit_run(event_type: str, payload: Dict[str, Any]) -> None:
            await emit_conversation_event(current_user, conversation_id, event_type, event_id, payload)

        try:
            run_agent = target_agent or choose_agent_for_conversation(conversation)
            run = await runtime_router.create_run(
                run_agent,
                current_user=current_user,
                conversation_id=conversation_id,
                prompt=execution_decision.get("suggestedRunPrompt") or model_user_input,
                payload=execution_payload,
                emit=emit_run,
            )
        except Exception as exc:
            if exc.__class__.__name__ == "WorkspaceActionDecision":
                action_context = getattr(exc, "action_context", {}) or {}
                if action_context.get("action") == "answer_only":
                    agent = target_agent or choose_agent_for_conversation(conversation)
                    try:
                        answer_content = await runtime_router.execute_chat(
                            agent,
                            conversation,
                            model_user_input,
                            chat_context,
                        )
                    except Exception as answer_exc:
                        answer_content = fallback_reply(agent, content, answer_exc)
                    answer_message = create_message(
                        conversation_id=conversation_id,
                        sender_id=agent["id"],
                        sender_name=agent["name"],
                        role="agent",
                        msg_type="text",
                        content=answer_content,
                        metadata={"workspaceActionContext": action_context},
                    )
                    completed_messages.append(answer_message)
                    update_conversation_activity(conversation_id, answer_content)
                    await send_message_completed(current_user, conversation_id, event_id, answer_message)
                    await emit_conversation_event(
                        current_user,
                        conversation_id,
                        "conversation.all_tasks.completed",
                        event_id,
                        {
                            "conversationId": conversation_id,
                            "summary": "只读回答已完成",
                            "totalMessages": 2,
                            "totalArtifacts": 0,
                            "workspaceActionContext": action_context,
                            "contextUsage": build_context_usage(conversation),
                        },
                    )
                    schedule_memory_extraction(conversation, user_message, completed_messages)
                    return
                decision_content = (
                    action_context.get("clarificationQuestion")
                    or "请补充要修改的目标。"
                )
                decision_message = create_message(
                    conversation_id=conversation_id,
                    sender_id="system",
                    sender_name="系统",
                    role="system",
                    msg_type="status",
                    content=decision_content,
                    metadata={
                        "event": "workspace.action.decision",
                        "workspaceActionContext": action_context,
                        "executionMode": "chat" if action_context.get("action") == "answer_only" else "clarify",
                    },
                )
                completed_messages.append(decision_message)
                update_conversation_activity(conversation_id, decision_content)
                await send_message_completed(current_user, conversation_id, event_id, decision_message)
                await emit_conversation_event(
                    current_user,
                    conversation_id,
                    "conversation.all_tasks.completed",
                    event_id,
                    {
                        "conversationId": conversation_id,
                        "summary": decision_content,
                        "totalMessages": 2,
                        "totalArtifacts": 0,
                        "workspaceActionContext": action_context,
                        "contextUsage": build_context_usage(conversation),
                    },
                )
                schedule_memory_extraction(conversation, user_message, completed_messages)
                return
            if isinstance(exc, ValueError):
                error_content = str(exc)
                error_message = create_message(
                    conversation_id=conversation_id,
                    sender_id="system",
                    sender_name="系统",
                    role="system",
                    msg_type="status",
                    content=error_content,
                    metadata={
                        "event": "sandbox.run.rejected",
                        "executionMode": execution_decision["executionMode"],
                        "intent": execution_decision["intent"],
                        "reason": execution_decision["reason"],
                        "error": error_content,
                    },
                )
                completed_messages.append(error_message)
                update_conversation_activity(conversation_id, error_content)
                await send_message_completed(current_user, conversation_id, event_id, error_message)
                await emit_conversation_event(
                    current_user,
                    conversation_id,
                    "conversation.all_tasks.completed",
                    event_id,
                    {
                        "conversationId": conversation_id,
                        "summary": error_content,
                        "totalMessages": 2,
                        "totalArtifacts": 0,
                        "contextUsage": build_context_usage(conversation),
                    },
                )
                return
            await send_ws_error(websocket, event_id, 40000, str(exc))
            return
        status_content = "已识别为产物型任务，沙箱任务已创建。"
        status_message = create_message(
            conversation_id=conversation_id,
            sender_id="system",
            sender_name="系统",
            role="system",
            msg_type="status",
            content=status_content,
            metadata={
                "executionMode": execution_decision["executionMode"],
                "intent": execution_decision["intent"],
                "reason": execution_decision["reason"],
            },
        )
        completed_messages.append(status_message)
        update_conversation_activity(conversation_id, status_content)
        await send_message_completed(current_user, conversation_id, event_id, status_message)
        schedule_memory_extraction(conversation, user_message, completed_messages)
        return

    web_search_model_user_input = model_user_input
    web_search_metadata: Optional[Dict[str, Any]] = None
    web_agent_id = target_agent.get("id") if target_agent else target_agent_id
    if conversation_allows_agent_tool(conversation, "web.search", web_agent_id):
        web_search_model_user_input, web_search_metadata = await prepare_web_search_for_chat(
            content,
            model_user_input,
            payload=data,
            conversation=conversation,
        )

    if should_run_group_chat_collaboration(conversation, target_agent, execution_decision):
        async def emit_collaboration(event_type: str, payload: Dict[str, Any]) -> None:
            await emit_conversation_event(current_user, conversation_id, event_type, event_id, payload)

        collaboration = await run_group_chat_collaboration(
            conversation=conversation,
            user_message=user_message,
            user_input=content,
            model_user_input=model_user_input,
            artifact_ref=artifact_ref,
            web_search_metadata=web_search_metadata,
            web_search_model_user_input=web_search_model_user_input,
            execution_decision=execution_decision,
            emit=emit_collaboration,
        )
        if collaboration and collaboration.get("handled"):
            collaboration_messages = collaboration.get("agentMessages") or []
            completed_messages.extend(collaboration_messages)
            total_artifacts += len(collaboration.get("artifacts") or [])
            await emit_conversation_event(
                current_user,
                conversation_id,
                "conversation.all_tasks.completed",
                event_id,
                {
                    "conversationId": conversation_id,
                    "summary": collaboration.get("summary") or "群聊协作已完成",
                    "totalMessages": 1 + len(collaboration_messages),
                    "totalArtifacts": total_artifacts,
                    "taskPlan": collaboration.get("taskPlan"),
                    "workspaceActionContext": collaboration.get("workspaceActionContext"),
                    "contextUsage": build_context_usage(conversation),
                },
            )
            schedule_memory_extraction(conversation, user_message, completed_messages)
            return

        intent_result = analyze_orchestrator_intent(content)
        if intent_result["intent"] == "chat":
            orchestrator_content = intent_result["reply"]
            if attachments or quoted_message or artifact_ref or (web_search_metadata and web_search_metadata.get("shouldSearch")):
                orchestrator_agent = get_enabled_orchestrator(conversation) or choose_agent_for_conversation(conversation)
                try:
                    orchestrator_content = await runtime_router.execute_chat(
                        orchestrator_agent,
                        conversation,
                        web_search_model_user_input,
                        chat_context,
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
                metadata={"webSearch": web_search_metadata} if web_search_metadata else None,
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
        full_response_text = await runtime_router.execute_chat(
            agent,
            conversation,
            web_search_model_user_input,
            chat_context,
        )
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
                "chunk": full_response_text,
                "sequence": 1,
                "isFullContent": True,
            },
        )
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
        metadata={"webSearch": web_search_metadata} if web_search_metadata else None,
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
