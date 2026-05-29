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
- `conversations.mode = agent` 表示 Agent 联系人长期会话，参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- `conversations.mode = group` 表示用户手动创建的群聊，也参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- `conversations.mode = single` 表示用户手动创建的临时单聊，不参与长期记忆、会话摘要或 Pinned Messages 注入。
- `conversations.contact_agent_id` 表示长期单聊绑定的 Agent。
- `conversations.conversation_type` 暂时兼容旧前端，后续以前端使用 `mode` 为准。
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
  systemPromptSource?: 'user_override';
  baseAgentId?: string;
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
  mode: 'agent' | 'single' | 'group';
  conversationType?: 'contact' | 'manual'; // 兼容字段，前端新逻辑优先使用 mode
  contactAgentId?: string | null;
  visible?: boolean;
  isPinned: boolean;
  isArchived: boolean;
  systemPrompt: string;
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

### 修改当前用户资料

`PUT /auth/profile`

Request:

```json
{
  "name": "string",
  "email": "string",
  "avatar": "string"
}
```

Response Data: `User`

说明：只更新当前登录用户；`email` 会做格式和唯一性校验。

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
- Orchestrator 是群聊调度器，作为 `enabled=false` 的展示元数据返回，不带长期联系人 `conversationId`。
- 每个 enabled 联系人 Agent 返回当前用户对应的长期单聊 `conversationId`。
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

说明：

- 创建自定义 Agent 后，后端会自动创建该 Agent 的长期联系人单聊，并在返回的 Agent 中带 `conversationId`。
- 当前版本采用平台统一模型 Key。`modelConfig` 不允许包含 `apiKey/api_key/secret/token/authorization/headers` 等敏感鉴权字段。
- 系统预置 Agent 和用户自建 Agent 暴露相同编辑能力。普通用户修改系统预置 Agent 时，后端保存为该用户自己的配置覆盖，不会修改公共模板，也不会影响其他用户。

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

说明：系统预置 Agent 也支持修改。非 admin 用户修改系统预置 Agent 时，后端保存用户级覆盖；自建 Agent 则直接更新自己的 Agent 记录。

### 禁用 Agent

`DELETE /agents/{agentId}`

Response Data: `true`

说明：

- 软删除：`enabled=false`，`status=disabled`。
- 历史消息仍可展示。
- 非 admin 用户禁用系统预置 Agent 时，仅对当前用户生效，不影响公共模板或其他用户。

## 6. Conversation API

### 会话列表

`GET /conversations`

Query:

```text
page?: number
pageSize?: number
mode?: agent | single | group
keyword?: string
isArchived?: true | false | all
```

Response Data: `PageResult<Conversation>`

规则：只返回当前登录用户自己的会话。

说明：

- 返回 `mode=single/group` 的用户手动创建会话。
- 返回 enabled Agent 对应的 `mode=agent` 长期联系人会话。
- 不返回 disabled Agent 对应的 `mode=agent` 会话。
- 默认返回未归档会话；`isArchived=true` 返回归档会话；`isArchived=all` 返回全部。
- 排序为置顶优先，其次按最近活跃时间倒序。

### 创建会话

`POST /conversations`

Request:

```json
{
  "title": "3人会话",
  "mode": "group",
  "agentIds": ["agent-claude-code", "agent-codex"],
  "systemPrompt": ""
}
```

Response Data: `Conversation`

说明：`mode=group` 时后端会自动加入 `agent-orchestrator` 作为群聊调度器。
`agent-orchestrator` 只作为群聊调度器，不作为 `mode=agent` 长期联系人会话。

### 会话详情

`GET /conversations/{conversationId}`

Response Data: `Conversation`

### 更新会话

`PUT /conversations/{conversationId}`

Request:

```json
{
  "title": "新标题",
  "agentIds": ["agent-claude-code"],
  "systemPrompt": "这个会话自己的系统提示词"
}
```

Response Data: `Conversation`

说明：`Conversation.systemPrompt` 是会话级覆盖，优先级高于 Agent 的 `systemPrompt`。修改 single 会话的 `systemPrompt` 不会修改 Agent 的个人 prompt 覆盖；修改 Agent prompt 也不会反写已有 single 会话。

### 会话置顶/取消置顶

`PUT /conversations/{conversationId}/pin`

Request:

```json
{
  "isPinned": true
}
```

Response Data: `Conversation`

### 会话归档/激活

`PUT /conversations/{conversationId}/archive`

Request:

```json
{
  "isArchived": true
}
```

Response Data: `Conversation`

### 删除会话

`DELETE /conversations/{conversationId}`

Response Data: `true`

说明：

- `mode=single/group` 会话允许删除，会删除会话及其消息/产物。
- `mode=agent` 长期联系人会话不会物理删除；该接口只把 `visible=false`，让它不再出现在会话列表中。
- 用户之后从 Agent 联系人重新打开该 Agent 时，后端会把 `visible` 恢复为 `true` 并继续使用原历史。

### 显示会话

`POST /conversations/{conversationId}/show`

Response Data: `Conversation`

说明：

- 幂等地把当前用户自己的会话 `visible=true`。
- 主要用于恢复被隐藏的 `mode=agent` 长期联系人会话。
- 如果原本已经可见，也直接返回成功。

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

- 只对 `mode=agent/group` 启用。
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

### 修改长期记忆

`PUT /conversations/{conversationId}/memories/{memoryId}`

Request:

```json
{
  "content": "后端端口固定为 9007",
  "category": "project",
  "active": true
}
```

Response Data: `Memory`

说明：`category` 只支持 `preference/project/profile/constraint`。

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
- 必须传有效 token；未登录连接会被关闭。
- 服务端按 `userId + conversationId` 做订阅隔离，跨用户无法订阅或接收事件。

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

建议前端先订阅会话；发送消息时后端也会自动把当前连接加入该会话房间。

Subscribe:

```json
{
  "type": "conversation.subscribe",
  "eventId": "evt_sub",
  "data": {
    "conversationId": "conv_xxx"
  }
}
```

Unsubscribe:

```json
{
  "type": "conversation.unsubscribe",
  "eventId": "evt_unsub",
  "data": {
    "conversationId": "conv_xxx"
  }
}
```

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
| 40006 | 当前操作无权限 |
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
