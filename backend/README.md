# AgentHub Backend

AgentHub 后端基于 FastAPI + SQLite，负责用户鉴权、Agent 管理、IM 会话、消息持久化、WebSocket 流式通信、Sandbox Run、Workspace、Artifact、Deployment、联网搜索、长期记忆和上下文压缩。

## Quick Start

后端依赖文件是 `backend/requirement.txt`。推荐用 `uv` 创建虚拟环境并安装依赖：

```bash
cd backend
uv venv .venv
source .venv/bin/activate
uv pip install -r requirement.txt
cp .env.example .env
python -m uvicorn app.main:app --host 0.0.0.0 --port <your_port> --reload
```

如果当前环境没有 `uv`，也可以使用标准 `venv + pip`：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirement.txt
cp .env.example .env
python -m uvicorn app.main:app --host 0.0.0.0 --port <your_port> --reload
```

健康检查：

```bash
curl http://localhost:<your_port>/api/v1/health
```

## Environment

本地启动前，先从示例文件复制一份自己的配置：

```bash
cd backend
cp .env.example .env
```

如果只是想把后端跑起来，通常只需要确认三类配置：

1. 服务端口：前端访问哪个端口，`PORT` 和 `PUBLIC_BASE_URL` 就写哪个端口。
2. 模型服务：把 `ARK_API_KEY`、`ARK_BASE_URL`、`MODEL_EP` 换成可用的模型配置。
3. Sandbox：需要演示代码生成、文件修改、部署时，确认本机 Docker 可用，并保留 Sandbox 配置。

一个常见的本地开发配置如下：

```text
# 后端监听地址。一般不用改。
HOST=0.0.0.0

# 后端端口。前端 VITE_API_BASE_URL / VITE_WS_URL 需要使用同一个端口。
PORT=9007

# 后端对外地址。端口要和 PORT 保持一致。
PUBLIC_BASE_URL="http://localhost:9007"

# 本地开发建议开启，方便查看接口文档。
ENABLE_API_DOCS=true

# 模型服务配置。这里必须换成真实可用的 key、base url 和模型 endpoint。
ARK_API_KEY="api_key"
ARK_BASE_URL="api_url"
MODEL_EP="model"

# 默认使用 SQLite，本地开发不用改。
DATABASE_URL="sqlite:///./agenthub.db"

# Sandbox 用于执行产物型任务。需要本机 Docker 可用。
SANDBOX_IMAGE="python:3.11-slim"
SANDBOX_NETWORK="bridge"
SANDBOX_ALLOW_NETWORK=true
SANDBOX_AUTO_INSTALL_UV=true
SANDBOX_TIMEOUT_SECONDS=120
SANDBOX_COMMAND_TIMEOUT_SECONDS=120
SANDBOX_SETUP_TIMEOUT_SECONDS=300
SANDBOX_MAX_PARALLEL_STEPS=2
SANDBOX_WORKSPACE_ROOT="/tmp/agenthub-sandboxes"

# 如果要使用平台 Runtime，需要本机能找到这些 CLI。
OPENCODE_BIN="opencode"
CODEX_BIN="codex"
CLAUDE_CODE_BIN="claude"

# 留空即可。后端会在 Sandbox 工作区下创建隔离 runtime home。
RUNTIME_HOME_ROOT=""

