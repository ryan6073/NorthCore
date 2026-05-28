import json
import re
from openai import OpenAI
from app.config import settings

client = OpenAI(api_key=settings.ARK_API_KEY, base_url=settings.ARK_BASE_URL)

AGENT_CONFIGS = {
    "Claude Code": {
        "system": "你是一个精通全栈开发的 AI 工程师。请直接根据用户的要求编写高质量的代码产物。当用户要求制作、构建或修改网页/UI时，你**必须且只能**输出包含在 ```html ... ``` 代码块中的完整单文件 HTML（包含 Tailwind CSS 样式）。不要说废话，直接开始编写或回答。"
    },
    "Codex": {
        "system": "你是一个资深的架构师和代码审查（Code Review）专家。你的任务是分析、评审其他 Agent 生成的代码或方案。请用严谨、专业的学术及工程语言，指出其优缺点，并给出优化建议。"
    },
    "Orchestrator": {
        "system": "你是一个高层任务协调器。你的职责是将用户复杂的开发需求拆解，并分派给合适的子 Agent（'Claude Code' 负责写代码，'Codex' 负责代码审查）。你必须输出一个标准的 JSON 数组，格式形如：[{\"agent\": \"Claude Code\", \"task\": \"具体任务\"}, {\"agent\": \"Codex\", \"task\": \"具体任务\"}]。不要输出任何其他文本。"
    }
}

TASK_KEYWORDS = {
    "帮我", "生成", "写", "做", "实现", "开发", "修改", "优化", "修复", "审查",
    "代码", "页面", "网页", "组件", "接口", "后端", "前端", "部署", "文档",
    "workflow", "agent", "diff", "bug", "review",
}

AGENT_NAME_TO_ID = {
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
如果是 task，请拆解为 1-3 个可执行子任务，只使用这些 agentName：Claude Code、Codex。
- Claude Code：负责代码生成、页面实现、工程改造。
- Codex：负责代码审查、质量检查、Bug 分析和优化建议。

你必须只输出 JSON，不要输出 Markdown，不要输出解释文本。
格式如下：
{
  "intent": "chat 或 task",
  "confidence": 0.9,
  "reply": "闲聊时的回复；任务时可以是一句简短确认",
  "taskPlan": [
    {
      "agentId": "agent-claude-code",
      "agentName": "Claude Code",
      "task": "具体任务"
    }
  ]
}
"""


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


def _looks_like_task(user_input: str) -> bool:
    lowered = user_input.lower()
    return any(keyword.lower() in lowered for keyword in TASK_KEYWORDS)


def _fallback_intent(user_input: str) -> dict:
    if _looks_like_task(user_input):
        return {
            "intent": "task",
            "confidence": 0.55,
            "reply": "我会先拆解任务，再安排合适的 Agent 处理。",
            "taskPlan": [
                {
                    "agentId": "agent-claude-code",
                    "agentName": "Claude Code",
                    "task": f"请围绕以下需求生成方案或代码：{user_input}",
                },
                {
                    "agentId": "agent-codex",
                    "agentName": "Codex",
                    "task": "请对生成结果进行 Code Review，并给出优化建议。",
                },
            ],
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
