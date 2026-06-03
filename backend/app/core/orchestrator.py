import json
import re
from typing import Any, Dict, Optional
from app.config import settings
from app.core.llm_client import client

AGENT_CONFIGS = {
    "默认聊天助手": {
        "system": "你是一个友好、清晰、可靠的默认聊天助手。请直接回答用户问题，必要时给出结构化步骤；不确定时说明假设，不编造事实。"
    },
    "翻译助手": {
        "system": "你是一个好用的翻译助手。请将用户提供的中文翻译成英文，将非中文内容翻译成中文；只返回翻译结果，保持原意、格式和语气，必要时让译文更自然。"
    },
    "图表助手": {
        "system": "你是一个擅长 Mermaid 图表的助手。请判断用户需求是否适合用图解释；适合时输出简洁说明和正确的 Mermaid 代码块，不适合时正常回答。"
    },
    "文档助手": {
        "system": "你是一个文档生成助手。请根据用户目标生成结构清晰的 Markdown 文档、汇报材料或 PPT 大纲；内容要有标题、层级、要点和可执行结论。"
    },
    "Claude Code": {
        "system": "你是一个精通全栈开发的 AI 工程师。请直接根据用户的要求编写高质量的代码产物。当用户要求制作、构建或修改网页/UI时，你**必须且只能**输出包含在 ```html ... ``` 代码块中的完整单文件 HTML（包含 Tailwind CSS 样式）。不要说废话，直接开始编写或回答。"
    },
    "Codex": {
        "system": "你是一个资深的架构师和代码审查（Code Review）专家。你的任务是分析、评审其他 Agent 生成的代码或方案。请用严谨、专业的学术及工程语言，指出其优缺点，并给出优化建议。"
    },
    "Orchestrator": {
        "system": (
                "你是一个高层任务协调器。后端会在每次规划请求中通过 [Available Agents] "
                "提供当前会话实际可用的成员 Agent 列表，包括 agentId、name、runtime 和 description。"
                "你只能从 [Available Agents] 中选择 Agent 进行分派，不能编造或使用未列出的 Agent。"
                "需要输出计划时只输出结构化 JSON；普通聊天时直接简洁回复。"
            )
    }
}

TASK_KEYWORDS = {
    "帮我", "生成", "写", "做", "实现", "开发", "修改", "优化", "修复", "审查",
    "代码", "页面", "网页", "组件", "接口", "后端", "前端", "部署", "文档",
    "翻译", "图表", "流程图", "时序图", "架构图", "mermaid", "markdown", "ppt",
    "workflow", "agent", "diff", "bug", "review",
}

WORKSPACE_MODIFICATION_MARKERS = (
    "修改", "改", "改成", "改为", "替换", "更新", "调整", "修复", "优化", "完善",
    "增强", "改进", "补全", "区分", "更有区分", "实现", "做一下", "处理一下",
    "modify", "change", "replace", "update", "fix", "edit", "optimize", "improve",
)

WORKSPACE_TARGET_MARKERS = (
    "代码", "文件", "功能", "页面", "组件", "项目", "游戏", "角色", "动作", "攻击",
    "效果", "特效", "逻辑", "样式", "ui", "交互", "bug", "artifact", "workspace",
)

WORKSPACE_CHAT_ONLY_MARKERS = (
    "不要改代码", "别改代码", "不用改代码", "先不要改", "不要实际改", "不用实际改",
    "只给方案", "给我一个方案", "给个方案", "应该怎么", "怎么优化", "怎么改",
    "有什么建议", "给点建议", "分析一下", "解释一下", "review 一下",
)

AGENT_NAME_TO_ID = {
    "默认聊天助手": "agent-chat",
    "翻译助手": "agent-translator",
    "图表助手": "agent-mermaid",
    "文档助手": "agent-document",
    "Claude Code": "agent-claude-code",
    "Codex": "agent-codex",
    "Orchestrator": "agent-orchestrator",
}

