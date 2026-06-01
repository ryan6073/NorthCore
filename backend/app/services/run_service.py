from typing import Any, Dict, List, Optional

from app.database import *
from app.services.file_version_service import FileVersionService
from app.services.message_service import (
    agent_is_callable,
    choose_agent_for_conversation,
    emit_conversation_event,
    get_effective_agent_for_conversation,
    latest_active_run_for_conversation,
)
from app.services.run_scheduler import generate_dag
from app.services.sandbox_service import SandboxService

def run_allowed_agent_ids(conversation: Dict[str, Any]) -> List[str]:
    agent_ids = [
        agent_id for agent_id in conversation.get("agentIds", [])
        if agent_id != ORCHESTRATOR_AGENT_ID
    ]
    callable_ids = []
    for agent_id in agent_ids:
        agent = get_effective_agent_for_conversation(conversation, agent_id)
        if agent_is_callable(agent):
            callable_ids.append(agent_id)
    if callable_ids:
        return callable_ids
    fallback = choose_agent_for_conversation(conversation)
    return [fallback["id"]] if fallback else ["agent-claude-code"]


async def emit_run_event(
    current_user: Dict[str, Any],
    conversation_id: str,
    event_type: str,
    data: Dict[str, Any],
) -> None:
    await emit_conversation_event(current_user, conversation_id, event_type, None, data)


def build_run_event_payload(run_id: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    run = get_agent_run_detail(run_id)
    payload: Dict[str, Any] = {"runId": run_id}
    if run:
        payload.update({
            "conversationId": run.get("conversationId"),
            "status": run.get("status"),
            "run": run,
            "sandbox": run.get("sandbox"),
            "steps": run.get("steps", []),
            "files": run.get("files", []),
            "conflicts": run.get("conflicts", []),
        })
    if extra:
        payload.update(extra)
    return payload


def namespace_run_dag(run_id: str, dag: Dict[str, Any]) -> Dict[str, Any]:
    steps = dag.get("steps") if isinstance(dag.get("steps"), list) else []
    id_map = {
        str(step.get("id") or f"step-{index + 1}"): f"{run_id}-step-{index + 1}"
        for index, step in enumerate(steps)
        if isinstance(step, dict)
    }
    namespaced_steps = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        original_id = str(step.get("id") or f"step-{index + 1}")
        depends_on = step.get("dependsOn") if isinstance(step.get("dependsOn"), list) else []
        namespaced_steps.append({
            **step,
            "id": id_map.get(original_id, f"{run_id}-step-{index + 1}"),
            "dependsOn": [
                id_map[dep]
                for dep in [str(item) for item in depends_on]
                if dep in id_map
            ],
        })
    return {**dag, "steps": namespaced_steps}
