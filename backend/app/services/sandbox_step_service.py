from typing import Any, Awaitable, Callable, Dict, Optional

from app.database import (
    get_agent,
    get_conversation,
    get_agent_run_detail,
    get_agent_run_step,
    list_artifacts_for_run,
    update_agent_run_step,
)
from app.runtimes.router import runtime_router
from app.services.dag_step_policy import path_matches_patterns, step_target_paths
from app.services.message_service import get_effective_agent_for_conversation

EventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]
INTERNAL_TASK_MARKERS = (
    "[Workspace AGENTS.md]",
    "[Workspace AGENTS.md fallback]",
    "[Workspace Action Context]",
    "[上传附件上下文]",
    "[本轮临时加载的附件正文]",
)


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


def _step_display_task(step: Dict[str, Any]) -> str:
    metadata = step.get("runtimeMetadata") if isinstance(step.get("runtimeMetadata"), dict) else {}
    execution_task = str(metadata.get("executionTask") or "").strip()
    if execution_task:
        return execution_task
    task = str(step.get("task") or "").strip()
    for marker in INTERNAL_TASK_MARKERS:
        marker_index = task.find(marker)
        if marker_index > 0:
            task = task[:marker_index].strip()
            break
    return task or str(step.get("task") or "").strip()


async def execute_sandbox_step(
    scheduler: Any,
    run_id: str,
    sandbox: Dict[str, Any],
    container_id: str,
    step: Dict[str, Any],
    send: EventEmitter,
) -> None:
    run = get_agent_run_detail(run_id)
    owner_user_id = (run or {}).get("ownerUserId")
    conversation_id = (run or {}).get("conversationId")
    conversation = get_conversation(conversation_id, owner_user_id=owner_user_id) if conversation_id else None
    if conversation:
        agent = get_effective_agent_for_conversation(conversation, step["agentId"])
    else:
        agent = get_agent(step["agentId"], owner_user_id=owner_user_id)
    agent = agent or get_agent("agent-claude-code", owner_user_id=owner_user_id) or get_agent("agent-claude-code")
    if agent:
        step_runtime_config = step.get("runtimeConfig") if isinstance(step.get("runtimeConfig"), dict) else {}
        runtime_metadata = step.get("runtimeMetadata") if isinstance(step.get("runtimeMetadata"), dict) else {}
        agent = {
            **agent,
            "runtime": step.get("runtime") or agent.get("runtime", "native"),
            "modelConfigId": step.get("modelConfigId") or agent.get("modelConfigId"),
            "runtimeConfig": {
                **(agent.get("runtimeConfig") if isinstance(agent.get("runtimeConfig"), dict) else {}),
                **step_runtime_config,
            },
            "runtimeMetadata": {
                **(agent.get("runtimeMetadata") if isinstance(agent.get("runtimeMetadata"), dict) else {}),
                **runtime_metadata,
            },
        }
    update_agent_run_step(step["id"], status="running", claimed_by=step["agentId"], mark_started=True)
    if hasattr(scheduler, "_send_step_progress_message"):
        display_task = _step_display_task(step)
        await scheduler._send_step_progress_message(
            run_id,
            step,
            "started",
            f"我正在处理：{display_task[:200]}",
            send,
            {
                "task": display_task,
                "displayTask": display_task,
                "agentRuntime": (agent or {}).get("runtime") or step.get("runtime") or "native",
            },
        )
    payload = _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step(step["id"])})
    await send("run.step.started", payload)
    await send("run.updated", payload)
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
            final_step = get_agent_run_step(step["id"]) or step
            if hasattr(scheduler, "_send_step_progress_message"):
                if final_step.get("status") == "completed":
                    output = final_step.get("output") if isinstance(final_step.get("output"), dict) else {}
                    files = output.get("files") if isinstance(output.get("files"), list) else []
                    suffix = f"已同步 {len(files)} 个文件。" if files else "本步骤已完成。"
                    await scheduler._send_step_progress_message(
                        run_id,
                        final_step,
                        "completed",
                        f"我已完成本步骤：{suffix}",
                        send,
                        {
                            "changedFileCount": len(files),
                            "runtime": output.get("runtime") or (agent or {}).get("runtime"),
                        },
                    )
                elif final_step.get("status") in {"failed", "conflict", "blocked"}:
                    error = str(final_step.get("error") or "步骤执行失败").strip()
                    is_blocked = final_step.get("status") == "blocked"
                    await scheduler._send_step_progress_message(
                        run_id,
                        final_step,
                        "blocked" if is_blocked else "failed",
                        (
                            f"我需要补充信息：{error[:300]}"
                            if is_blocked
                            else f"我执行失败：{error[:300]}"
                        ),
                        send,
                        {"error": error},
                        finish_reason="error",
                    )
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
            if hasattr(scheduler, "_send_step_progress_message"):
                await scheduler._send_step_progress_message(
                    run_id,
                    step,
                    "conflict",
                    "我遇到文件冲突，需要处理后继续。",
                    send,
                    {"error": result.get("error") or "文件冲突"},
                    finish_reason="error",
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
            if hasattr(scheduler, "_send_step_progress_message"):
                error = str(result.get("error") or "沙箱工具循环失败").strip()
                await scheduler._send_step_progress_message(
                    run_id,
                    step,
                    "failed",
                    f"我执行失败：{error[:300]}",
                    send,
                    {"error": error},
                    finish_reason="error",
                )
            payload = _run_snapshot_payload(
                run_id,
                {"stepId": step["id"], "step": get_agent_run_step(step["id"]), "error": result.get("error")},
            )
            await send("run.step.failed", payload)
            await send("run.updated", payload)
            return

        output = result.get("output") if isinstance(result.get("output"), dict) else {}
        extra_changed_files = output.get("extraChangedFiles") if isinstance(output.get("extraChangedFiles"), list) else []
        changed_files = output.get("changedFiles") if isinstance(output.get("changedFiles"), list) else []
        target_paths = step_target_paths(step)
        outside_changed_files = [
            str(path)
            for path in changed_files
            if target_paths and not path_matches_patterns(str(path), target_paths)
        ]
        if extra_changed_files or outside_changed_files:
            error = "step 实际写入超出声明 targetPaths，已阻止完成"
            failed_output = {
                **output,
                "targetPaths": target_paths,
                "outsideDeclaredTargetPaths": outside_changed_files,
            }
            update_agent_run_step(
                step["id"],
                status="failed",
                output=failed_output,
                append_log=result.get("logs", ""),
                error=error,
                mark_finished=True,
            )
            if hasattr(scheduler, "_send_step_progress_message"):
                await scheduler._send_step_progress_message(
                    run_id,
                    step,
                    "failed",
                    f"我执行失败：{error}",
                    send,
                    {"error": error, "extraChangedFiles": extra_changed_files, "outsideChangedFiles": outside_changed_files},
                    finish_reason="error",
                )
            payload = _run_snapshot_payload(
                run_id,
                {"stepId": step["id"], "step": get_agent_run_step(step["id"]), "error": error},
            )
            await send("run.step.failed", payload)
            await send("run.updated", payload)
            return

        update_agent_run_step(
            step["id"],
            status="completed",
            output=result["output"],
            append_log=result.get("logs", ""),
            mark_finished=True,
        )
        if hasattr(scheduler, "_send_step_progress_message"):
            output = result.get("output") if isinstance(result.get("output"), dict) else {}
            finish = output.get("finish") if isinstance(output.get("finish"), dict) else {}
            summary = str(finish.get("summary") or "本步骤已完成。").strip()
            changed_files = output.get("changedFiles") if isinstance(output.get("changedFiles"), list) else []
            await scheduler._send_step_progress_message(
                run_id,
                step,
                "completed",
                f"我已完成本步骤：{summary[:300]}",
                send,
                {
                    "summary": summary,
                    "changedFiles": changed_files[:20],
                    "changedFileCount": len(changed_files),
                },
            )
        payload = _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step(step["id"])})
        await send("run.step.completed", payload)
        await send("run.updated", payload)
    except Exception as exc:
        update_agent_run_step(step["id"], status="failed", error=str(exc), mark_finished=True)
        if hasattr(scheduler, "_send_step_progress_message"):
            await scheduler._send_step_progress_message(
                run_id,
                step,
                "failed",
                f"我执行失败：{str(exc)[:300]}",
                send,
                {"error": str(exc)},
                finish_reason="error",
            )
        payload = _run_snapshot_payload(
            run_id,
            {"stepId": step["id"], "step": get_agent_run_step(step["id"]), "error": str(exc)},
        )
        await send("run.step.failed", payload)
        await send("run.updated", payload)
