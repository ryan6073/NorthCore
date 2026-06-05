# AgentHub Backend

AgentHub 后端基于 FastAPI + SQLite，负责用户登录、Agent 管理、IM 会话、消息持久化、WebSocket 流式通信、产物版本管理、上下文压缩、长期记忆和 pinned message。

当前后端固定使用 `9007` 端口。

## Quick Start

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 9007 --reload
```
健康检查：

```bash
curl http://localhost:9007/api/v1/health
```

## Environment

从 `backend/.env.example` 创建 `backend/.env`，并填写模型服务配置。

```text
HOST=0.0.0.0
PORT=9007
ENABLE_API_DOCS=true
ARK_API_KEY="your_key"
ARK_BASE_URL="your_base_url"
MODEL_EP="your_model_endpoint"
DATABASE_URL="sqlite:///./agenthub.db"
SANDBOX_IMAGE="python:3.11-slim"
SANDBOX_NETWORK="bridge"
SANDBOX_ALLOW_NETWORK=true
SANDBOX_AUTO_INSTALL_UV=true
SANDBOX_TIMEOUT_SECONDS=120
SANDBOX_COMMAND_TIMEOUT_SECONDS=120
SANDBOX_SETUP_TIMEOUT_SECONDS=300
SANDBOX_MAX_PARALLEL_STEPS=1
SANDBOX_WORKSPACE_ROOT="/tmp/agenthub-sandboxes"
SANDBOX_MAX_OUTPUT_BYTES=100000
SANDBOX_KEEP_WORKSPACE_ON_STATUSES="failed,conflict,cancelled"
SANDBOX_CLEANUP_COMPLETED_WORKSPACE=true
SANDBOX_WORKSPACE_SCAN_MAX_FILES=500
SANDBOX_WORKSPACE_FILE_MAX_BYTES=200000
OPENCODE_BIN="opencode"
OPENCODE_TIMEOUT_SECONDS=600
CODEX_BIN="codex"
CODEX_TIMEOUT_SECONDS=600
CODEX_HOME_ROOT=""
RUNTIME_HOME_ROOT=""
CLAUDE_CODE_BIN="claude"
CLAUDE_CODE_TIMEOUT_SECONDS=600
```

Sandbox V1 开发阶段默认允许联网，方便安装依赖和自动安装 `uv`。这不是生产安全默认；生产模式可设置 `SANDBOX_NETWORK=none` 或 `SANDBOX_ALLOW_NETWORK=false`，并配合预构建镜像或依赖缓存完成环境初始化。沙箱不会注入 `.env`、token、SSH key，不挂载项目根目录，也不挂载 `docker.sock`。当前默认串行执行 step，后续恢复并行前需要改成每 step 独立 shell 或容器。

Platform Runtime 会把 Codex、Claude Code、OpenCode 的本地配置、缓存和会话状态按用户与模型配置隔离。`RUNTIME_HOME_ROOT` 为空时默认使用 `{SANDBOX_WORKSPACE_ROOT}/_runtime_homes`；`CODEX_HOME_ROOT` 仅作为兼容旧部署的 Codex 专用覆盖项。

前端真实模式建议：

```text
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:9007/api/v1
VITE_WS_URL=ws://localhost:9007/ws
```

如果前端通过线上域名访问后端，需要把 URL 换成对应反代后的 HTTPS/WSS 地址。

## Auth

默认管理员账号：

```text
email: admin@northcore.ai
password: admin123
```

登录、注册、游客登录都会返回 `token`：

```http
Authorization: Bearer <token>
```

真实前端请求应始终携带该 Header。为了兼容旧 Demo，未携带 token 的业务接口会回退到默认管理员。

## Core Concepts

### Agent

Agent 是 IM 联系人。系统预置 Agent 对所有用户可见，用户自建 Agent 只对创建者可见。Orchestrator 是群聊调度器，不作为长期联系人。
当前系统预置 Agent 包含：默认聊天助手、翻译助手、图表助手、文档助手、Claude Code、Codex、Orchestrator。前端可使用 `tags` 展示能力标签。

关键字段：

```ts
interface Agent {
  id: string;
  ownerUserId: string | null;
  conversationId?: string;
  name: string;
  tags: string[];
  status: string;
  enabled: boolean;
  systemPrompt: string;
  systemPromptSource?: 'user_override' | 'conversation_override';
  modelConfig: Record<string, any>;
  tools: any[];
  permissions: Record<string, any>;
}
```

`ownerUserId = null` 表示系统预置 Agent。`conversationId` 是当前用户和联系人 Agent 的长期联系人单聊 ID，Orchestrator 不返回该字段。
群聊内普通 Agent 可以有当前会话专属配置，返回时会带 `overrideSource: 'conversation'` 和当前 `conversationId`，该配置不反写全局 Agent。

### Conversation

会话用 `mode` 区分类型：

```ts
type ConversationMode = 'agent' | 'single' | 'group';
```

- `agent`：Agent 联系人长期会话，伴随 Agent 生命周期，不允许用户直接删除，参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- `single`：用户手动创建的临时单聊，允许删除，不参与长期记忆、会话摘要或 Pinned Messages 注入。
- `group`：用户手动创建的群聊，允许删除，参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- 群聊会自动保留 `agent-orchestrator` 作为调度器；前端不能配置或删除该调度器，普通成员可通过专用接口增删。

关键字段：

```ts
interface Conversation {
  id: string;
  ownerUserId: string;
  mode: 'agent' | 'single' | 'group';
  conversationType?: 'contact' | 'manual';
  contactAgentId?: string | null;
  visible?: boolean;
  isPinned: boolean;
  isArchived: boolean;
  systemPrompt: string;
  agentIds: string[];
  contextUsagePercent: number;
  contextUsageChars: number;
  contextLimitChars: number;
}
```

### Message

消息用于恢复聊天流。用户消息、Agent 回复、Orchestrator 任务拆解、产物卡片和系统状态都存在 `messages` 表。

系统状态消息规则：

- 前端发送 `role=system`、`senderId=system` 或 `type=status` 时，后端只保存消息。
- 系统状态消息不会触发 Agent 回复。
- 系统状态消息不会进入模型上下文、长期记忆或上下文压缩。

### Artifact

产物采用两层结构：

- `Artifact`：产物元数据和当前版本指针。
- `ArtifactVersion`：每次生成或编辑后的内容快照。

`PUT /artifacts/{artifactId}` 不覆盖旧内容，而是新增一个版本并更新 `currentVersionId/latestVersion`。

## Main APIs

HTTP Base URL：

```text
http://localhost:9007/api/v1
```

常用接口：

```text
GET  /health

