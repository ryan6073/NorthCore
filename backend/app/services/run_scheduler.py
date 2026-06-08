import asyncio
import json
import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import quote

from app.config import settings
from app.core.llm_client import client
from app.core.orchestrator import AGENT_NAME_TO_ID
from app.database import (
    create_artifact,
    create_id,
    create_message,
    get_agent,
    get_agent_run,
    get_agent_run_detail,
    get_artifact,
    get_conversation,
    get_sandbox,
    get_sandbox_file_version,
    get_user,
    list_agent_run_steps,
    list_artifacts_for_run,
    list_sandbox_files_changed_by_run,
    list_sandbox_files,
    list_sandbox_conflicts,
    heartbeat_workspace_mutation_lock,
    is_workspace_mutation_lock_current,
    now_text,
    release_workspace_mutation_lock,
    retry_chain_cancelled,
    retry_root_run_id_for_run,
    rollback_sandbox_files_for_run,
    set_sandbox_file_artifact,
    update_artifact,
    update_agent_run,
    update_agent_run_step,
    update_conversation_activity,
    update_sandbox,
)
from app.services.file_version_service import FileVersionService
from app.services.office_file_service import (
    is_legacy_office_path,
    is_openxml_office_path,
    validate_openxml_office_file,
)
from app.services.dag_step_policy import (
    normalize_step_mutation_fields,
    step_mutation_mode,
    step_read_paths,
    step_target_paths,
    steps_compatible,
)
from app.services.sandbox_service import SandboxService
from app.services.sandbox_tools import SANDBOX_TOOL_SPECS, SandboxToolExecutor
from app.services.secret_path_service import is_sensitive_workspace_path
from app.services.workspace_sync_service import sync_workspace_files
from app.services.workspace_agents_service import read_workspace_agents_context, write_workspace_agents_file
from app.services.workspace_index_service import rebuild_workspace_index_for_run

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
      "expectedOutputs": ["README.md"],
      "mutationMode": "write",
      "targetPaths": ["README.md"],
      "readPaths": [],
      "usesStableSnapshot": false,
      "writeToolOnly": true
    }
  ]
}
要求：
- step 数量 1-8 个。
- 如果任务能并行，dependsOn 为空。
- 如果审查依赖生成，审查 step 依赖生成 step。
- 每个 step 必须输出 mutationMode、targetPaths、readPaths、usesStableSnapshot、writeToolOnly。
- review/解释/检查/只读分析标记 mutationMode=read，填写 readPaths，不允许写文件。
- 生成/修改/运行命令/部署准备标记 mutationMode=write，尽量填写 targetPaths。
- 无法预测文件名或自由 runtime 写入时，targetPaths=[]，由后端按整个 workspace 写 lane 串行处理。
- 只有确认 write step 不需要 setup_environment/run_command/validate_command、只用 write_file/import_workspace_file 即可完成时，writeToolOnly=true；否则必须为 false。
- 用户只说“生成 PPT / 做一个 ppt / 帮我生成演示文稿”时，默认目标是真实 .pptx Office 文件，必须分配给 agent-claude-code 单步生成 .pptx。
- 只有用户明确说“PPT 大纲/文稿/Markdown”时，才分配给 agent-document 生成 .md 大纲。
- 只有用户明确说“网页 PPT/HTML/reveal.js/浏览器演示”时，才生成 .html 演示页面。
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
- import_workspace_file：把 /workspace 实际 UTF-8 文本文件导入版本系统，后续才能同步 Artifact。
- read_file：读取 workspace 内相对路径文件。
- write_file：写入完整文件内容，必须携带 baseVersion；更新已存在文件前必须先 read_file，并使用返回的 currentVersion 作为 baseVersion。baseVersion=0 只允许新建文件。
- run_command：执行普通非交互命令。
- validate_command：执行显式验证命令并返回 validationId。
- finish：结束 step，提交 success/failure、summary、changedFiles、nextActions。

核心规则：
- 工具执行成功不等于任务完成，必须基于文件内容、命令结果和日志判断是否真正达成任务目标。
- 复杂任务先 inspect_environment，再 read_dependency_manifest；需要依赖时先 setup_environment，再修改/执行/验证。
- 默认 Python 环境使用 uv；只有任务或项目文档明确要求 conda/poetry/pipenv 时才使用它们。
- Python 任务需要第三方依赖时，依赖必须由 workspace 项目环境管理：优先调用 setup_environment，传入 packageManager="uv"、createPythonEnv=true、dependencies=["包名"]；或先创建/维护 pyproject.toml，再用 uv add/uv run。不要在业务脚本里写 pip install/subprocess 自动安装逻辑。
- Python 脚本运行统一优先使用 uv run python <script.py>；matplotlib/绘图任务使用 Agg 后端并保存图片文件，不要依赖 GUI 弹窗。
- setup_environment 成功只代表环境准备完成，不代表任务成功；必须再执行 pytest、npm run build 或等价验证后才能 finish success。
- 如果命令生成了文件，必须先 scan_workspace；UTF-8 文本文件再 import_workspace_file，图片、压缩包等二进制文件不要 import，只在 summary/changedFiles 中说明其 workspace 路径。
- 用户要求 Office 文件时，只生成真实 .pptx/.docx/.xlsx，不生成老式 .ppt/.doc/.xls。
- PPT 使用 python-pptx 生成 .pptx；Word 使用 python-docx 生成 .docx；Excel 使用 openpyxl 生成 .xlsx。需要依赖时先 setup_environment 安装对应依赖。
- 禁止把 Markdown、纯文本或 HTML 写入 .ppt/.pptx/.doc/.docx/.xls/.xlsx 后缀。PPT 大纲/文稿用 .md，可演示网页 PPT 用 .html。
- Office 文件生成后必须 validate_command 验证能被对应 Python 库打开：pptx.Presentation、docx.Document、openpyxl.load_workbook，并检查至少有一页/一段或表格/一个 worksheet。
- 二进制 Office 文件不要 import_workspace_file；scan_workspace 后在 finish.changedFiles 中写 workspace 相对路径即可。
- finish(success=true) 必须在最后一次文件修改后完成验证；优先使用 validate_command，成功的 run_command 也可作为验证依据。纯文档或纯静态展示型前端产物如果没有可运行环境，可以携带 validationSkippedReason 说明内容自检结果。
- 纯静态 HTML/CSS/JS 任务不要调用 setup_environment；直接写文件，并通过文件完整性和内容自检完成验证。
- 纯静态 HTML/CSS/JS 可用 validate_command 做轻量验证，例如 `test -s index.html`、`node --check src/app.js`、`find . -maxdepth 3 -type f`；如果环境没有 node/npm 且只是静态文件修改，finish(success=true) 必须填写 validationSkippedReason。
- Python/Node/带 package.json 的项目必须执行命令验证。
- 命令必须非交互，不能屏蔽 stderr，例如不要使用 2>/dev/null。
- 耗时命令不要直接通过管道接 head/tail/grep 截断；需要筛选日志时先写入文件，再读取文件。
- 文件路径必须是相对路径，不能以 / 开头，不能包含 ..
- 覆盖 README.md、配置、源码等已存在文件时，必须根据 read_file 读到的原内容进行增量更新，不要用 baseVersion=0 直接重写。
- 写文件强制流程：
  1. 新建文件：可以直接 write_file(path, content, baseVersion=0)。
  2. 修改已有文件：必须先 read_file(path)，读取 currentVersion 和原始 content；然后基于原始 content 生成完整新内容；最后 write_file(path, fullContent, baseVersion=currentVersion)。
  3. write_file 必须写入完整文件内容，不允许只写 diff、片段、说明文字或补丁。
  4. write_file 返回 ok=false 时，必须读取 error/status 并修正后重试；不能在 write_file 失败后 finish(success=true)。
  5. 如果 write_file 返回 requires_read，必须立刻 read_file 对应 path，并用返回的 currentVersion 重新 write_file。
  6. 如果 write_file 返回权限、路径、targetPaths 或 mutation lock 错误，不要反复盲目重试，应 finish(success=false) 并说明失败原因。
  7. finish(success=true) 前必须确认至少一次目标文件 write_file/import_workspace_file 成功，并且 changedFiles 包含实际写入路径。
- 失败后根据日志修复，不能盲目 finish success。
- 完成时必须调用 finish。finish.summary 只写 1-2 句中文结果，控制在 120 字以内；只说明改了什么、是否验证通过，不要输出 Markdown 标题、分章节报告、逐项清单或大段功能介绍。

如果当前模型不支持原生 function calling，则输出一个 JSON 对象作为降级工具调用：
{"tool": "write_file", "arguments": {"path": "README.md", "content": "...", "baseVersion": 1}}
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
            if Path(candidate).suffix.lower() in {".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx"}:
                return f"{Path(candidate).stem or 'office-output'}.md"
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
            "artifacts": list_artifacts_for_run(run_id),
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
    target_paths = [path for path in [_safe_output_path("README.md")] if path]
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
                "mutationMode": "write",
                "targetPaths": target_paths,
                "readPaths": [],
                "usesStableSnapshot": False,
                "writeToolOnly": False,
            }
        ],
    }


