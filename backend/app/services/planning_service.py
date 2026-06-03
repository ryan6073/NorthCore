import json
from typing import Any, Dict, List, Optional

from app.database import (
    ORCHESTRATOR_AGENT_ID,
    get_agent,
    get_conversation_agent_config,
)
from app.runtimes.router import runtime_router
from app.services.intent_service import planner_agent_for_conversation
from app.services.run_scheduler import normalize_dag

PLATFORM_RUNTIMES = {"opencode", "codex", "claude_code", "claude-code"}


def is_platform_runtime(agent: Optional[Dict[str, Any]]) -> bool:
    return str((agent or {}).get("runtime") or "native").strip().lower() in PLATFORM_RUNTIMES


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


def _callable_agent_ids(conversation: Dict[str, Any]) -> List[str]:
    result: List[str] = []
    for agent_id in conversation.get("agentIds") or []:
        if agent_id == ORCHESTRATOR_AGENT_ID:
            continue
        agent = _effective_agent_for_conversation(conversation, agent_id)
        if _agent_is_callable(agent):
            result.append(agent_id)
    return result


def _single_step_dag(prompt: str, agent: Dict[str, Any], summary: str = "平台 Agent 沙箱任务") -> Dict[str, Any]:
    return {
        "summary": summary,
        "strategy": "platform_single_step",
        "steps": [
            {
                "id": "step-1",
                "agentId": agent["id"],
                "agentName": agent.get("name") or "Agent",
                "task": prompt,
                "dependsOn": [],
                "expectedOutputs": ["workspace changes"],
            }
        ],
    }


def _agent_capability_context(agents: List[Dict[str, Any]]) -> str:
    lines = ["[Available Agents]"]
    for agent in agents:
        lines.append(
            "- "
            f"agentId={agent.get('id')}; "
            f"name={agent.get('name')}; "
            f"runtime={agent.get('runtime') or 'native'}; "
            f"description={agent.get('description') or ''}"
        )
    return "\n".join(lines)


def _agent_name_map(agents: List[Dict[str, Any]]) -> Dict[str, str]:
    return {
        str(agent.get("id")): str(agent.get("name") or "Agent")
        for agent in agents
        if agent and agent.get("id")
    }


def _dag_system_prompt(agents: List[Dict[str, Any]]) -> str:
    return (
        "你是 AgentHub 的会话调度器。请把用户需求拆成一个可执行 DAG。\n"
        "你必须只输出 JSON，不要 Markdown，不要解释文本。\n\n"
        "硬性规则：\n"
        "- 只能使用下方 [Available Agents] 中列出的 agentId。\n"
        "- 不要使用未列出的 Agent 名称或 agentId。\n"
        "- 如果某个 Agent 是平台 runtime，只给它一个完整子任务，不拆它的内部流程。\n"
        "- step 数量 1-4 个；能并行则 dependsOn 为空；审查/验证可依赖实现 step。\n\n"
        f"{_agent_capability_context(agents)}\n\n"
        "输出格式：\n"
        "{\n"
        '  "summary": "一句话任务摘要",\n'
        '  "steps": [\n'
        '    {"id": "step-1", "agentId": "必须来自 Available Agents", "task": "具体任务", "dependsOn": [], "expectedOutputs": []}\n'
        "  ]\n"
        "}"
    )


def _collapse_platform_steps(
    dag: Dict[str, Any],
    conversation: Dict[str, Any],
) -> Dict[str, Any]:
    steps = dag.get("steps") if isinstance(dag.get("steps"), list) else []
    collapsed: List[Dict[str, Any]] = []
    platform_by_agent: Dict[str, Dict[str, Any]] = {}
    for step in steps:
        agent = _effective_agent_for_conversation(conversation, str(step.get("agentId") or ""))
        if not is_platform_runtime(agent):
            collapsed.append(step)
            continue
        agent_id = str(step.get("agentId"))
        existing = platform_by_agent.get(agent_id)
        if not existing:
            platform_by_agent[agent_id] = {**step, "dependsOn": [], "expectedOutputs": []}
            collapsed.append(platform_by_agent[agent_id])
            existing = platform_by_agent[agent_id]
        else:
            existing["task"] = f"{existing.get('task')}\n\n{step.get('task')}"
        existing["expectedOutputs"] = list({
            *[str(item) for item in existing.get("expectedOutputs") or []],
            *[str(item) for item in step.get("expectedOutputs") or []],
        })
    return {**dag, "steps": collapsed}


async def plan_run_for_conversation(
    conversation: Dict[str, Any],
    prompt: str,
    selected_agent: Optional[Dict[str, Any]],
    planner_prompt: str,
) -> Dict[str, Any]:
    mode = conversation.get("mode")
    target_agent = selected_agent or planner_agent_for_conversation(conversation, selected_agent)
    if mode == "single":
        if not target_agent:
            raise ValueError("single 会话没有可用 Agent，无法规划沙箱任务")
        if is_platform_runtime(target_agent):
            return _single_step_dag(planner_prompt, target_agent)
        user_content = planner_prompt + "\n\n" + _agent_capability_context([target_agent])
        payload = await runtime_router.complete_json(
            target_agent,
            conversation,
            _dag_system_prompt([target_agent]),
            user_content,
            {"purpose": "single_native_dag"},
        )
        dag = normalize_dag(payload, user_content, [target_agent["id"]], _agent_name_map([target_agent]))
        return {**dag, "strategy": "native_dag"}

    if mode == "group":
        if selected_agent and is_platform_runtime(selected_agent):
            return _single_step_dag(planner_prompt, selected_agent)
        planner_agent = planner_agent_for_conversation(conversation, selected_agent)
        if not planner_agent:
            raise ValueError("group 会话没有可用 Orchestrator，无法规划沙箱任务")
        allowed_agent_ids = _callable_agent_ids(conversation)
        if not allowed_agent_ids:
            raise ValueError("group 会话没有可执行成员 Agent")
        member_agents = [
            _effective_agent_for_conversation(conversation, agent_id)
            for agent_id in allowed_agent_ids
        ]
        user_content = (
            f"{planner_prompt}\n\n"
            f"{_agent_capability_context([agent for agent in member_agents if agent])}\n\n"
            "[Planning Rules]\n"
            "- 你是会话 Orchestrator，只做高层分派。\n"
            "- 如果目标 Agent 是平台 runtime，不要拆它的内部流程，只给它一个完整子任务。\n"
            "- 只输出 DAG JSON。"
        )
        payload = await runtime_router.complete_json(
            planner_agent,
            conversation,
            _dag_system_prompt([agent for agent in member_agents if agent]),
            user_content,
            {"purpose": "group_orchestrator_dag"},
        )
        dag = normalize_dag(
            payload,
            user_content,
            allowed_agent_ids,
            _agent_name_map([agent for agent in member_agents if agent]),
        )
        return {**_collapse_platform_steps(dag, conversation), "strategy": "group_orchestrator_dag"}

    raise ValueError("Sandbox Run 仅支持 single 或 group 会话")