POST /auth/register
POST /auth/login
POST /auth/guest
GET  /auth/me
POST /auth/logout

GET    /agents
POST   /agents
GET    /agents/{agentId}
PUT    /agents/{agentId}
DELETE /agents/{agentId}
GET    /agents/{agentId}/conversation
GET    /users/{userId}/agents/{agentId}/contact

GET    /conversations
POST   /conversations
GET    /conversations/{conversationId}
PUT    /conversations/{conversationId}
DELETE /conversations/{conversationId}
PUT    /conversations/{conversationId}/pin
PUT    /conversations/{conversationId}/archive
POST   /conversations/{conversationId}/mention

GET  /conversations/{conversationId}/messages
POST /conversations/{conversationId}/messages

GET    /conversations/{conversationId}/context/usage
POST   /conversations/{conversationId}/context/compress
GET    /conversations/{conversationId}/memories
PUT    /conversations/{conversationId}/memories/{memoryId}
DELETE /conversations/{conversationId}/memories/{memoryId}
GET    /conversations/{conversationId}/pins
POST   /conversations/{conversationId}/messages/{messageId}/pin
DELETE /conversations/{conversationId}/messages/{messageId}/pin

GET /conversations/{conversationId}/artifacts
GET /artifacts/{artifactId}
PUT /artifacts/{artifactId}
GET /artifacts/{artifactId}/versions
GET /artifacts/{artifactId}/versions/{versionId}

POST /conversations/{conversationId}/runs
GET  /runs/{runId}
POST /runs/{runId}/cancel
GET  /runs/{runId}/files
GET  /runs/{runId}/files/{filePath}
GET  /runs/{runId}/conflicts
POST /runs/{runId}/conflicts/{conflictId}/resolve
```

WebSocket：

```text
ws://localhost:9007/ws?token=<token>
```

`/ws` 必须携带有效 token，并通过 `conversation.subscribe` 按会话订阅；服务端按 `userId + conversationId` 隔离推送事件。旧 Demo 入口 `/ws/chat` 已弃用，前端应统一使用 `/ws`。

## SQLite

默认 SQLite 文件：

```text
backend/agenthub.db
```

查看数据示例：

```bash
sqlite3 backend/agenthub.db
```

常用表：

```text
users
user_sessions
agents
conversations
conversation_agents
messages
artifacts
artifact_versions
attachments
conversation_summaries
long_term_memories
pinned_messages
sandboxes
agent_runs
agent_run_steps
sandbox_files
sandbox_file_versions
sandbox_conflicts
```

## Docs

- 后端代码架构说明：`docs/backend_architecture.md`
- 前端完整接口合同：`docs/frontend_api_contract.md`
- 前端快速交接说明：`docs/frontend_handoff.md`
- 登录注册接口：`docs/auth_api_contract.md`
- SQLite 表结构：`docs/database_schema.md`
- 技术架构说明：`docs/technical_architecture.md`
