# AgentHub 前端联调交接说明

这份文档给前端同学用于快速接入当前后端能力。完整接口字段见 `frontend_api_contract.md`，这里重点说明实际接入流程和最近的产品语义变化。

## 1. 当前核心产品语义

现在后端把会话分成两类：

```ts
type ConversationType = 'contact' | 'manual';
```

### contact 长期联系人会话

- Agent 作为联系人存在。
- 每个用户对每个 enabled Agent 都有一个长期单聊。
- 这个长期单聊伴随 Agent 生命周期。
- 前端不应该允许用户删除 contact 会话。
- Agent 被禁用后，后端默认不再返回该 Agent，也不再展示它对应的 contact 会话。
- 历史数据不会被删除。

### manual 短期手动会话

- 用户手动创建的单聊或群聊。
- 群聊永远是 manual。
- 用户手动创建的单聊也是 manual。
- manual 会话允许删除。

## 2. 登录接入流程

登录、注册、游客入口：

```text
POST /api/v1/auth/login
POST /api/v1/auth/register
POST /api/v1/auth/guest
```

成功后返回：

```ts
interface AuthSession {
  user: User;
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
}
```

前端需要保存 `token`，后续 HTTP 请求统一加：

```http
Authorization: Bearer <token>
```

页面刷新后先调：

```text
GET /api/v1/auth/me
```

如果 `code = 0`，进入主界面；如果 `code = 40101`，回到登录页。

## 3. Agent 联系人列表

前端联系人列表建议直接使用：

```text
GET /api/v1/agents
```

返回的每个 enabled Agent 都会带：

```ts
interface Agent {
  id: string;
  ownerUserId: string | null;
  conversationId?: string;
  name: string;
  avatar: string;
  enabled: boolean;
  status: string;
}
```

关键字段：

- `ownerUserId = null`：系统预置 Agent，所有用户可见。
- `ownerUserId = 当前用户 id`：用户自建 Agent。
- `conversationId`：当前用户与该 Agent 的长期联系人单聊 ID。

前端点击某个 Agent 联系人时，优先打开：

```ts
agent.conversationId
```

如果某些异常情况下没有 `conversationId`，兜底调用：

```text
GET /api/v1/agents/{agentId}/conversation
```

这个接口会返回当前用户与该 Agent 的长期单聊；如果不存在，后端会自动创建。

如果前端已经明确拿到了 `userId` 和 `agentId`，也可以用显式查询接口：

```text
GET /api/v1/users/{userId}/agents/{agentId}/contact
```

Response Data:

```ts
{
  contactId: string;
  conversationId: string;
  conversation: Conversation;
}
```

说明：

- `contactId` 就是这个 Agent 联系人长期单聊的会话 ID。
- `conversationId` 与 `contactId` 相同，方便前端直接复用会话打开逻辑。
- 普通用户只能查自己的 `userId`；admin 可以查任意用户。

## 4. 会话列表展示

会话列表接口：

```text
GET /api/v1/conversations
```

返回：

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

展示规则建议：

- `conversationType = contact`：作为 Agent 联系人长期单聊展示。
- `conversationType = manual` 且 `mode = group`：作为用户创建的群聊展示。
- `conversationType = manual` 且 `mode = single`：作为用户创建的临时单聊展示。

删除按钮规则：

- `manual` 会话可以显示删除按钮。
- `contact` 会话不要显示删除按钮。

如果误删 contact 会话，后端会返回：

```json
{
  "code": 40007,
  "message": "Agent 联系人会话不允许删除，请禁用对应 Agent"
}
```

## 5. 创建 Agent

创建自定义 Agent：

```text
POST /api/v1/agents
```

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

后端会自动：

- 创建 Agent。
- 写入 `ownerUserId = 当前用户 id`。
- 创建该 Agent 的长期 contact 单聊。
- 在返回的 Agent 上带 `conversationId`。

所以前端创建成功后，可以直接把返回的 Agent 加到联系人列表里。

## 6. 禁用 Agent

禁用 Agent：

```text
DELETE /api/v1/agents/{agentId}
```

这是软删除：

- `enabled = false`
- `status = disabled`
- 不删除历史消息
- 不删除 contact 会话

禁用后：

- `GET /agents` 默认不返回该 Agent。
- `GET /conversations` 默认不返回该 Agent 对应的 contact 会话。

## 7. 创建手动会话

手动创建会话仍然保留：

```text
POST /api/v1/conversations
```

创建群聊：

```json
{
  "title": "3人会话",
  "mode": "group",
  "agentIds": ["agent-orchestrator", "agent-claude-code", "agent-codex"]
}
```

创建手动单聊：

```json
{
  "title": "临时 Claude Code 会话",
  "mode": "single",
  "agentIds": ["agent-claude-code"]
}
```

后端会把这些会话标记为：

```ts
conversationType = 'manual'
```

manual 会话允许用户删除。

## 8. 发送消息

发送消息接口不变：

```text
POST /api/v1/conversations/{conversationId}/messages
```

Request:

```json
{
  "content": "这是什么意思",
  "targetAgentId": "agent-codex",
  "quotedMessageId": "msg-xxx",
  "attachments": []
}
```

说明：

- `content` 必填。
- `targetAgentId` 用于群聊中指定某个 Agent 回复。
- `quotedMessageId` 用于引用历史消息。
- `attachments` 当前阶段只是预留。

如果前端做回复/引用，只需要传 `quotedMessageId`。后端会返回：

```ts
message.metadata.quotedMessage
```

前端可以用它恢复引用卡片。

产物编辑后需要把“已生成新版本”这类提示保留在聊天流时，也继续调用同一个接口，但按系统消息发送：

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

后端会保存这条消息，刷新后 `GET /messages` 能恢复；但不会触发 Agent 回复，也不会进入模型上下文、上下文压缩或长期记忆。

## 9. WebSocket

WebSocket 地址：

```text
/ws?token=<token>
```

发送消息事件：

```json
{
  "type": "conversation.message.create",
  "eventId": "evt_xxx",
  "data": {
    "conversationId": "conv_xxx",
    "content": "帮我生成登录页",
    "targetAgentId": "agent-codex",
    "quotedMessageId": "msg_xxx"
  }
}
```

建议前端当前主流程仍可继续使用 HTTP。WS 已支持同样的 `targetAgentId` 和 `quotedMessageId`。

## 10. 前端最小接入清单

1. 登录成功后保存 token。
2. HTTP 请求统一带 `Authorization`。
3. 获取 Agent 列表，使用 `agent.conversationId` 打开联系人单聊。
4. 渲染会话时区分 `conversationType`。
5. contact 会话不展示删除按钮。
6. manual 会话可以删除。
7. 创建自定义 Agent 后，把返回的 Agent 加入联系人列表。
8. 发送引用消息时传 `quotedMessageId`。
