import json
from typing import Any, Dict, Optional

from app.core import orchestrator as legacy_orchestrator
from app.database import (
    ORCHESTRATOR_AGENT_ID,
    get_agent,
    get_conversation_agent_config,
)
from app.runtimes.native import NativeRuntimeAdapter


def _agent_is_callable(agent: Optional[Dict[str, Any]]) -> bool:
    return bool(agent and agent.get("enabled") and agent.get("status") != "disabled")


def _effective_agent_for_conversation(
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


def planner_agent_for_conversation(
    conversation: Dict[str, Any],
    selected_agent: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if conversation.get("mode") == "single":
        if selected_agent and _agent_is_callable(selected_agent):
            return selected_agent
        for agent_id in conversation.get("agentIds") or []:
            agent = _effective_agent_for_conversation(conversation, agent_id)
            if _agent_is_callable(agent):
                return agent
        return None
    if conversation.get("mode") == "group":
        orchestrator = _effective_agent_for_conversation(conversation, ORCHESTRATOR_AGENT_ID)
        return orchestrator if _agent_is_callable(orchestrator) else None
    return selected_agent if _agent_is_callable(selected_agent) else None


async def classify_for_conversation(
    conversation: Dict[str, Any],
    selected_agent: Optional[Dict[str, Any]],
    content: str,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    clean_content = (content or "").strip()
    explicit_mode = legacy_orchestrator._explicit_execution_mode(payload)
    if explicit_mode == "chat":
        return legacy_orchestrator._chat_execution_decision(
            clean_content,
            reason="payload 显式指定普通聊天",
            confidence=1.0,
        )
    if explicit_mode == "deployment":
        return legacy_orchestrator._deployment_execution_decision(
            clean_content,
            reason="payload 显式指定部署",
            confidence=1.0,
        )
    if explicit_mode == "sandbox":
        return legacy_orchestrator._sandbox_execution_decision(
            clean_content,
            reason="payload 显式指定 sandbox 执行",
            confidence=1.0,
        )
    if conversation.get("mode") == "agent":
        return legacy_orchestrator._chat_execution_decision(
            clean_content,
            reason="agent 联系人会话本轮不自动触发 sandbox",
            confidence=1.0,
        )

    planner_agent = planner_agent_for_conversation(conversation, selected_agent)
    if not planner_agent:
        raise ValueError("当前会话没有可用的意图识别 Agent")

    context = {
        "conversationMode": conversation.get("mode"),
        "conversationWorkspaceId": conversation.get("workspaceId"),
        "plannerAgentId": planner_agent.get("id"),
        "plannerAgentName": planner_agent.get("name"),
        "plannerAgentRuntime": planner_agent.get("runtime"),
        "selectedAgentId": selected_agent.get("id") if selected_agent else None,
        "selectedAgentName": selected_agent.get("name") if selected_agent else None,
        "selectedAgentRuntime": selected_agent.get("runtime") if selected_agent else None,
        "userInput": clean_content,
    }
    raw = await NativeRuntimeAdapter().complete_json(
        planner_agent,
        conversation,
        legacy_orchestrator.EXECUTION_MODE_SYSTEM,
        json.dumps(context, ensure_ascii=False),
        {"purpose": "execution_mode_classification"},
    )
    return legacy_orchestrator._normalize_execution_decision(raw, clean_content)
