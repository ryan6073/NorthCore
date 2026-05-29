# AgentHub Technical Architecture

## 当前阶段目标

当前阶段实现 SQLite 持久化 + P0 HTTP 联调闭环, 并补齐后端 WebSocket 流式协议:

```text
前端关闭 Mock
→ 拉取真实 Agent
→ 创建真实 Conversation
→ 发送真实 Message
→ SQLite 持久化
→ 刷新后恢复历史
→ WebSocket 可推送流式 Agent 回复
```

## 系统分层

```text
Frontend React
  services/http
  services/ws
  components

Backend FastAPI
  API Layer
  Application Service Layer
  Agent Harness Layer
  Adapter Layer
  Persistence Layer
  Infrastructure Layer

SQLite
  agents
  conversations
  conversation_agents
  messages
  artifacts
  attachments
```

## 后端分层说明

### API Layer

负责 HTTP 路由和 WebSocket 入口。

当前实现:

- `/api/v1/health`
- `/api/v1/agents`
- `/api/v1/conversations`
- `/api/v1/conversations/{id}/messages`
- `/api/v1/artifacts`

- `/ws`
- `/ws/chat`

### Application Service Layer

负责业务用例:

- Agent 列表和配置更新
- 会话创建、查询、删除
- 消息保存和历史读取
- 产物元数据和详情读取

第一阶段为了快速闭环, service 逻辑主要放在 FastAPI endpoint 和 `database.py` 中。后续模块增多后可拆分到 `app/services/`。

### Agent Harness Layer

Harness 用于让 Agent 执行可控、可追踪、可复用。

第一阶段已经体现:

- Conversation 隔离不同任务上下文
- Message 保存完整聊天历史
- Artifact 绑定生成消息
- Attachment 预留多模态输入

第二阶段增强:

- `agent_runs`
- Orchestrator 调度链路
- 上下文压缩
- 长期记忆注入

### Adapter Layer

当前使用 OpenAI-compatible API 调用火山方舟。

MVP 不宣称真实接入 Claude Code / Codex 平台。当前 Claude Code / Codex 是 Agent 配置和 prompt 模拟, 后续通过 Adapter 替换真实 provider。

### Persistence Layer

使用 Python 标准库 `sqlite3`, 不新增 ORM 依赖。

数据库内部字段使用 `snake_case`, API 返回前转换为 `camelCase`。

## 通信策略

### HTTP

负责稳定 CRUD:

- Agent 联系人
- 会话列表
- 历史消息
- 非流式发送消息
- Artifact 详情

### WebSocket

当前 `/ws` 已实现前端 `services/ws` 预留事件:

- `connected`
- `ping`
- `pong`
- `conversation.message.create`
- `conversation.subscribe`
- `conversation.unsubscribe`
- `conversation.message.user_created`
- `agent.status.changed`
- `agent.thinking.started`
- `conversation.message.chunk`
- `conversation.message.completed`
- `artifact.created`
- `conversation.all_tasks.completed`

`/ws` 必须携带有效 token。服务端按 `userId + conversationId` 建立订阅房间，所有会话事件只广播给已鉴权订阅该会话的连接。`/ws/chat` 暂时保留为旧 Demo 兼容入口，但未鉴权连接会被拒绝。

## 开发环境

后端:

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 9007 --reload
```

前端:

```bash
cd frontend
npm run dev
```

前端 `.env.development`:

```text
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:9007/api/v1
VITE_WS_URL=ws://localhost:9007/ws
```
