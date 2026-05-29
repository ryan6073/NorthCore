import asyncio
import json
import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

from openai import OpenAI

from app.config import settings
from app.core.orchestrator import AGENT_NAME_TO_ID
from app.database import (
    create_artifact,
    get_agent,
    get_agent_run,
    get_agent_run_detail,
    get_sandbox,
    get_sandbox_file_version,
    list_agent_run_steps,
    list_sandbox_files,
    list_sandbox_conflicts,
    set_sandbox_file_artifact,
    update_agent_run,
    update_agent_run_step,
    update_sandbox,
)
from app.services.file_version_service import FileVersionService
from app.services.sandbox_service import SandboxService

EventEmitter = Callable[[str, Dict[str, Any]], Awaitable[None]]

client = OpenAI(api_key=settings.ARK_API_KEY, base_url=settings.ARK_BASE_URL)

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

STEP_OUTPUT_SYSTEM_PROMPT = """你是 AgentHub 沙箱里的执行 Agent。
你需要根据任务在空工作区中产出文件，或修改已有文件。
你不能访问网络。你可以声明需要在容器里运行的验证命令。

必须只输出 JSON：
{
  "summary": "本步骤完成了什么",
  "files": [
    {
      "path": "README.md",
      "baseVersion": 0,
      "content": "完整文件内容"
    }
  ],
  "commands": [
    "python --version"
  ]
}
规则：
- path 必须是相对路径，不能以 / 开头，不能包含 ..
- 修改已有文件时 baseVersion 必须等于当前文件版本。
- 新建文件 baseVersion 使用 0。
- commands 可为空数组，只放安全、短时的验证命令。
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


def _run_snapshot_payload(run_id: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
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
                await send("run.failed", _run_snapshot_payload(run_id, {"status": "failed", "failedSteps": failed_steps}))
            elif conflicts:
                update_agent_run(run_id, status="conflict", summary="任务完成但存在文件冲突", mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="conflict")
                await send("run.failed", _run_snapshot_payload(run_id, {"status": "conflict", "conflicts": conflicts}))
            else:
                update_agent_run(run_id, status="completed", summary="沙箱任务完成", mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="completed")
                await send("run.completed", _run_snapshot_payload(run_id))
        except Exception as exc:
            update_agent_run(run_id, status="failed", error=str(exc), mark_finished=True)
            await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId"), final_status="failed")
            update_sandbox(sandbox["id"], status="failed", error=str(exc))
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
                    await send("run.step.failed", _run_snapshot_payload(run_id, {"step": get_agent_run_step_payload(step["id"])}))

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
        await send("run.step.started", _run_snapshot_payload(run_id, {"step": get_agent_run_step_payload(step["id"])}))
        try:
            output = await self._call_step_agent(run_id, step, agent)
            logs: List[str] = []
            conflict_count = 0
            for file_payload in output.get("files", []):
                if not isinstance(file_payload, dict):
                    continue
                path = str(file_payload.get("path") or "").strip()
                if not path or path.startswith("/") or ".." in Path(path).parts:
                    continue
                content = str(file_payload.get("content") or "")
                try:
                    base_version = int(file_payload.get("baseVersion", 0))
                except (TypeError, ValueError):
                    base_version = 0
                result = self.file_service.write_file(
                    sandbox=sandbox,
                    run_id=run_id,
                    path=path,
                    content=content,
                    base_version=base_version,
                    step_id=step["id"],
                )
                if result["status"] == "conflict":
                    conflict_count += 1
                    await send(
                        "run.step.conflict",
                        _run_snapshot_payload(run_id, {"stepId": step["id"], "conflict": result["conflict"]}),
                    )
                else:
                    logs.append(f"saved {path} v{result['version']['version']}")

            command_results = []
            for command in output.get("commands", []):
                if not isinstance(command, str) or not command.strip():
                    continue
                result = await self.sandbox_service.execute(container_id, command.strip())
                command_results.append(result)
                log_text = f"$ {command}\n{result['stdout']}\n{result['stderr']}".strip()
                await send("run.step.log", _run_snapshot_payload(run_id, {"stepId": step["id"], "log": log_text, "command": result}))
                if result["exitCode"] != 0:
                    raise RuntimeError(f"命令执行失败: {command}")

            step_output = {**output, "commandResults": command_results}
            if conflict_count:
                update_agent_run_step(
                    step["id"],
                    status="conflict",
                    output=step_output,
                    append_log="\n".join(logs),
                    error=f"{conflict_count} 个文件冲突",
                    mark_finished=True,
                )
                return

            update_agent_run_step(
                step["id"],
                status="completed",
                output=step_output,
                append_log="\n".join(logs),
                mark_finished=True,
            )
            await send("run.step.completed", _run_snapshot_payload(run_id, {"step": get_agent_run_step_payload(step["id"])}))
        except Exception as exc:
            update_agent_run_step(step["id"], status="failed", error=str(exc), mark_finished=True)
            await send(
                "run.step.failed",
                _run_snapshot_payload(run_id, {"step": get_agent_run_step_payload(step["id"]), "error": str(exc)}),
            )

    async def _call_step_agent(self, run_id: str, step: Dict[str, Any], agent: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        files = list_sandbox_files(run_id)
        file_context = "\n".join(f"- {item['path']} v{item['currentVersion']}" for item in files) or "空工作区"
        user_content = (
            f"任务：{step['task']}\n\n"
            f"期望输出：{', '.join(step.get('expectedOutputs') or []) or '自行判断'}\n\n"
            f"当前文件：\n{file_context}"
        )
        messages = [
            {"role": "system", "content": STEP_OUTPUT_SYSTEM_PROMPT + "\n\n" + (agent or {}).get("systemPrompt", "")},
            {"role": "user", "content": user_content},
        ]
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=messages,
            stream=False,
        )
        content = response.choices[0].message.content or ""
        try:
            return _extract_json_object(content)
        except json.JSONDecodeError as exc:
            return _fallback_step_output(content, step, exc)

    async def _sync_artifacts(self, run_id: str, sandbox: Dict[str, Any], send: EventEmitter) -> None:
        run = get_agent_run(run_id)
        if not run:
            return
        for file_meta in list_sandbox_files(run_id):
            if file_meta.get("artifactId"):
                continue
            version = get_sandbox_file_version(file_meta["id"], file_meta["currentVersion"])
            if not version or not version.get("content"):
                continue
            artifact_type = _artifact_type_for_path(file_meta["path"])
            artifact = create_artifact(
                conversation_id=run["conversationId"],
                title=file_meta["path"],
                artifact_type=artifact_type,
                content=version["content"],
                run_id=run_id,
                description=f"Run {run_id} 输出文件",
                created_by=run_id,
                created_by_type="agent",
                metadata={
                    "source": "sandbox",
                    "sourceRunId": run_id,
                    "sourceSandboxId": sandbox["id"],
                    "sourceSandboxFileId": file_meta["id"],
                    "sourceFilePath": file_meta["path"],
                    "sourceFileVersion": version["version"],
                    "sourceContentHash": version["contentHash"],
                    "sourceStepId": version.get("createdByStepId"),
                },
            )
            set_sandbox_file_artifact(file_meta["id"], artifact["id"])
            artifact_meta = {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}
            await send(
                "artifact.created",
                _run_snapshot_payload(
                    run_id,
                    {
                        "conversationId": run["conversationId"],
                        "artifact": artifact_meta,
                    },
                ),
            )


def _artifact_type_for_path(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".html", ".htm"}:
        return "html"
    if suffix in {".md", ".markdown"}:
        return "markdown"
    if suffix in {".mmd", ".mermaid"}:
        return "mermaid"
    return "code"


def get_agent_run_step_payload(step_id: str) -> Optional[Dict[str, Any]]:
    from app.database import get_agent_run_step

    return get_agent_run_step(step_id)
