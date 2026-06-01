import asyncio
import json
import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.config import settings
from app.core.llm_client import client
from app.core.orchestrator import AGENT_NAME_TO_ID
from app.database import (
    create_artifact,
    create_id,
    get_agent,
    get_agent_run,
    get_agent_run_detail,
    get_sandbox,
    get_sandbox_file_version,
    list_agent_run_steps,
    list_sandbox_files_changed_by_run,
    list_sandbox_files,
    list_sandbox_conflicts,
    now_text,
    set_sandbox_file_artifact,
    update_artifact,
    update_agent_run,
    update_agent_run_step,
    update_sandbox,
)
from app.services.file_version_service import FileVersionService
from app.services.sandbox_service import SandboxService
from app.services.sandbox_tools import SANDBOX_TOOL_SPECS, SandboxToolExecutor

EventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]

DAG_SYSTEM_PROMPT = """你是 AgentHub 的任务调度器。
请把用户需求拆成一个可执行 DAG。只输出 JSON，不要 Markdown。
可用 agentId：
- agent-chat：通用问答、解释说明、轻量整理
- agent-translator：中英互译、多语言翻译、文本润色
- agent-mermaid：Mermaid 图表、流程图、时序图、架构图
- agent-document：Markdown 文档、汇报材料、PPT 大纲
- agent-claude-code：代码生成、文件实现、工程改造
- agent-codex：代码审查、质量检查、修复建议

格式：
{
  "summary": "一句话任务摘要",
  "steps": [
    {
      "id": "step-1",
      "agentId": "agent-claude-code",
      "agentName": "Claude Code",
      "task": "具体任务",
      "dependsOn": [],
      "expectedOutputs": ["README.md"]
    }
  ]
}
要求：
- step 数量 1-4 个。
- 如果任务能并行，dependsOn 为空。
- 如果审查依赖生成，审查 step 依赖生成 step。
"""

SANDBOX_EXECUTOR_SYSTEM_PROMPT = """你是 AgentHub 的沙箱执行模式。
你不是独立新 Agent，而是当前 Agent 在隔离 Docker workspace 中执行这个 step。

你只能使用后端提供的工具：
- inspect_environment：检测 OS/CPU 架构、cwd、Python/Node/uv/npm/conda 和网络策略。
- read_dependency_manifest：读取 requirements.txt、pyproject.toml、package.json、lockfile 等依赖入口。
- setup_environment：创建/激活环境并安装依赖。
- list_files：查看当前 workspace 文件树。
- scan_workspace：扫描 /workspace 实际文件，发现命令生成但尚未入库的文件。
- read_workspace_file：读取 /workspace 实际文件，包括未 tracked 文件。
- import_workspace_file：把 /workspace 实际文件导入版本系统，后续才能同步 Artifact。
- read_file：读取 workspace 内相对路径文件。
- write_file：写入完整文件内容，必须携带 baseVersion。
- run_command：执行普通非交互命令。
- validate_command：执行显式验证命令并返回 validationId。
- finish：结束 step，提交 success/failure、summary、changedFiles、nextActions。

核心规则：
- 工具执行成功不等于任务完成，必须基于文件内容、命令结果和日志判断是否真正达成任务目标。
- 复杂任务先 inspect_environment，再 read_dependency_manifest；需要依赖时先 setup_environment，再修改/执行/验证。
- 默认 Python 环境使用 uv；只有任务或项目文档明确要求 conda/poetry/pipenv 时才使用它们。
- setup_environment 成功只代表环境准备完成，不代表任务成功；必须再执行 pytest、npm run build 或等价验证后才能 finish success。
- 如果命令生成了文件，必须先 scan_workspace，再 import_workspace_file，导入后才能作为 Artifact 输出。
- finish(success=true) 必须在最后一次文件修改后完成验证；优先使用 validate_command，成功的 run_command 也可作为验证依据。纯文档/不可运行任务可以携带 validationSkippedReason 说明跳过原因。
- 命令必须非交互，不能屏蔽 stderr，例如不要使用 2>/dev/null。
- 耗时命令不要直接通过管道接 head/tail/grep 截断；需要筛选日志时先写入文件，再读取文件。
- 文件路径必须是相对路径，不能以 / 开头，不能包含 ..
- 失败后根据日志修复，不能盲目 finish success。
- 完成时必须调用 finish。

如果当前模型不支持原生 function calling，则输出一个 JSON 对象作为降级工具调用：
{"tool": "write_file", "arguments": {"path": "README.md", "content": "...", "baseVersion": 0}}
"""


