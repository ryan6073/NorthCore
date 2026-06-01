# AgentHub 前端联调交接说明

这份文档给前端同学用于快速接入当前后端能力。完整接口字段见 `frontend_api_contract.md`，这里重点说明实际接入流程和最近的产品语义变化。

## 1. 当前核心产品语义

现在后端直接用 `mode` 区分会话类型：

```ts
type ConversationMode = 'agent' | 'single' | 'group';
```

### agent 长期联系人会话

- Agent 作为联系人存在。
- 每个用户对每个 enabled 联系人 Agent 都有一个长期单聊。
- Orchestrator 只作为群聊调度器，不作为长期联系人 Agent；后端会以 `enabled=false` 返回它的展示元数据，方便群聊成员区展示头像。
- 这个长期单聊伴随 Agent 生命周期。
- `mode=agent` 会话会参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- 前端如果对 `mode=agent` 会话调用删除接口，后端只会隐藏该会话，不删除历史消息。
- Agent 被禁用后，后端默认不再返回该 Agent，也不再展示它对应的 agent 会话。
- 历史数据不会被删除。

### single / group 手动会话

- 用户手动创建的单聊或群聊。
- `single` 是用户手动创建的临时单聊，不参与长期记忆、会话摘要或 Pinned Messages 注入。
- `group` 是用户手动创建的群聊，会参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- `single/group` 会话允许删除。

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

返回的每个 enabled 联系人 Agent 都会带：

```ts
interface Agent {
  id: string;
  ownerUserId: string | null;
  conversationId?: string;
  name: string;
  avatar: string;
  enabled: boolean;
  status: string;
  systemPrompt?: string;
  systemPromptSource?: 'user_override' | 'conversation_override';
}
```

关键字段：

- `ownerUserId = null`：系统预置 Agent，所有用户可见。
- `ownerUserId = 当前用户 id`：用户自建 Agent。
- `conversationId`：当前用户与该 Agent 的长期联系人单聊 ID。
- 系统预置 Agent 和自建 Agent 的编辑能力一致。普通用户修改系统预置 Agent 时，后端保存为用户级配置覆盖，不会影响其他用户或公共模板。
- Orchestrator 可能作为 `enabled=false` 的调度器元数据返回，不带 `conversationId`，前端不要作为可选联系人处理。
- `/agents` 默认只返回 enabled Agent；配置/管理页需要展示禁用项时可传 `enabled=all` 或 `includeDisabled=true`。

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

- `contactId` 就是这个 Agent 联系人长期会话 ID。
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

展示规则建议：

- `mode = agent`：作为 Agent 联系人长期会话展示，后端会注入长期记忆、会话摘要、Pinned Messages 和最近有效消息。
- `mode = group`：作为用户创建的群聊展示，后端同样会注入长期记忆、会话摘要、Pinned Messages 和最近有效消息。
- `mode = single`：作为用户创建的临时单聊展示，不参与长期记忆、会话摘要或 Pinned Messages 注入。

删除按钮规则：

- `single/group` 会话可以显示删除按钮。
- `agent` 会话可以显示“移除/隐藏”语义的按钮，调用同一个删除接口即可。

隐藏 agent 会话成功后，后端返回：

```json
{
  "code": 0,
  "message": "Agent 联系人会话已隐藏",
  "data": true
}
```

如果前端需要主动恢复一个被隐藏的会话，可以调用：

```text
POST /api/v1/conversations/{conversationId}/show
```

该接口会幂等地把 `visible` 改回 `true`，并返回恢复后的 `Conversation`。

## 5. 创建 Agent

系统预置 Agent 目前包括：默认聊天助手、翻译助手、图表助手、文档助手、Claude Code、Codex、Orchestrator。前端可以直接使用 `tags` 展示能力标签，例如翻译、Mermaid、Markdown、PPT、代码生成、代码审查。Orchestrator 仍只作为群聊调度器，不作为联系人会话。

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

## 5.1 修改 Agent 和 Prompt 的两个层级

