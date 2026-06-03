from typing import Any, Awaitable, Callable, Dict, Optional

from app.database import (
    get_agent,
    get_agent_run_detail,
    get_agent_run_step,
    list_artifacts_for_run,
    update_agent_run_step,
)
from app.runtimes.router import runtime_router

EventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]


def _run_snapshot_payload(run_id: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
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
            "artifacts": list_artifacts_for_run(run_id),
        })
    if extra:
        payload.update(extra)
    return payload


async def execute_sandbox_step(
    scheduler: Any,
    run_id: str,
    sandbox: Dict[str, Any],
    container_id: str,
    step: Dict[str, Any],
    send: EventEmitter,
) -> None:
    agent = get_agent(step["agentId"]) or get_agent("agent-claude-code")
    update_agent_run_step(step["id"], status="running", claimed_by=step["agentId"], mark_started=True)
    await send(
        "run.step.started",
        _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step(step["id"])}),
    )
    try:
        handled_by_runtime = await runtime_router.execute_run_step(
            run_id,
            sandbox,
            container_id,
            step,
            agent,
            send,
            {"scheduler": scheduler},
        )
        if handled_by_runtime:
            return

        result = await scheduler._run_tool_loop(run_id, sandbox, container_id, step, agent, send)
        if result["status"] == "conflict":
            update_agent_run_step(
                step["id"],
                status="conflict",
                output=result["output"],
                append_log=result.get("logs", ""),
                error=result.get("error") or "文件冲突",
                mark_finished=True,
            )
            return
        if result["status"] == "failed":
            update_agent_run_step(
                step["id"],
                status="failed",
                output=result["output"],
                append_log=result.get("logs", ""),
                error=result.get("error") or "沙箱工具循环失败",
                mark_finished=True,
            )
            await send(
                "run.step.failed",
                _run_snapshot_payload(
                    run_id,
                    {"stepId": step["id"], "step": get_agent_run_step(step["id"]), "error": result.get("error")},
                ),
            )
            return

        update_agent_run_step(
            step["id"],
            status="completed",
            output=result["output"],
            append_log=result.get("logs", ""),
            mark_finished=True,
        )
        await send(
            "run.step.completed",
            _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step(step["id"])}),
        )
    except Exception as exc:
        update_agent_run_step(step["id"], status="failed", error=str(exc), mark_finished=True)
        await send(
            "run.step.failed",
            _run_snapshot_payload(
                run_id,
                {"stepId": step["id"], "step": get_agent_run_step(step["id"]), "error": str(exc)},
            ),
        )