def _plain_pptx_request(prompt: str) -> bool:
    text = str(prompt or "")
    lowered = text.lower()
    if not any(marker in lowered for marker in ("ppt", "pptx", "powerpoint")) and "演示文稿" not in text:
        return False
    outline_markers = ("大纲", "提纲", "markdown", ".md")
    web_markers = ("网页", "html", "reveal", "浏览器", "web")
    return not any(marker in lowered for marker in outline_markers) and not any(marker in lowered for marker in web_markers)


def _force_plain_pptx_dag_if_needed(
    dag: Dict[str, Any],
    prompt: str,
    allowed: set[str],
) -> Dict[str, Any]:
    if not _plain_pptx_request(prompt) or "agent-claude-code" not in allowed:
        return dag
    return {
        "summary": "生成真实 PPTX 演示文稿",
        "steps": [
            {
                "id": "step-1",
                "agentId": "agent-claude-code",
                "agentName": _agent_name_for_id("agent-claude-code"),
                "task": (
                    "请根据用户需求生成一个真实可下载的 .pptx Office 演示文稿。"
                    "必须使用 python-pptx 生成 .pptx，不要生成 reveal.js、HTML、Markdown 大纲或 .ppt 老格式。"
                    f"用户需求：{prompt}"
                ),
                "dependsOn": [],
                "expectedOutputs": ["演示文稿.pptx"],
                "mutationMode": "write",
                "targetPaths": ["演示文稿.pptx"],
                "readPaths": [],
                "usesStableSnapshot": False,
                "writeToolOnly": False,
            }
        ],
    }


def _artifact_publish_paths_for_action_context(action_context: Dict[str, Any]) -> set[str]:
    paths = {
        str(item.get("path"))
        for item in action_context.get("targetFiles") or []
        if isinstance(item, dict) and item.get("path")
    }
    paths.update(str(path) for path in action_context.get("allowedRelatedFiles") or [] if path)
    paths.update(
        str(item.get("path"))
        for item in action_context.get("candidateTargets") or []
        if isinstance(item, dict) and item.get("path")
    )
    return paths


