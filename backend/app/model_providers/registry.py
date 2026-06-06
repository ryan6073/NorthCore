from typing import Any, Dict, List


MODEL_PROVIDERS: List[Dict[str, Any]] = [
    {
        "id": "openai",
        "name": "OpenAI",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.openai.com/v1",
        "supportedRuntimes": ["native", "opencode", "codex"],
        "runtimeDefaults": {
            "codex": {},
            "opencode": {},
        },
    },
    {
        "id": "anthropic",
        "name": "Anthropic",
        "protocol": "anthropic_messages",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.anthropic.com",
        "supportedRuntimes": ["native", "opencode", "claude_code"],
        "runtimeDefaults": {
            "claude_code": {},
            "opencode": {},
        },
    },
    {
        "id": "anthropic_compatible",
        "name": "Anthropic-compatible / Claude Code Router",
        "protocol": "anthropic_messages",
        "requiresBaseUrl": True,
        "aliases": ["claude_code_router", "claude-router", "anthropic_proxy"],
        "supportedRuntimes": ["native", "opencode", "claude_code"],
        "runtimeDefaults": {
            "claude_code": {},
            "opencode": {},
        },
    },
    {
        "id": "volcengine_ark",
        "name": "Volcengine Ark / Doubao",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
        "aliases": ["ark", "volcengine", "volces", "doubao", "bytedance"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.deepseek.com/v1",
        "aliases": ["deepseek_chat"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "qwen",
        "name": "Alibaba Qwen / DashScope",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "aliases": ["dashscope", "aliyun", "tongyi", "千问", "通义千问"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "zhipu",
        "name": "Zhipu GLM",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "aliases": ["glm", "bigmodel", "智谱"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "moonshot",
        "name": "Moonshot / Kimi",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.moonshot.cn/v1",
        "aliases": ["kimi", "moonshot_ai", "月之暗面"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "openrouter",
        "name": "OpenRouter",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://openrouter.ai/api/v1",
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "siliconflow",
        "name": "SiliconFlow",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.siliconflow.cn/v1",
        "aliases": ["硅基流动"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "openai_compatible",
        "name": "OpenAI-compatible",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": True,
        "aliases": ["compatible"],
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "custom_openai_compatible",
        "name": "Custom OpenAI-compatible",
        "protocol": "openai_chat_completions",
        "requiresBaseUrl": True,
        "supportedRuntimes": ["native", "opencode"],
        "runtimeDefaults": {"opencode": {}},
    },
    {
        "id": "chatanywhere_codex",
        "name": "ChatAnywhere / Codex",
        "protocol": "openai_responses",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.chatanywhere.tech/v1",
        "supportedRuntimes": ["codex"],
        "runtimeDefaults": {
            "codex": {
                "extraConfig": {
                    "codex": {
                        "wireApi": "responses",
                        "requiresOpenAIAuth": False,
                    },
                },
            },
        },
        "runtimeNotes": "用于 Codex CLI 的 ChatAnywhere Responses API 中转站。",
    },
    {
        "id": "chatanywhere_claude_code",
        "name": "ChatAnywhere / Claude Code",
        "protocol": "anthropic_messages",
        "requiresBaseUrl": False,
        "defaultBaseUrl": "https://api.chatanywhere.tech",
        "supportedRuntimes": ["claude_code"],
        "runtimeDefaults": {
            "claude_code": {},
        },
        "runtimeNotes": "用于 Claude Code 的 ChatAnywhere Anthropic-compatible 中转站。",
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
