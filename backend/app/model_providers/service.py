import json
import re
import time
import urllib.request
from typing import Any, Dict, Optional

from openai import OpenAI

from app.config import settings
from app.database import get_model_config, get_model_credential
from app.model_providers.registry import get_model_provider


def _apply_provider_defaults(config: Dict[str, Any]) -> Dict[str, Any]:
    provider = get_model_provider(str(config.get("provider") or ""))
    if not config.get("protocol"):
        config = {**config, "protocol": provider.get("protocol") or "openai_chat_completions"}
    if not config.get("baseUrl") and provider.get("defaultBaseUrl"):
        config = {**config, "baseUrl": provider["defaultBaseUrl"]}
    return config


def _normalize_api_secret(secret: str) -> str:
    clean_secret = str(secret or "").strip()
    if not clean_secret:
        return ""
    first_line = next((line.strip() for line in clean_secret.splitlines() if line.strip()), "")
    if first_line.startswith("export "):
        first_line = first_line[len("export "):].strip()
    if "=" in first_line:
        name, value = first_line.split("=", 1)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name.strip()):
            first_line = value.strip()
    if len(first_line) >= 2 and first_line[0] == first_line[-1] and first_line[0] in {"'", '"'}:
        first_line = first_line[1:-1].strip()
    return first_line


def resolve_model_config(agent: Optional[Dict[str, Any]], owner_user_id: Optional[str] = None) -> Dict[str, Any]:
    config_id = (agent or {}).get("modelConfigId") or (agent or {}).get("model_config_id")
    if config_id:
        config = get_model_config(str(config_id), owner_user_id=owner_user_id)
        if config:
            return _apply_provider_defaults(config)

    # Backward compatibility: the legacy Agent.modelConfig values are UI metadata
    # in the current native flow. Before runtime/model_config support, actual model
    # calls used the global .env-backed client and settings.MODEL_EP. Preserve that
    # behavior unless an explicit model_config_id is selected.
    legacy = (agent or {}).get("modelConfig") if isinstance((agent or {}).get("modelConfig"), dict) else {}
    return _apply_provider_defaults({
        "id": None,
        "ownerUserId": owner_user_id,
        "name": "Environment Default Model Config",
        "provider": "openai_compatible",
        "protocol": "openai_chat_completions",
        "modelName": settings.MODEL_EP,
        "baseUrl": settings.ARK_BASE_URL,
        "credentialRef": None,
        "extraConfig": {
            "temperature": legacy.get("temperature", 0.7),
            "maxTokens": legacy.get("maxTokens", 8192),
        },
    })


def resolve_model_secret(config: Dict[str, Any], owner_user_id: Optional[str] = None) -> str:
    credential_ref = config.get("credentialRef")
    if credential_ref:
        credential = get_model_credential(str(credential_ref), owner_user_id=owner_user_id, include_secret=True)
        if credential:
            return _normalize_api_secret(str(credential.get("secret") or ""))
    return _normalize_api_secret(settings.ARK_API_KEY)


def create_openai_client_for_agent(agent: Optional[Dict[str, Any]], owner_user_id: Optional[str] = None) -> OpenAI:
    config = resolve_model_config(agent, owner_user_id=owner_user_id)
    base_url = config.get("baseUrl") or settings.ARK_BASE_URL
    return OpenAI(api_key=resolve_model_secret(config, owner_user_id=owner_user_id), base_url=base_url)


def model_name_for_agent(agent: Optional[Dict[str, Any]], owner_user_id: Optional[str] = None) -> str:
    config = resolve_model_config(agent, owner_user_id=owner_user_id)
    return str(config.get("modelName") or settings.MODEL_EP)


def _test_openai_compatible(config: Dict[str, Any], secret: str) -> None:
    if not config.get("modelName"):
        raise ValueError("model_name 不能为空")
    base_url = config.get("baseUrl") or get_model_provider(config.get("provider", "")).get("defaultBaseUrl")
    if not base_url:
        raise ValueError("base_url 不能为空")
    client = OpenAI(api_key=secret, base_url=base_url)
    client.chat.completions.create(
        model=config["modelName"],
        messages=[{"role": "user", "content": "ping"}],
        max_tokens=8,
        stream=False,
    )


def _test_anthropic(config: Dict[str, Any], secret: str) -> None:
    if not config.get("modelName"):
        raise ValueError("model_name 不能为空")
    base_url = (config.get("baseUrl") or "https://api.anthropic.com").rstrip("/")
    request = urllib.request.Request(
        f"{base_url}/v1/messages",
        data=json.dumps(
            {
                "model": config["modelName"],
                "max_tokens": 8,
                "messages": [{"role": "user", "content": "ping"}],
            }
        ).encode("utf-8"),
        headers={
            "x-api-key": secret,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        response.read()


def test_model_config_connectivity(config_id: str, owner_user_id: str) -> Dict[str, Any]:
    config = get_model_config(config_id, owner_user_id=owner_user_id)
    if not config:
        return {"ok": False, "error": "Model Config 不存在"}
    provider = get_model_provider(str(config.get("provider") or ""))
    secret = resolve_model_secret(config, owner_user_id=owner_user_id)
    if not secret:
        return {"ok": False, "error": "credential 未配置"}
    started = time.time()
    try:
        if config.get("protocol") == "anthropic_messages" or provider["id"] in {"anthropic", "anthropic_compatible"}:
            _test_anthropic(config, secret)
        else:
            _test_openai_compatible(config, secret)
        return {
            "ok": True,
            "provider": config.get("provider"),
            "protocol": config.get("protocol"),
            "modelName": config.get("modelName"),
            "latencyMs": int((time.time() - started) * 1000),
            "error": None,
        }
    except Exception as exc:
        return {
            "ok": False,
            "provider": config.get("provider"),
            "protocol": config.get("protocol"),
            "modelName": config.get("modelName"),
            "latencyMs": int((time.time() - started) * 1000),
            "error": str(exc),
        }