def normalize_dag(
    payload: Dict[str, Any],
    prompt: str,
    allowed_agent_ids: Optional[List[str]] = None,
    agent_name_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    allowed_list = list(dict.fromkeys(allowed_agent_ids or [
        "agent-chat",
        "agent-translator",
        "agent-mermaid",
        "agent-document",
        "agent-claude-code",
        "agent-codex",
    ]))
    allowed = set(allowed_list)
    fallback_agent_id = allowed_list[0] if allowed_list else "agent-claude-code"
    name_map = agent_name_map or {}
    raw_steps = payload.get("steps") if isinstance(payload, dict) else None
    if not isinstance(raw_steps, list) or not raw_steps:
        fallback = _fallback_dag(prompt, fallback_agent_id)
        return _force_plain_pptx_dag_if_needed(fallback, prompt, allowed)

    normalized: List[Dict[str, Any]] = []
    used_ids = set()
    for index, step in enumerate(raw_steps[:8], start=1):
        if not isinstance(step, dict):
            continue
        step_id = str(step.get("id") or f"step-{index}").strip()
        if not step_id or step_id in used_ids:
            step_id = f"step-{index}"
        used_ids.add(step_id)
        agent_id = str(step.get("agentId") or AGENT_NAME_TO_ID.get(str(step.get("agentName") or ""), "")).strip()
        if agent_id not in allowed:
            agent_id = "agent-claude-code" if "agent-claude-code" in allowed else fallback_agent_id
        task = str(step.get("task") or prompt).strip()
        depends_on = step.get("dependsOn") if isinstance(step.get("dependsOn"), list) else []
        expected_outputs = step.get("expectedOutputs") if isinstance(step.get("expectedOutputs"), list) else []
        mutation_fields = normalize_step_mutation_fields(
            {
                **step,
                "task": task,
                "expectedOutputs": expected_outputs,
            },
            prompt,
        )
        normalized.append({
            "id": step_id,
            "agentId": agent_id,
            "agentName": str(name_map.get(agent_id) or _agent_name_for_id(agent_id)),
            "task": task,
            "dependsOn": [str(dep) for dep in depends_on],
            "expectedOutputs": [str(item) for item in expected_outputs],
            **mutation_fields,
        })

    valid_ids = {step["id"] for step in normalized}
    for step in normalized:
        step["dependsOn"] = [dep for dep in step["dependsOn"] if dep in valid_ids and dep != step["id"]]
    if not normalized:
        fallback = _fallback_dag(prompt, fallback_agent_id)
        return _force_plain_pptx_dag_if_needed(fallback, prompt, allowed)
    dag = {
        "summary": str(payload.get("summary") or "沙箱任务").strip(),
        "steps": normalized,
    }
    return _force_plain_pptx_dag_if_needed(dag, prompt, allowed)


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
        self.max_parallel_steps = max(1, int(max_parallel_steps or settings.SANDBOX_MAX_PARALLEL_STEPS or 1))
        self._progress_message_keys: set[str] = set()

    def _step_can_start_with_running(self, step: Dict[str, Any], running_steps: List[Dict[str, Any]]) -> bool:
        return all(steps_compatible(step, running_step) for running_step in running_steps)

    def _is_invalid_tool_call(self, call: Dict[str, Any], tool_result: Dict[str, Any]) -> bool:
        if tool_result.get("ok"):
            return False
        name = str(call.get("name") or "")
        arguments = call.get("arguments") if isinstance(call.get("arguments"), dict) else {}
        if not arguments:
            return True
        required_keys = {
            "read_workspace_file": {"path"},
            "import_workspace_file": {"path"},
            "read_file": {"path"},
            "write_file": {"path", "content", "baseVersion"},
            "run_command": {"command"},
            "validate_command": {"command"},
        }.get(name)
        if required_keys and any(key not in arguments for key in required_keys):
            return True
        status = str(tool_result.get("status") or "")
        if status in {"blocked_office_text_write", "blocked_office_text_import", "requires_read", "invalid_tool_arguments"}:
            return True
        error = str(tool_result.get("error") or "")
        return "非法文件路径" in error

    def _finish_office_error(
        self,
        sandbox: Dict[str, Any],
        changed_files: List[str],
        finish_data: Dict[str, Any],
    ) -> Optional[str]:
        paths = list(changed_files)
        finish_changed_files = finish_data.get("changedFiles") if isinstance(finish_data.get("changedFiles"), list) else []
        paths.extend([str(item) for item in finish_changed_files])
        workspace_root = Path(str(sandbox.get("workspacePath") or "")).resolve()
        for raw_path in dict.fromkeys(paths):
            path = str(raw_path or "").strip().replace("\\", "/")
            if not path:
                continue
            if is_legacy_office_path(path):
                return f"不支持生成老式 Office 文件：{path}，请改为生成 .pptx/.docx/.xlsx"
            if not is_openxml_office_path(path):
                continue
            candidate = (workspace_root / path).resolve()
            try:
                candidate.relative_to(workspace_root)
            except ValueError:
                return f"Office 文件路径非法：{path}"
            office_error = validate_openxml_office_file(candidate)
            if office_error:
                return f"{path} 校验失败：{office_error}"
        return None

    def _step_agent_identity(self, step: Dict[str, Any]) -> tuple[str, str, str]:
        agent_id = str(step.get("agentId") or "agent-claude-code")
        agent_name = str(step.get("agentName") or _agent_name_for_id(agent_id) or "Agent")
        return agent_id, agent_name, "agent"

    def _progress_dedupe_key(
        self,
        run_id: str,
        step_id: str,
        phase: str,
        tool_name: Optional[str] = None,
    ) -> str:
        if phase in {"tool_started", "tool_completed", "tool_failed"}:
            bucket = self._tool_progress_bucket(tool_name or "")
            return f"{run_id}:{step_id}:{phase}:{bucket}"
        return f"{run_id}:{step_id}:{phase}"

    def _tool_progress_bucket(self, tool_name: str) -> str:
        if tool_name in {"inspect_environment", "read_dependency_manifest", "list_files", "scan_workspace", "read_workspace_file", "read_file"}:
            return "inspect"
        if tool_name in {"write_file", "import_workspace_file"}:
            return "write"
        if tool_name in {"run_command", "validate_command", "setup_environment"}:
            return tool_name
        if tool_name == "finish":
            return "finish"
        return tool_name or "tool"

    def _tool_progress_content(
        self,
        agent_name: str,
        phase: str,
        tool_name: str,
        metadata: Dict[str, Any],
    ) -> str:
        command = str(metadata.get("command") or "").strip()
        changed_file_count = int(metadata.get("changedFileCount") or 0)
        if phase == "tool_failed":
            return f"我执行 {tool_name} 时遇到问题。"
        if tool_name in {"inspect_environment", "read_dependency_manifest", "list_files", "scan_workspace", "read_workspace_file", "read_file"}:
            return "我正在查看工作区文件和依赖配置。"
        if tool_name in {"write_file", "import_workspace_file"}:
            if changed_file_count > 0:
                return f"我已更新 {changed_file_count} 个文件。"
            return "我正在更新工作区文件。"
        if tool_name == "setup_environment":
            return "我正在准备运行环境。"
        if tool_name in {"run_command", "validate_command"}:
            if command:
                return f"我正在运行 `{command[:160]}`。"
            return "我正在运行验证命令。"
        if tool_name == "finish":
            return "我正在整理本步骤结果。"
        return f"我正在执行 {tool_name}。"

    async def _send_step_progress_message(
        self,
        run_id: str,
        step: Dict[str, Any],
        phase: str,
        content: str,
        send: EventEmitter,
        metadata: Optional[Dict[str, Any]] = None,
        *,
        dedupe: bool = True,
        finish_reason: str = "stop",
    ) -> Optional[Dict[str, Any]]:
        run = get_agent_run(run_id)
        if not run or not run.get("conversationId"):
            return None
        step_id = str(step.get("id") or "")
        if not step_id:
            return None
        tool_name = str((metadata or {}).get("toolName") or "")
        dedupe_key = self._progress_dedupe_key(run_id, step_id, phase, tool_name)
        if dedupe and dedupe_key in self._progress_message_keys:
            return None
        if dedupe:
            self._progress_message_keys.add(dedupe_key)

        sender_id, sender_name, role = self._step_agent_identity(step)
        message_metadata = {
            "source": "sandboxRunProgress",
            "sourceRunId": run_id,
            "runId": run_id,
            "stepId": step_id,
            "phase": phase,
            "readOnly": True,
            **(metadata or {}),
        }
        message = create_message(
            conversation_id=run["conversationId"],
            sender_id=sender_id,
            sender_name=sender_name,
            role=role,
            msg_type="status",
            content=content,
            metadata=message_metadata,
        )
        update_conversation_activity(run["conversationId"], content)
        await send(
            "conversation.message.completed",
            {
                "conversationId": run["conversationId"],
                "messageId": message["id"],
                "finishReason": finish_reason,
                "fullMessage": message,
                "metadata": message_metadata,
            },
        )
        return message

    async def _send_tool_progress_message(
        self,
        run_id: str,
        step: Dict[str, Any],
        phase: str,
        tool_name: str,
        send: EventEmitter,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        _, agent_name, _ = self._step_agent_identity(step)
        merged_metadata = {"toolName": tool_name, **(metadata or {})}
        content = self._tool_progress_content(agent_name, phase, tool_name, merged_metadata)
        return await self._send_step_progress_message(
            run_id,
            step,
            phase,
            content,
            send,
            merged_metadata,
        )

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

        heartbeat_stop = asyncio.Event()
        lock_token = run.get("lockFencingToken")
        lock_lost = False
        active_container_id: Optional[str] = None

        async def heartbeat_loop() -> None:
            nonlocal lock_lost, active_container_id
            if run.get("runMode") not in {"write", "deploy"} or not run.get("workspaceId") or not lock_token:
                return
            while not heartbeat_stop.is_set():
                try:
                    await asyncio.wait_for(heartbeat_stop.wait(), timeout=30)
                    break
                except asyncio.TimeoutError:
                    ok = heartbeat_workspace_mutation_lock(
                        run["workspaceId"],
                        "run",
                        run_id,
                        int(lock_token),
                    )
                    if not ok:
                        lock_lost = True
                        print(f"[WorkspaceMutationLock] heartbeat lost run={run_id}", flush=True)
                        latest_sandbox = get_sandbox(sandbox["id"])
                        container_to_stop = (latest_sandbox or {}).get("containerId") or active_container_id
                        if container_to_stop:
                            await self.sandbox_service.stop_container(
                                sandbox["id"],
                                container_to_stop,
                                final_status="failed",
                            )
                        break

        heartbeat_task = asyncio.create_task(heartbeat_loop())

        try:
            print(f"[SandboxRun] scheduler start run={run_id}", flush=True)
            if run.get("runMode") in {"write", "deploy"} and not is_workspace_mutation_lock_current(
                str(run.get("workspaceId") or ""),
                "run",
                run_id,
                int(lock_token or 0),
            ):
                update_agent_run(
                    run_id,
                    status="failed",
                    error="workspace mutation lock is not current",
                    mark_finished=True,
                )
                return
            update_agent_run(run_id, status="running", mark_started=True)
            update_sandbox(sandbox["id"], status="starting")
            await send("run.created", _run_snapshot_payload(run_id))
            container_id = await self.sandbox_service.start_container(sandbox["id"], sandbox["workspacePath"])
            active_container_id = container_id
            sandbox = get_sandbox(sandbox["id"])
            await self._run_dag(run_id, sandbox, container_id, send)
            if lock_lost or (
                run.get("runMode") in {"write", "deploy"}
                and not is_workspace_mutation_lock_current(str(run.get("workspaceId") or ""), "run", run_id, int(lock_token or 0))
            ):
                raise RuntimeError("workspace mutation lock lost during run")
            current_run = get_agent_run(run_id)
            if current_run and (current_run["status"] == "cancelled" or self._retry_chain_cancelled(run_id)):
                update_sandbox(sandbox["id"], status="cancelled")
                payload = _run_snapshot_payload(
                    run_id,
                    {"status": "cancelled", "summary": "用户已取消", "autoRetryCancelled": True},
                )
                await send("run.cancelled", payload)
                await send("run.updated", payload)
                await send("conversation.all_tasks.completed", payload)
                return
            steps = list_agent_run_steps(run_id)
            failed_steps = [step for step in steps if step["status"] in {"failed", "blocked"}]
            conflicts = [item for item in list_sandbox_conflicts(run_id) if item["status"] == "open"]
            if conflicts:
                summary = "任务完成但存在文件冲突"
                update_agent_run(run_id, status="conflict", summary=summary, mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="conflict")
                print(f"[SandboxRun] conflict run={run_id} conflicts={len(conflicts)}", flush=True)
                payload = _run_snapshot_payload(run_id, {"status": "conflict", "summary": summary, "conflicts": conflicts, "artifacts": list_artifacts_for_run(run_id), "artifactChanges": [], "rollbackChanges": []})
                await self._send_run_summary_message(run_id, "conflict", summary, [], [], conflicts, send, rollback_changes=[])
                await send("run.failed", payload)
                await send("run.updated", payload)
                await send("conversation.all_tasks.completed", payload)
            elif failed_steps:
                summary = (
                    "任务需要补充信息"
                    if all(step.get("status") == "blocked" for step in failed_steps)
                    else "任务部分步骤失败"
                )
                rollback_changes = self._rollback_run_changes(run_id, sandbox)
                update_agent_run(run_id, status="failed", summary=summary, mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="failed")
                print(f"[SandboxRun] failed run={run_id} failedSteps={len(failed_steps)} rollbackFiles={len(rollback_changes)}", flush=True)
                payload = _run_snapshot_payload(run_id, {"status": "failed", "summary": summary, "failedSteps": failed_steps, "artifacts": list_artifacts_for_run(run_id), "artifactChanges": [], "rollbackChanges": rollback_changes})
                await self._send_run_summary_message(run_id, "failed", summary, [], failed_steps, [], send, rollback_changes=rollback_changes)
                await send("run.failed", payload)
                await send("run.updated", payload)
                if not await self._continue_failed_run(run_id, "blocked" if summary == "任务需要补充信息" else "failed", summary, emit):
                    await send("conversation.all_tasks.completed", payload)
            else:
                if self._retry_chain_cancelled(run_id):
                    update_agent_run(run_id, status="cancelled", summary="用户已取消", mark_finished=True)
                    update_sandbox(sandbox["id"], status="cancelled")
                    payload = _run_snapshot_payload(
                        run_id,
                        {"status": "cancelled", "summary": "用户已取消", "autoRetryCancelled": True},
                    )
                    await send("run.cancelled", payload)
                    await send("run.updated", payload)
                    await send("conversation.all_tasks.completed", payload)
                    return
                if run.get("runMode") in {"write", "deploy"} and not is_workspace_mutation_lock_current(
                    str(run.get("workspaceId") or ""),
                    "run",
                    run_id,
                    int(lock_token or 0),
                ):
                    raise RuntimeError("workspace mutation lock lost before workspace sync")
                try:
                    synced_workspace_files = sync_workspace_files(
                        sandbox,
                        run_id,
                        created_by_step_id=None,
                    )
                    print(
                        f"[WorkspaceSync] run={run_id} syncedFiles={len(synced_workspace_files)}",
                        flush=True,
                    )
                except Exception as sync_exc:
                    print(f"❌ [WorkspaceSync] failed run={run_id} error={sync_exc}", flush=True)
                artifact_changes = await self._sync_artifacts(run_id, sandbox, send)
                if self._retry_chain_cancelled(run_id):
                    update_agent_run(run_id, status="cancelled", summary="用户已取消", mark_finished=True)
                    update_sandbox(sandbox["id"], status="cancelled")
                    payload = _run_snapshot_payload(
                        run_id,
                        {"status": "cancelled", "summary": "用户已取消", "autoRetryCancelled": True},
                    )
                    await send("run.cancelled", payload)
                    await send("run.updated", payload)
                    await send("conversation.all_tasks.completed", payload)
                    return
                await rebuild_workspace_index_for_run(run_id, artifact_changes)
                agents_file = write_workspace_agents_file(run.get("workspaceId") or "")
                if agents_file:
                    synced_agents_files = sync_workspace_files(
                        sandbox,
                        run_id,
                        created_by_step_id=None,
                    )
                    print(
                        f"[WorkspaceAgents] run={run_id} path={agents_file['path']} syncedFiles={len(synced_agents_files)}",
                        flush=True,
                    )
                run_artifacts = list_artifacts_for_run(run_id)
                summary = "沙箱任务完成"
                update_agent_run(run_id, status="completed", summary=summary, mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId") or container_id, final_status="completed")
                print(f"[SandboxRun] completed run={run_id}", flush=True)
                payload = _run_snapshot_payload(run_id, {"status": "completed", "summary": summary, "artifacts": run_artifacts, "artifactChanges": artifact_changes})
                await self._send_run_summary_message(run_id, "completed", summary, artifact_changes, [], [], send)
                await send("run.completed", payload)
                await send("run.updated", payload)
                await send("conversation.all_tasks.completed", payload)
        except Exception as exc:
            if self._retry_chain_cancelled(run_id):
                update_agent_run(run_id, status="cancelled", summary="用户已取消", mark_finished=True)
                await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId"), final_status="cancelled")
                update_sandbox(sandbox["id"], status="cancelled")
                payload = _run_snapshot_payload(
                    run_id,
                    {"status": "cancelled", "summary": "用户已取消", "autoRetryCancelled": True},
                )
                await send("run.cancelled", payload)
                await send("run.updated", payload)
                await send("conversation.all_tasks.completed", payload)
                return
            rollback_changes = self._rollback_run_changes(run_id, sandbox) if sandbox else []
            update_agent_run(run_id, status="failed", error=str(exc), mark_finished=True)
            await self.sandbox_service.stop_container(sandbox["id"], sandbox.get("containerId"), final_status="failed")
            update_sandbox(sandbox["id"], status="failed", error=str(exc))
            print(f"[SandboxRun] exception run={run_id} error={exc} rollbackFiles={len(rollback_changes)}", flush=True)
            payload = _run_snapshot_payload(
                run_id,
                {
                    "status": "failed",
                    "summary": "沙箱任务异常失败",
                    "error": str(exc),
                    "artifacts": list_artifacts_for_run(run_id),
                    "artifactChanges": [],
                    "rollbackChanges": rollback_changes,
                },
            )
            await self._send_run_summary_message(run_id, "failed", "沙箱任务异常失败", [], [], [], send, rollback_changes=rollback_changes)
            await send("run.failed", payload)
            await send("run.updated", payload)
            if not await self._continue_failed_run(run_id, "failed", "沙箱任务异常失败", emit):
                await send("conversation.all_tasks.completed", payload)
        finally:
            heartbeat_stop.set()
            await heartbeat_task
            latest_run = get_agent_run(run_id) or run
            if latest_run.get("runMode") in {"write", "deploy"} and latest_run.get("workspaceId") and latest_run.get("lockFencingToken"):
                release_result = release_workspace_mutation_lock(
                    latest_run["workspaceId"],
                    "run",
                    run_id,
                    int(latest_run.get("lockFencingToken") or 0),
                )
                if release_result.get("released"):
                    update_agent_run(run_id, queued_reason="", lock_owner_id="", lock_fencing_token=0)
                    await send("workspace.mutation_lock.released", {"lock": release_result.get("lock")})
                from app.services.run_service import schedule_next_workspace_mutation_owner

                await schedule_next_workspace_mutation_owner(release_result.get("nextOwner"))

    async def _continue_failed_run(
        self,
        run_id: str,
        status: str,
        summary: str,
        emit: Optional[EventEmitter],
    ) -> bool:
        if status in {"conflict", "blocked"}:
            return False
        if not settings.SANDBOX_AUTO_RETRY_ENABLED:
            return False
        run = get_agent_run_detail(run_id)
        if not run:
            return False
        if self._retry_chain_cancelled(run_id):
            return False
        owner_user_id = str(run.get("ownerUserId") or "").strip()
        if not owner_user_id:
            return False
        metadata = run.get("runtimeMetadata") if isinstance(run.get("runtimeMetadata"), dict) else {}
        current_attempt = self._safe_retry_attempt(metadata.get("retryAttempt"))
        max_attempts = max(0, int(settings.SANDBOX_AUTO_RETRY_MAX_ATTEMPTS or 0))
        retry_root_run_id = str(metadata.get("retryRootRunId") or run_id).strip()

        async def broadcast(event_type: str, data: Dict[str, Any]) -> None:
            if emit:
                await emit(event_type, data)

        current_user = get_user(owner_user_id) or {"id": owner_user_id}
        if current_attempt < max_attempts:
            next_attempt = current_attempt + 1
            await broadcast(
                "run.retry.scheduled",
                {
                    "runId": run_id,
                    "conversationId": run.get("conversationId"),
                    "workspaceId": run.get("workspaceId"),
                    "retryRootRunId": retry_root_run_id,
                    "retryOfRunId": run_id,
                    "retryAttempt": next_attempt,
                    "maxRetryAttempts": max_attempts,
                    "status": status,
                    "summary": summary,
                    "message": f"系统正在自动重试 {next_attempt}/{max_attempts}...",
                },
            )
            if self._retry_chain_cancelled(run_id):
                return False
            try:
                from app.services.run_service import retry_agent_run

                result = await retry_agent_run(
                    current_user=current_user,
                    run_id=run_id,
                    emit=broadcast,
                    auto_retry=True,
                    max_retry_attempts=max_attempts,
                )
                retry_run = result.get("run") or {}
                await broadcast(
                    "run.retry.created",
                    {
                        "runId": retry_run.get("id"),
                        "conversationId": retry_run.get("conversationId") or run.get("conversationId"),
                        "workspaceId": retry_run.get("workspaceId") or run.get("workspaceId"),
                        "retryRootRunId": result.get("retryRootRunId") or retry_root_run_id,
                        "retryOfRunId": run_id,
                        "retryAttempt": result.get("retryAttempt") or next_attempt,
                        "maxRetryAttempts": max_attempts,
                        "run": retry_run,
                    },
                )
                return True
            except Exception as exc:
                print(f"❌ [SandboxRetry] auto retry failed run={run_id} error={exc}", flush=True)
                summary = f"自动重试创建失败：{exc}"

        exhausted_by_attempts = current_attempt >= max_attempts
        exhausted_message = (
            f"已自动重试 {max_attempts} 次仍失败，正在生成兜底结果..."
            if exhausted_by_attempts
            else "自动重试无法继续创建，正在生成兜底结果..."
        )
        if self._retry_chain_cancelled(run_id):
            return False
        await broadcast(
            "run.retry.exhausted",
            {
                "runId": run_id,
                "conversationId": run.get("conversationId"),
                "workspaceId": run.get("workspaceId"),
                "retryRootRunId": retry_root_run_id,
                "retryAttempt": current_attempt,
                "maxRetryAttempts": max_attempts,
                "status": status,
                "summary": summary,
                "reason": "max_attempts" if exhausted_by_attempts else "retry_creation_failed",
                "message": exhausted_message,
            },
        )
        if self._retry_chain_cancelled(run_id):
            return False
        await broadcast(
            "run.retry.fallback.started",
            {
                "runId": run_id,
                "conversationId": run.get("conversationId"),
                "workspaceId": run.get("workspaceId"),
                "retryRootRunId": retry_root_run_id,
                "maxRetryAttempts": max_attempts,
            },
        )
        if self._retry_chain_cancelled(run_id):
            return False
        try:
            from app.services.run_service import create_retry_fallback_message

            await create_retry_fallback_message(
                current_user=current_user,
                final_run_id=run_id,
                emit=broadcast,
                max_retry_attempts=max_attempts,
            )
        except Exception as exc:
            print(f"❌ [SandboxRetryFallback] failed run={run_id} error={exc}", flush=True)
            await broadcast(
                "conversation.all_tasks.completed",
                {
                    "conversationId": run.get("conversationId"),
                    "runId": run_id,
                    "status": "failed",
                    "retryExhausted": True,
                    "fallbackError": str(exc),
                },
            )
        return True

    def _safe_retry_attempt(self, value: Any) -> int:
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return 0

    def _retry_chain_cancelled(self, run_id: str) -> bool:
        run = get_agent_run(run_id)
        if not run:
            return False
        if run.get("status") == "cancelled":
            return True
        return retry_chain_cancelled(
            retry_root_run_id_for_run(run),
            owner_user_id=run.get("ownerUserId"),
        )

    async def _run_dag(self, run_id: str, sandbox: Dict[str, Any], container_id: str, send: EventEmitter) -> None:
        running: Dict[str, Dict[str, Any]] = {}
        while True:
            run = get_agent_run(run_id)
            if run and (run["status"] == "cancelled" or self._retry_chain_cancelled(run_id)):
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
                    await self._send_step_progress_message(
                        run_id,
                        step,
                        "blocked",
                        f"{step.get('agentName') or _agent_name_for_id(step.get('agentId'))} 暂停执行：依赖步骤未成功完成。",
                        send,
                        {"error": "依赖步骤未成功完成"},
                    )
                    await send("run.step.failed", _run_snapshot_payload(run_id, {"stepId": step["id"], "step": get_agent_run_step_payload(step["id"])}))

            steps = list_agent_run_steps(run_id)
            ready = [
                step for step in steps
                if step["status"] == "pending"
                and all(dep in completed_ids for dep in step["dependsOn"])
                and step["id"] not in running
            ]
            capacity = max(0, self.max_parallel_steps - len(running))
            for step in ready:
                if capacity <= 0:
                    break
                running_steps = [
                    item["step"]
                    for item in running.values()
                    if isinstance(item.get("step"), dict)
                ]
                if not self._step_can_start_with_running(step, running_steps):
                    continue
                task = asyncio.create_task(self._execute_step(run_id, sandbox, container_id, step, send))
                running[step["id"]] = {"task": task, "step": step}
                capacity -= 1

            if not running:
                await asyncio.sleep(0.2)
                continue
            done, _ = await asyncio.wait(
                [item["task"] for item in running.values()],
                timeout=0.2,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                step_id = next((key for key, value in running.items() if value.get("task") is task), None)
                if step_id:
                    running.pop(step_id, None)
                await task

    def _build_run_summary_content(
        self,
        run_id: str,
        status: str,
        summary: str,
        artifact_changes: List[Dict[str, Any]],
        failed_steps: List[Dict[str, Any]],
        conflicts: List[Dict[str, Any]],
        rollback_changes: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        status_label = {
            "completed": "已完成",
            "failed": "执行失败",
            "conflict": "存在文件冲突",
        }.get(status, status)
        steps = list_agent_run_steps(run_id)
        run = get_agent_run(run_id)
        prompt = str((run or {}).get("prompt") or "").strip()
        lines = [f"任务{status_label}。"]
        if prompt:
            lines.extend(["", f"本次需求：{prompt[:300]}"])
        step_summaries = []
        validation_lines = []
        for step in steps:
            output = step.get("output") if isinstance(step.get("output"), dict) else {}
            finish = output.get("finish") if isinstance(output.get("finish"), dict) else {}
            finish_summary = str(finish.get("summary") or "").strip()
            if step.get("status") == "completed" and finish_summary:
                step_summaries.append(f"- {step.get('agentName') or step.get('agentId')}: {finish_summary[:180]}")
            validations = output.get("validations") if isinstance(output.get("validations"), list) else []
            for validation in validations:
                if not isinstance(validation, dict):
                    continue
                command = validation.get("command") or (validation.get("result") or {}).get("command")
                if command:
                    mark = "通过" if validation.get("success") else "失败"
                    validation_lines.append(f"- `{command}`：{mark}")
        if step_summaries:
            lines.extend(["", "本次完成：", *step_summaries[:6]])
        elif summary:
            lines.extend(["", f"本次完成：{summary}"])
        if artifact_changes:
            created = []
            updated = []
            for change in artifact_changes[:12]:
                artifact = change.get("artifact") or {}
                action = "更新" if change.get("action") == "updated" else "生成"
                title = artifact.get("title") or change.get("filePath") or artifact.get("id") or "未命名产物"
                version_text = f"v{change.get('newVersion')}" if change.get("newVersion") else ""
                previous = f"（原 v{change.get('previousVersion')}）" if change.get("previousVersion") else ""
                item = f"- {action} `{title}` {version_text}{previous}"
                if change.get("action") == "updated":
                    updated.append(item)
                else:
                    created.append(item)
            if updated:
                lines.extend(["", "修改/更新：", *updated])
            if created:
                lines.extend(["", "新生成：", *created])
        else:
            lines.extend(["", "产物变更：无"])
        if validation_lines:
            lines.extend(["", "验证：", *validation_lines[:8]])
        if failed_steps:
            blocked_steps = [step for step in failed_steps if step.get("status") == "blocked"]
            error_steps = [step for step in failed_steps if step.get("status") != "blocked"]
            if blocked_steps:
                lines.extend(["", "需要补充信息："])
                for step in blocked_steps[:8]:
                    lines.append(f"- `{step.get('id')}`：{step.get('error') or step.get('task') or '需要补充任务条件'}")
            if error_steps:
                lines.extend(["", "失败步骤："])
                for step in error_steps[:8]:
                    lines.append(f"- `{step.get('id')}`：{step.get('error') or step.get('task') or '步骤失败'}")
        if conflicts:
            lines.extend(["", "需要处理的冲突："])
            for conflict in conflicts[:8]:
                lines.append(
                    f"- `{conflict.get('filePath')}`：当前版本 v{conflict.get('currentVersion')}，"
                    f"写入基线 v{conflict.get('baseVersion')}"
                )
        if rollback_changes:
            lines.extend(["", "已回滚本次失败任务的文件改动："])
            for item in rollback_changes[:12]:
                action = "删除新文件" if item.get("action") == "deleted" else f"恢复到 v{item.get('restoredVersion')}"
                lines.append(f"- `{item.get('path')}`：{action}")
        return "\n".join(lines)

    async def _send_run_summary_message(
        self,
        run_id: str,
        status: str,
        summary: str,
        artifact_changes: List[Dict[str, Any]],
        failed_steps: List[Dict[str, Any]],
        conflicts: List[Dict[str, Any]],
        send: EventEmitter,
        rollback_changes: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        run = get_agent_run(run_id)
        if not run:
            return None
        sender_id, sender_name, role = self._run_summary_sender(run_id, run)
        content = self._build_run_summary_content(
            run_id,
            status,
            summary,
            artifact_changes,
            failed_steps,
            conflicts,
            rollback_changes=rollback_changes,
        )
        message = create_message(
            conversation_id=run["conversationId"],
            sender_id=sender_id,
            sender_name=sender_name,
            role=role,
            msg_type="text",
            content=content,
            metadata={
                "source": "sandboxRunSummary",
                "sourceRunId": run_id,
                "status": status,
                "artifactChanges": artifact_changes,
                "failedStepIds": [step.get("id") for step in failed_steps],
                "conflictIds": [item.get("id") for item in conflicts],
                "rollbackChanges": rollback_changes or [],
            },
        )
        update_conversation_activity(run["conversationId"], content)
        await send(
            "conversation.message.completed",
            {
                "conversationId": run["conversationId"],
                "messageId": message["id"],
                "finishReason": "stop",
                "fullMessage": message,
            },
        )
        return message

    def _run_summary_sender(self, run_id: str, run: Dict[str, Any]) -> tuple[str, str, str]:
        conversation = get_conversation(run["conversationId"])
        if conversation and conversation.get("mode") == "group":
            return "agent-orchestrator", "Orchestrator", "orchestrator"

        steps = list_agent_run_steps(run_id)
        agent_id = next(
            (
                str(step.get("agentId"))
                for step in steps
                if step.get("agentId") and str(step.get("agentId")) != "agent-orchestrator"
            ),
            "",
        )
        agent = get_agent(agent_id, owner_user_id=(conversation or {}).get("ownerUserId")) if agent_id else None
        if not agent and conversation:
            agent_id = next(
                (
                    str(item)
                    for item in conversation.get("agentIds") or []
                    if str(item) != "agent-orchestrator"
                ),
                "",
            )
            agent = get_agent(agent_id, owner_user_id=conversation.get("ownerUserId")) if agent_id else None
        if agent:
            return agent["id"], agent.get("name") or "Agent", "agent"
        return "system", "系统", "system"

    def _rollback_run_changes(self, run_id: str, sandbox: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        try:
            changes = rollback_sandbox_files_for_run(run_id)
        except Exception as exc:
            print(f"❌ [WorkspaceRollback] db rollback failed run={run_id} error={exc}", flush=True)
            return []
        raw_workspace_path = str((sandbox or {}).get("workspacePath") or "").strip()
        if not raw_workspace_path:
            return changes
        workspace_path = Path(raw_workspace_path)
        try:
            workspace_root = workspace_path.resolve()
            for item in changes:
                relative_path = str(item.get("path") or "")
                if not relative_path:
                    continue
                file_path = (workspace_root / relative_path).resolve()
                if workspace_root not in file_path.parents and file_path != workspace_root:
                    continue
                if item.get("action") == "deleted":
                    if file_path.exists() and file_path.is_file():
                        file_path.unlink()
                    continue
                content = item.get("content")
                if isinstance(content, str):
                    file_path.parent.mkdir(parents=True, exist_ok=True)
                    file_path.write_text(content, encoding="utf-8")
        except Exception as exc:
            print(f"❌ [WorkspaceRollback] fs rollback failed run={run_id} error={exc}", flush=True)
        return [{key: value for key, value in item.items() if key != "content"} for item in changes]

    async def _execute_step(
        self,
        run_id: str,
        sandbox: Dict[str, Any],
        container_id: str,
        step: Dict[str, Any],
        send: EventEmitter,
    ) -> None:
        from app.services.sandbox_step_service import execute_sandbox_step

        await execute_sandbox_step(self, run_id, sandbox, container_id, step, send)

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
        invalid_tool_call_count = 0
        rejected_finish_count = 0
        active_tool_name = {"name": ""}
        run = get_agent_run(run_id) or {}
        action_context = (run.get("dag") or {}).get("workspaceActionContext") or {}
        step_task_text = str(step.get("task") or "")
        step_agent_id = str(step.get("agentId") or "")
        mutation_mode = step_mutation_mode(step)
        declared_target_paths = set(step_target_paths(step))
        review_markers = ("review", "code review", "审查", "评审", "验证", "检查", "报告")
        requires_target_mutation = (
            mutation_mode == "write"
            and action_context.get("action") == "modify_existing"
            and bool(declared_target_paths)
            and step_agent_id != "agent-codex"
            and not any(marker in step_task_text.lower() or marker in step_task_text for marker in review_markers)
        )
        action_target_paths = {
            str(item.get("path"))
            for item in action_context.get("targetFiles") or []
            if isinstance(item, dict) and item.get("path")
        }
        required_target_paths = (
            declared_target_paths.intersection(action_target_paths)
            or declared_target_paths
        ) if requires_target_mutation else set()

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
            agent=agent,
        )
        messages = self._build_tool_loop_messages(run_id, step, agent)

        for iteration in range(settings.SANDBOX_MAX_TOOL_ITERATIONS):
            if self._retry_chain_cancelled(run_id):
                return self._tool_loop_result(
                    "cancelled",
                    tool_calls,
                    command_results,
                    changed_files,
                    finish_data,
                    logs,
                    "用户已取消",
                    environment_state,
                    validations,
                    workspace_scan,
                )
            call = await self._next_tool_call(messages)
            if self._retry_chain_cancelled(run_id):
                return self._tool_loop_result(
                    "cancelled",
                    tool_calls,
                    command_results,
                    changed_files,
                    finish_data,
                    logs,
                    "用户已取消",
                    environment_state,
                    validations,
                    workspace_scan,
                )
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
            await self._send_tool_progress_message(
                run_id,
                step,
                "tool_started",
                call["name"],
                send,
                {
                    "toolCallId": call["id"],
                    "iteration": iteration + 1,
                    "command": str(call["arguments"].get("command") or "").strip(),
                    "path": str(call["arguments"].get("path") or "").strip(),
                },
            )
            if self._retry_chain_cancelled(run_id):
                return self._tool_loop_result(
                    "cancelled",
                    tool_calls,
                    command_results,
                    changed_files,
                    finish_data,
                    logs,
                    "用户已取消",
                    environment_state,
                    validations,
                    workspace_scan,
                )
            try:
                active_tool_name["name"] = call["name"]
                tool_result = await executor.execute(call["name"], call["arguments"])
            except Exception as exc:
                tool_result = {"ok": False, "error": str(exc)}
            finally:
                active_tool_name["name"] = ""
            if self._retry_chain_cancelled(run_id):
                return self._tool_loop_result(
                    "cancelled",
                    tool_calls,
                    command_results,
                    changed_files,
                    finish_data,
                    logs,
                    "用户已取消",
                    environment_state,
                    validations,
                    workspace_scan,
                )
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
            tool_changed_files = tool_result.get("changedFiles") if isinstance(tool_result.get("changedFiles"), list) else []
            for changed_path in tool_changed_files:
                path_text = str(changed_path or "").strip()
                if path_text and path_text not in changed_files:
                    changed_files.append(path_text)
            if tool_changed_files and call["name"] in {"run_command", "validate_command"}:
                last_mutation_index = len(tool_calls)

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
            if not tool_result.get("ok"):
                if self._is_invalid_tool_call(call, tool_result):
                    invalid_tool_call_count += 1
                    if invalid_tool_call_count >= 3:
                        return self._tool_loop_result(
                            "failed",
                            tool_calls,
                            command_results,
                            changed_files,
                            finish_data,
                            logs,
                            "模型连续 3 次发起无效工具调用，已停止本步骤",
                            environment_state,
                            validations,
                            workspace_scan,
                        )
                else:
                    invalid_tool_call_count = 0
                await self._send_tool_progress_message(
                    run_id,
                    step,
                    "tool_failed",
                    call["name"],
                    send,
                    {
                        "toolCallId": call["id"],
                        "iteration": iteration + 1,
                        "error": str(tool_result.get("error") or "").strip(),
                    },
                )
            else:
                invalid_tool_call_count = 0

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
                    await self._send_tool_progress_message(
                        run_id,
                        step,
                        "tool_completed",
                        call["name"],
                        send,
                        {
                            "toolCallId": call["id"],
                            "path": saved_file.get("path") if saved_file else call["arguments"].get("path"),
                            "changedFiles": changed_files[:20],
                            "changedFileCount": len(changed_files),
                        },
                    )
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
                if saved_file:
                    await self._send_tool_progress_message(
                        run_id,
                        step,
                        "tool_completed",
                        call["name"],
                        send,
                        {
                            "toolCallId": call["id"],
                            "path": saved_file.get("path"),
                            "changedFiles": changed_files[:20],
                            "changedFileCount": len(changed_files),
                        },
                    )
                # Importing a generated workspace file only syncs an existing file
                # into the version DB. It should not invalidate a validation command
                # that already produced or checked that file.
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
                if finish_data.get("success"):
                    office_finish_error = self._finish_office_error(sandbox, changed_files, finish_data)
                    if office_finish_error:
                        rejected_finish_count += 1
                        finish_data = {
                            **finish_data,
                            "success": False,
                            "officeValidationRequired": True,
                            "officeValidationError": office_finish_error,
                        }
                        if rejected_finish_count >= 2:
                            return self._tool_loop_result(
                                "failed",
                                tool_calls,
                                command_results,
                                changed_files,
                                finish_data,
                                logs,
                                office_finish_error,
                                environment_state,
                                validations,
                                workspace_scan,
                            )
                        if iteration + 1 < settings.SANDBOX_MAX_TOOL_ITERATIONS:
                            messages.append({
                                "role": "user",
                                "content": (
                                    f"finish 被后端拒绝：{office_finish_error}。"
                                    "请使用 python-pptx/python-docx/openpyxl 生成真实 .pptx/.docx/.xlsx，"
                                    "并调用 validate_command 验证文件可被对应库打开。"
                                ),
                            })
                            update_agent_run_step(
                                step["id"],
                                status="running",
                                output=self._tool_loop_output(
                                    tool_calls,
                                    command_results,
                                    changed_files,
                                    finish_data,
                                    environment_state,
                                    validations,
                                    workspace_scan,
                                ),
                            )
                            continue
                        return self._tool_loop_result(
                            "failed",
                            tool_calls,
                            command_results,
                            changed_files,
                            finish_data,
                            logs,
                            office_finish_error,
                            environment_state,
                            validations,
                            workspace_scan,
                        )
                if (
                    finish_data.get("success")
                    and required_target_paths
                    and not required_target_paths.intersection(set(changed_files))
                ):
                    rejected_finish_count += 1
                    finish_data = {
                        **finish_data,
                        "success": False,
                        "targetMutationRequired": True,
                        "requiredTargetFiles": sorted(required_target_paths),
                        "actualChangedFiles": list(changed_files),
                    }
                    if rejected_finish_count >= 2:
                        return self._tool_loop_result(
                            "failed",
                            tool_calls,
                            command_results,
                            changed_files,
                            finish_data,
                            logs,
                            "finish 被连续拒绝，模型未实际写入目标文件",
                            environment_state,
                            validations,
                            workspace_scan,
                        )
                    if iteration + 1 < settings.SANDBOX_MAX_TOOL_ITERATIONS:
                        messages.append({
                            "role": "user",
                            "content": (
                                "finish 被后端拒绝：finish(success=true) 前没有实际写入任何 targetFiles。"
                                "请继续使用 read_file/write_file 修改 requiredTargetFiles 中的目标文件；"
                                "如果目标文件已存在，必须先 read_file 获取 currentVersion，再 write_file 使用该 currentVersion；"
                                "不能用 baseVersion=0 覆盖已有文件；"
                                "changedFiles 必须包含实际成功写入的路径；"
                                "完成后运行验证命令或填写合理的 validationSkippedReason，再重新调用 finish。"
                            ),
                        })
                        update_agent_run_step(
                            step["id"],
                            status="running",
                            output=self._tool_loop_output(
                                tool_calls,
                                command_results,
                                changed_files,
                                finish_data,
                                environment_state,
                                validations,
                                workspace_scan,
                            ),
                        )
                        continue
                    return self._tool_loop_result(
                        "failed",
                        tool_calls,
                        command_results,
                        changed_files,
                        finish_data,
                        logs,
                        "finish(success=true) 前没有实际写入任何 targetFiles，不能仅通过 changedFiles 声明完成修改",
                        environment_state,
                        validations,
                        workspace_scan,
                    )
                if (
                    finish_data.get("success")
                    and not self._finish_has_valid_validation(finish_data, validations, last_mutation_index)
                    and not self._finish_allows_validation_skip(step, changed_files, finish_data)
                ):
                    rejected_finish_count += 1
                    finish_data = {
                        **finish_data,
                        "success": False,
                        "validationRequired": True,
                    }
                    if rejected_finish_count >= 2:
                        return self._tool_loop_result(
                            "failed",
                            tool_calls,
                            command_results,
                            changed_files,
                            finish_data,
                            logs,
                            "finish 被连续拒绝，模型未按要求完成验证",
                            environment_state,
                            validations,
                            workspace_scan,
                        )
                    if iteration + 1 < settings.SANDBOX_MAX_TOOL_ITERATIONS:
                        messages.append({
                            "role": "user",
                            "content": (
                                "finish 被后端拒绝：finish(success=true) 前缺少最后一次文件修改后的成功验证命令。"
                                "请继续调用 validate_command，或用成功的 run_command 验证修改结果；"
                                "如果这是纯静态 HTML/CSS/JS 或纯文档任务且没有可运行环境，请重新调用 finish 并填写 validationSkippedReason。"
                            ),
                        })
                        update_agent_run_step(
                            step["id"],
                            status="running",
                            output=self._tool_loop_output(
                                tool_calls,
                                command_results,
                                changed_files,
                                finish_data,
                                environment_state,
                                validations,
                                workspace_scan,
                            ),
                        )
                        continue
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
        file_context = "\n".join(
            f"- {item['path']} v{item['currentVersion']} hash={item.get('contentHash') or ''} artifactId={item.get('artifactId') or '-'}"
            for item in files
        ) or "空工作区"
        run = get_agent_run(run_id)
        environment_profile = (run or {}).get("dag", {}).get("environmentProfile") if run else None
        action_context = (run or {}).get("dag", {}).get("workspaceActionContext") if run else None
        workspace_context = read_workspace_agents_context((run or {}).get("workspaceId") if run else None)
        if workspace_context:
            print(
                f"[WorkspaceAgentsContext] stage=run.step run={run_id} step={step.get('id')}\n{workspace_context}",
                flush=True,
            )
        runtime_metadata = step.get("runtimeMetadata") if isinstance(step.get("runtimeMetadata"), dict) else {}
        task = str(runtime_metadata.get("executionTask") or step.get("task") or "")
        step_access = {
            "mutationMode": step.get("mutationMode") or runtime_metadata.get("mutationMode") or "unknown",
            "targetPaths": step_target_paths(step),
            "readPaths": step_read_paths(step),
            "usesStableSnapshot": bool(step.get("usesStableSnapshot") or runtime_metadata.get("usesStableSnapshot")),
            "writeToolOnly": bool(step.get("writeToolOnly") or runtime_metadata.get("writeToolOnly")),
        }
        user_content = (
            f"任务：{task}\n\n"
            f"期望输出：{', '.join(step.get('expectedOutputs') or []) or '自行判断'}\n\n"
            f"Step Access Declaration：\n{_json_text(step_access)}\n\n"
            f"环境约束：{_json_text(environment_profile or {'packageManager': 'uv'})}\n\n"
            f"AGENTS.md 项目上下文：\n{workspace_context or '暂无'}\n\n"
            f"Workspace Action Context：\n{_json_text(action_context or {'action': 'create_new'})}\n\n"
            f"当前文件：\n{file_context}\n\n"
            "如果 action=modify_existing，必须先 read_file 读取目标文件，再 write_file 写回；"
            "如果 candidateTargets 包含 feature，先读取 targetFiles，并按需读取 allowedRelatedFiles 中同一功能的测试、样式、配置或入口文件；"
            "finish.changedFiles 只是总结字段，不能替代 write_file；未实际 write_file 保存 targetFiles 时任务会失败；"
            "如果 mutationMode=write 且 targetPaths 非空，只能写入 targetPaths 覆盖的路径；"
            "如果 writeToolOnly=true，只能使用 write_file/import_workspace_file，不能调用 setup_environment/run_command/validate_command；"
            "如果需要写入未声明路径，必须先停止并说明 targetPaths 声明不足，不能绕过后端校验；"
            "默认只修改 targetFiles 和 allowedRelatedFiles，不要凭空新建重复文件。请选择一个工具调用。完成时必须调用 finish。"
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
        paths = [str(path).lower() for path in changed_files]
        if not paths:
            paths = [str(path).lower() for path in step.get("expectedOutputs") or []]
        if not paths:
            return False
        doc_suffixes = {".md", ".markdown", ".txt", ".mmd", ".mermaid"}
        if all(Path(path).suffix in doc_suffixes for path in paths):
            return True

        skip_reason = str(finish_data.get("validationSkippedReason") or "").strip()
        suffixes = {Path(path).suffix for path in paths}
        static_frontend_suffixes = {".html", ".htm", ".css", ".js", ".md", ".markdown", ".txt"}
        code_project_markers = {
            "package.json",
            "vite.config.js",
            "vite.config.ts",
            "webpack.config.js",
            "tsconfig.json",
            "pyproject.toml",
            "requirements.txt",
        }
        has_project_marker = any(Path(path).name in code_project_markers for path in paths)
        has_static_html = any(Path(path).suffix in {".html", ".htm"} for path in paths)
        has_only_static_frontend_files = suffixes.issubset(static_frontend_suffixes)
        if has_static_html and has_only_static_frontend_files and not has_project_marker:
            return True
        return bool(skip_reason) and has_only_static_frontend_files and not has_project_marker

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
        correction = self._tool_argument_correction_message(call, result)
        if call.get("native"):
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "name": call["name"],
                "content": content,
            })
            if correction:
                messages.append({"role": "user", "content": correction})
        else:
            messages.append({
                "role": "user",
                "content": f"工具 {call['name']} 返回：\n{content}\n{correction or '请继续选择下一个工具，完成时调用 finish。'}",
            })

    def _tool_argument_correction_message(self, call: Dict[str, Any], result: Dict[str, Any]) -> str:
        if result.get("status") != "invalid_tool_arguments":
            return ""
        tool_name = str(call.get("name") or "")
        expected = result.get("expectedArguments") if isinstance(result.get("expectedArguments"), dict) else {}
        if tool_name == "write_file":
            return (
                "刚才 write_file 的 arguments 是空对象或缺少必填字段，必须重新调用 write_file，"
                "不要调用 finish。正确格式："
                '{"tool":"write_file","arguments":{"path":"index.html","content":"完整文件内容","baseVersion":0}}。'
                "如果是修改已有文件，先调用 read_file(path)，再用 read_file 返回的 currentVersion 作为 baseVersion。"
            )
        return (
            f"刚才 {tool_name} 的 arguments 缺少必填字段，必须重新调用该工具，arguments 示例："
            f"{_json_text(expected)}。不要传空对象 {{}}。"
        )

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
        extra_changed_files = [
            record.get("result", {}).get("extraChangedFile")
            for record in tool_calls
            if isinstance(record.get("result"), dict) and isinstance(record.get("result", {}).get("extraChangedFile"), dict)
        ]
        for record in tool_calls:
            result = record.get("result") if isinstance(record.get("result"), dict) else {}
            items = result.get("extraChangedFiles") if isinstance(result.get("extraChangedFiles"), list) else []
            extra_changed_files.extend([item for item in items if isinstance(item, dict)])
        if extra_changed_files:
            output["extraChangedFiles"] = extra_changed_files
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

    def _artifact_candidate_paths_for_run(self, run_id: str) -> set[str]:
        paths: set[str] = set()

        def add_path(value: Any) -> None:
            raw_path = ""
            if isinstance(value, dict):
                raw_path = str(value.get("path") or value.get("filePath") or "").strip()
            elif isinstance(value, str):
                raw_path = value.strip()
            if not raw_path:
                return
            clean_path = _safe_output_path(raw_path)
            if clean_path:
                paths.add(clean_path)

        for step in list_agent_run_steps(run_id):
            output = step.get("output") if isinstance(step.get("output"), dict) else {}
            for path in output.get("changedFiles") or []:
                add_path(path)
            for file_item in output.get("files") or []:
                add_path(file_item)
            finish = output.get("finish") if isinstance(output.get("finish"), dict) else {}
            for path in finish.get("changedFiles") or []:
                add_path(path)
        return paths

    async def _sync_artifacts(self, run_id: str, sandbox: Dict[str, Any], send: EventEmitter) -> List[Dict[str, Any]]:
        run = get_agent_run(run_id)
        if not run:
            return []
        print(f"[SandboxArtifact] sync start run={run_id}", flush=True)
        synced = 0
        artifact_changes: List[Dict[str, Any]] = []
        artifact_messages: List[Dict[str, Any]] = []
        action_context = (run.get("dag") or {}).get("workspaceActionContext") or {}
        is_modify_existing = action_context.get("action") == "modify_existing"
        target_paths = _artifact_publish_paths_for_action_context(action_context)
        target_artifacts = {str(item) for item in action_context.get("targetArtifacts") or []}
        target_artifact_by_path = {
            str(item.get("path")): str(item.get("artifactId"))
            for item in action_context.get("targetFiles") or []
            if isinstance(item, dict) and item.get("path") and item.get("artifactId")
        }
        if len(target_paths) == 1 and len(target_artifacts) == 1:
            target_artifact_by_path.setdefault(next(iter(target_paths)), next(iter(target_artifacts)))
        candidate_paths = self._artifact_candidate_paths_for_run(run_id)
        for file_meta in list_sandbox_files_changed_by_run(run_id):
            if is_sensitive_workspace_path(file_meta.get("path")):
                print(
                    f"[SandboxArtifact] skip sensitive path run={run_id} path={file_meta.get('path')}",
                    flush=True,
                )
                continue
            version = get_sandbox_file_version(file_meta["id"], file_meta["currentVersion"])
            is_declared_output = str(file_meta.get("path") or "") in candidate_paths
            if not version and not is_declared_output:
                continue
            if version and not version.get("createdByStepId") and not is_declared_output:
                continue
            target_artifact_id = target_artifact_by_path.get(file_meta["path"])
            if target_artifact_id and not file_meta.get("artifactId"):
                file_meta = set_sandbox_file_artifact(file_meta["id"], target_artifact_id) or file_meta
            if is_modify_existing and not file_meta.get("artifactId") and file_meta.get("path") not in target_paths:
                continue
            workspace_file_path = (Path(sandbox["workspacePath"]).resolve() / str(file_meta["path"])).resolve()
            try:
                workspace_file_path.relative_to(Path(sandbox["workspacePath"]).resolve())
            except ValueError:
                print(
                    f"[SandboxArtifact] skip unsafe path run={run_id} path={file_meta['path']}",
                    flush=True,
                )
                continue
            if is_legacy_office_path(file_meta["path"]):
                print(
                    f"[SandboxArtifact] skip legacy office run={run_id} path={file_meta['path']}",
                    flush=True,
                )
                continue
            if is_openxml_office_path(file_meta["path"]):
                office_error = validate_openxml_office_file(workspace_file_path)
                if office_error:
                    print(
                        f"[SandboxArtifact] skip invalid office run={run_id} "
                        f"path={file_meta['path']} error={office_error}",
                        flush=True,
                    )
                    continue
            artifact_type = _artifact_type_for_path(file_meta["path"])
            artifact_content = version.get("content") or (
                f"[Binary Artifact]\n"
                f"path={file_meta['path']}\n"
                f"mimeType={file_meta.get('mimeType')}\n"
                f"size={file_meta.get('size')}\n"
                f"sha256={file_meta.get('sha256') or file_meta.get('contentHash')}\n"
            ) if version else (
                f"[Binary Artifact]\n"
                f"path={file_meta['path']}\n"
                f"mimeType={file_meta.get('mimeType')}\n"
                f"size={file_meta.get('size')}\n"
                f"sha256={file_meta.get('sha256') or file_meta.get('contentHash')}\n"
            )
            source_version = int((version or {}).get("version") or file_meta.get("currentVersion") or 0)
            source_content_hash = str((version or {}).get("contentHash") or file_meta.get("sha256") or file_meta.get("contentHash") or "")
            source_step_id = (version or {}).get("createdByStepId")
            metadata = {
                "source": "sandbox",
                "sourceConversationId": run.get("conversationId"),
                "sourceRunId": run_id,
                "sourceSandboxId": sandbox["id"],
                "sourceWorkspaceId": run.get("workspaceId") or sandbox.get("workspaceId"),
                "sourceSandboxFileId": file_meta["id"],
                "sourceFilePath": file_meta["path"],
                "filePath": file_meta["path"],
                "sourceFileVersion": source_version,
                "sourceContentHash": source_content_hash,
                "sourceStepId": source_step_id,
                "mimeType": file_meta.get("mimeType"),
                "size": file_meta.get("size"),
                "sha256": file_meta.get("sha256"),
                "isText": file_meta.get("isText"),
                "contentPreview": file_meta.get("contentPreview"),
                "downloadUrl": f"/api/v1/runs/{run_id}/files/{quote(str(file_meta['path']), safe='/')}/download",
                "previewable": bool(file_meta.get("isText")),
            }
            if file_meta.get("artifactId"):
                action = "updated"
                previous_artifact = get_artifact(file_meta["artifactId"])
                previous_version = previous_artifact.get("latestVersion") if previous_artifact else None
                artifact = update_artifact(
                    file_meta["artifactId"],
                    artifact_content,
                    change_summary=f"Run {run_id} 更新 {file_meta['path']}",
                    created_by=run_id,
                    created_by_type="agent",
                    metadata=metadata,
                    source_conversation_id=run.get("conversationId"),
                    source_workspace_id=run.get("workspaceId") or sandbox.get("workspaceId"),
                )
                if not artifact:
                    continue
            else:
                if is_modify_existing and not target_artifacts:
                    continue
                action = "created"
                previous_version = None
                artifact = create_artifact(
                    conversation_id=run["conversationId"],
                    title=file_meta["path"],
                    artifact_type=artifact_type,
                    content=artifact_content,
                    run_id=run_id,
                    description=f"Run {run_id} 输出文件",
                    created_by=run_id,
                    created_by_type="agent",
                    metadata=metadata,
                    workspace_id=run.get("workspaceId") or sandbox.get("workspaceId"),
                )
                set_sandbox_file_artifact(file_meta["id"], artifact["id"])
            synced += 1
            print(
                f"[SandboxArtifact] {action} run={run_id} path={file_meta['path']} "
                f"type={artifact_type} artifact={artifact['id']} "
                f"previousVersion={previous_version or '-'} newVersion={artifact.get('latestVersion')}",
                flush=True,
            )
            artifact_meta = {k: v for k, v in artifact.items() if k not in {"content", "currentVersion"}}
            artifact_changes.append({
                "action": action,
                "artifact": artifact_meta,
                "previousVersion": previous_version,
                "newVersion": artifact.get("latestVersion"),
                "filePath": file_meta["path"],
            })
            artifact_message_content = (
                f"更新产物 {artifact['title']} 到 v{artifact['latestVersion']}"
                if action == "updated"
                else f"生成产物 {artifact['title']}"
            )
            artifact_message = create_message(
                conversation_id=run["conversationId"],
                sender_id=run_id,
                sender_name="Sandbox",
                role="agent",
                msg_type="artifact",
                content=artifact_message_content,
                artifact_id=artifact["id"],
                metadata={
                    "source": "sandbox",
                    "sourceRunId": run_id,
                    "sourceFilePath": file_meta["path"],
                    "action": action,
                },
            )
            artifact_messages.append(artifact_message)
            update_conversation_activity(run["conversationId"], artifact_message_content)
            await send(
                "conversation.message.completed",
                {
                    "conversationId": run["conversationId"],
                    "messageId": artifact_message["id"],
                    "finishReason": "stop",
                    "fullMessage": artifact_message,
                },
            )
            await send(
                "artifact.created",
                _run_snapshot_payload(
                    run_id,
                    {
                        "conversationId": run["conversationId"],
                        "artifactId": artifact_meta.get("id"),
                        "artifact": artifact_meta,
                        "action": action,
                    },
                ),
            )
        if artifact_messages:
            created_count = sum(1 for item in artifact_changes if item.get("action") == "created")
            updated_count = sum(1 for item in artifact_changes if item.get("action") == "updated")
            summary_parts = []
            if created_count:
                summary_parts.append(f"新生成 {created_count} 个")
            if updated_count:
                summary_parts.append(f"更新 {updated_count} 个")
            summary_text = "，".join(summary_parts) or f"{len(artifact_messages)} 个产物"
            aggregate_content = f"本次产物变更：{summary_text}"
            aggregate_message = create_message(
                conversation_id=run["conversationId"],
                sender_id=run_id,
                sender_name="Sandbox",
                role="agent",
                msg_type="artifacts",
                content=aggregate_content,
                metadata={
                    "source": "sandbox",
                    "sourceRunId": run_id,
                    "sourceConversationId": run.get("conversationId"),
                    "sourceWorkspaceId": run.get("workspaceId") or sandbox.get("workspaceId"),
                    "artifactCount": len(artifact_messages),
                    "createdCount": created_count,
                    "updatedCount": updated_count,
                    "items": artifact_messages,
                    "artifactChanges": artifact_changes,
                },
            )
            update_conversation_activity(run["conversationId"], aggregate_content)
            await send(
                "conversation.message.completed",
                {
                    "conversationId": run["conversationId"],
                    "messageId": aggregate_message["id"],
                    "finishReason": "stop",
                    "fullMessage": aggregate_message,
                },
            )
        print(f"[SandboxArtifact] sync done run={run_id} count={synced}", flush=True)
        return artifact_changes


def _artifact_type_for_path(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".html", ".htm"}:
        return "html"
    if suffix in {".md", ".markdown"}:
        return "markdown"
    if suffix in {".mmd", ".mermaid"}:
        return "mermaid"
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"}:
        return "image"
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
