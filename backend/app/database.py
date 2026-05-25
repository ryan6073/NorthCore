import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import unquote, urlparse

from app.config import ROOT_DIR, settings


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_load(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _resolve_sqlite_path() -> Path:
    database_url = settings.DATABASE_URL
    if database_url.startswith("sqlite:///"):
        raw_path = database_url.replace("sqlite:///", "", 1)
        path = Path(unquote(raw_path))
        return path if path.is_absolute() else ROOT_DIR / path
    if database_url.startswith("sqlite:////"):
        parsed = urlparse(database_url)
        return Path(unquote(parsed.path))
    return ROOT_DIR / "agenthub.db"


DB_PATH = _resolve_sqlite_path()


@contextmanager
def get_connection() -> Iterable[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


DEFAULT_PERMISSIONS = {
    "canReadFiles": False,
    "canWriteFiles": False,
    "canRunCommands": False,
    "canGenerateArtifacts": True,
    "canDeploy": False,
}


DEFAULT_AGENTS = [
    {
        "id": "agent-orchestrator",
        "name": "Orchestrator",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=orchestrator",
        "description": "任务调度与智能拆解汇总",
        "tags": ["任务拆解", "调度", "汇总"],
        "status": "online",
        "category": "orchestrator",
        "provider": "mock",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是 Orchestrator，负责理解用户需求、拆解任务、调度不同 Agent 协同工作并汇总结果。",
        "modelConfig": {
            "provider": "mock",
            "modelName": "orchestrator-v1",
            "temperature": 0.7,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "task_plan", "name": "任务拆解", "description": "将复杂需求拆解成执行步骤", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
            "canReadFiles": True,
            "canWriteFiles": True,
            "canRunCommands": True,
        },
    },
    {
        "id": "agent-claude-code",
        "name": "Claude Code",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=claude-code",
        "description": "专业代码生成与工程理解",
        "tags": ["代码生成", "工程理解", "网页产物"],
        "status": "online",
        "category": "coding",
        "provider": "claude-code",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是一个精通全栈开发的 AI 工程师。请直接根据用户要求编写高质量代码产物。生成网页时优先输出完整 HTML。",
        "modelConfig": {
            "provider": "claude-code",
            "modelName": "claude-code-simulated",
            "temperature": 0.2,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "code_generate", "name": "代码生成", "description": "生成代码或网页产物", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
            "canReadFiles": True,
            "canWriteFiles": True,
        },
    },
    {
        "id": "agent-codex",
        "name": "Codex",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=codex",
        "description": "代码理解、Bug 修复与代码审查",
        "tags": ["代码审查", "Bug修复", "质量检查"],
        "status": "online",
        "category": "review",
        "provider": "codex",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是一个资深代码审查专家。请分析方案或代码的风险、缺陷和改进建议，回答要清晰、具体、可执行。",
        "modelConfig": {
            "provider": "codex",
            "modelName": "codex-simulated",
            "temperature": 0.1,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "code_review", "name": "代码审查", "description": "审查代码质量和风险", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
            "canReadFiles": True,
        },
    },
]


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'offline',
                category TEXT NOT NULL DEFAULT 'custom',
                provider TEXT NOT NULL DEFAULT 'mock',
                enabled INTEGER NOT NULL DEFAULT 1,
                last_used_at TEXT,
                system_prompt TEXT NOT NULL DEFAULT '',
                model_config_json TEXT NOT NULL DEFAULT '{}',
                tools_json TEXT NOT NULL DEFAULT '[]',
                permissions_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                mode TEXT NOT NULL CHECK (mode IN ('single', 'group')),
                last_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversation_agents (
                conversation_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                PRIMARY KEY (conversation_id, agent_id),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                role TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'text',
                content TEXT NOT NULL DEFAULT '',
                language TEXT,
                artifact_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT,
                run_id TEXT,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                description TEXT,
                size INTEGER,
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                storage_path TEXT NOT NULL,
                url TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
                ON conversations(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
                ON messages(conversation_id, created_at ASC);
            CREATE INDEX IF NOT EXISTS idx_artifacts_conversation_created_at
                ON artifacts(conversation_id, created_at DESC);
            """
        )
        seed_agents(conn)


def seed_agents(conn: sqlite3.Connection) -> None:
    existing = conn.execute("SELECT COUNT(*) AS count FROM agents").fetchone()["count"]
    if existing:
        return
    timestamp = now_text()
    for agent in DEFAULT_AGENTS:
        conn.execute(
            """
            INSERT INTO agents (
                id, name, avatar, description, tags_json, status, category, provider,
                enabled, last_used_at, system_prompt, model_config_json, tools_json,
                permissions_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent["id"],
                agent["name"],
                agent["avatar"],
                agent["description"],
                _json_dump(agent["tags"]),
                agent["status"],
                agent["category"],
                agent["provider"],
                1 if agent["enabled"] else 0,
                agent["lastUsedAt"],
                agent["systemPrompt"],
                _json_dump(agent["modelConfig"]),
                _json_dump(agent["tools"]),
                _json_dump(agent["permissions"]),
                timestamp,
                timestamp,
            ),
        )


def paginate(items: List[Dict[str, Any]], page: int, page_size: int) -> Dict[str, Any]:
    total = len(items)
    start = max(page - 1, 0) * page_size
    end = start + page_size
    return {
        "list": items[start:end],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": end < total,
    }


def agent_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "avatar": row["avatar"],
        "description": row["description"],
        "tags": _json_load(row["tags_json"], []),
        "status": row["status"],
        "category": row["category"],
        "provider": row["provider"],
        "enabled": bool(row["enabled"]),
        "lastUsedAt": row["last_used_at"],
        "systemPrompt": row["system_prompt"],
        "modelConfig": _json_load(row["model_config_json"], {}),
        "tools": _json_load(row["tools_json"], []),
        "permissions": _json_load(row["permissions_json"], DEFAULT_PERMISSIONS),
    }


def conversation_from_row(row: sqlite3.Row, agent_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "mode": row["mode"],
        "agentIds": agent_ids or [],
        "lastMessage": row["last_message"],
        "updatedAt": row["updated_at"],
        "createdAt": row["created_at"],
    }


def message_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    message = {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "senderId": row["sender_id"],
        "senderName": row["sender_name"],
        "role": row["role"],
        "type": row["type"],
        "content": row["content"],
        "createdAt": row["created_at"],
    }
    if row["language"]:
        message["language"] = row["language"]
    if row["artifact_id"]:
        message["artifactId"] = row["artifact_id"]
    return message


def artifact_meta_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    artifact = {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "title": row["title"],
        "type": row["type"],
        "createdAt": row["created_at"],
    }
    if row["description"]:
        artifact["description"] = row["description"]
    if row["size"] is not None:
        artifact["size"] = row["size"]
    return artifact


def artifact_detail_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    artifact = artifact_meta_from_row(row)
    artifact["content"] = row["content"]
    return artifact


def list_agents(
    page: int = 1,
    page_size: int = 20,
    category: Optional[str] = None,
    provider: Optional[str] = None,
    keyword: Optional[str] = None,
    enabled: Optional[bool] = None,
) -> Dict[str, Any]:
    query = "SELECT * FROM agents WHERE 1=1"
    params: List[Any] = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if provider:
        query += " AND provider = ?"
        params.append(provider)
    if keyword:
        query += " AND (name LIKE ? OR description LIKE ?)"
        like = f"%{keyword}%"
        params.extend([like, like])
    if enabled is not None:
        query += " AND enabled = ?"
        params.append(1 if enabled else 0)
    query += " ORDER BY enabled DESC, name ASC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return paginate([agent_from_row(row) for row in rows], page, page_size)


def get_agent(agent_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    return agent_from_row(row) if row else None


def update_agent(agent_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    current = get_agent(agent_id)
    if not current:
        return None

    updated = {**current, **payload, "id": agent_id}
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE agents
            SET name = ?, avatar = ?, description = ?, tags_json = ?, status = ?,
                category = ?, provider = ?, enabled = ?, last_used_at = ?,
                system_prompt = ?, model_config_json = ?, tools_json = ?,
                permissions_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                updated["name"],
                updated.get("avatar", ""),
                updated.get("description", ""),
                _json_dump(updated.get("tags", [])),
                updated.get("status", "offline"),
                updated.get("category", "custom"),
                updated.get("provider", "mock"),
                1 if updated.get("enabled", True) else 0,
                updated.get("lastUsedAt"),
                updated.get("systemPrompt", ""),
                _json_dump(updated.get("modelConfig", {})),
                _json_dump(updated.get("tools", [])),
                _json_dump(updated.get("permissions", DEFAULT_PERMISSIONS)),
                timestamp,
                agent_id,
            ),
        )
    return get_agent(agent_id)


def get_conversation_agent_ids(conn: sqlite3.Connection, conversation_id: str) -> List[str]:
    rows = conn.execute(
        "SELECT agent_id FROM conversation_agents WHERE conversation_id = ? ORDER BY rowid ASC",
        (conversation_id,),
    ).fetchall()
    return [row["agent_id"] for row in rows]


def list_conversations(
    page: int = 1,
    page_size: int = 20,
    mode: Optional[str] = None,
    keyword: Optional[str] = None,
) -> Dict[str, Any]:
    query = "SELECT * FROM conversations WHERE 1=1"
    params: List[Any] = []
    if mode:
        query += " AND mode = ?"
        params.append(mode)
    if keyword:
        query += " AND title LIKE ?"
        params.append(f"%{keyword}%")
    query += " ORDER BY updated_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        conversations = [
            conversation_from_row(row, get_conversation_agent_ids(conn, row["id"]))
            for row in rows
        ]
    return paginate(conversations, page, page_size)


def create_conversation(title: str, mode: str, agent_ids: List[str]) -> Dict[str, Any]:
    conversation_id = create_id("conv")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO conversations (id, title, mode, last_message, created_at, updated_at)
            VALUES (?, ?, ?, '', ?, ?)
            """,
            (conversation_id, title, mode, timestamp, timestamp),
        )
        for agent_id in agent_ids:
            conn.execute(
                "INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id) VALUES (?, ?)",
                (conversation_id, agent_id),
            )
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        return conversation_from_row(row, get_conversation_agent_ids(conn, conversation_id))


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        if not row:
            return None
        return conversation_from_row(row, get_conversation_agent_ids(conn, conversation_id))


def update_conversation(conversation_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    current = get_conversation(conversation_id)
    if not current:
        return None
    title = payload.get("title", current["title"])
    agent_ids = payload.get("agentIds")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            (title, timestamp, conversation_id),
        )
        if agent_ids is not None:
            conn.execute("DELETE FROM conversation_agents WHERE conversation_id = ?", (conversation_id,))
            for agent_id in agent_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id) VALUES (?, ?)",
                    (conversation_id, agent_id),
                )
    return get_conversation(conversation_id)


def delete_conversation(conversation_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        return cur.rowcount > 0


def list_messages(conversation_id: str, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC",
            (conversation_id,),
        ).fetchall()
    return paginate([message_from_row(row) for row in rows], page, page_size)


def create_message(
    conversation_id: str,
    sender_id: str,
    sender_name: str,
    role: str,
    content: str,
    msg_type: str = "text",
    language: Optional[str] = None,
    artifact_id: Optional[str] = None,
    message_id: Optional[str] = None,
) -> Dict[str, Any]:
    message_id = message_id or create_id("msg")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO messages (
                id, conversation_id, sender_id, sender_name, role, type,
                content, language, artifact_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_id,
                conversation_id,
                sender_id,
                sender_name,
                role,
                msg_type,
                content,
                language,
                artifact_id,
                timestamp,
            ),
        )
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
        return message_from_row(row)


def update_conversation_activity(conversation_id: str, last_message: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE conversations SET last_message = ?, updated_at = ? WHERE id = ?",
            (last_message[:200], now_text(), conversation_id),
        )


def list_artifacts(conversation_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE conversation_id = ? ORDER BY created_at DESC",
            (conversation_id,),
        ).fetchall()
    return [artifact_meta_from_row(row) for row in rows]


def get_artifact(artifact_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
    return artifact_detail_from_row(row) if row else None


def create_artifact(
    conversation_id: str,
    title: str,
    artifact_type: str,
    content: str,
    message_id: Optional[str] = None,
    run_id: Optional[str] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    artifact_id = create_id("artifact")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO artifacts (
                id, conversation_id, message_id, run_id, title, type,
                description, size, content, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                artifact_id,
                conversation_id,
                message_id,
                run_id,
                title,
                artifact_type,
                description,
                len(content.encode("utf-8")),
                content,
                timestamp,
                timestamp,
            ),
        )
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        return artifact_detail_from_row(row)


def update_artifact(artifact_id: str, content: str) -> Optional[Dict[str, Any]]:
    timestamp = now_text()
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE artifacts SET content = ?, size = ?, updated_at = ? WHERE id = ?",
            (content, len(content.encode("utf-8")), timestamp, artifact_id),
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        return artifact_detail_from_row(row)


def get_context_messages(
    conversation_id: str,
    limit: int = 12,
    exclude_message_id: Optional[str] = None,
) -> List[Dict[str, str]]:
    exclude_clause = ""
    params: List[Any] = [conversation_id]
    if exclude_message_id:
        exclude_clause = "AND id != ?"
        params.append(exclude_message_id)
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT role, content
            FROM messages
            WHERE conversation_id = ?
              AND type IN ('text', 'code')
              AND content != ''
              {exclude_clause}
            ORDER BY created_at DESC, rowid DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    result: List[Dict[str, str]] = []
    for row in reversed(rows):
        role = "assistant" if row["role"] in ("agent", "orchestrator", "system") else "user"
        result.append({"role": role, "content": row["content"]})
    return result


def get_chat_history(session_id: str) -> List[Dict[str, str]]:
    return get_context_messages(session_id)


def save_message(session_id: str, role: str, agent_name: str, content: str, msg_type: str = "text") -> None:
    sender_id = "user" if role == "user" else f"agent-{agent_name.lower().replace(' ', '-')}"
    sender_name = "用户" if role == "user" else agent_name
    normalized_role = "agent" if role == "assistant" else role
    if get_conversation(session_id):
        create_message(
            conversation_id=session_id,
            sender_id=sender_id,
            sender_name=sender_name,
            role=normalized_role,
            content=content,
            msg_type=msg_type,
        )