def _extract_json_object(text: str) -> Dict[str, Any]:
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


def _safe_output_path(path: str) -> Optional[str]:
    cleaned = (path or "").strip().replace("\\", "/")
    if not cleaned or cleaned.startswith("/") or ".." in Path(cleaned).parts:
        return None
    return cleaned


def _fallback_extension_for_step(step: Dict[str, Any]) -> str:
    agent_id = step.get("agentId")
    task_text = f"{step.get('agentName', '')} {step.get('task', '')}".lower()
    if agent_id == "agent-mermaid" or "mermaid" in task_text:
        return ".md"
    if agent_id == "agent-document" or "markdown" in task_text or "文档" in task_text or "汇报" in task_text:
        return ".md"
    if "html" in task_text or "网页" in task_text:
        return ".html"
    return ".md"


def _fallback_path_for_step(step: Dict[str, Any]) -> str:
    for expected in step.get("expectedOutputs") or []:
        candidate = _safe_output_path(str(expected))
        if candidate and Path(candidate).suffix:
            return candidate
    step_id = str(step.get("id") or "step-output")
    return f"{step_id}-output{_fallback_extension_for_step(step)}"


def _fallback_step_output(raw_content: str, step: Dict[str, Any], error: Exception) -> Dict[str, Any]:
    path = _fallback_path_for_step(step)
    content = (raw_content or "").strip()
    if not content:
        content = f"模型未返回可保存内容。\n\n解析错误：{error}"
    return {
        "summary": f"模型未返回合法 JSON，已将原始回复保存为 {path}",
        "files": [
            {
                "path": path,
                "baseVersion": 0,
                "content": content,
            }
        ],
        "commands": [],
        "parseWarning": str(error),
        "rawOutputSaved": True,
    }


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


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
        })
    if extra:
        payload.update(extra)
    return payload


def _agent_name_for_id(agent_id: str) -> str:
    names = {
        "agent-chat": "默认聊天助手",
        "agent-translator": "翻译助手",
        "agent-mermaid": "图表助手",
        "agent-document": "文档助手",
        "agent-claude-code": "Claude Code",
        "agent-codex": "Codex",
    }
    return names.get(agent_id, "Agent")


def _fallback_dag(prompt: str, agent_id: str = "agent-claude-code") -> Dict[str, Any]:
    return {
        "summary": "单 Agent 沙箱任务",
        "steps": [
            {
                "id": "step-1",
                "agentId": agent_id,
                "agentName": _agent_name_for_id(agent_id),
                "task": prompt,
                "dependsOn": [],
                "expectedOutputs": ["README.md"],
            }
        ],
    }


