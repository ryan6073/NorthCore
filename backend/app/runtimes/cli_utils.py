import json
import hashlib
import shutil
import tempfile
import re
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from app.config import settings


READONLY_CHAT_MUTATION_MESSAGE = (
    "当前是普通聊天只读模式，我不能直接修改工作区文件。"
    "如果你希望我修改、生成或删除文件，请发起沙箱任务，我会通过 AgentHub 的版本和冲突流程处理。"
)

READONLY_CHAT_SYSTEM_PROMPT = """[AgentHub 只读聊天模式]
当前调用只是普通聊天，不允许修改真实 workspace。
你可以阅读临时工作区副本中的文件并回答问题。
不要创建、修改或删除文件；不要声称“已修改/已保存/已写入”任何文件。
如果用户要求修改、生成、删除、保存或调整文件，请明确说明需要创建沙箱任务，由 AgentHub 通过版本与冲突流程执行。
"""

_FINGERPRINT_SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    ".next",
    "dist",
    "build",
}


def _ignore_runtime_heavy_paths(_directory: str, names: list[str]) -> set[str]:
    ignored = {name for name in names if name in _FINGERPRINT_SKIP_DIRS}
    for name in names:
        try:
            if (Path(_directory) / name).is_symlink():
                ignored.add(name)
        except OSError:
            ignored.add(name)
    return ignored


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


def runtime_home_root() -> Path:
    configured = str(settings.RUNTIME_HOME_ROOT or "").strip()
    if configured:
        return Path(configured).resolve()
    return (Path(settings.SANDBOX_WORKSPACE_ROOT) / "_runtime_homes").resolve()


def runtime_home_for_agent(
    agent: Optional[Dict[str, Any]],
    runtime: str,
    model_config: Optional[Dict[str, Any]] = None,
) -> str:
    owner = safe_config_name(str((agent or {}).get("ownerUserId") or "default"), "owner")
    runtime_name = safe_config_name(str(runtime or "native"), "runtime")
    config_identity = safe_config_name(
        str((model_config or {}).get("id") or (agent or {}).get("modelConfigId") or "environment-default"),
        "environment-default",
    )
    return str(runtime_home_root() / owner / runtime_name / config_identity)


def apply_isolated_runtime_home_env(env: Dict[str, str], runtime_home: str) -> Dict[str, str]:
    home = Path(runtime_home)
    home.mkdir(parents=True, exist_ok=True)
    config_home = home / ".config"
    cache_home = home / ".cache"
    config_home.mkdir(parents=True, exist_ok=True)
    cache_home.mkdir(parents=True, exist_ok=True)
    return {
        **env,
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(config_home),
        "XDG_CACHE_HOME": str(cache_home),
    }


def ensure_workspace_path(path: str) -> str:
    clean_path = str(path or ".").strip() or "."
    return str(Path(clean_path).resolve())


def workspace_fingerprint(workspace_path: str) -> Dict[str, str]:
    root = Path(workspace_path).resolve()
    fingerprint: Dict[str, str] = {}
    if not root.exists() or not root.is_dir():
        return fingerprint
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel_path = path.relative_to(root)
        if any(part in _FINGERPRINT_SKIP_DIRS for part in rel_path.parts):
            continue
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            stat = path.stat()
        except OSError:
            continue
        fingerprint[str(rel_path)] = f"{digest}:{stat.st_size}"
    return fingerprint


def readonly_chat_prompt(user_input: str, workspace_context: str = "") -> str:
    parts = [READONLY_CHAT_SYSTEM_PROMPT.strip()]
    if str(workspace_context or "").strip():
        parts.append(str(workspace_context).strip())
    parts.append("[用户消息]\n" + str(user_input or "").strip())
    return "\n\n".join(parts).strip()


def prepare_readonly_chat_workspace(workspace: Dict[str, Any], workspace_context: str = "") -> Dict[str, Any]:
    real_path = Path(str(workspace.get("workspacePath") or "")).resolve()
    if not real_path.exists() or not real_path.is_dir():
        raise RuntimeError("工作区路径不存在，无法进入只读聊天模式")
    temp_path = Path(tempfile.mkdtemp(prefix="agenthub-readonly-chat-"))
    shutil.copytree(
        real_path,
        temp_path,
        dirs_exist_ok=True,
        ignore=_ignore_runtime_heavy_paths,
    )
    context_text = str(workspace_context or "").strip()
    if context_text:
        (temp_path / "AGENTS.md").write_text(context_text, encoding="utf-8")
    return {
        "workspacePath": str(temp_path),
        "realWorkspacePath": str(real_path),
        "tempWorkspacePath": str(temp_path),
        "realBefore": workspace_fingerprint(str(real_path)),
        "tempBefore": workspace_fingerprint(str(temp_path)),
        "tempWorkspaceMutated": False,
        "realWorkspaceMutationDetected": False,
    }


def finalize_readonly_chat_workspace(audit: Dict[str, Any]) -> Dict[str, Any]:
    temp_path = str(audit.get("tempWorkspacePath") or "")
    real_path = str(audit.get("realWorkspacePath") or "")
    try:
        audit["tempWorkspaceMutated"] = workspace_fingerprint(temp_path) != (audit.get("tempBefore") or {})
    finally:
        if temp_path:
            shutil.rmtree(temp_path, ignore_errors=True)
    if real_path:
        audit["realWorkspaceMutationDetected"] = workspace_fingerprint(real_path) != (audit.get("realBefore") or {})
        if audit["realWorkspaceMutationDetected"]:
            print(
                "[PlatformReadOnlyChat] real workspace changed during readonly chat",
                {
                    "workspacePath": real_path,
                    "tempWorkspacePath": temp_path,
                },
                flush=True,
            )
    return audit
