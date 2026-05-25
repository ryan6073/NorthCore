# AgentHub API Contract

## 基础约定

- Base URL: `http://localhost:8000/api/v1`
- Content-Type: `application/json`
- 字段命名: API 统一使用 `camelCase`
- ID 类型: string, 如 `agent-codex`, `conv-xxxx`, `msg-xxxx`
- 时间格式: `YYYY-MM-DD HH:mm:ss`
- MVP 阶段: 单用户, 暂不启用认证

## 通用响应

成功响应:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

分页响应:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

错误响应:

```json
{
  "code": 40001,
  "message": "资源不存在",
  "data": null
}
```

## 核心模型

### Agent

Agent 是 AI 联系人/能力对象, 例如 Claude Code、Codex、Orchestrator。

| 字段 | 类型 | 含义 | 前端用途 | 后端来源 |
|---|---|---|---|---|
| id | string | Agent 唯一 ID | 选择聊天对象 | `agents.id` |
| name | string | 展示名称 | 联系人卡片、消息头像 | `agents.name` |
| avatar | string | 头像 URL | 联系人和消息头像 | `agents.avatar` |
| description | string | 能力描述 | 联系人副标题 | `agents.description` |
| tags | string[] | 能力标签 | 标签展示/筛选 | `tags_json` |
| status | string | `online/offline/mock/thinking/disabled` | 状态展示 | `agents.status` |
| category | string | `orchestrator/coding/review/document/design/custom` | 分类筛选 | `agents.category` |
| provider | string | `mock/claude-code/codex/opencode/local-qwen/custom` | 平台说明 | `agents.provider` |
| enabled | boolean | 是否启用 | 禁用态展示 | `agents.enabled` |
| lastUsedAt | string/null | 最近使用时间 | 排序/展示 | `last_used_at` |
| systemPrompt | string | Agent 系统提示词 | 配置面板 | `system_prompt` |
| modelConfig | object | 模型配置 | 配置面板 | `model_config_json` |
| tools | object[] | 工具列表 | 配置面板 | `tools_json` |
| permissions | object | 权限能力 | 配置面板 | `permissions_json` |

### Conversation

Conversation 是聊天窗口/任务上下文。

| 字段 | 类型 | 含义 | 前端用途 | 后端来源 |
|---|---|---|---|---|
| id | string | 会话唯一 ID | 切换会话、拉取消息 | `conversations.id` |
| title | string | 会话标题 | 左侧会话列表 | `conversations.title` |
| mode | string | `single` 或 `group` | 区分单聊/群聊 UI | `conversations.mode` |
| agentIds | string[] | 参与 Agent 列表 | 激活聊天对象 | `conversation_agents` |
| lastMessage | string | 最近一条消息摘要 | 会话列表摘要 | `last_message` |
| updatedAt | string | 最近活跃时间 | 会话排序 | `updated_at` |
| createdAt | string | 创建时间 | 详情展示 | `created_at` |

### Message

Message 是会话中的一条可回放聊天记录。

| 字段 | 类型 | 含义 | 前端用途 | 后端来源 |
|---|---|---|---|---|
| id | string | 消息唯一 ID | 渲染 key | `messages.id` |
| conversationId | string | 所属会话 | 消息隔离 | `conversation_id` |
| senderId | string | 发送者 ID | 判断发送者 | `sender_id` |
| senderName | string | 发送者名称 | 气泡标题 | `sender_name` |
| role | string | `user/agent/orchestrator/system` | 气泡样式 | `role` |
| type | string | `text/code/artifact/task-plan/status` | 内容渲染方式 | `type` |
| content | string | 文本正文 | 消息内容/上下文 | `content` |
| language | string | 代码语言 | CodeBlock 高亮 | `language` |
| artifactId | string | 产物引用 | 打开产物详情 | `artifact_id` |
| createdAt | string | 发送时间 | 排序/展示 | `created_at` |

图片和文件不写入 `content`, 后续通过 `attachments` 关联。

### Artifact

Artifact 是 Agent 生成的可预览或可编辑产物。

| 字段 | 类型 | 含义 |
|---|---|---|
| id | string | 产物唯一 ID |
| conversationId | string | 所属会话 |
| title | string | 文件/产物标题 |
| type | string | `code/html/markdown/diff/deploy` |
| description | string | 产物说明 |
| size | number | 内容字节大小 |
| content | string | 产物完整内容, 详情接口返回 |
| createdAt | string | 创建时间 |