def normalize_dag(payload: Dict[str, Any], prompt: str, allowed_agent_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    allowed = set(allowed_agent_ids or [
        "agent-chat",
        "agent-translator",
        "agent-mermaid",
        "agent-document",
        "agent-claude-code",
        "agent-codex",
    ])
    raw_steps = payload.get("steps") if isinstance(payload, dict) else None
    if not isinstance(raw_steps, list) or not raw_steps:
        return _fallback_dag(prompt, next(iter(allowed), "agent-claude-code"))

    normalized: List[Dict[str, Any]] = []
    used_ids = set()
    for index, step in enumerate(raw_steps[:4], start=1):
        if not isinstance(step, dict):
            continue
        step_id = str(step.get("id") or f"step-{index}").strip()
        if not step_id or step_id in used_ids:
            step_id = f"step-{index}"
        used_ids.add(step_id)
        agent_id = str(step.get("agentId") or AGENT_NAME_TO_ID.get(str(step.get("agentName") or ""), "")).strip()
        if agent_id not in allowed:
            agent_id = "agent-claude-code" if "agent-claude-code" in allowed else next(iter(allowed), "agent-claude-code")
        task = str(step.get("task") or prompt).strip()
        depends_on = step.get("dependsOn") if isinstance(step.get("dependsOn"), list) else []
        expected_outputs = step.get("expectedOutputs") if isinstance(step.get("expectedOutputs"), list) else []
        normalized.append({
            "id": step_id,
            "agentId": agent_id,
            "agentName": str(step.get("agentName") or _agent_name_for_id(agent_id)),
            "task": task,
            "dependsOn": [str(dep) for dep in depends_on],
            "expectedOutputs": [str(item) for item in expected_outputs],
        })

    valid_ids = {step["id"] for step in normalized}
    for step in normalized:
        step["dependsOn"] = [dep for dep in step["dependsOn"] if dep in valid_ids and dep != step["id"]]
    if not normalized:
        return _fallback_dag(prompt, next(iter(allowed), "agent-claude-code"))
    return {
        "summary": str(payload.get("summary") or "沙箱任务").strip(),
        "steps": normalized,
    }


async def generate_dag(prompt: str, allowed_agent_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": DAG_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            stream=False,
        )
        payload = _extract_json_object(response.choices[0].message.content or "")
        return normalize_dag(payload, prompt, allowed_agent_ids)
    except Exception:
        return normalize_dag({}, prompt, allowed_agent_ids)


class RunScheduler:
    def __init__(
        self,
        sandbox_service: Optional[SandboxService] = None,
        file_service: Optional[FileVersionService] = None,
        max_parallel_steps: Optional[int] = None,
    ) -> None:
        self.sandbox_service = sandbox_service or SandboxService()
        self.file_service = file_service or FileVersionService(self.sandbox_service)
        self.max_parallel_steps = max_parallel_steps or settings.SANDBOX_MAX_PARALLEL_STEPS

    async def run(self, run_id: str, emit: Optional[EventEmitter] = None) -> None:
        run = get_agent_run(run_id)
        if not run:
            return
        sandbox = get_sandbox(run["sandboxId"])
        if not sandbox:
            update_agent_run(run_id, status="failed", error="Sandbox 不存在", mark_finished=True)
            return

        async def send(event_type: str, data: Dict[str, Any]) -> None:
            if emit:
                await emit(event_type, {"runId": run_id, **data})

        try:
            print(f"[SandboxRun] scheduler start run={run_id}", flush=True)
            update_agent_run(run_id, status="running", mark_started=True)
            update_sandbox(sandbox["id"], status="starting")
            await send("run.created", _run_snapshot_payload(run_id))
            container_id = await self.sandbox_service.start_container(sandbox["id"], sandbox["workspacePath"])
            sandbox = get_sandbox(sandbox["id"])
            await self._run_dag(run_id, sandbox, container_id, send)
            current_run = get_agent_run(run_id)
            if current_run and current_run["status"] == "cancelled":
                update_sandbox(sandbox["id"], status="cancelled")
                return
            await self._sync_artifacts(run_id, sandbox, send)
            steps = list_agent_run_steps(run_id)
            failed_steps = [step for step in steps if step["status"] in {"failed", "blocked"}]
            conflicts = [item for item in list_sandbox_conflicts(run_id) if item["status"] == "open"]
            if failed_steps:
                update_agent_run(run_id, status="failed", summary="任务部分步骤失败", mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="failed")
                print(f"[SandboxRun] failed run={run_id} failedSteps={len(failed_steps)}", flush=True)
                await send("run.failed", _run_snapshot_payload(run_id, {"status": "failed", "failedSteps": failed_steps}))
            elif conflicts:
                update_agent_run(run_id, status="conflict", summary="任务完成但存在文件冲突", mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="conflict")
                print(f"[SandboxRun] conflict run={run_id} conflicts={len(conflicts)}", flush=True)
                await send("run.failed", _run_snapshot_payload(run_id, {"status": "conflict", "conflicts": conflicts}))
            else:
                update_agent_run(run_id, status="completed", summary="沙箱任务完成", mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="completed")
                print(f"[SandboxRun] completed run={run_id}", flush=True)
                await send("run.completed", _run_snapshot_payload(run_id))
        except Exception as exc:
            update_agent_run(run_id, status="failed", error=str(exc), mark_finished=True)
            await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId"), final_status="failed")
            update_sandbox(sandbox["id"], status="failed", error=str(exc))
            print(f"[SandboxRun] exception run={run_id} error={exc}", flush=True)
            await send("run.failed", _run_snapshot_payload(run_id, {"error": str(exc)}))

    async def _run_dag(self, run_id: str, sandbox: Dict[str, Any], container_id: str, send: EventEmitter) -> None:
        running: Dict[str, asyncio.Task] = {}
        while True:
            run = get_agent_run(run_id)
            if run and run["status"] == "cancelled":
                return
            steps = list_agent_run_steps(run_id)
            pending = [step for step in steps if step["status"] == "pending"]
            active_statuses = {"running"}
            if not pending and not any(step["status"] in active_statuses for step in steps):
                return

            completed_ids = {step["id"] for step in steps if step["status"] == "completed"}
            failed_ids = {step["id"] for step in steps if step["status"] in {"failed", "conflict", "blocked"}}
            for step in pending:
                if any(dep in failed_ids for dep in step["dependsOn"]):
                    update_agent_run_step(step["id"], status="blocked", error="依赖步骤未成功完成", mark_finished=True)
                    await send("run.step.failed", _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step_payload(step["id"])}))

            steps = list_agent_run_steps(run_id)
            ready = [
                step for step in steps
                if step["status"] == "pending"
                and all(dep in completed_ids for dep in step["dependsOn"])
                and step["id"] not in running
            ]
            capacity = max(0, self.max_parallel_steps - len(running))
            for step in ready[:capacity]:
                running[step["id"]] = asyncio.create_task(self._execute_step(run_id, sandbox, container_id, step, send))

            if not running:
                await asyncio.sleep(0.2)
                continue
            done, _ = await asyncio.wait(running.values(), timeout=0.2, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                step_id = next((key for key, value in running.items() if value is task), None)
                if step_id:
                    running.pop(step_id, None)
                await task

    async def _execute_step(
        self,
        run_id: str,
        sandbox: Dict[str, Any],
        container_id: str,
        step: Dict[str, Any],
        send: EventEmitter,
    ) -> None:
        agent = get_agent(step["agentId"]) or get_agent("agent-claude-code")
        update_agent_run_step(step["id"], status="running", claimed_by=step["agentId"], mark_started=True)
        await send("run.step.started", _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step_payload(step["id"])}))
        try:
            result = await self._run_tool_loop(run_id, sandbox, container_id, step, agent, send)
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
                    _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step_payload(step["id"]), "error": result.get("error")}),
                )
                return

            update_agent_run_step(
                step["id"],
                status="completed",
                output=result["output"],
                append_log=result.get("logs", ""),
                mark_finished=True,
            )
            await send("run.step.completed", _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step_payload(step["id"])}))
        except Exception as exc:
            update_agent_run_step(step["id"], status="failed", error=str(exc), mark_finished=True)
            await send(
                "run.step.failed",
                _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step_payload(step["id"]), "error": str(exc)}),
            )

    async def _run_tool_loop(
        self,
        run_id: str,
        sandbox: Dict[str, Any],
        container_id: str,
        step: Dict[str, Any],
        agent: Optional[Dict[str, Any]],
        send: EventEmitter,
    ) -> Dict[str, Any]:
        tool_calls: List[Dict[str, Any]] = []
        command_results: List[Dict[str, object]] = []
        changed_files: List[str] = []
        logs: List[str] = []
        finish_data: Optional[Dict[str, Any]] = None
        environment_state: Optional[Dict[str, Any]] = None
        validations: List[Dict[str, Any]] = []
        workspace_scan: Optional[Dict[str, Any]] = None
        last_mutation_index = 0
        active_tool_name = {"name": ""}

        async def setup_command_logger(command_result: Dict[str, Any]) -> None:
            if active_tool_name["name"] == "setup_environment":
                try:
                    await self._emit_command_log(run_id, step["id"], command_result, logs, send, prefix="[setup]")
                except Exception:
                    pass

        executor = SandboxToolExecutor(
            sandbox_service=self.sandbox_service,
            file_service=self.file_service,
            sandbox=sandbox,
            run_id=run_id,
            container_id=container_id,
            step_id=step["id"],
            environment_profile=(get_agent_run(run_id) or {}).get("dag", {}).get("environmentProfile") or {},
            command_callback=setup_command_logger,
        )
        messages = self._build_tool_loop_messages(run_id, step, agent)

        for iteration in range(settings.SANDBOX_MAX_TOOL_ITERATIONS):
            call = await self._next_tool_call(messages)
            if not call:
                return self._tool_loop_result(
                    "failed",
                    tool_calls,
                    command_results,
                    changed_files,
                    finish_data,
                    logs,
                    "模型未调用任何沙箱工具",
                    environment_state,
                    validations,
                    workspace_scan,
                )

            started_at = now_text()
            started = asyncio.get_running_loop().time()
            print(
                f"[SandboxToolLoop] run={run_id} step={step['id']} "
                f"iteration={iteration + 1} tool={call['name']}",
                flush=True,
            )
            record = {
                "id": call["id"],
                "tool": call["name"],
                "name": call["name"],
                "arguments": call["arguments"],
                "args": call["arguments"],
                "status": "running",
                "result": None,
                "error": None,
                "createdAt": started_at,
                "startedAt": started_at,
                "finishedAt": None,
                "durationMs": None,
            }
            await send(
                "run.step.tool.started",
                _run_snapshot_payload(run_id, {"stepId": step["id"], "toolCall": record}),
            )
            try:
                active_tool_name["name"] = call["name"]
                tool_result = await executor.execute(call["name"], call["arguments"])
            except Exception as exc:
                tool_result = {"ok": False, "error": str(exc)}
            finally:
                active_tool_name["name"] = ""
            finished_at = now_text()
            record["status"] = "success" if tool_result.get("ok") else "failed"
            record["finishedAt"] = finished_at
            record["durationMs"] = int((asyncio.get_running_loop().time() - started) * 1000)
            record["error"] = tool_result.get("error")
            record["result"] = tool_result
            tool_calls.append(record)

            command_result_items = tool_result.get("commandResults")
            if isinstance(command_result_items, list):
                command_results.extend([item for item in command_result_items if isinstance(item, dict)])
            if isinstance(tool_result.get("environmentState"), dict):
                environment_state = tool_result["environmentState"]
            if isinstance(tool_result.get("workspaceScan"), dict):
                workspace_scan = tool_result["workspaceScan"]

            output_snapshot = self._tool_loop_output(
                tool_calls,
                command_results,
                changed_files,
                finish_data,
                environment_state,
                validations,
                workspace_scan,
            )
            update_agent_run_step(step["id"], status="running", output=output_snapshot)

            event_type = "run.step.tool.completed" if tool_result.get("ok") else "run.step.tool.failed"
            await send(
                event_type,
                _run_snapshot_payload(run_id, {"stepId": step["id"], "toolCall": record}),
            )

            self._append_tool_result_message(messages, call, tool_result)

            if call["name"] == "run_command":
                command_result = tool_result.get("command") if isinstance(tool_result.get("command"), dict) else None
                if command_result:
                    command_results.append(command_result)
                    await self._emit_command_log(run_id, step["id"], command_result, logs, send)
                    if tool_result.get("ok"):
                        validations.append({
                            "id": call["id"],
                            "command": command_result.get("command") or str(call["arguments"].get("command") or ""),
                            "success": True,
                            "result": command_result,
                            "source": "run_command",
                            "createdAt": now_text(),
                            "toolCallIndex": len(tool_calls),
                        })
            elif call["name"] == "validate_command":
                command_result = tool_result.get("command") if isinstance(tool_result.get("command"), dict) else None
                validation = tool_result.get("validation") if isinstance(tool_result.get("validation"), dict) else None
                if command_result:
                    command_results.append(command_result)
                    await self._emit_command_log(run_id, step["id"], command_result, logs, send, prefix="[validate]")
                if validation:
                    validations.append({**validation, "toolCallIndex": len(tool_calls)})
            elif call["name"] == "write_file":
                if tool_result.get("status") == "conflict":
                    await send(
                        "run.step.conflict",
                        _run_snapshot_payload(run_id, {"stepId": step["id"], "conflict": tool_result.get("conflict")}),
                    )
                    return self._tool_loop_result(
                        "conflict",
                        tool_calls,
                        command_results,
                        changed_files,
                        finish_data,
                        logs,
                        "文件冲突",
                        environment_state,
                        validations,
                        workspace_scan,
                    )
                saved_file = tool_result.get("file") if isinstance(tool_result.get("file"), dict) else None
                if saved_file and saved_file.get("path") not in changed_files:
                    changed_files.append(saved_file["path"])
                if tool_result.get("status") == "saved":
                    last_mutation_index = len(tool_calls)
            elif call["name"] == "import_workspace_file":
                if tool_result.get("status") == "conflict":
                    await send(
                        "run.step.conflict",
                        _run_snapshot_payload(run_id, {"stepId": step["id"], "conflict": tool_result.get("conflict")}),
                    )
                    return self._tool_loop_result(
                        "conflict",
                        tool_calls,
                        command_results,
                        changed_files,
                        finish_data,
                        logs,
                        "文件冲突",
                        environment_state,
                        validations,
                        workspace_scan,
                    )
                saved_file = tool_result.get("file") if isinstance(tool_result.get("file"), dict) else None
                if saved_file and saved_file.get("path") not in changed_files:
                    changed_files.append(saved_file["path"])
                if tool_result.get("status") == "saved":
                    last_mutation_index = len(tool_calls)
            elif call["name"] == "finish":
                finish_data = tool_result.get("finish") if isinstance(tool_result.get("finish"), dict) else None
                if not finish_data:
                    return self._tool_loop_result(
                        "failed",
                        tool_calls,
                        command_results,
                        changed_files,
                        finish_data,
                        logs,
                        tool_result.get("error") or "finish 工具返回无效",
                        environment_state,
                        validations,
                        workspace_scan,
                    )
                if (
                    finish_data.get("success")
                    and not self._finish_has_valid_validation(finish_data, validations, last_mutation_index)
                    and not self._finish_allows_validation_skip(step, changed_files, finish_data)
                ):
                    finish_data = {
                        **finish_data,
                        "success": False,
                        "validationRequired": True,
                    }
                    return self._tool_loop_result(
                        "failed",
                        tool_calls,
                        command_results,
                        changed_files,
                        finish_data,
                        logs,
                        "finish(success=true) 前缺少最后一次文件修改后的成功验证命令",
                        environment_state,
                        validations,
                        workspace_scan,
                    )
                return self._tool_loop_result(
                    "completed" if finish_data.get("success") else "failed",
                    tool_calls,
                    command_results,
                    changed_files,
                    finish_data,
                    logs,
                    None if finish_data.get("success") else finish_data.get("summary") or "Agent 标记任务失败",
                    environment_state,
                    validations,
                    workspace_scan,
                )

        return self._tool_loop_result(
            "failed",
            tool_calls,
            command_results,
            changed_files,
            finish_data,
            logs,
            "超过最大沙箱工具调用次数",
            environment_state,
            validations,
            workspace_scan,
        )

    def _build_tool_loop_messages(
        self,
        run_id: str,
        step: Dict[str, Any],
        agent: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        files = list_sandbox_files(run_id)
        file_context = "\n".join(f"- {item['path']} v{item['currentVersion']}" for item in files) or "空工作区"
        run = get_agent_run(run_id)
        environment_profile = (run or {}).get("dag", {}).get("environmentProfile") if run else None
        user_content = (
            f"任务：{step['task']}\n\n"
            f"期望输出：{', '.join(step.get('expectedOutputs') or []) or '自行判断'}\n\n"
            f"环境约束：{_json_text(environment_profile or {'packageManager': 'uv'})}\n\n"
            f"当前文件：\n{file_context}\n\n"
            "请选择一个工具调用。完成时必须调用 finish。"
        )
        return [
            {"role": "system", "content": SANDBOX_EXECUTOR_SYSTEM_PROMPT + "\n\n" + (agent or {}).get("systemPrompt", "")},
            {"role": "user", "content": user_content},
        ]

    async def _emit_command_log(
        self,
        run_id: str,
        step_id: str,
        command_result: Dict[str, Any],
        logs: List[str],
        send: EventEmitter,
        prefix: str = "",
    ) -> None:
        command = command_result.get("command")
        stdout = command_result.get("stdout") or command_result.get("stdoutPreview") or ""
        stderr = command_result.get("stderr") or command_result.get("stderrPreview") or ""
        prompt = f"{prefix} $ {command}".strip()
        log_text = f"{prompt}\n{stdout}\n{stderr}".strip()
        logs.append(log_text)
        await send(
            "run.step.log",
            _run_snapshot_payload(run_id, {"stepId": step_id, "log": log_text, "command": command_result}),
        )

    def _finish_has_valid_validation(
        self,
        finish_data: Dict[str, Any],
        validations: List[Dict[str, Any]],
        last_mutation_index: int,
    ) -> bool:
        validation_id = str(finish_data.get("validationCommandId") or "").strip()
        latest_valid = False
        for validation in validations:
            is_success_after_mutation = (
                bool(validation.get("success"))
                and int(validation.get("toolCallIndex") or 0) > int(last_mutation_index or 0)
            )
            if is_success_after_mutation:
                latest_valid = True
            if validation_id and validation.get("id") == validation_id:
                return is_success_after_mutation
        return latest_valid

    def _finish_allows_validation_skip(
        self,
        step: Dict[str, Any],
        changed_files: List[str],
        finish_data: Dict[str, Any],
    ) -> bool:
        reason = str(finish_data.get("validationSkippedReason") or "").strip()
        if not reason:
            return False
        paths = [str(path).lower() for path in changed_files]
        if not paths:
            paths = [str(path).lower() for path in step.get("expectedOutputs") or []]
        if not paths:
            return False
        doc_suffixes = {".md", ".markdown", ".txt", ".mmd", ".mermaid"}
        return all(Path(path).suffix in doc_suffixes for path in paths)

    async def _next_tool_call(self, messages: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=settings.MODEL_EP,
                messages=messages,
                tools=SANDBOX_TOOL_SPECS,
                tool_choice="auto",
                stream=False,
            )
            message = response.choices[0].message
            native_call = self._extract_native_tool_call(message)
            if native_call:
                messages.append(native_call["assistantMessage"])
                return {k: native_call[k] for k in ("id", "name", "arguments", "native")}
            content = getattr(message, "content", "") or ""
            fallback = self._extract_json_tool_call(content)
            if fallback:
                messages.append({"role": "assistant", "content": content})
                return fallback
        except Exception:
            pass

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=messages,
            stream=False,
        )
        content = response.choices[0].message.content or ""
        fallback = self._extract_json_tool_call(content)
        if fallback:
            messages.append({"role": "assistant", "content": content})
        return fallback

    def _extract_native_tool_call(self, message: Any) -> Optional[Dict[str, Any]]:
        tool_calls = getattr(message, "tool_calls", None) or []
        if not tool_calls:
            return None
        tool_call = tool_calls[0]
        function = getattr(tool_call, "function", None)
        name = getattr(function, "name", "") if function else ""
        arguments_text = getattr(function, "arguments", "{}") if function else "{}"
        try:
            arguments = json.loads(arguments_text or "{}")
        except json.JSONDecodeError:
            arguments = {}
        call_id = getattr(tool_call, "id", None) or create_id("toolCall")
        assistant_message = {
            "role": "assistant",
            "content": getattr(message, "content", None),
            "tool_calls": [
                {
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": _json_text(arguments),
                    },
                }
            ],
        }
        return {
            "id": call_id,
            "name": name,
            "arguments": arguments,
            "native": True,
            "assistantMessage": assistant_message,
        }

    def _extract_json_tool_call(self, content: str) -> Optional[Dict[str, Any]]:
        try:
            payload = _extract_json_object(content)
        except Exception:
            return None
        name = str(payload.get("tool") or payload.get("name") or "").strip()
        arguments = payload.get("arguments") if isinstance(payload.get("arguments"), dict) else {}
        if not name:
            return None
        return {
            "id": create_id("toolCall"),
            "name": name,
            "arguments": arguments,
            "native": False,
        }

    def _append_tool_result_message(
        self,
        messages: List[Dict[str, Any]],
        call: Dict[str, Any],
        result: Dict[str, Any],
    ) -> None:
        content = _json_text(self._prompt_safe_tool_result(result))
        if call.get("native"):
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "name": call["name"],
                "content": content,
            })
        else:
            messages.append({
                "role": "user",
                "content": f"工具 {call['name']} 返回：\n{content}\n请继续选择下一个工具，完成时调用 finish。",
            })

    def _prompt_safe_tool_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        def compact_command(item: Dict[str, Any]) -> Dict[str, Any]:
            return {
                **item,
                "stdout": item.get("stdoutPreview", str(item.get("stdout") or "")[:4000]),
                "stderr": item.get("stderrPreview", str(item.get("stderr") or "")[:4000]),
            }

        safe = dict(result)
        if isinstance(safe.get("command"), dict):
            safe["command"] = compact_command(safe["command"])
        if isinstance(safe.get("commandResults"), list):
            safe["commandResults"] = [
                compact_command(item) if isinstance(item, dict) else item
                for item in safe["commandResults"]
            ]
        return safe

    def _tool_loop_output(
        self,
        tool_calls: List[Dict[str, Any]],
        command_results: List[Dict[str, object]],
        changed_files: List[str],
        finish_data: Optional[Dict[str, Any]],
        environment_state: Optional[Dict[str, Any]] = None,
        validations: Optional[List[Dict[str, Any]]] = None,
        workspace_scan: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        output: Dict[str, Any] = {
            "toolCalls": tool_calls,
            "commandResults": command_results,
            "changedFiles": changed_files,
        }
        if finish_data:
            output["finish"] = finish_data
        if environment_state:
            output["environmentState"] = environment_state
        if validations:
            output["validations"] = validations
        if workspace_scan:
            output["workspaceScan"] = workspace_scan
        return output

    def _tool_loop_result(
        self,
        status: str,
        tool_calls: List[Dict[str, Any]],
        command_results: List[Dict[str, object]],
        changed_files: List[str],
        finish_data: Optional[Dict[str, Any]],
        logs: List[str],
        error: Optional[str],
        environment_state: Optional[Dict[str, Any]] = None,
        validations: Optional[List[Dict[str, Any]]] = None,
        workspace_scan: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "status": status,
            "output": self._tool_loop_output(
                tool_calls,
                command_results,
                changed_files,
                finish_data,
                environment_state,
                validations,
                workspace_scan,
            ),
            "logs": "\n".join(logs),
            "error": error,
        }

    async def _sync_artifacts(self, run_id: str, sandbox: Dict[str, Any], send: EventEmitter) -> None:
        run = get_agent_run(run_id)
        if not run:
            return
        print(f"[SandboxArtifact] sync start run={run_id}", flush=True)
        synced = 0
        for file_meta in list_sandbox_files_changed_by_run(run_id):
            version = get_sandbox_file_version(file_meta["id"], file_meta["currentVersion"])
            if not version or not version.get("content"):
                continue
            artifact_type = _artifact_type_for_path(file_meta["path"])
            metadata = {
                "source": "sandbox",
                "sourceRunId": run_id,
                "sourceSandboxId": sandbox["id"],
                "sourceWorkspaceId": run.get("workspaceId") or sandbox.get("workspaceId"),
                "sourceSandboxFileId": file_meta["id"],
                "sourceFilePath": file_meta["path"],
                "sourceFileVersion": version["version"],
                "sourceContentHash": version["contentHash"],
                "sourceStepId": version.get("createdByStepId"),
            }
            if file_meta.get("artifactId"):
                artifact = update_artifact(
                    file_meta["artifactId"],
                    version["content"],
                    change_summary=f"Run {run_id} 更新 {file_meta['path']}",
                    created_by=run_id,
                    created_by_type="agent",
                    metadata=metadata,
                )
                if not artifact:
                    continue
            else:
                artifact = create_artifact(
                    conversation_id=run["conversationId"],
                    title=file_meta["path"],
                    artifact_type=artifact_type,
                    content=version["content"],
                    run_id=run_id,
                    description=f"Run {run_id} 输出文件",
                    created_by=run_id,
                    created_by_type="agent",
                    metadata=metadata,
                )
                set_sandbox_file_artifact(file_meta["id"], artifact["id"])
            synced += 1
            print(
                f"[SandboxArtifact] created run={run_id} path={file_meta['path']} "
                f"type={artifact_type} artifact={artifact['id']}",
                flush=True,
            )
            artifact_meta = {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}
            await send(
                "artifact.created",
                _run_snapshot_payload(
                    run_id,
                    {
                        "conversationId": run["conversationId"],
                        "artifactId": artifact_meta.get("id"),
                        "artifact": artifact_meta,
                    },
                ),
            )
        print(f"[SandboxArtifact] sync done run={run_id} count={synced}", flush=True)


def _artifact_type_for_path(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".html", ".htm"}:
        return "html"
    if suffix in {".md", ".markdown"}:
        return "markdown"
    if suffix in {".mmd", ".mermaid"}:
        return "mermaid"
    if suffix == ".pdf":
        return "pdf"
    if suffix in {".ppt", ".pptx"}:
        return "ppt"
    if suffix in {".doc", ".docx"}:
        return "document"
    if suffix in {".xls", ".xlsx", ".csv"}:
        return "spreadsheet"
    if suffix in {".txt", ".log"}:
        return "text"
    return "code"


def get_agent_run_step_payload(step_id: str) -> Optional[Dict[str, Any]]:
    from app.database import get_agent_run_step

    return get_agent_run_step(step_id)
