# AgentHub Frontend API Contract

本文档用于前后端联调对齐，覆盖当前后端全部核心 API、用户归属规则、消息引用、上下文压缩、产物版本和 WebSocket 协议。

## 1. 基础约定

- HTTP Base URL: `/api/v1`
- WebSocket URL: `/ws`
- 统一响应：

```ts
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}
```

- 成功：`code = 0`
- 分页：

```ts
interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

- 登录后请求头：

```http
Authorization: Bearer <token>
```

说明：当前为了兼容旧 Demo，业务接口未带 token 时会回退到默认管理员；但前端真实登录态下应始终携带 token。

## 2. 用户归属设计

### 新增数据表

```text
users
user_sessions
```

### 新增归属字段

```text
agents.owner_user_id
conversations.owner_user_id
```

### 归属规则

- `users.id` 是用户唯一 ID。
- `user_sessions` 保存登录 token 的哈希，不明文存 token。
- `conversations.owner_user_id` 表示会话所属用户。
- `agents.owner_user_id = null` 表示系统预置 Agent，所有用户可见。
- `agents.owner_user_id = 当前用户 id` 表示用户自建 Agent，仅创建者可见。
- `conversations.conversation_type = contact` 表示 Agent 联系人长期单聊。
- `conversations.conversation_type = manual` 表示用户手动创建的短期会话。
- `conversations.contact_agent_id` 表示长期单聊绑定的 Agent。
- 消息、产物、记忆、Pinned Message 通过 `conversationId` 间接归属用户。
- 老数据迁移到默认管理员：`user-admin`。

### 默认管理员

```text
email: admin@northcore.ai
password: admin123
```

## 3. 核心类型

### User

```ts
interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: string;
  updatedAt: string;
}
```

### AuthSession

```ts
interface AuthSession {
  user: User;
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
}
```

### Agent

```ts
interface Agent {
  id: string;
  ownerUserId: string | null;
  conversationId?: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: 'online' | 'offline' | 'thinking' | 'disabled' | string;
  category: string;
  provider: string;
  enabled: boolean;
  lastUsedAt?: string | null;
  systemPrompt: string;
  modelConfig: Record<string, any>;
  tools: any[];
  permissions: Record<string, any>;
}
```

### Conversation

```ts
interface Conversation {
  id: string;
  ownerUserId: string;
  title: string;
  mode: 'single' | 'group';
  conversationType: 'contact' | 'manual';
  contactAgentId?: string | null;
  agentIds: string[];
  lastMessage: string;
  contextUsagePercent: number;
  contextUsageChars: number;
  contextLimitChars: number;
  createdAt: string;
  updatedAt: string;
}
```

### Message

```ts
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'agent' | 'orchestrator' | 'system';
  type: 'text' | 'code' | 'task-plan' | 'artifact' | 'status' | string;
  content: string;
  language?: string;
  artifactId?: string;
  metadata?: {
    quotedMessageId?: string;
    quotedMessage?: {
      id: string;
      senderId: string;
      senderName: string;
      role: string;
      type: string;
      content: string;
      artifactId?: string;
    };
    artifactId?: string;
    artifactVersionId?: string;
    event?: string;
  };
  createdAt: string;
}
```

### Artifact

```ts
interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: string;
  description?: string;
  tags: string[];
  currentVersionId: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}
