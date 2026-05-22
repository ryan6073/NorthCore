import json
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