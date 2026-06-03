from typing import Any, Dict, List


MODEL_PROVIDERS: List[Dict[str, Any]] = [
    {
        "id": "openai",
        "name": "OpenAI",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.openai.com/v1",
    },
    {
        "id": "anthropic",
        "name": "Anthropic",
        "protocol": "anthropic_messages",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.anthropic.com",
    },
    {
        "id": "anthropic_compatible",
        "name": "Anthropic-compatible / Claude Code Router",
        "protocol": "anthropic_messages",
        "requiresBaseUrl": True,
        "aliases": ["claude_code_router", "claude-router", "anthropic_proxy"],
    },
    {
        "id": "volcengine_ark",
        "name": "Volcengine Ark / Doubao",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
        "aliases": ["ark", "volcengine", "volces", "doubao", "bytedance"],
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.deepseek.com/v1",
        "aliases": ["deepseek_chat"],
    },
    {
        "id": "qwen",
        "name": "Alibaba Qwen / DashScope",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "aliases": ["dashscope", "aliyun", "tongyi", "千问", "通义千问"],
    },
    {
        "id": "zhipu",
        "name": "Zhipu GLM",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "aliases": ["glm", "bigmodel", "智谱"],
    },
    {
        "id": "moonshot",
        "name": "Moonshot / Kimi",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.moonshot.cn/v1",
        "aliases": ["kimi", "moonshot_ai", "月之暗面"],
    },
    {
        "id": "openrouter",
        "name": "OpenRouter",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://openrouter.ai/api/v1",
    },
    {
        "id": "siliconflow",
        "name": "SiliconFlow",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.siliconflow.cn/v1",
        "aliases": ["硅基流动"],
    },
    {
        "id": "openai_compatible",
        "name": "OpenAI-compatible",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": True,
        "aliases": ["compatible"],
    },
    {
        "id": "custom_openai_compatible",
        "name": "Custom OpenAI-compatible",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": True,
    },
]


def list_model_providers() -> List[Dict[str, Any]]:
    return MODEL_PROVIDERS


def get_model_provider(provider_id: str) -> Dict[str, Any]:
    normalized = (provider_id or "").strip().lower()
    for provider in MODEL_PROVIDERS:
        if provider["id"] == normalized or normalized in provider.get("aliases", []):
            return provider
    return next(provider for provider in MODEL_PROVIDERS if provider["id"] == "volcengine_ark")
