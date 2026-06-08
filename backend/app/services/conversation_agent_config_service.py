from typing import Any, Dict, Optional

from app.database import ORCHESTRATOR_AGENT_ID, get_agent, get_conversation_agent_config


def get_effective_agent_for_conversation(
    conversation: Dict[str, Any],
    agent_id: str,
) -> Optional[Dict[str, Any]]:
    owner_user_id = conversation.get("ownerUserId")
    conversation_agent_ids = set(conversation.get("agentIds") or [])
    contact_agent_id = str(conversation.get("contactAgentId") or "")
    if (
        agent_id != ORCHESTRATOR_AGENT_ID
        and (
            agent_id in conversation_agent_ids
            or contact_agent_id == agent_id
        )
    ):
        return get_conversation_agent_config(
            conversation["id"],
            agent_id,
            owner_user_id=owner_user_id,
        )
    return get_agent(agent_id, owner_user_id=owner_user_id)