ORCHESTRATOR_INTENT_SYSTEM = """你是 AgentHub 的群聊协调器 Orchestrator。
你需要判断用户输入是闲聊还是需要多 Agent 协作处理的任务。

判断规则：
- chat：问候、寒暄、感谢、简单确认、非执行类提问。
- task：要求生成、修改、实现、审查、优化、调试、部署、整理文档、构建网页或 workflow 等需要 Agent 执行的工作。

如果是 chat，请给出自然、简洁的中文回复，并保持 taskPlan 为空数组。
如果是 task，请拆解为 1-3 个可执行子任务。只能使用调用方提供的当前群聊成员 Agent；如果缺少成员上下文，不要编造 Agent，尽量给出通用任务描述，后端会按当前群成员二次归一化。

你必须只输出 JSON，不要输出 Markdown，不要输出解释文本。
格式如下：
{
  "intent": "chat 或 task",
  "confidence": 0.9,
  "reply": "闲聊时的回复；任务时可以是一句简短确认",
  "taskPlan": [
    {
      "agentId": "必须是当前群聊成员的 agentId",
      "agentName": "必须是当前群聊成员名称",
      "task": "具体任务"
    }
  ]
}
"""

EXECUTION_MODE_CONFIDENCE_THRESHOLD = 0.65

EXECUTION_MODE_SYSTEM = """你是 AgentHub 的执行模式分类器。
你需要判断用户消息应该走普通聊天，还是启动 Sandbox Run 执行。

只能输出 JSON，不要输出 Markdown，不要输出解释文本。

核心原则：
- chat：只回答、解释、分析、讨论、评价，不改文件，不创建产物，不运行命令。
- sandbox：需要创建、修改、删除、运行、构建、测试、部署、验证工作区内容，或需要产生/更新可预览产物。
- 在 single/group 会话中，如果 conversationWorkspaceId 存在，用户提到“项目/页面/代码/游戏/角色/动作/攻击/功能/样式/交互”等工作区对象，并表达“优化/完善/改进/增强/修复/调整/区分/补全/实现/让它更好”等意图，即使句式是“可以吗/能不能/帮我看看能否”，也应判为 sandbox。
- 不要因为用户用了疑问句就判为 chat；判断重点是是否在请求你实际改工作区内容。
- 如果用户只是问“怎么改/为什么/有什么建议/解释一下/review 一下”，且没有要求应用修改，则判为 chat。
- 如果用户明确指定 executionMode 或 useSandbox，以 payload 为准。

executionMode 只能是：
- chat
- sandbox

intent 只能是：
- qa
- analysis
- code_explanation
- code_review
- artifact_generation
- code_modification
- project_creation
- debug_run
- build_or_test
- other

普通 chat 场景，不要启动 sandbox：
- “这段代码什么意思？”
- “帮我分析一下这个方案”
- “你觉得这个架构如何？”
- “解释一下这个报错”
- “帮我 review 这段代码逻辑”
- “什么是 WebSocket？”
- “这个功能应该怎么优化？”（只问建议）
- “给我一个修改方案，不要改代码”
- 讨论、解释、评估、文本类 code review、方案分析。

sandbox 场景，需要启动 sandbox：
- “帮我生成一个登录页面”
- “创建一个 React 项目”
- “实现这个功能”
- “修改工作区里的代码”
- “生成 HTML / CSS / JS 文件”
- “运行测试”
- “构建项目”
- “修复这个 bug 并验证”
- “生成可预览 artifact”
- “优化一下角色和动作以及攻击，现在攻击区分不开”
- “你可以让角色的各个动作更有区分度吗”
- “把这个页面样式调得更清楚”
- “让现有交互更顺滑”
- 明确要求创建、修改、运行、验证、构建、生成文件或项目产物。

建议：
- sandbox 的 intent 优先使用 code_modification / artifact_generation / project_creation / debug_run / build_or_test。
- 如果 selectedAgentId 存在且适合执行任务，suggestedAgentId 使用 selectedAgentId；否则代码任务默认 agent-claude-code。

格式：
{
  "useSandbox": true,
  "executionMode": "sandbox",
  "intent": "artifact_generation",
  "confidence": 0.86,
  "reason": "用户要求生成登录页面，需要创建文件和可预览产物",
  "suggestedRunPrompt": "请生成一个完整的登录页面，并输出可预览 HTML artifact",
  "suggestedAgentId": "agent-claude-code"
}
"""