# 联网搜索。没有搜索需求可以关掉。
WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER="ddgs"
```

Demo 环境建议保持 `SANDBOX_ALLOW_NETWORK=true`，这样 Sandbox 可以安装依赖和自动安装 `uv`。生产环境不建议这样开，建议设置 `SANDBOX_NETWORK=none` 或 `SANDBOX_ALLOW_NETWORK=false`，并提前准备好镜像或依赖缓存。

沙箱不会注入 `.env`、token、SSH key，不挂载项目根目录，也不挂载 `docker.sock`。敏感文件默认不会发布为 Artifact，也不会进入部署构建上下文。

Platform Runtime 会把 Codex、Claude Code、OpenCode 的本地配置、缓存和会话状态按用户与模型配置隔离。`RUNTIME_HOME_ROOT` 为空时默认使用 `{SANDBOX_WORKSPACE_ROOT}/_runtime_homes`。

## Auth

系统支持三类身份：

- 未登录或 token 无效：业务接口返回 `40101`。
- 注册 / 账号登录用户：可使用完整功能。
- 一键游客登录用户：只能使用受限普通聊天，不能使用工具、Sandbox、Deployment、Workspace、Artifact、Memory、Web Search、自定义 Agent 或 Agent 配置能力。

默认管理员账号：

```text
email: admin@northcore.ai
password: admin123
```

登录、注册、游客登录都会返回 `token`：

```http
Authorization: Bearer <token>
```

真实业务请求必须携带该 Header。`user-admin` 仅保留为历史数据 owner，不再作为匿名默认身份。

## Core Concepts

### Agent

Agent 是 IM 联系人。系统预置 Agent 对所有用户可见，用户自建 Agent 只对创建者可见。

Orchestrator 是群聊调度器，不作为长期联系人，不出现在普通联系人列表里给用户长期对话；群聊中由后端自动保留并用于规划、调度和汇总。

当前系统预置 Agent：

| Agent ID | 名称 | 定位 | 是否长期联系人 |
| --- | --- | --- | --- |
| `agent-mermaid` | 图表助手 | Mermaid 图表、流程图、架构图 | 是 |
| `agent-document` | 文档助手 | Markdown 文档、汇报材料、PPT 大纲 | 是 |
| `agent-claude-code` | Coding Agent | 代码生成、工程实现、网页产物 | 是 |
| `agent-codex` | Review Agent | 代码审查、Bug 修复、质量检查 | 是 |
| `agent-orchestrator` | Orchestrator | 群聊任务拆解、调度、汇总 | 否 |

已移除的历史预置 Agent：`agent-chat`、`agent-translator`。旧数据不会删除，但新系统默认不再提供这两个预置联系人。

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
- 群聊会自动保留 `agent-orchestrator` 作为调度器；普通成员可通过专用接口增删。

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

### Workspace

Workspace 是持久工作区。conversation 可以绑定 workspace，Sandbox Run 会复用 workspace，并将 run 内生成或修改的工作区文件同步回 workspace 文件索引。

写入型 run 和部署会按 workspace 获取 mutation lock 串行执行；只读 run 不占用写锁。

### Artifact

产物采用两层结构：

- `Artifact`：产物元数据和当前版本指针。
- `ArtifactVersion`：每次生成或编辑后的内容快照。

`PUT /artifacts/{artifactId}` 不覆盖旧内容，而是新增一个版本并更新 `currentVersionId/latestVersion`。Artifact 以 workspace 为主要归属，conversation 表示来源。

## Main APIs

HTTP Base URL：

```text
http://localhost:<your_port>/api/v1
```

常用接口：

```text
# 健康检查
GET  /health                                      # 检查服务是否启动

# 登录注册与当前用户
POST /auth/register                              # 注册账号并返回 token
POST /auth/login                                 # 账号登录并返回 token
POST /auth/guest                                 # 一键游客登录，功能受限
GET  /auth/me                                    # 获取当前登录用户
POST /auth/logout                                # 注销当前 session

# Agent 列表、详情、创建、更新、删除和联系人会话
GET    /agents                                   # 获取系统预置和当前用户可见 Agent
POST   /agents                                   # 创建用户自建 Agent，游客不可用
GET    /agents/{agentId}                         # 获取 Agent 详情
PUT    /agents/{agentId}                         # 更新用户自建 Agent 或用户级配置
DELETE /agents/{agentId}                         # 删除用户自建 Agent
GET    /agents/{agentId}/conversation            # 获取联系人 Agent 的长期会话
GET    /users/{userId}/agents/{agentId}/contact  # 兼容旧前端的联系人会话入口

# 会话列表、创建、详情、更新、删除、置顶、归档和 mention 分流
GET    /conversations                            # 获取当前用户会话列表
POST   /conversations                            # 创建 single / group 会话
GET    /conversations/{conversationId}           # 获取会话详情
PUT    /conversations/{conversationId}           # 更新会话标题、成员、配置等
DELETE /conversations/{conversationId}           # 删除用户手动创建的会话
PUT    /conversations/{conversationId}/pin       # 置顶或取消置顶会话
PUT    /conversations/{conversationId}/archive   # 归档或取消归档会话
POST   /conversations/{conversationId}/mention   # 处理 @Agent 分流

# 消息读取与发送
GET  /conversations/{conversationId}/messages    # 读取会话消息历史
POST /conversations/{conversationId}/messages    # 发送消息，后端分流 chat/run/deploy

# 上下文、记忆和 pinned message
GET    /conversations/{conversationId}/context/usage       # 查看上下文用量
POST   /conversations/{conversationId}/context/compress    # 手动触发上下文压缩
GET    /conversations/{conversationId}/memories            # 获取长期记忆
PUT    /conversations/{conversationId}/memories/{memoryId} # 更新长期记忆
DELETE /conversations/{conversationId}/memories/{memoryId} # 删除长期记忆
GET    /conversations/{conversationId}/pins                # 获取 pinned messages
POST   /conversations/{conversationId}/messages/{messageId}/pin    # pin 一条消息
DELETE /conversations/{conversationId}/messages/{messageId}/pin    # 取消 pin