- 修改 Agent 配置：调用 `PUT /api/v1/agents/{agentId}`。系统预置 Agent 会保存为当前用户自己的配置覆盖；自建 Agent 会直接更新自己的记录。
- 前端也可以统一使用 `GET/PUT /api/v1/conversations/{conversationId}/agents/{agentId}/config` 打开配置面板：`group` 会话保存群聊成员配置；`agent/single` 会话保存用户级 Agent 配置，返回会带 `configScope = 'conversation' | 'user'`。
- 修改 single 会话的 `systemPrompt`：调用 `PUT /api/v1/conversations/{conversationId}`，请求体带 `systemPrompt`。这是会话级覆盖，只影响这个会话。
- 两者互不反写。Agent prompt 不会自动改已有 single 会话；single prompt 也不会改 Agent prompt。

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
  "agentIds": ["agent-claude-code", "agent-codex"]
}
```

说明：Orchestrator 是群聊调度器。前端创建群聊时可以不传 `agent-orchestrator`，后端会自动把它加入群聊成员。

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
mode = 'single' | 'group'
```

`single/group` 会话允许用户删除。Orchestrator 只作为群聊调度器由后端默认加入 `group`，不作为 `agent` 长期联系人会话。

### 7.1 会话内 Agent 配置与群聊成员管理

群聊内普通 Agent 配置和全局 Agent 隔离；保存后只影响当前群聊。`agent/single` 会话也可以使用同一个配置入口，但保存的是用户级 Agent 配置。Orchestrator 是系统调度器，不支持配置或删除。

```text
GET /api/v1/conversations/{conversationId}/agents/{agentId}/config
PUT /api/v1/conversations/{conversationId}/agents/{agentId}/config
```

PUT 请求体使用 `Partial<Agent>`，允许保存名称、头像、描述、Prompt、模型参数、工具和权限等安全可编辑字段，不允许提交身份字段或模型密钥。
GET/PUT 返回的 `Agent.conversationId` 始终指当前会话 ID，并带 `configScope: 'conversation' | 'user'`，方便前端判断当前保存层级。

```text
POST /api/v1/conversations/{conversationId}/agents
DELETE /api/v1/conversations/{conversationId}/agents/{agentId}
```

添加重复成员和删除不存在成员都会返回当前群聊状态。普通成员可以删空，但后端会保留 `agent-orchestrator`。

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

- `content` 必填；如果 `attachments` 非空，允许 `content` 为空，后端会用附件名生成一段兜底文本。
- `targetAgentId` 用于群聊中指定某个 Agent 回复。
- `quotedMessageId` 用于引用历史消息。
- `attachments` 当前阶段支持元数据入库和消息返回，不上传、不下载、不解析文件内容。`blob:` URL 只对浏览器本地有效，后端仅保存为展示引用。

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

说明：`/ws` 必须携带有效 token。前端可以发送 `conversation.subscribe` 订阅会话，后端会按 `userId + conversationId` 做房间隔离；未拥有该会话的用户无法订阅，也不会收到该会话的流式事件。

订阅事件：

```json
{
  "type": "conversation.subscribe",
  "eventId": "evt_sub",
  "data": {
    "conversationId": "conv_xxx"
  }
}
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

## 9.1 Sandbox Run

可运行任务工作区走独立 Run API：

```text
POST /api/v1/conversations/{conversationId}/runs
GET  /api/v1/conversations/{conversationId}/runs
GET  /api/v1/runs/{runId}
GET  /api/v1/runs/{runId}/files
GET  /api/v1/runs/{runId}/files/{filePath}
GET  /api/v1/runs/{runId}/conflicts
POST /api/v1/runs/{runId}/conflicts/{conflictId}/resolve
POST /api/v1/runs/{runId}/cancel
```

创建 Run 的请求体：

```json
{
  "prompt": "生成一个 Todo 页面并做代码审查"
}
```

说明：

- 后端会创建空工作区 Docker 沙箱；V1 开发阶段默认允许联网以安装依赖，生产模式可通过配置切回禁网。
- 仅支持 `mode=agent` 和 `mode=group` 会话。
- Orchestrator 会生成 DAG，后端当前默认串行调度 step。
- 文件写入使用 `baseVersion` 乐观锁，冲突会进入 `sandbox_conflicts`。
- 运行完成后，沙箱输出文件会同步成现有 Artifact。
- 前端可监听 `run.*` WebSocket 事件展示 DAG 节点、日志、冲突和完成状态。

## 10. 前端最小接入清单

1. 登录成功后保存 token。
2. HTTP 请求统一带 `Authorization`。
3. 获取 Agent 列表，使用 `agent.conversationId` 打开联系人单聊。
4. 渲染会话时区分 `mode`。
5. `mode=agent` 会话的删除按钮语义是“移除/隐藏”，不会删除历史。
6. `mode=single/group` 会话可以物理删除。
7. 创建自定义 Agent 后，把返回的 Agent 加入联系人列表。
8. 发送引用消息时传 `quotedMessageId`。