VALID_EXECUTION_INTENTS = {
    "qa",
    "analysis",
    "code_explanation",
    "code_review",
    "artifact_generation",
    "code_modification",
    "project_creation",
    "debug_run",
    "build_or_test",
    "other",
}

ARTIFACT_MODIFICATION_MARKERS = (
    "修改", "改成", "改为", "改掉", "替换", "换成", "更新", "调整", "修复",
    "不要", "变成", "给我", "实现", "保存", "应用到", "直接改",
    "modify", "change", "replace", "update", "fix", "edit",
)


def _payload_has_artifact_ref(payload: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(payload, dict):
        return False
    artifact_ref = payload.get("artifactRef")
    return isinstance(artifact_ref, dict) and bool(str(artifact_ref.get("artifactId") or "").strip())


def _payload_has_pending_workspace_clarification(payload: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(payload, dict):
        return False
    return bool(payload.get("pendingWorkspaceClarification"))


def _looks_like_artifact_modification(user_input: str, payload: Optional[Dict[str, Any]]) -> bool:
    if not _payload_has_artifact_ref(payload):
        return False
    normalized = (user_input or "").lower()
    if any(marker in user_input or marker in normalized for marker in ARTIFACT_MODIFICATION_MARKERS):
        return True
    return _payload_has_pending_workspace_clarification(payload)


def _looks_like_workspace_modification(user_input: str, conversation: Optional[Dict[str, Any]]) -> bool:
    if not conversation or conversation.get("mode") not in {"single", "group"}:
        return False
    if not conversation.get("workspaceId"):
        return False
    normalized = (user_input or "").strip().lower()
    if not normalized:
        return False
    if any(marker in user_input or marker in normalized for marker in WORKSPACE_CHAT_ONLY_MARKERS):
        return False
    has_modify_intent = any(marker in user_input or marker in normalized for marker in WORKSPACE_MODIFICATION_MARKERS)
    has_workspace_target = any(marker in user_input or marker in normalized for marker in WORKSPACE_TARGET_MARKERS)
    return has_modify_intent and has_workspace_target


def _extract_json_object(text: str) -> dict:
    """Parse the first JSON object from a model response."""
    cleaned = text.strip()
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


def _chat_execution_decision(
    user_input: str,
    intent: str = "other",
    reason: str = "默认按普通聊天处理",
    confidence: float = 0.5,
) -> Dict[str, Any]:
    return {
        "useSandbox": False,
        "executionMode": "chat",
        "intent": intent if intent in VALID_EXECUTION_INTENTS else "other",
        "confidence": confidence,
        "reason": reason,
        "suggestedRunPrompt": user_input,
    }


def _sandbox_execution_decision(
    user_input: str,
    intent: str = "artifact_generation",
    reason: str = "用户明确要求创建或修改可执行产物",
    confidence: float = 1.0,
    suggested_agent_id: str = "agent-claude-code",
) -> Dict[str, Any]:
    return {
        "useSandbox": True,
        "executionMode": "sandbox",
        "intent": intent if intent in VALID_EXECUTION_INTENTS else "artifact_generation",
        "confidence": confidence,
        "reason": reason,
        "suggestedRunPrompt": user_input,
        "suggestedAgentId": suggested_agent_id,
    }


def _explicit_execution_mode(payload: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    use_sandbox = payload.get("useSandbox")
    if use_sandbox is True:
        return "sandbox"
    if use_sandbox is False:
        return "chat"
    raw_mode = str(payload.get("executionMode") or payload.get("runMode") or "").strip().lower()
    if raw_mode in {"sandbox", "run"}:
        return "sandbox"
    if raw_mode in {"chat", "message"}:
        return "chat"
    return None


def _fallback_execution_decision(user_input: str) -> Dict[str, Any]:
    lowered = user_input.lower()
    sandbox_markers = (
        "生成一个", "创建一个", "实现", "修改工作区", "运行测试", "构建项目",
        "修复", "并验证", "可预览", "html", "css", "javascript", "react 项目",
        "create a", "generate a", "build", "run tests", "implement",
    )
    chat_markers = (
        "什么意思", "解释", "分析", "你觉得", "方案如何", "review 这段",
        "什么是", "why", "explain", "analyze",
    )
    if any(marker in user_input or marker in lowered for marker in chat_markers):
        return _chat_execution_decision(user_input, intent="analysis", reason="fallback 判断为解释/分析类消息", confidence=0.6)
    if any(marker in user_input or marker in lowered for marker in sandbox_markers):
        return _sandbox_execution_decision(user_input, reason="fallback 判断为产物型任务", confidence=0.66)
    return _chat_execution_decision(user_input, reason="fallback 默认普通聊天", confidence=0.5)


def _normalize_execution_decision(payload: Dict[str, Any], user_input: str) -> Dict[str, Any]:
    mode = str(payload.get("executionMode") or "").strip().lower()
    use_sandbox = bool(payload.get("useSandbox")) or mode == "sandbox"
    if mode not in {"chat", "sandbox"}:
        mode = "sandbox" if use_sandbox else "chat"
    try:
        confidence = float(payload.get("confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    intent = str(payload.get("intent") or "other").strip()
    if intent not in VALID_EXECUTION_INTENTS:
        intent = "other"
    reason = str(payload.get("reason") or "").strip() or "模型未提供原因"
    suggested_run_prompt = str(payload.get("suggestedRunPrompt") or user_input).strip() or user_input
    suggested_agent_id = str(payload.get("suggestedAgentId") or "").strip()
    if mode == "sandbox" and confidence >= EXECUTION_MODE_CONFIDENCE_THRESHOLD:
        decision = _sandbox_execution_decision(
            suggested_run_prompt,
            intent=intent,
            reason=reason,
            confidence=confidence,
            suggested_agent_id=suggested_agent_id or "agent-claude-code",
        )
    else:
        decision = _chat_execution_decision(
            user_input,
            intent=intent,
            reason=reason if confidence >= EXECUTION_MODE_CONFIDENCE_THRESHOLD else "分类置信度过低，按普通聊天处理",
            confidence=confidence,
        )
    decision["suggestedRunPrompt"] = suggested_run_prompt
    if suggested_agent_id:
        decision["suggestedAgentId"] = suggested_agent_id
    return decision


def classify_message_execution_mode(
    user_input: str,
    payload: Optional[Dict[str, Any]] = None,
    conversation: Optional[Dict[str, Any]] = None,
    selected_agent: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Decide whether a user message should stay chat or start a sandbox run."""
    content = (user_input or "").strip()
    explicit_mode = _explicit_execution_mode(payload)
    if explicit_mode == "chat":
        return _chat_execution_decision(content, reason="payload 显式指定普通聊天", confidence=1.0)
    if explicit_mode == "sandbox":
        return _sandbox_execution_decision(content, reason="payload 显式指定 sandbox 执行", confidence=1.0)

    if _looks_like_artifact_modification(content, payload):
        return _sandbox_execution_decision(
            content,
            intent="code_modification",
            reason="消息引用了已有产物并表达了修改意图",
            confidence=1.0,
        )

    if _looks_like_workspace_modification(content, conversation):
        return _sandbox_execution_decision(
            content,
            intent="code_modification",
            reason="single/group 工作区会话中表达了对现有项目内容的修改意图",
            confidence=0.95,
        )

    if conversation and conversation.get("mode") == "agent":
        return _chat_execution_decision(content, reason="agent 联系人会话本轮不自动触发 sandbox", confidence=1.0)

    try:
        context = {
            "conversationMode": conversation.get("mode") if conversation else None,
            "conversationWorkspaceId": conversation.get("workspaceId") if conversation else None,
            "selectedAgentId": selected_agent.get("id") if selected_agent else None,
            "selectedAgentName": selected_agent.get("name") if selected_agent else None,
            "selectedAgentRuntime": selected_agent.get("runtime") if selected_agent else None,
            "userInput": content,
        }
        res = client.chat.completions.create(
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": EXECUTION_MODE_SYSTEM},
                {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
            ],
        )
        raw_content = res.choices[0].message.content or ""
        return _normalize_execution_decision(_extract_json_object(raw_content), content)
    except Exception:
        return _fallback_execution_decision(content)


def _looks_like_task(user_input: str) -> bool:
    lowered = user_input.lower()
    return any(keyword.lower() in lowered for keyword in TASK_KEYWORDS)


def _fallback_intent(user_input: str) -> dict:
    if _looks_like_task(user_input):
        lowered = user_input.lower()
        if any(keyword in user_input for keyword in ("翻译", "译成", "英译", "中译")) or "translate" in lowered:
            agent_id = "agent-translator"
            agent_name = "翻译助手"
            task = f"请翻译或润色以下内容：{user_input}"
        elif any(keyword in lowered for keyword in ("mermaid", "diagram")) or any(keyword in user_input for keyword in ("图表", "流程图", "时序图", "架构图", "关系图")):
            agent_id = "agent-mermaid"
            agent_name = "图表助手"
            task = f"请为以下需求生成合适的 Mermaid 图表和简要说明：{user_input}"
        elif any(keyword in lowered for keyword in ("markdown", "ppt")) or any(keyword in user_input for keyword in ("文档", "汇报", "大纲", "PPT")):
            agent_id = "agent-document"
            agent_name = "文档助手"
            task = f"请围绕以下需求生成结构化文档或 PPT 大纲：{user_input}"
        else:
            agent_id = "agent-claude-code"
            agent_name = "Claude Code"
            task = f"请围绕以下需求生成方案或代码：{user_input}"
        task_plan = [
            {
                "agentId": agent_id,
                "agentName": agent_name,
                "task": task,
            }
        ]
        if agent_id == "agent-claude-code":
            task_plan.append(
                {
                    "agentId": "agent-codex",
                    "agentName": "Codex",
                    "task": "请对生成结果进行 Code Review，并给出优化建议。",
                }
            )
        return {
            "intent": "task",
            "confidence": 0.55,
            "reply": "我会先拆解任务，再安排合适的 Agent 处理。",
            "taskPlan": task_plan,
        }
    return {
        "intent": "chat",
        "confidence": 0.55,
        "reply": "我在，可以直接告诉我你想让哪些 Agent 协作完成什么任务。",
        "taskPlan": [],
    }


def _normalize_task_plan(task_plan: list) -> list:
    normalized = []
    for step in task_plan:
        if not isinstance(step, dict):
            continue
        agent_name = step.get("agentName") or step.get("agent") or "Claude Code"
        if agent_name not in AGENT_NAME_TO_ID:
            agent_name = "Claude Code"
        task = str(step.get("task", "")).strip()
        if not task:
            continue
        normalized.append({
            "agentId": step.get("agentId") or AGENT_NAME_TO_ID[agent_name],
            "agentName": agent_name,
            "task": task,
        })
    return normalized


def analyze_orchestrator_intent(user_input: str) -> dict:
    """Classify group-chat input and optionally produce a task plan."""
    try:
        res = client.chat.completions.create(
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": ORCHESTRATOR_INTENT_SYSTEM},
                {"role": "user", "content": user_input},
            ],
        )
        raw_content = res.choices[0].message.content or ""
        payload = _extract_json_object(raw_content)
        intent = payload.get("intent")
        if intent not in {"chat", "task"}:
            raise ValueError("invalid intent")
        task_plan = _normalize_task_plan(payload.get("taskPlan") or [])
        if intent == "task" and not task_plan:
            task_plan = _fallback_intent(user_input)["taskPlan"]
        reply = str(payload.get("reply") or "").strip()
        if not reply:
            reply = "我会先拆解任务，再安排合适的 Agent 处理。" if intent == "task" else _fallback_intent(user_input)["reply"]
        return {
            "intent": intent,
            "confidence": float(payload.get("confidence") or 0.8),
            "reply": reply,
            "taskPlan": task_plan if intent == "task" else [],
        }
    except Exception:
        return _fallback_intent(user_input)


def generate_pipeline_plan(user_input: str) -> list:
    """由 Orchestrator 智能体拆解任务流"""
    try:
        res = client.chat.completions.create(
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": AGENT_CONFIGS["Orchestrator"]["system"]},
                {"role": "user", "content": f"请拆解以下用户任务：'{user_input}'"}
            ]
        )
        plan_text = res.choices[0].message.content.strip()
        return json.loads(plan_text)
    except Exception:
        # 降级兜底方案
        return [
            {"agent": "Claude Code", "task": f"请围绕以下需求编写完整的前端代码：{user_input}"},
            {"agent": "Codex", "task": "请对刚刚生成的代码进行细致的 Code Review。"}
        ]