# Workspace
GET    /workspaces                                # 获取当前用户 workspace 列表
POST   /workspaces                                # 创建 workspace，游客不可用
GET    /workspaces/{workspaceId}                  # 获取 workspace 详情
DELETE /workspaces/{workspaceId}                  # 软删除 workspace
POST   /workspaces/{workspaceId}/restore          # 恢复已删除 workspace
DELETE /workspaces/{workspaceId}/purge            # 彻底清理 workspace
GET    /workspaces/{workspaceId}/files/tree       # 获取文件树
GET    /workspaces/{workspaceId}/files/content    # 读取文件内容，query 传 path
PUT    /workspaces/{workspaceId}/files/content    # 写入文件内容，游客不可用
GET    /workspaces/{workspaceId}/files/download   # 下载文件
POST   /workspaces/{workspaceId}/files/upload     # 上传文件

# Artifact 与版本
GET /conversations/{conversationId}/artifacts     # 获取会话来源的产物列表
GET /workspaces/{workspaceId}/artifacts           # 获取 workspace 下的产物列表
GET /artifacts/{artifactId}                       # 获取产物详情和当前版本
PUT /artifacts/{artifactId}                       # 更新产物内容并创建新版本
GET /artifacts/{artifactId}/versions              # 获取产物版本历史
GET /artifacts/{artifactId}/versions/{versionId}  # 按版本 ID 获取版本内容
GET /artifacts/{artifactId}/versions/by-number/{versionNumber} # 按版本号获取版本内容

# Sandbox Run、文件、冲突、取消和 rollback
POST /conversations/{conversationId}/runs         # 显式创建 Sandbox Run
GET  /conversations/{conversationId}/runs         # 获取会话 run 列表
GET  /runs/{runId}                                # 获取 run 详情、状态和 step
POST /runs/{runId}/retry                          # 重试失败 run
POST /runs/{runId}/cancel                         # 取消运行中 run
POST /runs/{runId}/rollback                       # 回滚本 run 的文件和产物
GET  /runs/{runId}/files                          # 获取 run 变更文件列表
GET  /runs/{runId}/files/tree                     # 获取 run 文件树
GET  /runs/{runId}/files/{filePath}               # 读取 run 文件内容
GET  /runs/{runId}/files/{filePath}/download      # 下载 run 文件
GET  /runs/{runId}/preview/{filePath}             # 预览 run 文件
GET  /runs/{runId}/conflicts                      # 获取冲突列表
POST /runs/{runId}/conflicts/{conflictId}/resolve # 解决文件冲突

# Workspace 部署
POST /workspaces/{workspaceId}/deployments        # 部署整个 workspace
GET  /workspaces/{workspaceId}/deployments        # 获取 workspace 部署记录
GET  /deployments/{deploymentId}                  # 获取部署详情和 URL
POST /deployments/{deploymentId}/stop             # 停止部署
GET  /deployments/{deploymentId}/logs             # 获取部署日志
```

WebSocket：

```text
ws://localhost:<your_port>/ws?token=<token>       # 主 WebSocket 入口，token 必填
```

连接成功后通过 `conversation.subscribe` 订阅会话；服务端按 `userId + conversationId` 隔离推送事件。旧 Demo 入口 `/ws/chat` 已弃用，前端应统一使用 `/ws`。

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

| 表名 | 用途 |
| --- | --- |
| `users` | 用户账号，包含注册用户、游客用户和历史默认用户 |
| `user_sessions` | 登录 session 和 token |
| `agents` | 系统预置 Agent 和用户自建 Agent |
| `conversations` | single / group / agent 会话 |
| `conversation_agents` | 会话成员关系 |
| `conversation_agent_overrides` | 会话级 Agent 配置隔离 |
| `messages` | 用户消息、Agent 回复、状态消息和产物消息 |
| `workspaces` | 持久工作区元数据 |
| `workspace_files` | workspace 文件索引 |
| `artifacts` | 产物元数据和当前版本指针 |
| `artifact_versions` | 产物版本快照 |
| `attachments` | 消息附件 |
| `conversation_summaries` | 会话上下文压缩摘要 |
| `long_term_memories` | 长期记忆 |
| `pinned_messages` | 置顶消息 |
| `sandboxes` | Sandbox 容器或运行环境记录 |
| `agent_runs` | Sandbox Run 主记录 |
| `agent_run_steps` | Run DAG step 和执行状态 |
| `sandbox_files` | Sandbox / workspace 文件元数据 |
| `sandbox_file_versions` | 文件版本历史 |
| `sandbox_conflicts` | 文件冲突记录 |
| `workspace_deployments` | workspace 部署记录 |
| `web_search_cache` | 联网搜索缓存 |
