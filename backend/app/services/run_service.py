import asyncio
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.config import settings
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
from app.services.run_scheduler import RunScheduler
from app.services.sandbox_service import SandboxService

RunEventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]

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


def resolve_conversation_workspace(
    conversation: Dict[str, Any],
    owner_user_id: str,
    requested_workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    workspace_id = (requested_workspace_id or conversation.get("workspaceId") or "").strip() or None
    return ensure_conversation_workspace(
        conversation["id"],
        owner_user_id,
        workspace_id=workspace_id,
    )


def build_files_tree(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    root: Dict[str, Any] = {
        "name": "workspace",
        "type": "directory",
        "children": [],
    }
    directory_index: Dict[str, Dict[str, Any]] = {"": root}
    for file_meta in sorted(files, key=lambda item: str(item.get("path") or "")):
        path = str(file_meta.get("path") or "").strip().replace("\\", "/")
        if not path or path.startswith("/") or ".." in path.split("/"):
            continue
        current_path = ""
        parent = root
        parts = [part for part in path.split("/") if part]
        for part in parts[:-1]:
            current_path = f"{current_path}/{part}" if current_path else part
            node = directory_index.get(current_path)
            if not node:
                node = {
                    "name": part,
                    "type": "directory",
                    "path": current_path,
                    "children": [],
                }
                parent["children"].append(node)
                directory_index[current_path] = node
            parent = node
        parent["children"].append({
            "name": parts[-1],
            "type": "file",
            "path": path,
            "file": file_meta,
        })

    def sort_children(node: Dict[str, Any]) -> None:
        children = node.get("children") or []
        children.sort(key=lambda item: (item.get("type") != "directory", item.get("name", "")))
        for child in children:
            if child.get("type") == "directory":
                sort_children(child)

    sort_children(root)
    return root


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
            "workspaceId": run.get("workspaceId"),
            "status": run.get("status"),
            "run": run,
            "sandbox": run.get("sandbox"),
            "workspace": run.get("workspace"),
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


async def create_run_for_conversation(
    current_user: Dict[str, Any],
    conversation_id: str,
    prompt: str,
    payload: Optional[Dict[str, Any]] = None,
    emit: Optional[RunEventEmitter] = None,
) -> Dict[str, Any]:
    conversation = get_conversation(conversation_id, owner_user_id=current_user["id"])
    if not conversation:
        raise ValueError("会话不存在")
    if conversation.get("mode") not in {"agent", "single", "group"}:
        raise ValueError("Sandbox Run 仅支持 agent、single 或 group 会话")
    if conversation.get("mode") in {"agent", "single"} and not choose_agent_for_conversation(conversation):
        raise ValueError("当前 Agent 已隐藏或删除，无法创建 Sandbox Run")
    clean_prompt = str(prompt or "").strip()
    if not clean_prompt:
        raise ValueError("prompt 不能为空")
    payload = payload or {}
    environment_profile = payload.get("environmentProfile")
    if not isinstance(environment_profile, dict):
        environment_profile = {}
    package_manager = str(environment_profile.get("packageManager") or "uv").strip() or "uv"
    allow_network = environment_profile.get("allowNetwork")
    if allow_network is None:
        allow_network = settings.SANDBOX_ALLOW_NETWORK
    environment_profile = {
        **environment_profile,
        "packageManager": package_manager,
        "allowNetwork": bool(allow_network),
    }

    sandbox_network = settings.SANDBOX_NETWORK if environment_profile["allowNetwork"] else "none"
    sandbox_service = SandboxService(network=sandbox_network)
    environment_profile["allowNetwork"] = sandbox_service.network != "none"

    requested_workspace_id = str(payload.get("workspaceId") or "").strip() or None
    workspace = resolve_conversation_workspace(
        conversation,
        current_user["id"],
        requested_workspace_id=requested_workspace_id,
    )
    if not workspace:
        raise ValueError("Workspace 不存在")

    allowed_agent_ids = run_allowed_agent_ids(conversation)
    run_id = create_id("run")
    dag_payload = await generate_dag(clean_prompt, allowed_agent_ids=allowed_agent_ids)
    dag_payload["environmentProfile"] = environment_profile
    dag = namespace_run_dag(run_id, dag_payload)
    print(
        f"[SandboxRun] dag generated run={run_id} steps={len(dag.get('steps', []))} "
        f"agents={allowed_agent_ids}",
        flush=True,
    )
    sandbox = create_sandbox(
        owner_user_id=current_user["id"],
        conversation_id=conversation_id,
        image=settings.SANDBOX_IMAGE,
        network=sandbox_service.network,
        workspace_path=str(workspace["workspacePath"]),
        workspace_id=workspace["id"],
    )
    create_agent_run(
        owner_user_id=current_user["id"],
        conversation_id=conversation_id,
        sandbox_id=sandbox["id"],
        prompt=clean_prompt,
        dag=dag,
        run_id=run_id,
        workspace_id=workspace["id"],
    )
    create_agent_run_steps(run_id, dag.get("steps", []))
    print(
        f"[SandboxRun] created run={run_id} sandbox={sandbox['id']} "
        f"workspace={workspace['workspacePath']} network={sandbox_service.network}",
        flush=True,
    )
    detail = get_agent_run_detail(run_id, owner_user_id=current_user["id"])

    async def scheduler_emit(event_type: str, data: Dict[str, Any]) -> None:
        if emit:
            await emit(event_type, data)

    if emit:
        await emit("run.created", build_run_event_payload(run_id, {"run": detail}))
    asyncio.create_task(RunScheduler(sandbox_service=sandbox_service).run(run_id, emit=scheduler_emit))
    return detail