### Attachment

Attachment 是用户上传图片/文件的预留模型。MVP 先建表, 暂不开放上传接口。

| 字段 | 类型 | 含义 |
|---|---|---|
| id | string | 附件 ID |
| conversationId | string | 所属会话 |
| messageId | string | 关联消息 |
| kind | string | `image` 或 `file` |
| name | string | 原始文件名 |
| mimeType | string | MIME 类型 |
| size | number | 文件大小 |
| storagePath | string | 服务端存储路径 |
| url | string | 前端访问 URL |
| createdAt | string | 创建时间 |

## P0 HTTP API

| 方法 | 路径 | 用途 | 返回 |
|---|---|---|---|
| GET | `/health` | 健康检查 | `HealthCheckData` |
| GET | `/agents` | 获取 Agent 分页列表 | `PaginatedData<Agent>` |
| GET | `/agents/{agentId}` | 获取 Agent 详情 | `Agent` |
| PUT | `/agents/{agentId}` | 更新 Agent 配置 | `Agent` |
| GET | `/conversations` | 获取会话分页列表 | `PaginatedData<Conversation>` |
| POST | `/conversations` | 创建会话 | `Conversation` |
| GET | `/conversations/{conversationId}` | 获取会话详情 | `Conversation` |
| PUT | `/conversations/{conversationId}` | 更新会话 | `Conversation` |
| DELETE | `/conversations/{conversationId}` | 删除会话 | `boolean` |
| GET | `/conversations/{conversationId}/messages` | 获取历史消息 | `PaginatedData<Message>` |
| POST | `/conversations/{conversationId}/messages` | 发送消息, 非流式返回 | `SendMessageResponse` |
| GET | `/conversations/{conversationId}/artifacts` | 获取产物元数据列表 | `ArtifactMeta[]` |
| GET | `/artifacts/{artifactId}` | 获取产物详情 | `ArtifactDetail` |
| PUT | `/artifacts/{artifactId}` | 更新产物内容 | `ArtifactDetail` |

## 发送消息

请求:

```json
{
  "content": "帮我生成一个登录页"
}
```

## WebSocket API

WebSocket URL:

```text
ws://localhost:8000/ws
```

事件统一结构:

```json
{
  "type": "event.name",
  "eventId": "evt_xxx",
  "data": {}
}
```

### connected

连接成功后由服务端主动推送:

```json
{
  "type": "connected",
  "sessionId": "agenthub-ws",
  "serverTime": "2026-05-25T12:00:00",
  "version": "1.0.0"
}
```

### ping / pong

客户端发送:

```json
{
  "type": "ping"
}
```

服务端返回:

```json
{
  "type": "pong",
  "timestamp": 1710000000000
}
```

### conversation.message.create

客户端通过 WebSocket 发起流式消息:

```json
{
  "type": "conversation.message.create",
  "eventId": "evt_001",
  "data": {
    "conversationId": "conv_xxx",
    "content": "帮我生成一个登录页"
  }
}
```

服务端依次推送:

```text
conversation.message.user_created
agent.status.changed
agent.thinking.started
conversation.message.chunk
conversation.message.completed
artifact.created
agent.status.changed
conversation.all_tasks.completed
```

### conversation.message.chunk

模型流式输出片段:

```json
{
  "type": "conversation.message.chunk",
  "eventId": "evt_001",
  "data": {
    "messageId": "msg_xxx",
    "conversationId": "conv_xxx",
    "senderId": "agent-claude-code",
    "senderName": "Claude Code",
    "role": "agent",
    "messageType": "text",
    "chunk": "好的",
    "sequence": 1,
    "isFullContent": false
  }
}
```

### conversation.message.completed

单条 Agent 消息完成:

```json
{
  "type": "conversation.message.completed",
  "eventId": "evt_001",
  "data": {
    "messageId": "msg_xxx",
    "finishReason": "stop",
    "fullMessage": {}
  }
}
```

### error

错误事件:

```json
{
  "type": "error",
  "eventId": "evt_001",
  "data": {
    "code": 50001,
    "message": "Agent 调用失败"
  }
}
```

响应:

```json
{
  "code": 0,
  "message": "消息发送成功",
  "data": {
    "userMessage": {},
    "agentMessages": [],
    "artifacts": []
  }
}
```
