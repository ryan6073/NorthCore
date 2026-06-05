from typing import Any, Dict, Iterable, List, Optional, Tuple


DEFAULT_PERMISSIONS = {
    "canReadFiles": False,
    "canWriteFiles": False,
    "canRunCommands": False,
    "canGenerateArtifacts": False,
    "canDeploy": False,
}

RUNTIME_ALIASES = {
    "claude-code": "claude_code",
    "claude_code": "claude_code",
    "codex": "codex",
    "opencode": "opencode",
    "native": "native",
}
PLATFORM_RUNTIMES = {"claude_code", "codex", "opencode"}

TOOL_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "workspace.read",
        "name": "读取工作区",
        "description": "读取工作区文件树、文件元信息和文件内容。",
        "displayGroup": "context",
        "riskGroup": "context_read",
        "riskLevel": "medium",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": ["canReadFiles"],
        "requiresWorkspace": True,
        "mutatesWorkspace": False,
    },
    {
        "id": "memory.use",
        "name": "使用长期记忆",
        "description": "读取或写入会话长期记忆。",
        "displayGroup": "context",
        "riskGroup": "memory",
        "riskLevel": "medium",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": [],
        "requiresWorkspace": False,
        "mutatesWorkspace": False,
    },
    {
        "id": "web.search",
        "name": "联网搜索",
        "description": "联网搜索或外部资料检索。",
        "displayGroup": "context",
        "riskGroup": "external",
        "riskLevel": "medium",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": [],
        "requiresWorkspace": False,
        "mutatesWorkspace": False,
    },
    {
        "id": "workspace.write",
        "name": "受控写入工作区",
        "description": "通过后端受控工具写入或导入 workspace 文件。",
        "displayGroup": "workspace",
        "riskGroup": "workspace_write",
        "riskLevel": "high",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": ["canReadFiles", "canWriteFiles"],
        "requiresWorkspace": True,
        "mutatesWorkspace": True,
    },
    {
        "id": "platform.runtime_write",
        "name": "自由代码运行时",
        "description": "允许 Codex、Claude Code 或 OpenCode 自由修改 workspace。",
        "displayGroup": "workspace",
        "riskGroup": "platform_write",
        "riskLevel": "critical",
        "runtimes": ["claude_code", "codex", "opencode"],
        "permissionKeys": ["canReadFiles", "canWriteFiles", "canRunCommands"],
        "requiresWorkspace": True,
        "mutatesWorkspace": True,
    },
    {
        "id": "environment.setup",
        "name": "依赖与环境安装",
        "description": "安装依赖、创建虚拟环境或初始化运行环境。",
        "displayGroup": "sandbox",
        "riskGroup": "command",
        "riskLevel": "high",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": ["canRunCommands"],
        "requiresWorkspace": True,
        "mutatesWorkspace": True,
    },
    {
        "id": "command.run",
        "name": "终端命令执行",
        "description": "执行终端命令、验证命令、测试、构建或脚本。",
        "displayGroup": "sandbox",
        "riskGroup": "command",
        "riskLevel": "high",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": ["canRunCommands"],
        "requiresWorkspace": True,
        "mutatesWorkspace": True,
    },
    {
        "id": "artifact.generate",
        "name": "生成产物",
        "description": "生成新的可展示或可下载产物。",
        "displayGroup": "artifact",
        "riskGroup": "workspace_write",
        "riskLevel": "medium",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": ["canGenerateArtifacts"],
        "requiresWorkspace": False,
        "mutatesWorkspace": False,
    },
    {
        "id": "deploy.run",
        "name": "部署服务",
        "description": "构建、启动并健康检查部署服务。",
        "displayGroup": "artifact",
        "riskGroup": "deploy",
        "riskLevel": "critical",
        "runtimes": ["native", "claude_code", "codex", "opencode"],
        "permissionKeys": ["canDeploy", "canRunCommands"],
        "requiresWorkspace": True,
        "mutatesWorkspace": True,
    },
]

TOOL_BY_ID = {tool["id"]: tool for tool in TOOL_CATALOG}

LEGACY_TOOL_MAP = {
    "task_plan": [],
    "general_chat": [],
    "translate": [],
    "file_read": ["workspace.read"],
    "read_file": ["workspace.read"],
    "workspace_file_read": ["workspace.read"],
    "file_write": ["workspace.write"],
    "write_file": ["workspace.write"],
    "workspace_file_write": ["workspace.write"],
    "web_search": ["web.search"],
    "memory": ["memory.use"],
    "memory_use": ["memory.use"],
    "environment_setup": ["environment.setup"],
    "shell_exec": ["command.run"],
    "command_run": ["command.run"],
    "artifact_generate": ["artifact.generate"],
    "deploy_run": ["deploy.run"],
    "mermaid_generate": ["artifact.generate"],
    "document_generate": ["artifact.generate"],
    "code_review": ["workspace.read", "command.run"],
    "code_generate": [
        "workspace.read",
        "workspace.write",
        "platform.runtime_write",
        "environment.setup",
        "command.run",
        "artifact.generate",
    ],
}

