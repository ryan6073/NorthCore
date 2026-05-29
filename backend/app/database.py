import json
import sqlite3
import uuid
import hashlib
import hmac
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import unquote, urlparse

from app.config import ROOT_DIR, settings


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def future_text(days: int) -> str:
    return (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


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


def _hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_HASH_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt}${password_hash}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt, expected_hash = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
    except (ValueError, AttributeError):
        return False
    actual_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(actual_hash, expected_hash)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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

DEFAULT_ADMIN_EMAIL = "admin@northcore.ai"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "默认管理员"
GUEST_EMAIL = "guest@northcore.local"
PASSWORD_HASH_ITERATIONS = 120_000
SESSION_EXPIRE_DAYS = 14
ORCHESTRATOR_AGENT_ID = "agent-orchestrator"


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
        "id": "agent-chat",
        "name": "默认聊天助手",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=chat-agent",
        "description": "通用问答、解释说明与日常对话",
        "tags": ["聊天", "问答", "通用助手"],
        "status": "online",
        "category": "assistant",
        "provider": "mock",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是一个友好、清晰、可靠的默认聊天助手。请直接回答用户问题，必要时给出结构化步骤；不确定时说明假设，不编造事实。",
        "modelConfig": {
            "provider": "mock",
            "modelName": "chat-assistant-v1",
            "temperature": 0.6,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "general_chat", "name": "通用问答", "description": "回答问题、解释概念、整理思路", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
        },
    },
    {
        "id": "agent-translator",
        "name": "翻译助手",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=translator-agent",
        "description": "中英互译、多语言翻译与文本润色",
        "tags": ["翻译", "中英互译", "文本润色"],
        "status": "online",
        "category": "language",
        "provider": "mock",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是一个好用的翻译助手。请将用户提供的中文翻译成英文，将非中文内容翻译成中文；只返回翻译结果，保持原意、格式和语气，必要时让译文更自然。",
        "modelConfig": {
            "provider": "mock",
            "modelName": "translator-v1",
            "temperature": 0.2,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "translate", "name": "翻译", "description": "执行中英互译和文本润色", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
        },
    },
    {
        "id": "agent-mermaid",
        "name": "图表助手",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=mermaid-agent",
        "description": "使用 Mermaid 生成流程图、时序图、架构图和关系图",
        "tags": ["图表", "Mermaid", "流程图", "时序图", "架构图"],
        "status": "online",
        "category": "diagram",
        "provider": "mock",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是一个擅长 Mermaid 图表的助手。请判断用户需求是否适合用图解释；适合时输出简洁说明和正确的 Mermaid 代码块，不适合时正常回答。Mermaid 语法必须有效、清晰、不过度复杂。",
        "modelConfig": {
            "provider": "mock",
            "modelName": "mermaid-diagram-v1",
            "temperature": 0.3,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "mermaid_generate", "name": "Mermaid 图表", "description": "生成 Mermaid 流程图、时序图和结构图", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
            "canGenerateArtifacts": True,
        },
    },
    {
        "id": "agent-document",
        "name": "文档助手",
        "avatar": "https://api.dicebear.com/7.x/shapes/svg?seed=document-agent",
        "description": "生成 Markdown 文档、汇报材料和 PPT 大纲",
        "tags": ["Markdown", "文档生成", "PPT", "富文档"],
        "status": "online",
        "category": "document",
        "provider": "mock",
        "enabled": True,
        "lastUsedAt": None,
        "systemPrompt": "你是一个文档生成助手。请根据用户目标生成结构清晰的 Markdown 文档、汇报材料或 PPT 大纲；内容要有标题、层级、要点和可执行结论。",
        "modelConfig": {
            "provider": "mock",
            "modelName": "document-writer-v1",
            "temperature": 0.4,
            "maxTokens": 8192,
        },
        "tools": [
            {"id": "document_generate", "name": "文档生成", "description": "生成 Markdown、汇报文档和 PPT 大纲", "enabled": True},
        ],
        "permissions": {
            **DEFAULT_PERMISSIONS,
            "canGenerateArtifacts": True,
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

DEFAULT_AGENT_IDS = {agent["id"] for agent in DEFAULT_AGENTS}


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                avatar TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_user_overrides (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                base_agent_id TEXT NOT NULL,
                name TEXT,
                avatar TEXT,
                description TEXT,
                tags_json TEXT,
                status TEXT,
                category TEXT,
                provider TEXT,
                enabled INTEGER,
                last_used_at TEXT,
                system_prompt TEXT NOT NULL DEFAULT '',
                model_config_json TEXT,
                tools_json TEXT,
                permissions_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(owner_user_id, base_agent_id),
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (base_agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT,
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
                updated_at TEXT NOT NULL,
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                mode TEXT NOT NULL CHECK (mode IN ('agent', 'single', 'group')),
                conversation_type TEXT NOT NULL DEFAULT 'manual',
                contact_agent_id TEXT,
                visible INTEGER NOT NULL DEFAULT 1,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                system_prompt TEXT NOT NULL DEFAULT '',
                last_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS conversation_agents (
                conversation_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                PRIMARY KEY (conversation_id, agent_id),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS conversation_agent_overrides (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                name TEXT,
                avatar TEXT,
                description TEXT,
                tags_json TEXT,
                status TEXT,
                category TEXT,
                provider TEXT,
                enabled INTEGER,
                last_used_at TEXT,
                system_prompt TEXT,
                model_config_json TEXT,
                tools_json TEXT,
                permissions_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(conversation_id, agent_id),
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
                metadata_json TEXT NOT NULL DEFAULT '{}',
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
                tags_json TEXT NOT NULL DEFAULT '[]',
                current_version_id TEXT,
                latest_version INTEGER NOT NULL DEFAULT 0,
                size INTEGER,
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS artifact_versions (
                id TEXT PRIMARY KEY,
                artifact_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                language TEXT,
                size INTEGER,
                change_summary TEXT,
                created_by TEXT NOT NULL,
                created_by_type TEXT NOT NULL,
                parent_version_id TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_version_id) REFERENCES artifact_versions(id) ON DELETE SET NULL,
                UNIQUE (artifact_id, version)
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

            CREATE TABLE IF NOT EXISTS conversation_summaries (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL UNIQUE,
                summary TEXT NOT NULL DEFAULT '',
                covered_until_message_id TEXT,
                covered_message_count INTEGER NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (covered_until_message_id) REFERENCES messages(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS long_term_memories (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.0,
                source_message_id TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL,
                UNIQUE (conversation_id, category, content)
            );

            CREATE TABLE IF NOT EXISTS pinned_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                UNIQUE (conversation_id, message_id)
            );

            CREATE TABLE IF NOT EXISTS sandboxes (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                run_id TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                container_id TEXT,
                image TEXT NOT NULL,
                network TEXT NOT NULL DEFAULT 'none',
                workspace_path TEXT NOT NULL,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_runs (
                id TEXT PRIMARY KEY,
                sandbox_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                owner_user_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                prompt TEXT NOT NULL DEFAULT '',
                dag_json TEXT NOT NULL DEFAULT '{}',
                summary TEXT NOT NULL DEFAULT '',
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE CASCADE,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_run_steps (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                agent_name TEXT NOT NULL DEFAULT '',
                task TEXT NOT NULL DEFAULT '',
                depends_on_json TEXT NOT NULL DEFAULT '[]',
                expected_outputs_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'pending',
                claimed_by TEXT,
                output_json TEXT NOT NULL DEFAULT '{}',
                logs TEXT NOT NULL DEFAULT '',
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sandbox_files (
                id TEXT PRIMARY KEY,
                sandbox_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                path TEXT NOT NULL,
                content_hash TEXT NOT NULL DEFAULT '',
                current_version INTEGER NOT NULL DEFAULT 0,
                artifact_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE CASCADE,
                FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
                FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL,
                UNIQUE (sandbox_id, path)
            );

            CREATE TABLE IF NOT EXISTS sandbox_file_versions (
                id TEXT PRIMARY KEY,
                file_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                content_hash TEXT NOT NULL DEFAULT '',
                created_by_step_id TEXT,
                base_version INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (file_id) REFERENCES sandbox_files(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by_step_id) REFERENCES agent_run_steps(id) ON DELETE SET NULL,
                UNIQUE (file_id, version)
            );

            CREATE TABLE IF NOT EXISTS sandbox_conflicts (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                sandbox_id TEXT NOT NULL,
                file_id TEXT,
                file_path TEXT NOT NULL,
                base_version INTEGER NOT NULL DEFAULT 0,
                current_version INTEGER NOT NULL DEFAULT 0,
                incoming_content TEXT NOT NULL DEFAULT '',
                incoming_hash TEXT NOT NULL DEFAULT '',
                created_by_step_id TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                resolution TEXT,
                created_at TEXT NOT NULL,
                resolved_at TEXT,
                FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
                FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE CASCADE,
                FOREIGN KEY (file_id) REFERENCES sandbox_files(id) ON DELETE SET NULL,
                FOREIGN KEY (created_by_step_id) REFERENCES agent_run_steps(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
                ON conversations(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash
                ON user_sessions(token_hash);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
                ON messages(conversation_id, created_at ASC);
            CREATE INDEX IF NOT EXISTS idx_artifacts_conversation_created_at
                ON artifacts(conversation_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_version
                ON artifact_versions(artifact_id, version DESC);
            CREATE INDEX IF NOT EXISTS idx_memories_conversation_active
                ON long_term_memories(conversation_id, active, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation
                ON pinned_messages(conversation_id, created_at ASC);
            CREATE INDEX IF NOT EXISTS idx_conversation_agent_overrides_conversation
                ON conversation_agent_overrides(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation
                ON agent_runs(conversation_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_run_steps_run_status
                ON agent_run_steps(run_id, status);
            CREATE INDEX IF NOT EXISTS idx_sandbox_files_run_path
                ON sandbox_files(run_id, path);
            CREATE INDEX IF NOT EXISTS idx_sandbox_conflicts_run_status
                ON sandbox_conflicts(run_id, status);
            """
        )
        ensure_column(conn, "artifacts", "tags_json", "TEXT NOT NULL DEFAULT '[]'")
        ensure_column(conn, "artifacts", "current_version_id", "TEXT")
        ensure_column(conn, "artifacts", "latest_version", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "messages", "metadata_json", "TEXT NOT NULL DEFAULT '{}'")
        ensure_column(conn, "agents", "owner_user_id", "TEXT")
        ensure_column(conn, "agent_user_overrides", "name", "TEXT")
        ensure_column(conn, "agent_user_overrides", "avatar", "TEXT")
        ensure_column(conn, "agent_user_overrides", "description", "TEXT")
        ensure_column(conn, "agent_user_overrides", "tags_json", "TEXT")
        ensure_column(conn, "agent_user_overrides", "status", "TEXT")
        ensure_column(conn, "agent_user_overrides", "category", "TEXT")
        ensure_column(conn, "agent_user_overrides", "provider", "TEXT")
        ensure_column(conn, "agent_user_overrides", "enabled", "INTEGER")
        ensure_column(conn, "agent_user_overrides", "last_used_at", "TEXT")
        ensure_column(conn, "agent_user_overrides", "model_config_json", "TEXT")
        ensure_column(conn, "agent_user_overrides", "tools_json", "TEXT")
        ensure_column(conn, "agent_user_overrides", "permissions_json", "TEXT")
        ensure_column(conn, "conversations", "owner_user_id", "TEXT")
        ensure_column(conn, "conversations", "conversation_type", "TEXT NOT NULL DEFAULT 'manual'")
        ensure_column(conn, "conversations", "contact_agent_id", "TEXT")
        ensure_column(conn, "conversations", "visible", "INTEGER NOT NULL DEFAULT 1")
        ensure_column(conn, "conversations", "is_pinned", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "conversations", "is_archived", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "conversations", "system_prompt", "TEXT NOT NULL DEFAULT ''")
        seed_default_user(conn)
        migrate_legacy_ownership(conn)
        migrate_agent_conversation_mode(conn)
        conn.executescript(
            """
            DROP INDEX IF EXISTS idx_conversations_contact_unique;
            CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated_at
                ON conversations(owner_user_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_conversations_contact_agent
                ON conversations(owner_user_id, contact_agent_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_contact_unique
                ON conversations(owner_user_id, contact_agent_id)
                WHERE mode = 'agent' AND contact_agent_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_agents_owner_enabled
                ON agents(owner_user_id, enabled);
            """
        )
        migrate_artifact_versions(conn)
        seed_agents(conn)
        ensure_group_orchestrator_memberships(conn)
        ensure_all_user_contact_conversations(conn)


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, ddl: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    if column_name not in {row["name"] for row in rows}:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")


def migrate_agent_conversation_mode(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversations'"
    ).fetchone()
    create_sql = row["sql"] if row else ""
    needs_rebuild = "mode IN ('agent', 'single', 'group')" not in create_sql
    if needs_rebuild:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.executescript(
            """
            CREATE TABLE conversations_new (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                mode TEXT NOT NULL CHECK (mode IN ('agent', 'single', 'group')),
                conversation_type TEXT NOT NULL DEFAULT 'manual',
                contact_agent_id TEXT,
                visible INTEGER NOT NULL DEFAULT 1,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                system_prompt TEXT NOT NULL DEFAULT '',
                last_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (contact_agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );

            INSERT INTO conversations_new (
                id, owner_user_id, title, mode, conversation_type,
                contact_agent_id, visible, is_pinned, is_archived,
                system_prompt, last_message, created_at, updated_at
            )
            SELECT
                id,
                owner_user_id,
                title,
                CASE
                    WHEN conversation_type = 'contact' OR contact_agent_id IS NOT NULL THEN 'agent'
                    ELSE mode
                END,
                conversation_type,
                contact_agent_id,
                COALESCE(visible, 1),
                COALESCE(is_pinned, 0),
                COALESCE(is_archived, 0),
                COALESCE(system_prompt, ''),
                last_message,
                created_at,
                updated_at
            FROM conversations;

            DROP TABLE conversations;
            ALTER TABLE conversations_new RENAME TO conversations;
            """
        )
        conn.execute("PRAGMA foreign_keys = ON")

    conn.execute(
        """
        UPDATE conversations
        SET mode = 'agent', conversation_type = 'contact'
        WHERE conversation_type = 'contact' OR contact_agent_id IS NOT NULL
        """
    )


def migrate_artifact_versions(conn: sqlite3.Connection) -> None:
    artifacts = conn.execute("SELECT * FROM artifacts").fetchall()
    for artifact in artifacts:
        existing = conn.execute(
            "SELECT id FROM artifact_versions WHERE artifact_id = ? AND version = 1",
            (artifact["id"],),
        ).fetchone()
        if existing:
            if not artifact["current_version_id"]:
                conn.execute(
                    "UPDATE artifacts SET current_version_id = ?, latest_version = 1 WHERE id = ?",
                    (existing["id"], artifact["id"]),
                )
            continue
        version_id = create_id("version")
        created_by = artifact["message_id"] or "system"
        created_at = artifact["created_at"]
        conn.execute(
            """
            INSERT INTO artifact_versions (
                id, artifact_id, version, content, language, size, change_summary,
                created_by, created_by_type, parent_version_id, metadata_json, created_at
            )
            VALUES (?, ?, 1, ?, NULL, ?, ?, ?, 'agent', NULL, '{}', ?)
            """,
            (
                version_id,
                artifact["id"],
                artifact["content"] or "",
                artifact["size"] or len((artifact["content"] or "").encode("utf-8")),
                "历史产物迁移为 v1",
                created_by,
                created_at,
            ),
        )
        conn.execute(
            """
            UPDATE artifacts
            SET current_version_id = ?, latest_version = 1
            WHERE id = ?
            """,
            (version_id, artifact["id"]),
            )


def seed_default_user(conn: sqlite3.Connection) -> None:
    timestamp = now_text()
    existing = conn.execute(
        "SELECT id FROM users WHERE email = ?",
        (DEFAULT_ADMIN_EMAIL,),
    ).fetchone()
    if existing:
        return
    conn.execute(
        """
        INSERT INTO users (id, email, password_hash, name, avatar, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
        """,
        (
            "user-admin",
            DEFAULT_ADMIN_EMAIL,
            _hash_password(DEFAULT_ADMIN_PASSWORD),
            DEFAULT_ADMIN_NAME,
            "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
            timestamp,
            timestamp,
        ),
    )


def migrate_legacy_ownership(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        UPDATE conversations
        SET owner_user_id = ?
        WHERE owner_user_id IS NULL OR owner_user_id = ''
        """,
        ("user-admin",),
    )
    default_agent_ids = tuple(sorted(DEFAULT_AGENT_IDS))
    default_placeholders = ",".join("?" for _ in default_agent_ids)
    conn.execute(
        f"""
        UPDATE agents
        SET owner_user_id = ?
        WHERE (owner_user_id IS NULL OR owner_user_id = '')
          AND id NOT IN ({default_placeholders})
        """,
        ("user-admin", *default_agent_ids),
    )
    conn.execute(
        f"""
        UPDATE agents
        SET owner_user_id = NULL
        WHERE id IN ({default_placeholders})
        """,
        default_agent_ids,
    )


def get_enabled_agents_for_user_conn(conn: sqlite3.Connection, owner_user_id: str) -> List[sqlite3.Row]:
    return conn.execute(
        """
        SELECT *
        FROM agents
        WHERE enabled = 1
          AND status != 'disabled'
          AND id != ?
          AND (owner_user_id IS NULL OR owner_user_id = ?)
        ORDER BY name ASC
        """,
        (ORCHESTRATOR_AGENT_ID, owner_user_id),
    ).fetchall()


def ensure_contact_conversation_conn(
    conn: sqlite3.Connection,
    owner_user_id: str,
    agent_id: str,
    title: Optional[str] = None,
    restore_visible: bool = True,
) -> Dict[str, Any]:
    if agent_id == ORCHESTRATOR_AGENT_ID:
        raise ValueError("Orchestrator 是群聊调度器，不提供长期联系人会话")

    existing = conn.execute(
        """
        SELECT *
        FROM conversations
        WHERE owner_user_id = ?
          AND mode = 'agent'
          AND contact_agent_id = ?
        """,
        (owner_user_id, agent_id),
    ).fetchone()
    if existing:
        if restore_visible and not existing["visible"]:
            conn.execute(
                "UPDATE conversations SET visible = 1, updated_at = ? WHERE id = ?",
                (now_text(), existing["id"]),
            )
            existing = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (existing["id"],),
            ).fetchone()
        return conversation_from_row(existing, get_conversation_agent_ids(conn, existing["id"]))

    agent = conn.execute(
        """
        SELECT *
        FROM agents
        WHERE id = ?
          AND enabled = 1
          AND status != 'disabled'
          AND (owner_user_id IS NULL OR owner_user_id = ?)
        """,
        (agent_id, owner_user_id),
    ).fetchone()
    if not agent:
        raise ValueError("Agent 不存在或已禁用")

    conversation_id = create_id("conv")
    timestamp = now_text()
    conn.execute(
        """
            INSERT INTO conversations (
                id, owner_user_id, title, mode, conversation_type,
                contact_agent_id, visible, is_pinned, is_archived,
                system_prompt, last_message, created_at, updated_at
            )
            VALUES (?, ?, ?, 'agent', 'contact', ?, 1, 0, 0, '', '', ?, ?)
        """,
        (conversation_id, owner_user_id, title or agent["name"], agent_id, timestamp, timestamp),
    )
    conn.execute(
        "INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id) VALUES (?, ?)",
        (conversation_id, agent_id),
    )
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    return conversation_from_row(row, get_conversation_agent_ids(conn, conversation_id))


def ensure_user_contact_conversations_conn(conn: sqlite3.Connection, owner_user_id: str) -> None:
    for agent in get_enabled_agents_for_user_conn(conn, owner_user_id):
        ensure_contact_conversation_conn(
            conn,
            owner_user_id,
            agent["id"],
            agent["name"],
            restore_visible=False,
        )


def ensure_all_user_contact_conversations(conn: sqlite3.Connection) -> None:
    users = conn.execute("SELECT id FROM users").fetchall()
    for user in users:
        ensure_user_contact_conversations_conn(conn, user["id"])


def ensure_group_orchestrator_memberships(conn: sqlite3.Connection) -> None:
    if not conn.execute(
        """
        SELECT id FROM agents
        WHERE id = ? AND enabled = 1 AND status != 'disabled'
        """,
        (ORCHESTRATOR_AGENT_ID,),
    ).fetchone():
        return
    rows = conn.execute("SELECT id FROM conversations WHERE mode = 'group'").fetchall()
    for row in rows:
        agent_ids = get_conversation_agent_ids(conn, row["id"])
        ordered_agent_ids = [ORCHESTRATOR_AGENT_ID] + [
            agent_id for agent_id in agent_ids if agent_id != ORCHESTRATOR_AGENT_ID
        ]
        conn.execute("DELETE FROM conversation_agents WHERE conversation_id = ?", (row["id"],))
        for agent_id in ordered_agent_ids:
            conn.execute(
                """
                INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id)
                VALUES (?, ?)
                """,
                (row["id"], agent_id),
            )


def seed_agents(conn: sqlite3.Connection) -> None:
    timestamp = now_text()
    for agent in DEFAULT_AGENTS:
        conn.execute(
            """
            INSERT OR IGNORE INTO agents (
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


def user_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "avatar": row["avatar"],
        "role": row["role"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def update_user_profile(
    user_id: str,
    name: Optional[str] = None,
    email: Optional[str] = None,
    avatar: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    current = get_user(user_id)
    if not current:
        return None
    updated_name = current["name"] if name is None else name.strip()
    updated_email = current["email"] if email is None else email.strip().lower()
    updated_avatar = current["avatar"] if avatar is None else avatar.strip()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE users
            SET name = ?, email = ?, avatar = ?, updated_at = ?
            WHERE id = ?
            """,
            (updated_name, updated_email, updated_avatar, now_text(), user_id),
        )
    return get_user(user_id)


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return user_from_row(row) if row else None


def get_default_user() -> Dict[str, Any]:
    user = get_user("user-admin")
    if user:
        return user
    with get_connection() as conn:
        seed_default_user(conn)
    return get_user("user-admin")


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    normalized_email = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (normalized_email,)).fetchone()
    return user_from_row(row) if row else None


def create_user(email: str, password: str, name: str, avatar: str = "", role: str = "user") -> Optional[Dict[str, Any]]:
    normalized_email = email.strip().lower()
    timestamp = now_text()
    user_id = create_id("user")
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (normalized_email,)).fetchone()
        if existing:
            return None
        conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, avatar, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                normalized_email,
                _hash_password(password),
                name.strip() or normalized_email.split("@", 1)[0],
                avatar,
                role,
                timestamp,
                timestamp,
            ),
        )
    user = get_user(user_id)
    ensure_user_contact_conversations(user_id)
    return user


def verify_user_credentials(email: str, password: str) -> Optional[Dict[str, Any]]:
    normalized_email = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (normalized_email,)).fetchone()
    if not row or not _verify_password(password, row["password_hash"]):
        return None
    return user_from_row(row)


def create_user_session(user_id: str) -> Dict[str, Any]:
    token = secrets.token_urlsafe(32)
    session_id = create_id("session")
    timestamp = now_text()
    expires_at = future_text(SESSION_EXPIRE_DAYS)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, user_id, _token_hash(token), timestamp, expires_at),
        )
    return {
        "token": token,
        "tokenType": "Bearer",
        "expiresAt": expires_at,
    }


def get_user_by_session_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM user_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            """,
            (_token_hash(token), now_text()),
        ).fetchone()
    return user_from_row(row) if row else None


def revoke_user_session(token: str) -> bool:
    if not token:
        return False
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM user_sessions WHERE token_hash = ?",
            (_token_hash(token),),
        )
        return cur.rowcount > 0


def get_or_create_guest_user() -> Dict[str, Any]:
    existing = get_user_by_email(GUEST_EMAIL)
    if existing:
        ensure_user_contact_conversations(existing["id"])
        return existing
    user = create_user(
        email=GUEST_EMAIL,
        password=secrets.token_urlsafe(16),
        name="游客用户",
        avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=guest",
        role="guest",
    )
    user = user or get_user_by_email(GUEST_EMAIL)
    ensure_user_contact_conversations(user["id"])
    return user


def agent_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "ownerUserId": row["owner_user_id"],
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


def apply_agent_user_override(agent: Dict[str, Any], owner_user_id: Optional[str]) -> Dict[str, Any]:
    if (
        not owner_user_id
        or agent.get("ownerUserId") is not None
        or agent.get("id") == ORCHESTRATOR_AGENT_ID
    ):
        return agent
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM agent_user_overrides
            WHERE owner_user_id = ? AND base_agent_id = ?
            """,
            (owner_user_id, agent["id"]),
        ).fetchone()
    if not row:
        return agent
    overridden = {
        **agent,
        "name": row["name"] if row["name"] is not None else agent["name"],
        "avatar": row["avatar"] if row["avatar"] is not None else agent["avatar"],
        "description": row["description"] if row["description"] is not None else agent["description"],
        "tags": _json_load(row["tags_json"], agent["tags"]) if row["tags_json"] is not None else agent["tags"],
        "status": row["status"] if row["status"] is not None else agent["status"],
        "category": row["category"] if row["category"] is not None else agent["category"],
        "provider": row["provider"] if row["provider"] is not None else agent["provider"],
        "enabled": bool(row["enabled"]) if row["enabled"] is not None else agent["enabled"],
        "lastUsedAt": row["last_used_at"] if row["last_used_at"] is not None else agent["lastUsedAt"],
        "systemPrompt": row["system_prompt"] if row["system_prompt"] is not None else agent["systemPrompt"],
        "modelConfig": _json_load(row["model_config_json"], agent["modelConfig"]) if row["model_config_json"] is not None else agent["modelConfig"],
        "tools": _json_load(row["tools_json"], agent["tools"]) if row["tools_json"] is not None else agent["tools"],
        "permissions": _json_load(row["permissions_json"], agent["permissions"]) if row["permissions_json"] is not None else agent["permissions"],
        "overrideSource": "user",
        "baseAgentId": agent["id"],
    }
    if overridden["status"] == "disabled":
        overridden["enabled"] = False
    return overridden


def apply_conversation_agent_override(agent: Dict[str, Any], conversation_id: str) -> Dict[str, Any]:
    if agent.get("id") == ORCHESTRATOR_AGENT_ID:
        return agent
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM conversation_agent_overrides
            WHERE conversation_id = ? AND agent_id = ?
            """,
            (conversation_id, agent["id"]),
        ).fetchone()
    if not row:
        return agent

    overridden = {
        **agent,
        "name": row["name"] if row["name"] is not None else agent["name"],
        "avatar": row["avatar"] if row["avatar"] is not None else agent["avatar"],
        "description": row["description"] if row["description"] is not None else agent["description"],
        "tags": _json_load(row["tags_json"], agent["tags"]) if row["tags_json"] is not None else agent["tags"],
        "status": row["status"] if row["status"] is not None else agent["status"],
        "category": row["category"] if row["category"] is not None else agent["category"],
        "provider": row["provider"] if row["provider"] is not None else agent["provider"],
        "enabled": bool(row["enabled"]) if row["enabled"] is not None else agent["enabled"],
        "lastUsedAt": row["last_used_at"] if row["last_used_at"] is not None else agent["lastUsedAt"],
        "systemPrompt": row["system_prompt"] if row["system_prompt"] is not None else agent["systemPrompt"],
        "modelConfig": _json_load(row["model_config_json"], agent["modelConfig"]) if row["model_config_json"] is not None else agent["modelConfig"],
        "tools": _json_load(row["tools_json"], agent["tools"]) if row["tools_json"] is not None else agent["tools"],
        "permissions": _json_load(row["permissions_json"], agent["permissions"]) if row["permissions_json"] is not None else agent["permissions"],
        "overrideSource": "conversation",
        "conversationId": conversation_id,
        "baseAgentId": agent["id"],
    }
    if row["system_prompt"] is not None:
        overridden["systemPromptSource"] = "conversation_override"
    if overridden["status"] == "disabled":
        overridden["enabled"] = False
    return overridden


def get_conversation_agent_config(
    conversation_id: str,
    agent_id: str,
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    agent = get_agent(agent_id, owner_user_id=owner_user_id)
    if not agent:
        return None
    agent = {**agent, "conversationId": conversation_id}
    return apply_conversation_agent_override(agent, conversation_id)


def upsert_agent_user_override(
    owner_user_id: str,
    base_agent_id: str,
    payload: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    timestamp = now_text()
    with get_connection() as conn:
        base_agent = conn.execute(
            """
            SELECT *
            FROM agents
            WHERE id = ?
              AND owner_user_id IS NULL
              AND id != ?
            """,
            (base_agent_id, ORCHESTRATOR_AGENT_ID),
        ).fetchone()
        if not base_agent:
            return None
        current = apply_agent_user_override(agent_from_row(base_agent), owner_user_id)
        updated = {**current, **payload, "id": base_agent_id, "ownerUserId": None}
        if payload.get("enabled") is False:
            updated["status"] = "disabled"
        elif payload.get("enabled") is True and "status" not in payload and updated.get("status") == "disabled":
            updated["status"] = "online"
        if updated.get("status") == "disabled":
            updated["enabled"] = False

        existing = conn.execute(
            """
            SELECT id
            FROM agent_user_overrides
            WHERE owner_user_id = ? AND base_agent_id = ?
            """,
            (owner_user_id, base_agent_id),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE agent_user_overrides
                SET name = ?, avatar = ?, description = ?, tags_json = ?,
                    status = ?, category = ?, provider = ?, enabled = ?, last_used_at = ?,
                    system_prompt = ?, model_config_json = ?, tools_json = ?,
                    permissions_json = ?, updated_at = ?
                WHERE owner_user_id = ? AND base_agent_id = ?
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
                    owner_user_id,
                    base_agent_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO agent_user_overrides (
                    id, owner_user_id, base_agent_id, name, avatar, description, tags_json,
                    status, category, provider, enabled, last_used_at, system_prompt,
                    model_config_json, tools_json, permissions_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    create_id("agentOverride"),
                    owner_user_id,
                    base_agent_id,
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
                    timestamp,
                ),
            )
    return get_agent(base_agent_id, owner_user_id=owner_user_id)


def upsert_agent_user_system_prompt(
    owner_user_id: str,
    base_agent_id: str,
    system_prompt: str,
) -> Optional[Dict[str, Any]]:
    return upsert_agent_user_override(
        owner_user_id,
        base_agent_id,
        {"systemPrompt": system_prompt.strip()},
    )


def upsert_conversation_agent_config(
    conversation_id: str,
    agent_id: str,
    payload: Dict[str, Any],
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    current = get_agent(agent_id, owner_user_id=owner_user_id)
    if not current or agent_id == ORCHESTRATOR_AGENT_ID:
        return None

    timestamp = now_text()
    with get_connection() as conn:
        existing = conn.execute(
            """
            SELECT *
            FROM conversation_agent_overrides
            WHERE conversation_id = ? AND agent_id = ?
            """,
            (conversation_id, agent_id),
        ).fetchone()

        values: Dict[str, Any] = {
            "name": existing["name"] if existing else None,
            "avatar": existing["avatar"] if existing else None,
            "description": existing["description"] if existing else None,
            "tags_json": existing["tags_json"] if existing else None,
            "status": existing["status"] if existing else None,
            "category": existing["category"] if existing else None,
            "provider": existing["provider"] if existing else None,
            "enabled": existing["enabled"] if existing else None,
            "last_used_at": existing["last_used_at"] if existing else None,
            "system_prompt": existing["system_prompt"] if existing else None,
            "model_config_json": existing["model_config_json"] if existing else None,
            "tools_json": existing["tools_json"] if existing else None,
            "permissions_json": existing["permissions_json"] if existing else None,
        }

        if "name" in payload:
            values["name"] = str(payload.get("name") or "").strip()
        if "avatar" in payload:
            values["avatar"] = str(payload.get("avatar") or "")
        if "description" in payload:
            values["description"] = str(payload.get("description") or "")
        if "tags" in payload:
            values["tags_json"] = _json_dump(payload.get("tags") or [])
        if "status" in payload:
            values["status"] = str(payload.get("status") or "offline")
        if "category" in payload:
            values["category"] = str(payload.get("category") or "custom")
        if "provider" in payload:
            values["provider"] = str(payload.get("provider") or "mock")
        if "enabled" in payload:
            values["enabled"] = 1 if bool(payload.get("enabled")) else 0
        if "lastUsedAt" in payload:
            values["last_used_at"] = payload.get("lastUsedAt")
        if "systemPrompt" in payload:
            values["system_prompt"] = str(payload.get("systemPrompt") or "")
        if "modelConfig" in payload:
            values["model_config_json"] = _json_dump(payload.get("modelConfig") or {})
        if "tools" in payload:
            values["tools_json"] = _json_dump(payload.get("tools") or [])
        if "permissions" in payload:
            values["permissions_json"] = _json_dump(payload.get("permissions") or DEFAULT_PERMISSIONS)

        if payload.get("enabled") is False:
            values["status"] = "disabled"
        elif payload.get("enabled") is True and "status" not in payload:
            effective_status = values["status"] if values["status"] is not None else current.get("status")
            if effective_status == "disabled":
                values["status"] = "online"
        if values["status"] == "disabled":
            values["enabled"] = 0

        if existing:
            conn.execute(
                """
                UPDATE conversation_agent_overrides
                SET name = ?, avatar = ?, description = ?, tags_json = ?,
                    status = ?, category = ?, provider = ?, enabled = ?, last_used_at = ?,
                    system_prompt = ?, model_config_json = ?, tools_json = ?,
                    permissions_json = ?, updated_at = ?
                WHERE conversation_id = ? AND agent_id = ?
                """,
                (
                    values["name"],
                    values["avatar"],
                    values["description"],
                    values["tags_json"],
                    values["status"],
                    values["category"],
                    values["provider"],
                    values["enabled"],
                    values["last_used_at"],
                    values["system_prompt"],
                    values["model_config_json"],
                    values["tools_json"],
                    values["permissions_json"],
                    timestamp,
                    conversation_id,
                    agent_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO conversation_agent_overrides (
                    id, conversation_id, agent_id, name, avatar, description,
                    tags_json, status, category, provider, enabled, last_used_at,
                    system_prompt, model_config_json, tools_json, permissions_json,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    create_id("convAgentOverride"),
                    conversation_id,
                    agent_id,
                    values["name"],
                    values["avatar"],
                    values["description"],
                    values["tags_json"],
                    values["status"],
                    values["category"],
                    values["provider"],
                    values["enabled"],
                    values["last_used_at"],
                    values["system_prompt"],
                    values["model_config_json"],
                    values["tools_json"],
                    values["permissions_json"],
                    timestamp,
                    timestamp,
                ),
            )

    return get_conversation_agent_config(
        conversation_id,
        agent_id,
        owner_user_id=owner_user_id,
    )


def attach_agent_contact_conversation(
    agent: Dict[str, Any],
    owner_user_id: Optional[str],
    expose_orchestrator_as_disabled: bool = False,
) -> Dict[str, Any]:
    if agent.get("id") == ORCHESTRATOR_AGENT_ID:
        return {**agent, "enabled": False} if expose_orchestrator_as_disabled else agent
    agent = apply_agent_user_override(agent, owner_user_id)
    if not owner_user_id or not agent.get("enabled") or agent.get("status") == "disabled":
        return agent
    conversation = get_contact_conversation(owner_user_id, agent["id"])
    if conversation:
        return {**agent, "conversationId": conversation["id"]}
    return agent


def conversation_from_row(row: sqlite3.Row, agent_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "ownerUserId": row["owner_user_id"],
        "title": row["title"],
        "mode": row["mode"],
        "conversationType": row["conversation_type"],
        "contactAgentId": row["contact_agent_id"],
        "visible": bool(row["visible"]),
        "isPinned": bool(row["is_pinned"]),
        "isArchived": bool(row["is_archived"]),
        "systemPrompt": row["system_prompt"],
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
    metadata = _json_load(row["metadata_json"], {})
    if metadata:
        message["metadata"] = metadata
        if isinstance(metadata.get("artifactRef"), dict):
            message["artifactRef"] = metadata["artifactRef"]
    return message


def artifact_meta_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    artifact = {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "runId": row["run_id"],
        "title": row["title"],
        "type": row["type"],
        "tags": _json_load(row["tags_json"], []),
        "currentVersionId": row["current_version_id"],
        "latestVersion": row["latest_version"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if row["description"]:
        artifact["description"] = row["description"]
    return artifact


def artifact_version_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    version = {
        "id": row["id"],
        "artifactId": row["artifact_id"],
        "version": row["version"],
        "content": row["content"],
        "size": row["size"],
        "createdBy": row["created_by"],
        "createdByType": row["created_by_type"],
        "metadata": _json_load(row["metadata_json"], {}),
        "createdAt": row["created_at"],
    }
    if row["language"]:
        version["language"] = row["language"]
    if row["change_summary"]:
        version["changeSummary"] = row["change_summary"]
    if row["parent_version_id"]:
        version["parentVersionId"] = row["parent_version_id"]
    return version


def artifact_detail_from_row(row: sqlite3.Row, current_version: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    artifact = artifact_meta_from_row(row)
    if current_version:
        artifact["currentVersion"] = current_version
        artifact["content"] = current_version["content"]
        artifact["size"] = current_version.get("size")
    return artifact


def summary_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "summary": row["summary"],
        "coveredUntilMessageId": row["covered_until_message_id"],
        "coveredMessageCount": row["covered_message_count"],
        "version": row["version"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def memory_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "category": row["category"],
        "content": row["content"],
        "confidence": row["confidence"],
        "sourceMessageId": row["source_message_id"],
        "active": bool(row["active"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def pin_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    pin = {
        "id": row["pin_id"],
        "conversationId": row["conversation_id"],
        "messageId": row["message_id"],
        "createdAt": row["pinned_at"],
    }
    if row["message_row_id"]:
        pin["message"] = message_from_row(row)
    return pin


def sandbox_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "ownerUserId": row["owner_user_id"],
        "conversationId": row["conversation_id"],
        "runId": row["run_id"],
        "status": row["status"],
        "containerId": row["container_id"],
        "image": row["image"],
        "network": row["network"],
        "workspacePath": row["workspace_path"],
        "error": row["error"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def agent_run_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "sandboxId": row["sandbox_id"],
        "conversationId": row["conversation_id"],
        "ownerUserId": row["owner_user_id"],
        "status": row["status"],
        "prompt": row["prompt"],
        "dag": _json_load(row["dag_json"], {}),
        "summary": row["summary"],
        "error": row["error"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
    }


def agent_run_step_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "runId": row["run_id"],
        "agentId": row["agent_id"],
        "agentName": row["agent_name"],
        "task": row["task"],
        "dependsOn": _json_load(row["depends_on_json"], []),
        "expectedOutputs": _json_load(row["expected_outputs_json"], []),
        "status": row["status"],
        "claimedBy": row["claimed_by"],
        "output": _json_load(row["output_json"], {}),
        "logs": row["logs"],
        "error": row["error"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
    }


def sandbox_file_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "sandboxId": row["sandbox_id"],
        "runId": row["run_id"],
        "path": row["path"],
        "contentHash": row["content_hash"],
        "currentVersion": row["current_version"],
        "artifactId": row["artifact_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def sandbox_file_version_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "fileId": row["file_id"],
        "version": row["version"],
        "content": row["content"],
        "contentHash": row["content_hash"],
        "createdByStepId": row["created_by_step_id"],
        "baseVersion": row["base_version"],
        "createdAt": row["created_at"],
    }


def sandbox_conflict_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "runId": row["run_id"],
        "sandboxId": row["sandbox_id"],
        "fileId": row["file_id"],
        "filePath": row["file_path"],
        "baseVersion": row["base_version"],
        "currentVersion": row["current_version"],
        "incomingContent": row["incoming_content"],
        "incomingHash": row["incoming_hash"],
        "createdByStepId": row["created_by_step_id"],
        "status": row["status"],
        "resolution": row["resolution"],
        "createdAt": row["created_at"],
        "resolvedAt": row["resolved_at"],
    }


def list_agents(
    page: int = 1,
    page_size: int = 20,
    category: Optional[str] = None,
    provider: Optional[str] = None,
    keyword: Optional[str] = None,
    enabled: Optional[bool] = None,
    owner_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    query = "SELECT * FROM agents WHERE 1=1"
    params: List[Any] = []
    if owner_user_id:
        query += " AND (owner_user_id IS NULL OR owner_user_id = ?)"
        params.append(owner_user_id)
    query += " ORDER BY enabled DESC, name ASC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    agents = [
        attach_agent_contact_conversation(
            agent_from_row(row),
            owner_user_id,
            expose_orchestrator_as_disabled=True,
        )
        for row in rows
    ]
    if category:
        agents = [agent for agent in agents if agent.get("category") == category]
    if provider:
        agents = [agent for agent in agents if agent.get("provider") == provider]
    if keyword:
        normalized_keyword = keyword.lower()
        agents = [
            agent for agent in agents
            if normalized_keyword in agent.get("name", "").lower()
            or normalized_keyword in agent.get("description", "").lower()
        ]
    if enabled is not None:
        agents = [
            agent for agent in agents
            if bool(agent.get("enabled")) == enabled
            and ((agent.get("status") != "disabled") == enabled)
        ]
    agents.sort(key=lambda agent: (not agent.get("enabled", False), agent.get("name", "")))
    return paginate(agents, page, page_size)


def get_agent(agent_id: str, owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [agent_id]
    if owner_user_id:
        owner_clause = "AND (owner_user_id IS NULL OR owner_user_id = ?)"
        params.append(owner_user_id)
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM agents WHERE id = ? {owner_clause}",
            params,
        ).fetchone()
    if not row:
        return None
    return attach_agent_contact_conversation(agent_from_row(row), owner_user_id)


def get_contact_conversation(owner_user_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM conversations
            WHERE owner_user_id = ?
              AND mode = 'agent'
              AND contact_agent_id = ?
            """,
            (owner_user_id, agent_id),
        ).fetchone()
        if not row:
            return None
        return conversation_from_row(row, get_conversation_agent_ids(conn, row["id"]))


def ensure_contact_conversation(
    owner_user_id: str,
    agent_id: str,
    restore_visible: bool = True,
) -> Dict[str, Any]:
    with get_connection() as conn:
        return ensure_contact_conversation_conn(
            conn,
            owner_user_id,
            agent_id,
            restore_visible=restore_visible,
        )


def ensure_user_contact_conversations(owner_user_id: str) -> None:
    with get_connection() as conn:
        ensure_user_contact_conversations_conn(conn, owner_user_id)


def create_agent(payload: Dict[str, Any], owner_user_id: Optional[str] = None) -> Dict[str, Any]:
    agent_id = create_id("agent")
    timestamp = now_text()
    name = str(payload.get("name", "")).strip()
    if not name:
        name = "Custom Agent"
    category = payload.get("category", "custom")
    provider = payload.get("provider", "custom")
    enabled = bool(payload.get("enabled", True))
    status = payload.get("status") or ("online" if enabled else "disabled")
    if not enabled:
        status = "disabled"
    model_config = payload.get("modelConfig") or {
        "provider": provider,
        "modelName": f"{name.lower().replace(' ', '-')}-custom",
        "temperature": 0.7,
        "maxTokens": 8192,
    }
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agents (
                id, owner_user_id, name, avatar, description, tags_json, status, category, provider,
                enabled, last_used_at, system_prompt, model_config_json, tools_json,
                permissions_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent_id,
                owner_user_id,
                name,
                payload.get("avatar", ""),
                payload.get("description", ""),
                _json_dump(payload.get("tags", [])),
                status,
                category,
                provider,
                1 if enabled else 0,
                payload.get("lastUsedAt"),
                payload.get("systemPrompt", ""),
                _json_dump(model_config),
                _json_dump(payload.get("tools", [])),
                _json_dump(payload.get("permissions", DEFAULT_PERMISSIONS)),
                timestamp,
                timestamp,
            ),
        )
    if owner_user_id and enabled and status != "disabled":
        ensure_contact_conversation(owner_user_id, agent_id)
    agent = get_agent(agent_id, owner_user_id=owner_user_id)
    if owner_user_id and agent and agent.get("enabled") and agent.get("status") != "disabled":
        ensure_contact_conversation(owner_user_id, agent_id)
        agent = get_agent(agent_id, owner_user_id=owner_user_id)
    return agent


def update_agent(agent_id: str, payload: Dict[str, Any], owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    current = get_agent(agent_id, owner_user_id=owner_user_id)
    if not current:
        return None

    updated = {**current, **payload, "id": agent_id}
    if payload.get("enabled") is False:
        updated["status"] = "disabled"
    elif payload.get("enabled") is True and "status" not in payload and updated.get("status") == "disabled":
        updated["status"] = "online"
    if updated.get("status") == "disabled":
        updated["enabled"] = False
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
    return get_agent(agent_id, owner_user_id=owner_user_id)


def disable_agent(agent_id: str, owner_user_id: Optional[str] = None) -> bool:
    timestamp = now_text()
    owner_clause = ""
    params: List[Any] = [timestamp, agent_id]
    if owner_user_id:
        owner_clause = "AND (owner_user_id IS NULL OR owner_user_id = ?)"
        params.append(owner_user_id)
    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE agents
            SET enabled = 0, status = 'disabled', updated_at = ?
            WHERE id = ? {owner_clause}
            """,
            params,
        )
        return cur.rowcount > 0


def is_agent_enabled(agent_id: str) -> bool:
    agent = get_agent(agent_id)
    return bool(agent and agent.get("enabled") and agent.get("status") != "disabled")


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
    is_archived: Optional[bool] = False,
    owner_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    query = """
        SELECT c.*
        FROM conversations c
        LEFT JOIN agents a ON a.id = c.contact_agent_id
        WHERE 1=1
          AND (
            c.mode IN ('single', 'group')
            OR (
              c.mode = 'agent'
              AND c.contact_agent_id != ?
              AND c.visible = 1
              AND a.enabled = 1
              AND a.status != 'disabled'
            )
          )
    """
    params: List[Any] = [ORCHESTRATOR_AGENT_ID]
    if owner_user_id:
        query += " AND c.owner_user_id = ?"
        params.append(owner_user_id)
    if mode:
        query += " AND c.mode = ?"
        params.append(mode)
    if keyword:
        query += " AND c.title LIKE ?"
        params.append(f"%{keyword}%")
    if is_archived is not None:
        query += " AND c.is_archived = ?"
        params.append(1 if is_archived else 0)
    query += " ORDER BY c.is_pinned DESC, c.updated_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        conversations = [
            conversation_from_row(row, get_conversation_agent_ids(conn, row["id"]))
            for row in rows
        ]
    if owner_user_id:
        conversations = [
            conversation
            for conversation in conversations
            if conversation["mode"] != "agent"
            or (
                conversation.get("contactAgentId")
                and (
                    agent := get_agent(
                        conversation["contactAgentId"],
                        owner_user_id=owner_user_id,
                    )
                )
                and agent.get("enabled")
                and agent.get("status") != "disabled"
            )
        ]
    return paginate(conversations, page, page_size)


def create_conversation(
    title: str,
    mode: str,
    agent_ids: List[str],
    owner_user_id: str = "user-admin",
    conversation_type: str = "manual",
    contact_agent_id: Optional[str] = None,
    system_prompt: str = "",
) -> Dict[str, Any]:
    if mode == "group":
        normalized_agent_ids = []
        for agent_id in [ORCHESTRATOR_AGENT_ID, *agent_ids]:
            if agent_id not in normalized_agent_ids:
                normalized_agent_ids.append(agent_id)
        agent_ids = normalized_agent_ids
    conversation_id = create_id("conv")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO conversations (
                id, owner_user_id, title, mode, conversation_type,
                contact_agent_id, visible, is_pinned, is_archived,
                system_prompt, last_message, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, '', ?, ?)
            """,
            (
                conversation_id,
                owner_user_id,
                title,
                mode,
                conversation_type,
                contact_agent_id,
                system_prompt.strip(),
                timestamp,
                timestamp,
            ),
        )
        for agent_id in agent_ids:
            conn.execute(
                "INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id) VALUES (?, ?)",
                (conversation_id, agent_id),
            )
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        return conversation_from_row(row, get_conversation_agent_ids(conn, conversation_id))


def get_conversation(conversation_id: str, owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [conversation_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM conversations WHERE id = ? {owner_clause}",
            params,
        ).fetchone()
        if not row:
            return None
        return conversation_from_row(row, get_conversation_agent_ids(conn, conversation_id))


def add_conversation_agent(
    conversation_id: str,
    agent_id: str,
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    current = get_conversation(conversation_id, owner_user_id=owner_user_id)
    if not current:
        return None
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id) VALUES (?, ?)",
            (conversation_id, agent_id),
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (timestamp, conversation_id),
        )
    return get_conversation(conversation_id, owner_user_id=owner_user_id)


def remove_conversation_agent(
    conversation_id: str,
    agent_id: str,
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    current = get_conversation(conversation_id, owner_user_id=owner_user_id)
    if not current:
        return None
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM conversation_agents WHERE conversation_id = ? AND agent_id = ?",
            (conversation_id, agent_id),
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (timestamp, conversation_id),
        )
    return get_conversation(conversation_id, owner_user_id=owner_user_id)


def update_conversation(conversation_id: str, payload: Dict[str, Any], owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    current = get_conversation(conversation_id, owner_user_id=owner_user_id)
    if not current:
        return None
    title = payload.get("title", current["title"])
    system_prompt = payload.get("systemPrompt", current.get("systemPrompt", ""))
    agent_ids = payload.get("agentIds")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            "UPDATE conversations SET title = ?, system_prompt = ?, updated_at = ? WHERE id = ?",
            (title, str(system_prompt or "").strip(), timestamp, conversation_id),
        )
        if agent_ids is not None:
            conn.execute("DELETE FROM conversation_agents WHERE conversation_id = ?", (conversation_id,))
            for agent_id in agent_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id) VALUES (?, ?)",
                    (conversation_id, agent_id),
                )
    return get_conversation(conversation_id, owner_user_id=owner_user_id)


def update_conversation_pin(
    conversation_id: str,
    is_pinned: bool,
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [1 if is_pinned else 0, now_text(), conversation_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE conversations
            SET is_pinned = ?, updated_at = ?
            WHERE id = ? {owner_clause}
            """,
            params,
        )
        if cur.rowcount == 0:
            return None
    return get_conversation(conversation_id, owner_user_id=owner_user_id)


def update_conversation_archive(
    conversation_id: str,
    is_archived: bool,
    owner_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [1 if is_archived else 0, now_text(), conversation_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE conversations
            SET is_archived = ?, updated_at = ?
            WHERE id = ? {owner_clause}
            """,
            params,
        )
        if cur.rowcount == 0:
            return None
    return get_conversation(conversation_id, owner_user_id=owner_user_id)


def delete_conversation(conversation_id: str, owner_user_id: Optional[str] = None) -> bool:
    owner_clause = ""
    params: List[Any] = [conversation_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        cur = conn.execute(
            f"DELETE FROM conversations WHERE id = ? {owner_clause}",
            params,
        )
        return cur.rowcount > 0


def hide_agent_conversation(conversation_id: str, owner_user_id: Optional[str] = None) -> bool:
    owner_clause = ""
    params: List[Any] = [now_text(), conversation_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE conversations
            SET visible = 0, updated_at = ?
            WHERE id = ?
              AND mode = 'agent'
              {owner_clause}
            """,
            params,
        )
        return cur.rowcount > 0


def show_conversation(conversation_id: str, owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [now_text(), conversation_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE conversations
            SET visible = 1, updated_at = ?
            WHERE id = ?
              {owner_clause}
            """,
            params,
        )
        if cur.rowcount == 0:
            return None
    return get_conversation(conversation_id, owner_user_id=owner_user_id)


def list_messages(conversation_id: str, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC",
            (conversation_id,),
        ).fetchall()
    return paginate([message_from_row(row) for row in rows], page, page_size)


def get_message_in_conversation(conversation_id: str, message_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ? AND conversation_id = ?",
            (message_id, conversation_id),
        ).fetchone()
    return message_from_row(row) if row else None


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
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    message_id = message_id or create_id("msg")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO messages (
                id, conversation_id, sender_id, sender_name, role, type,
                content, language, artifact_id, metadata_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                _json_dump(metadata or {}),
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


def get_artifact_version(version_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM artifact_versions WHERE id = ?", (version_id,)).fetchone()
    return artifact_version_from_row(row) if row else None


def get_current_artifact_version(conn: sqlite3.Connection, artifact: sqlite3.Row) -> Optional[Dict[str, Any]]:
    version_row = None
    if artifact["current_version_id"]:
        version_row = conn.execute(
            "SELECT * FROM artifact_versions WHERE id = ?",
            (artifact["current_version_id"],),
        ).fetchone()
    if not version_row:
        version_row = conn.execute(
            "SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC LIMIT 1",
            (artifact["id"],),
        ).fetchone()
    return artifact_version_from_row(version_row) if version_row else None


def get_artifact(artifact_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        if not row:
            return None
        migrate_artifact_versions(conn)
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        current_version = get_current_artifact_version(conn, row)
        return artifact_detail_from_row(row, current_version)


def list_artifact_versions(artifact_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM artifacts WHERE id = ?", (artifact_id,)).fetchone():
            return []
        rows = conn.execute(
            """
            SELECT *
            FROM artifact_versions
            WHERE artifact_id = ?
            ORDER BY version DESC
            """,
            (artifact_id,),
        ).fetchall()
    return [artifact_version_from_row(row) for row in rows]


def create_artifact(
    conversation_id: str,
    title: str,
    artifact_type: str,
    content: str,
    message_id: Optional[str] = None,
    run_id: Optional[str] = None,
    description: Optional[str] = None,
    language: Optional[str] = None,
    tags: Optional[List[str]] = None,
    created_by: Optional[str] = None,
    created_by_type: str = "agent",
    change_summary: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    artifact_id = create_id("artifact")
    version_id = create_id("version")
    timestamp = now_text()
    size = len(content.encode("utf-8"))
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO artifacts (
                id, conversation_id, message_id, run_id, title, type,
                description, tags_json, current_version_id, latest_version,
                size, content, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            """,
            (
                artifact_id,
                conversation_id,
                message_id,
                run_id,
                title,
                artifact_type,
                description,
                _json_dump(tags or []),
                version_id,
                size,
                content,
                timestamp,
                timestamp,
            ),
        )
        conn.execute(
            """
            INSERT INTO artifact_versions (
                id, artifact_id, version, content, language, size, change_summary,
                created_by, created_by_type, parent_version_id, metadata_json, created_at
            )
            VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                version_id,
                artifact_id,
                content,
                language,
                size,
                change_summary or "Agent 生成初始版本",
                created_by or message_id or "agent",
                created_by_type,
                _json_dump(metadata or {}),
                timestamp,
            ),
        )
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        current_version = get_current_artifact_version(conn, row)
        return artifact_detail_from_row(row, current_version)


def update_artifact(
    artifact_id: str,
    content: str,
    change_summary: Optional[str] = None,
    created_by: str = "user",
    created_by_type: str = "user",
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    timestamp = now_text()
    size = len(content.encode("utf-8"))
    with get_connection() as conn:
        artifact = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        if not artifact:
            return None
        current_version = get_current_artifact_version(conn, artifact)
        next_version = int(artifact["latest_version"] or 0) + 1
        version_id = create_id("version")
        conn.execute(
            """
            INSERT INTO artifact_versions (
                id, artifact_id, version, content, language, size, change_summary,
                created_by, created_by_type, parent_version_id, metadata_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                version_id,
                artifact_id,
                next_version,
                content,
                current_version.get("language") if current_version else None,
                size,
                change_summary,
                created_by,
                created_by_type,
                current_version["id"] if current_version else None,
                _json_dump(metadata or {}),
                timestamp,
            ),
        )
        conn.execute(
            """
            UPDATE artifacts
            SET current_version_id = ?, latest_version = ?, content = ?, size = ?, updated_at = ?
            WHERE id = ?
            """,
            (version_id, next_version, content, size, timestamp, artifact_id),
        )
        row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        new_version = get_current_artifact_version(conn, row)
        return artifact_detail_from_row(row, new_version)


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def create_sandbox(
    owner_user_id: str,
    conversation_id: str,
    image: str,
    network: str,
    workspace_path: str,
) -> Dict[str, Any]:
    sandbox_id = create_id("sandbox")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sandboxes (
                id, owner_user_id, conversation_id, status, image, network,
                workspace_path, created_at, updated_at
            )
            VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
            """,
            (sandbox_id, owner_user_id, conversation_id, image, network, workspace_path, timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM sandboxes WHERE id = ?", (sandbox_id,)).fetchone()
    return sandbox_from_row(row)


def update_sandbox(
    sandbox_id: str,
    status: Optional[str] = None,
    container_id: Optional[str] = None,
    run_id: Optional[str] = None,
    error: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    current = get_sandbox(sandbox_id)
    if not current:
        return None
    updated_status = status if status is not None else current["status"]
    updated_container_id = container_id if container_id is not None else current.get("containerId")
    updated_run_id = run_id if run_id is not None else current.get("runId")
    updated_error = error if error is not None else current.get("error")
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE sandboxes
            SET status = ?, container_id = ?, run_id = ?, error = ?, updated_at = ?
            WHERE id = ?
            """,
            (updated_status, updated_container_id, updated_run_id, updated_error, now_text(), sandbox_id),
        )
    return get_sandbox(sandbox_id)


def get_sandbox(sandbox_id: str, owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [sandbox_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM sandboxes WHERE id = ? {owner_clause}",
            params,
        ).fetchone()
    return sandbox_from_row(row) if row else None


def create_agent_run(
    owner_user_id: str,
    conversation_id: str,
    sandbox_id: str,
    prompt: str,
    dag: Dict[str, Any],
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    run_id = run_id or create_id("run")
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agent_runs (
                id, sandbox_id, conversation_id, owner_user_id, status,
                prompt, dag_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            """,
            (run_id, sandbox_id, conversation_id, owner_user_id, prompt, _json_dump(dag), timestamp, timestamp),
        )
    update_sandbox(sandbox_id, run_id=run_id)
    return get_agent_run(run_id)


def get_agent_run(run_id: str, owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    owner_clause = ""
    params: List[Any] = [run_id]
    if owner_user_id:
        owner_clause = "AND owner_user_id = ?"
        params.append(owner_user_id)
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM agent_runs WHERE id = ? {owner_clause}",
            params,
        ).fetchone()
    return agent_run_from_row(row) if row else None


def update_agent_run(
    run_id: str,
    status: Optional[str] = None,
    summary: Optional[str] = None,
    error: Optional[str] = None,
    mark_started: bool = False,
    mark_finished: bool = False,
) -> Optional[Dict[str, Any]]:
    current = get_agent_run(run_id)
    if not current:
        return None
    timestamp = now_text()
    started_at = timestamp if mark_started and not current.get("startedAt") else current.get("startedAt")
    finished_at = timestamp if mark_finished else current.get("finishedAt")
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE agent_runs
            SET status = ?, summary = ?, error = ?, started_at = ?, finished_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                status if status is not None else current["status"],
                summary if summary is not None else current.get("summary", ""),
                error if error is not None else current.get("error"),
                started_at,
                finished_at,
                timestamp,
                run_id,
            ),
        )
    return get_agent_run(run_id)


def create_agent_run_steps(run_id: str, steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    timestamp = now_text()
    with get_connection() as conn:
        for step in steps:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_run_steps (
                    id, run_id, agent_id, agent_name, task, depends_on_json,
                    expected_outputs_json, status, output_json, logs,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '{}', '', ?, ?)
                """,
                (
                    step["id"],
                    run_id,
                    step["agentId"],
                    step.get("agentName", ""),
                    step.get("task", ""),
                    _json_dump(step.get("dependsOn", [])),
                    _json_dump(step.get("expectedOutputs", [])),
                    timestamp,
                    timestamp,
                ),
            )
    return list_agent_run_steps(run_id)


def list_agent_run_steps(run_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM agent_run_steps WHERE run_id = ? ORDER BY created_at ASC, rowid ASC",
            (run_id,),
        ).fetchall()
    return [agent_run_step_from_row(row) for row in rows]


def get_agent_run_step(step_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM agent_run_steps WHERE id = ?", (step_id,)).fetchone()
    return agent_run_step_from_row(row) if row else None


def update_agent_run_step(
    step_id: str,
    status: Optional[str] = None,
    claimed_by: Optional[str] = None,
    output: Optional[Dict[str, Any]] = None,
    append_log: Optional[str] = None,
    error: Optional[str] = None,
    mark_started: bool = False,
    mark_finished: bool = False,
) -> Optional[Dict[str, Any]]:
    current = get_agent_run_step(step_id)
    if not current:
        return None
    timestamp = now_text()
    logs = current.get("logs") or ""
    if append_log:
        logs = (logs + ("\n" if logs else "") + append_log)[-50000:]
    started_at = timestamp if mark_started and not current.get("startedAt") else current.get("startedAt")
    finished_at = timestamp if mark_finished else current.get("finishedAt")
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE agent_run_steps
            SET status = ?, claimed_by = ?, output_json = ?, logs = ?, error = ?,
                started_at = ?, finished_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                status if status is not None else current["status"],
                claimed_by if claimed_by is not None else current.get("claimedBy"),
                _json_dump(output if output is not None else current.get("output", {})),
                logs,
                error if error is not None else current.get("error"),
                started_at,
                finished_at,
                timestamp,
                step_id,
            ),
        )
    return get_agent_run_step(step_id)


def get_agent_run_detail(run_id: str, owner_user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    run = get_agent_run(run_id, owner_user_id=owner_user_id)
    if not run:
        return None
    sandbox = get_sandbox(run["sandboxId"], owner_user_id=owner_user_id)
    return {
        **run,
        "sandbox": sandbox,
        "steps": list_agent_run_steps(run_id),
        "files": list_sandbox_files(run_id),
        "conflicts": list_sandbox_conflicts(run_id),
    }


def list_agent_runs_for_conversation(
    conversation_id: str,
    owner_user_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    query = """
        SELECT *
        FROM agent_runs
        WHERE conversation_id = ?
    """
    params: List[Any] = [conversation_id]
    if owner_user_id:
        query += " AND owner_user_id = ?"
        params.append(owner_user_id)
    query += " ORDER BY created_at DESC, rowid DESC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    runs = [
        get_agent_run_detail(row["id"], owner_user_id=owner_user_id)
        for row in rows
    ]
    return paginate(
        [run for run in runs if run],
        page,
        page_size,
    )


def list_sandbox_files(run_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM sandbox_files WHERE run_id = ? ORDER BY path ASC",
            (run_id,),
        ).fetchall()
    return [sandbox_file_from_row(row) for row in rows]


def get_sandbox_file(run_id: str, file_path: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM sandbox_files WHERE run_id = ? AND path = ?",
            (run_id, file_path),
        ).fetchone()
    return sandbox_file_from_row(row) if row else None


def get_sandbox_file_version(file_id: str, version: Optional[int] = None) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        if version is None:
            row = conn.execute(
                "SELECT * FROM sandbox_file_versions WHERE file_id = ? ORDER BY version DESC LIMIT 1",
                (file_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM sandbox_file_versions WHERE file_id = ? AND version = ?",
                (file_id, version),
            ).fetchone()
    return sandbox_file_version_from_row(row) if row else None


def create_sandbox_file_version(
    sandbox_id: str,
    run_id: str,
    file_path: str,
    content: str,
    base_version: int,
    created_by_step_id: Optional[str] = None,
) -> Dict[str, Any]:
    timestamp = now_text()
    content_hash = _content_hash(content)
    with get_connection() as conn:
        sandbox = conn.execute(
            "SELECT * FROM sandboxes WHERE id = ? AND run_id = ?",
            (sandbox_id, run_id),
        ).fetchone()
        if not sandbox:
            raise ValueError("sandbox not found for run")
        conn.execute(
            """
            INSERT OR IGNORE INTO sandbox_files (
                id, sandbox_id, run_id, path, content_hash, current_version,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, '', 0, ?, ?)
            """,
            (create_id("file"), sandbox_id, run_id, file_path, timestamp, timestamp),
        )
        file_row = conn.execute(
            "SELECT * FROM sandbox_files WHERE sandbox_id = ? AND path = ?",
            (sandbox_id, file_path),
        ).fetchone()
        current_version = int(file_row["current_version"] or 0)
        if current_version != int(base_version):
            conflict_id = create_id("conflict")
            conn.execute(
                """
                INSERT INTO sandbox_conflicts (
                    id, run_id, sandbox_id, file_id, file_path, base_version,
                    current_version, incoming_content, incoming_hash,
                    created_by_step_id, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
                """,
                (
                    conflict_id,
                    run_id,
                    sandbox_id,
                    file_row["id"],
                    file_path,
                    int(base_version),
                    current_version,
                    content,
                    content_hash,
                    created_by_step_id,
                    timestamp,
                ),
            )
            conflict = conn.execute("SELECT * FROM sandbox_conflicts WHERE id = ?", (conflict_id,)).fetchone()
            return {"status": "conflict", "conflict": sandbox_conflict_from_row(conflict)}

        next_version = current_version + 1
        version_id = create_id("fileVersion")
        conn.execute(
            """
            INSERT INTO sandbox_file_versions (
                id, file_id, version, content, content_hash,
                created_by_step_id, base_version, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (version_id, file_row["id"], next_version, content, content_hash, created_by_step_id, int(base_version), timestamp),
        )
        conn.execute(
            """
            UPDATE sandbox_files
            SET content_hash = ?, current_version = ?, updated_at = ?
            WHERE id = ?
            """,
            (content_hash, next_version, timestamp, file_row["id"]),
        )
        file_row = conn.execute("SELECT * FROM sandbox_files WHERE id = ?", (file_row["id"],)).fetchone()
        version_row = conn.execute("SELECT * FROM sandbox_file_versions WHERE id = ?", (version_id,)).fetchone()
        return {
            "status": "saved",
            "file": sandbox_file_from_row(file_row),
            "version": sandbox_file_version_from_row(version_row),
        }


def set_sandbox_file_artifact(file_id: str, artifact_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        conn.execute(
            "UPDATE sandbox_files SET artifact_id = ?, updated_at = ? WHERE id = ?",
            (artifact_id, now_text(), file_id),
        )
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM sandbox_files WHERE id = ?", (file_id,)).fetchone()
    return sandbox_file_from_row(row) if row else None


def list_sandbox_conflicts(run_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM sandbox_conflicts WHERE run_id = ? ORDER BY created_at ASC",
            (run_id,),
        ).fetchall()
    return [sandbox_conflict_from_row(row) for row in rows]


def get_sandbox_conflict(conflict_id: str, run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    run_clause = ""
    params: List[Any] = [conflict_id]
    if run_id:
        run_clause = "AND run_id = ?"
        params.append(run_id)
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM sandbox_conflicts WHERE id = ? {run_clause}",
            params,
        ).fetchone()
    return sandbox_conflict_from_row(row) if row else None


def resolve_sandbox_conflict(
    run_id: str,
    conflict_id: str,
    resolution: str,
    manual_content: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    conflict = get_sandbox_conflict(conflict_id, run_id=run_id)
    if not conflict or conflict["status"] != "open":
        return None
    if resolution == "current":
        resolved_content = None
    elif resolution == "incoming":
        resolved_content = conflict["incomingContent"]
    elif resolution == "manual":
        resolved_content = manual_content if manual_content is not None else ""
    else:
        raise ValueError("invalid conflict resolution")

    if resolved_content is not None:
        create_sandbox_file_version(
            sandbox_id=conflict["sandboxId"],
            run_id=run_id,
            file_path=conflict["filePath"],
            content=resolved_content,
            base_version=conflict["currentVersion"],
            created_by_step_id=conflict["createdByStepId"],
        )
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE sandbox_conflicts
            SET status = 'resolved', resolution = ?, resolved_at = ?
            WHERE id = ? AND run_id = ?
            """,
            (resolution, now_text(), conflict_id, run_id),
        )
    return get_sandbox_conflict(conflict_id, run_id=run_id)


ERROR_CONTEXT_PATTERNS = (
    "暂时无法完成模型调用",
    "错误摘要",
    "AuthenticationError",
    "Unauthorized",
    "The API key doesn't exist",
    "API key",
    "401",
)


def is_effective_message_content(content: str) -> bool:
    if not content.strip():
        return False
    return not any(pattern in content for pattern in ERROR_CONTEXT_PATTERNS)


def get_conversation_summary(conversation_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM conversation_summaries WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
    return summary_from_row(row) if row else None


def upsert_conversation_summary(
    conversation_id: str,
    summary: str,
    covered_until_message_id: Optional[str],
    covered_message_count: int,
) -> Dict[str, Any]:
    timestamp = now_text()
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM conversation_summaries WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE conversation_summaries
                SET summary = ?, covered_until_message_id = ?, covered_message_count = ?,
                    version = version + 1, updated_at = ?
                WHERE conversation_id = ?
                """,
                (summary, covered_until_message_id, covered_message_count, timestamp, conversation_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO conversation_summaries (
                    id, conversation_id, summary, covered_until_message_id,
                    covered_message_count, version, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    create_id("summary"),
                    conversation_id,
                    summary,
                    covered_until_message_id,
                    covered_message_count,
                    timestamp,
                    timestamp,
                ),
            )
        row = conn.execute(
            "SELECT * FROM conversation_summaries WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
    return summary_from_row(row)


def list_effective_messages(
    conversation_id: str,
    after_message_id: Optional[str] = None,
    exclude_message_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    params: List[Any] = [conversation_id]
    after_clause = ""
    if after_message_id:
        after_clause = """
            AND rowid > COALESCE((SELECT rowid FROM messages WHERE id = ?), 0)
        """
        params.append(after_message_id)

    exclude_clause = ""
    if exclude_message_id:
        exclude_clause = "AND id != ?"
        params.append(exclude_message_id)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT *
            FROM messages
            WHERE conversation_id = ?
              AND type IN ('text', 'code', 'task-plan')
              AND sender_id != 'system'
              AND content != ''
              {after_clause}
              {exclude_clause}
            ORDER BY created_at ASC, rowid ASC
            """,
            params,
        ).fetchall()
    messages = [message_from_row(row) for row in rows]
    return [message for message in messages if is_effective_message_content(message["content"])]


def list_active_memories(conversation_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM long_term_memories
            WHERE conversation_id = ? AND active = 1
            ORDER BY confidence DESC, updated_at DESC
            LIMIT ?
            """,
            (conversation_id, limit),
        ).fetchall()
    return [memory_from_row(row) for row in rows]


def create_memory(
    conversation_id: str,
    category: str,
    content: str,
    confidence: float,
    source_message_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    normalized_content = content.strip()
    if not normalized_content:
        return None
    timestamp = now_text()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO long_term_memories (
                id, conversation_id, category, content, confidence,
                source_message_id, active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                create_id("memory"),
                conversation_id,
                category,
                normalized_content,
                float(confidence),
                source_message_id,
                timestamp,
                timestamp,
            ),
        )
        row = conn.execute(
            """
            SELECT *
            FROM long_term_memories
            WHERE conversation_id = ? AND category = ? AND content = ?
            """,
            (conversation_id, category, normalized_content),
        ).fetchone()
    return memory_from_row(row) if row else None


def update_memory(
    conversation_id: str,
    memory_id: str,
    payload: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    current_payload = {
        key: value
        for key, value in payload.items()
        if key in {"content", "category", "active"}
    }
    if not current_payload:
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM long_term_memories
                WHERE id = ? AND conversation_id = ?
                """,
                (memory_id, conversation_id),
            ).fetchone()
        return memory_from_row(row) if row else None

    assignments = []
    params: List[Any] = []
    if "content" in current_payload:
        assignments.append("content = ?")
        params.append(str(current_payload["content"]).strip())
    if "category" in current_payload:
        assignments.append("category = ?")
        params.append(str(current_payload["category"]).strip())
    if "active" in current_payload:
        assignments.append("active = ?")
        params.append(1 if bool(current_payload["active"]) else 0)
    assignments.append("updated_at = ?")
    params.append(now_text())
    params.extend([memory_id, conversation_id])

    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE long_term_memories
            SET {", ".join(assignments)}
            WHERE id = ? AND conversation_id = ?
            """,
            params,
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM long_term_memories WHERE id = ? AND conversation_id = ?",
            (memory_id, conversation_id),
        ).fetchone()
    return memory_from_row(row) if row else None


def delete_memory(conversation_id: str, memory_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            """
            UPDATE long_term_memories
            SET active = 0, updated_at = ?
            WHERE id = ? AND conversation_id = ? AND active = 1
            """,
            (now_text(), memory_id, conversation_id),
        )
        return cur.rowcount > 0


def list_pins(conversation_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                p.id AS pin_id,
                p.conversation_id,
                p.message_id,
                p.created_at AS pinned_at,
                m.id AS message_row_id,
                m.id,
                m.conversation_id,
                m.sender_id,
                m.sender_name,
                m.role,
                m.type,
                m.content,
                m.language,
                m.artifact_id,
                m.metadata_json,
                m.created_at
            FROM pinned_messages p
            LEFT JOIN messages m ON m.id = p.message_id
            WHERE p.conversation_id = ?
            ORDER BY p.created_at ASC
            """,
            (conversation_id,),
        ).fetchall()
    pins = [pin_from_row(row) for row in rows]
    return [
        pin for pin in pins
        if pin.get("message") and is_effective_message_content(pin["message"]["content"])
    ]


def get_pinned_message_ids(conversation_id: str) -> List[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT message_id FROM pinned_messages WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchall()
    return [row["message_id"] for row in rows]


def pin_message(conversation_id: str, message_id: str) -> Optional[Dict[str, Any]]:
    timestamp = now_text()
    with get_connection() as conn:
        message = conn.execute(
            "SELECT id FROM messages WHERE id = ? AND conversation_id = ?",
            (message_id, conversation_id),
        ).fetchone()
        if not message:
            return None
        conn.execute(
            """
            INSERT OR IGNORE INTO pinned_messages (id, conversation_id, message_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (create_id("pin"), conversation_id, message_id, timestamp),
        )
    pins = list_pins(conversation_id)
    return next((pin for pin in pins if pin["messageId"] == message_id), None)


def unpin_message(conversation_id: str, message_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM pinned_messages WHERE conversation_id = ? AND message_id = ?",
            (conversation_id, message_id),
        )
        return cur.rowcount > 0


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