```

### ArtifactVersion

```ts
interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  language?: string;
  size?: number;
  changeSummary?: string;
  createdBy: string;
  createdByType: 'user' | 'agent' | 'orchestrator';
  parentVersionId?: string;
  metadata: Record<string, any>;
  createdAt: string;
}
```

### ArtifactDetail

```ts
interface ArtifactDetail extends Artifact {
  currentVersion: ArtifactVersion;
  content: string; // 兼容字段，等于 currentVersion.content
  size?: number;
}
```

## 4. Auth API

### 注册

`POST /auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "123456",
  "name": "张三",
  "avatar": "https://example.com/avatar.png"
}
```

Response Data: `AuthSession`

### 登录

`POST /auth/login`

Request:

```json
{
  "email": "admin@northcore.ai",
  "password": "admin123"
}
```

Response Data: `AuthSession`

### 游客登录

`POST /auth/guest`

Request: 无

Response Data: `AuthSession`

说明：当前 Demo 使用共享游客账号。

注册、登录、游客登录后，后端会确保当前用户拥有默认系统 Agent 的长期联系人会话。

### 当前用户

`GET /auth/me`

Headers:

```http
Authorization: Bearer <token>
```

Response Data: `User`

未登录或过期：`code = 40101`

### 退出登录

`POST /auth/logout`

Headers:

```http
Authorization: Bearer <token>
```

Response Data: `true`

## 5. Agent API

### Agent 列表

`GET /agents`

Query:

```text
page?: number
pageSize?: number
category?: string
provider?: string
keyword?: string
enabled?: true | false
```

Response Data: `PageResult<Agent>`

规则：

- 默认只返回 `enabled=true`。
- 返回系统预置 Agent + 当前用户自建 Agent。
- 每个 enabled Agent 返回当前用户对应的长期单聊 `conversationId`。
- 禁用 Agent 可通过 `enabled=false` 查询。

### 创建 Agent

`POST /agents`

Request:

```json
{
  "name": "My Agent",
  "avatar": "",
  "description": "自定义代码助手",
  "tags": ["自定义", "代码"],
  "category": "custom",
  "provider": "custom",
  "systemPrompt": "你是一个...",
  "modelConfig": {
    "provider": "custom",
    "modelName": "custom-agent",
    "temperature": 0.7,
    "maxTokens": 8192
  },
  "tools": [],
  "permissions": {}
}
```

Response Data: `Agent`

说明：创建自定义 Agent 后，后端会自动创建该 Agent 的长期联系人单聊，并在返回的 Agent 中带 `conversationId`。

### Agent 详情

`GET /agents/{agentId}`

Response Data: `Agent`

### 获取 Agent 长期联系人会话

`GET /agents/{agentId}/conversation`

用途：

- 返回当前用户与该 Agent 的长期单聊会话。
- 如果不存在则自动创建。
- 如果 Agent 已禁用，返回 `40002`。

Response Data: `Conversation`

### 根据用户和 Agent 获取 contact 会话 ID

`GET /users/{userId}/agents/{agentId}/contact`

用途：

- 根据指定 `userId + agentId` 返回长期联系人单聊 ID。
- 如果 contact 会话不存在，后端会自动创建。
- 普通用户只能查询自己的 `userId`。
- admin 用户可以查询任意用户。
- 如果 Agent 已禁用，返回 `40002`。

Response Data:

```ts
interface UserAgentContactResult {
  contactId: string;
  conversationId: string; // 与 contactId 相同，方便前端复用旧字段
  conversation: Conversation;
}
```

### 更新 Agent

`PUT /agents/{agentId}`

Request: Agent 可编辑字段。

Response Data: `Agent`

说明：非 admin 用户不能修改系统预置 Agent。

### 禁用 Agent

`DELETE /agents/{agentId}`

Response Data: `true`

说明：

- 软删除：`enabled=false`，`status=disabled`。
- 历史消息仍可展示。
- 非 admin 用户不能禁用系统预置 Agent。

## 6. Conversation API

### 会话列表

`GET /conversations`

Query:

```text
page?: number
pageSize?: number
mode?: single | group
keyword?: string
```

Response Data: `PageResult<Conversation>`

规则：只返回当前登录用户自己的会话。

说明：

- 返回 `manual` 短期会话。
- 返回 enabled Agent 对应的 `contact` 长期会话。
- 不返回 disabled Agent 对应的 `contact` 会话。

### 创建会话

`POST /conversations`

Request:

```json
{
  "title": "3人会话",
  "mode": "group",
  "agentIds": ["agent-orchestrator", "agent-claude-code", "agent-codex"]
}
```

Response Data: `Conversation`

### 会话详情

`GET /conversations/{conversationId}`

Response Data: `Conversation`

### 更新会话

`PUT /conversations/{conversationId}`

Request:

```json
{
  "title": "新标题",
  "agentIds": ["agent-claude-code"]
}
```

Response Data: `Conversation`

### 删除会话

`DELETE /conversations/{conversationId}`

Response Data: `true`

说明：

- `manual` 会话允许删除，包括手动单聊和群聊。
- `contact` 长期联系人会话不允许删除。
- 删除 `contact` 会话时返回：

```json
{
  "code": 40007,
  "message": "Agent 联系人会话不允许删除，请禁用对应 Agent"
}
```

## 7. Message API

### 历史消息

`GET /conversations/{conversationId}/messages`

Query:

```text
page?: number
pageSize?: number
```

Response Data: `PageResult<Message>`

### 发送消息

`POST /conversations/{conversationId}/messages`

Request:

```json
{
  "content": "这是什么意思",
  "targetAgentId": "agent-codex",
  "quotedMessageId": "msg-xxx",
  "attachments": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| content | 是 | 用户输入文本 |
| targetAgentId | 否 | 群聊中手动指定某个 Agent 回复 |
| quotedMessageId | 否 | 当前消息引用的历史消息 ID |
| attachments | 否 | 当前阶段预留，后端暂不处理上传 |

Response Data:

```ts
interface SendMessageResult {
  userMessage: Message;
  agentMessages: Message[];
  artifacts: Artifact[];
  contextUsage: {
    contextUsagePercent: number;
    contextUsageChars: number;
    contextLimitChars: number;
  };
}
```

引用规则：

- 如果传 `quotedMessageId`，后端会校验该消息属于当前会话。
- 用户消息会返回 `metadata.quotedMessage`，前端可用来渲染引用卡片。
- 模型调用时后端会把引用消息内容拼入本轮上下文。
- 引用不存在或不属于当前会话：`code = 40003`。

### 保存系统状态消息

`POST /conversations/{conversationId}/messages`

用途：前端在产物编辑、版本生成等系统事件发生后，把状态消息写入聊天流。该消息会持久化，刷新后仍展示，但不会触发 Agent 回复，也不会进入模型上下文。

Request:

```json
{
  "role": "system",
  "senderId": "system",
  "senderName": "系统",
  "type": "status",
  "content": "用户手动编辑了产物 html-page.html，已生成新版本 v17",
  "artifactId": "artifact-xxx",
  "artifactVersionId": "version-xxx",
  "metadata": {
    "event": "artifact.version.created"
  }
}
```

Response Data:

```ts
interface SendSystemMessageResult {
  userMessage: null;
  agentMessages: Message[];
  artifacts: [];
  contextUsage: {
    contextUsagePercent: number;
    contextUsageChars: number;
    contextLimitChars: number;
  };
}
```

说明：

- 只要 `role=system`、`senderId=system` 或 `type=status` 任一条件成立，后端就按系统消息处理。
- 后端固定保存为 `role=system`、`senderId=system`、`type=status`。
- `artifactId` 会同时返回在消息顶层字段和 `metadata.artifactId`。
- `artifactVersionId/event` 会写入 `metadata`，用于前端恢复状态卡片或跳转对应版本。

## 8. Mention API

### 获取当前会话可 @ 的 Agent

`POST /conversations/{conversationId}/mention`

Request:

```json
{
  "keyword": "co"
}
```

Response Data: `Agent[]`

说明：

- 只返回当前会话成员中的可用 Agent。
- 不返回 disabled Agent。
- 不返回 Orchestrator。

## 9. Context / Memory / Pin API

### 上下文使用率

`GET /conversations/{conversationId}/context/usage`

Response Data:

```json
{
  "contextUsagePercent": 42,
  "contextUsageChars": 84000,
  "contextLimitChars": 200000
}
```

说明：当前用字符数估算，限制暂定 200K。

### 手动压缩上下文

`POST /conversations/{conversationId}/context/compress`

Response Data:

```json
{
  "summary": {},
  "compressed": true,
  "contextUsage": {
    "contextUsagePercent": 20,
    "contextUsageChars": 40000,
    "contextLimitChars": 200000
  }
}
```

说明：

- 只对群聊启用。
- 不删除历史消息，只影响后续模型上下文。

### 长期记忆列表

`GET /conversations/{conversationId}/memories`

Response Data:

```ts
interface Memory {
  id: string;
  conversationId: string;
  category: 'preference' | 'project' | 'profile' | 'constraint' | string;
  content: string;
  confidence: number;
  sourceMessageId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 删除长期记忆

`DELETE /conversations/{conversationId}/memories/{memoryId}`

Response Data: `true`

### Pinned Messages 列表

`GET /conversations/{conversationId}/pins`

Response Data:

```ts
interface Pin {
  id: string;
  conversationId: string;
  messageId: string;
  message?: Message;
  createdAt: string;
}
```

### Pin 一条消息

`POST /conversations/{conversationId}/messages/{messageId}/pin`

Response Data: `Pin`

### 取消 Pin

`DELETE /conversations/{conversationId}/messages/{messageId}/pin`

Response Data: `true`

## 10. Artifact API

### 会话产物列表

`GET /conversations/{conversationId}/artifacts`

Response Data: `Artifact[]`

说明：列表只返回元数据，不返回大 content。

### 产物详情

`GET /artifacts/{artifactId}`

Response Data: `ArtifactDetail`

说明：内容在 `currentVersion.content`，同时兼容返回顶层 `content`。

### 保存产物内容

`PUT /artifacts/{artifactId}`

Request:

```json
{
  "content": "<html>...</html>",
  "changeSummary": "用户手动修改按钮颜色"
}
```

Response Data: `ArtifactDetail`

说明：不会覆盖旧内容，会新增一个 ArtifactVersion。

### 产物版本列表

`GET /artifacts/{artifactId}/versions`

Response Data: `ArtifactVersion[]`

### 指定版本详情

`GET /artifacts/{artifactId}/versions/{versionId}`

Response Data: `ArtifactVersion`

## 11. WebSocket API

### 连接

```text
ws://host/ws
wss://host/ws
```

可选 token：

```text
/ws?token=<token>
```

说明：

- 如果前端无法给 WebSocket 加 Header，可以用 query token。
- 未传 token 时回退默认管理员，兼容旧 Demo。

连接成功事件：

```json
{
  "type": "connected",
  "sessionId": "agenthub-ws",
  "serverTime": "2026-05-27T12:00:00",
  "version": "1.0.0",
  "user": {}
}
```

### Ping

Client:

```json
{
  "type": "ping"
}
```

Server:

```json
{
  "type": "pong",
  "timestamp": 1710000000000
}
```

### 创建消息

Client:

```json
{
  "type": "conversation.message.create",
  "eventId": "evt_xxx",
  "data": {
    "conversationId": "conv_xxx",
    "content": "这是什么意思",
    "targetAgentId": "agent-codex",
    "quotedMessageId": "msg_xxx"
  }
}
```

Server 事件顺序：

```text
conversation.message.user_created
agent.status.changed
agent.thinking.started
conversation.message.chunk
conversation.message.completed
artifact.created                可选
conversation.all_tasks.completed
```

错误事件：

```json
{
  "type": "error",
  "eventId": "evt_xxx",
  "data": {
    "code": 40003,
    "message": "引用消息不存在或不属于当前会话"
  }
}
```

## 12. 常见错误码

| code | message |
| --- | --- |
| 40000 | 参数错误 |
| 40001 | 资源不存在 |
| 40002 | Agent 不存在、已禁用或无权限 |
| 40003 | 引用消息不存在或不属于当前会话 |
| 40004 | 邮箱已注册 |
| 40005 | 邮箱或密码错误 |
| 40006 | 系统预置 Agent 不允许修改/禁用 |
| 40007 | Agent 联系人会话不允许删除 |
| 40101 | 未登录或登录已过期 |

## 13. 前端接入建议

1. 登录页调用 `/auth/login`、`/auth/register` 或 `/auth/guest`。
2. 保存 `data.token`。
3. HTTP 请求统一加 `Authorization: Bearer <token>`。
4. WebSocket 连接使用 `/ws?token=<token>`。
5. 启动主应用前调用 `/auth/me` 校验登录态。
6. 会话、Agent、消息、产物均以登录用户为隔离边界。
7. 引用消息时只传 `quotedMessageId`，后端会返回引用快照用于刷新恢复。
8. 打开 Agent 联系人聊天时，优先使用 `Agent.conversationId`；兜底可调用 `/agents/{agentId}/conversation`。