DEFAULT_TOOL_IDS_BY_AGENT = {
    "agent-orchestrator": [],
    "agent-chat": [],
    "agent-translator": [],
    "agent-mermaid": ["artifact.generate"],
    "agent-document": ["artifact.generate"],
    "agent-claude-code": [
        "workspace.read",
        "workspace.write",
        "platform.runtime_write",
        "environment.setup",
        "command.run",
        "artifact.generate",
    ],
    "agent-codex": [
        "workspace.read",
        "workspace.write",
        "platform.runtime_write",
        "environment.setup",
        "command.run",
        "artifact.generate",
    ],
}


def normalize_runtime(runtime: Optional[str]) -> str:
    raw = str(runtime or "native").strip().lower() or "native"
    return RUNTIME_ALIASES.get(raw, raw)


def list_agent_tool_catalog() -> List[Dict[str, Any]]:
    return [dict(tool) for tool in TOOL_CATALOG]


def _enabled_ids_from_tools(tools: Iterable[Dict[str, Any]]) -> List[str]:
    ids: List[str] = []
    seen: set[str] = set()
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        if tool.get("enabled") is False:
            continue
        raw_id = str(tool.get("id") or "").strip()
        mapped_ids = LEGACY_TOOL_MAP.get(raw_id, [raw_id])
        for tool_id in mapped_ids:
            if tool_id and tool_id not in seen:
                ids.append(tool_id)
                seen.add(tool_id)
    return ids


def default_tool_ids_for_agent(agent_id: Optional[str], runtime: Optional[str], category: Optional[str] = None) -> List[str]:
    if agent_id and agent_id in DEFAULT_TOOL_IDS_BY_AGENT:
        return list(DEFAULT_TOOL_IDS_BY_AGENT[agent_id])
    runtime_id = normalize_runtime(runtime)
    if runtime_id in PLATFORM_RUNTIMES:
        return [
            "workspace.read",
            "workspace.write",
            "platform.runtime_write",
            "environment.setup",
            "command.run",
            "artifact.generate",
        ]
    category_id = str(category or "").strip().lower()
    if category_id in {"document", "diagram"}:
        return ["artifact.generate"]
    if category_id == "review":
        return ["workspace.read", "command.run"]
    return []


def normalize_agent_tools(
    tools: Any,
    runtime: Optional[str] = None,
    agent_id: Optional[str] = None,
    category: Optional[str] = None,
    strict: bool = False,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    runtime_id = normalize_runtime(runtime)
    if strict and tools is not None and not isinstance(tools, list):
        return [], "tools 必须是数组"
    raw_tools = tools if isinstance(tools, list) else None
    if strict and raw_tools is not None:
        for tool in raw_tools:
            if not isinstance(tool, dict):
                return [], "工具配置格式不正确"
            if tool.get("enabled") is False:
                continue
            raw_id = str(tool.get("id") or "").strip()
            mapped_ids = LEGACY_TOOL_MAP.get(raw_id, [raw_id])
            for tool_id in mapped_ids:
                catalog_tool = TOOL_BY_ID.get(tool_id)
                if not catalog_tool:
                    return [], f"未知工具: {tool_id}"
                if runtime_id not in catalog_tool["runtimes"]:
                    continue
    enabled_ids = default_tool_ids_for_agent(agent_id, runtime_id, category) if raw_tools is None else _enabled_ids_from_tools(raw_tools)
    normalized: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for tool_id in enabled_ids:
        catalog_tool = TOOL_BY_ID.get(tool_id)
        if not catalog_tool:
            if strict:
                return [], f"未知工具: {tool_id}"
            continue
        if runtime_id not in catalog_tool["runtimes"]:
            if strict:
                continue
            continue
        if tool_id in seen:
            continue
        normalized.append({
            "id": catalog_tool["id"],
            "name": catalog_tool["name"],
            "description": catalog_tool["description"],
            "enabled": True,
            "displayGroup": catalog_tool["displayGroup"],
            "riskGroup": catalog_tool["riskGroup"],
            "riskLevel": catalog_tool["riskLevel"],
        })
        seen.add(tool_id)
    return normalized, None


def permissions_from_tools(tools: Any) -> Dict[str, bool]:
    permissions = {**DEFAULT_PERMISSIONS}
    raw_tools = tools if isinstance(tools, list) else []
    for tool_id in _enabled_ids_from_tools(raw_tools):
        catalog_tool = TOOL_BY_ID.get(tool_id)
        if not catalog_tool:
            continue
        for permission_key in catalog_tool.get("permissionKeys") or []:
            permissions[str(permission_key)] = True
    return permissions


def agent_enabled_tool_ids(agent: Optional[Dict[str, Any]]) -> set[str]:
    return set(_enabled_ids_from_tools((agent or {}).get("tools") or []))


def agent_has_tool(agent: Optional[Dict[str, Any]], tool_id: str) -> bool:
    return tool_id in agent_enabled_tool_ids(agent)


def tool_mutates_workspace(tool_id: str) -> bool:
    tool = TOOL_BY_ID.get(tool_id)
    return bool(tool and tool.get("mutatesWorkspace"))
