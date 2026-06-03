import json
import re
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse


def validate_http_base_url(base_url: str, label: str = "baseUrl") -> str:
    clean_url = str(base_url or "").strip()
    if not clean_url:
        return ""
    parsed = urlparse(clean_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError(f"{label} 无效：{clean_url}。请填写包含 http(s):// 的完整地址。")
    return clean_url.rstrip("/")


def extract_json_object(text: str) -> Dict[str, Any]:
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


def safe_config_name(value: str, fallback: str = "northcore") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    cleaned = cleaned.strip("_-")
    if not cleaned:
        return fallback
    if cleaned[0].isdigit():
        cleaned = f"{fallback}_{cleaned}"
    return cleaned[:64]


def ensure_workspace_path(path: str) -> str:
    clean_path = str(path or ".").strip() or "."
    return str(Path(clean_path).resolve())
