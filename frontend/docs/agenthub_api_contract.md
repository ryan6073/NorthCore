# AgentHub API 接口规范

版本：v1.1.0  
适用阶段：前后端联调 / MVP Demo / 后续 WebSocket 流式扩展  
通信模式：HTTP + WebSocket 混合架构

---

## 1. 文档说明

### 1.1 文档目的

本文档用于规范 AgentHub 多 Agent 协作平台的前后端接口，包括：

- HTTP REST API
- WebSocket Event API
- 通用数据模型
- 错误码规范
- 前端接入约定
- MVP 实现范围
- 后续扩展接口

本文档是前后端协作的接口契约。前端应按照本文档封装 service 层，后端应按照本文档提供 API 和事件推送能力。

### 1.2 设计原则

AgentHub 采用 HTTP + WebSocket 混合通信架构：

- HTTP 用于稳定、可分页、可缓存的 CRUD 和详情查询。
- WebSocket 用于实时、低延迟的流式输出和状态推送。
- 大内容不通过 WebSocket 传输，只通过 WebSocket 推送 ID，再由 HTTP 拉取详情。
- 第一阶段优先保证 HTTP 闭环跑通，WebSocket 作为第二阶段增强。

---

## 2. 实现优先级

为了保证前后端能够快速联调，接口按 P0 / P1 / P2 分级。

### 2.1 P0：MVP 必须实现

P0 接口用于保证前端基础 Demo 能够完整运行。

| 模块 | 接口 | 说明 |
|---|---|---|
| 健康检查 | GET /health | 检查后端服务状态 |
| Agent | GET /agents | 获取 Agent 联系人列表 |
| Agent | GET /agents/{agentId} | 获取 Agent 详情 |
| Agent | PUT /agents/{agentId} | 更新 Agent 配置 |
| Conversation | GET /conversations | 获取会话列表 |
| Conversation | POST /conversations | 创建会话 |
| Conversation | GET /conversations/{conversationId} | 获取会话详情 |
| Message | GET /conversations/{conversationId}/messages | 获取会话历史消息 |
| Message | POST /conversations/{conversationId}/messages | 发送消息，非流式返回 |
| Artifact | GET /conversations/{conversationId}/artifacts | 获取会话产物元数据列表 |
| Artifact | GET /artifacts/{artifactId} | 获取产物详情 |

### 2.2 P1：建议实现

P1 用于增强用户体验，支持流式输出和实时状态。

| 模块 | 能力 | 说明 |
|---|---|---|
| WebSocket | connected | 连接成功事件 |
| WebSocket | ping / pong | 心跳保活 |
| Message Stream | conversation.message.create | 通过 WebSocket 发起消息 |
| Message Stream | conversation.message.chunk | Agent 流式输出 chunk |
| Message Stream | conversation.message.completed | 单条 Agent 消息完成 |
| Artifact | artifact.created | 产物生成事件 |
| Task | conversation.all_tasks.completed | 当前任务全部完成 |
| Agent Status | agent.status.changed | Agent 状态变化 |

### 2.3 P2：预留扩展

P2 仅在文档中保留设计，MVP 阶段不强制实现。

| 模块 | 能力 | 说明 |
|---|---|---|
| Tool Calling | tool.calling.started | 工具调用开始 |
| Tool Calling | tool.calling.completed | 工具调用完成 |
| Workflow | workflow.step.updated | 工作流步骤更新 |
| Deploy | deployment.status.changed | 部署状态更新 |
| Collaboration | presence.updated | 多人在线状态 |
| Collaboration | cursor.updated | 多人协作光标同步 |

---

## 3. 系统通信架构

### 3.1 架构概览

```text
┌──────────────────────────────────────────────────────┐
│                    AgentHub 前端                      │
├──────────────────────┬───────────────────────────────┤
│ HTTP Client           │ WebSocket Client              │
│ RESTful CRUD          │ Event-driven Streaming        │
└───────────┬──────────┴──────────────┬────────────────┘
            │                         │
            ▼                         ▼
┌──────────────────────┬───────────────────────────────┐
│ HTTP Server           │ WebSocket Server              │
│ Agent / Conversation  │ Message Stream                │
│ Message / Artifact    │ Agent Status                  │
│ CRUD & Query          │ Workflow Events               │
└──────────────────────┴───────────────────────────────┘
```

### 3.2 HTTP 负责

- Agent 联系人列表
- Agent 配置详情
- Agent 配置更新
- 会话列表
- 会话详情
- 会话创建
- 历史消息分页
- 发送消息的非流式版本
- Artifact 元数据列表
- Artifact 大内容详情
- 健康检查

### 3.3 WebSocket 负责

- 消息流式输出
- 多 Agent 依次回复事件
- Agent 思考状态
- Agent 状态变化
- Artifact 生成通知
- Tool Calling 事件
- Workflow 进度事件

### 3.4 第一阶段推荐方案

MVP 阶段建议优先使用 HTTP 完成闭环：

```text
用户发送消息
↓
POST /conversations/{id}/messages
↓
后端保存用户消息
↓
后端生成 Mock Orchestrator / Agent 回复
↓
后端返回 userMessage + agentMessages + artifacts
↓
前端更新消息流和 Artifact 面板
```

WebSocket 在 HTTP 方案稳定后再引入。

---

## 4. 基础约定

### 4.1 Base URL

开发环境：

```text
http://localhost:8000/api/v1
```

生产环境：

```text
https://your-domain.com/api/v1
```

### 4.2 请求格式

```http
Content-Type: application/json
```

### 4.3 认证方式

MVP 阶段可以暂不启用登录认证。

如启用认证，统一使用：

```http
Authorization: Bearer {token}
```

### 4.4 字段命名

前后端统一使用 camelCase。

正确示例：

```json
{
  "agentIds": ["agent-code"],
  "lastMessage": "已生成代码",
  "updatedAt": "2026-05-24 15:30"
}
```

不建议使用：

```json
{
  "agent_ids": [],
  "last_message": "",
  "updated_at": ""
}
```

### 4.5 ID 类型

所有 ID 统一使用 string。

示例：

```text
agent-orchestrator
conv-001
msg-001
artifact-001
```

### 4.6 时间格式

MVP 阶段建议使用字符串：

```text
2026-05-24 15:30
```

后续可统一为 ISO 8601：

```text
2026-05-24T15:30:00Z
```

---

## 5. 通用响应格式

### 5.1 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 5.2 分页响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

### 5.3 错误响应

```json
{
  "code": 40001,
  "message": "资源不存在",
  "data": null
}
```

---

## 6. 通用数据模型

### 6.1 AgentProvider

```ts
export type AgentProvider =
  | 'mock'
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'local-qwen'
  | 'custom';
```

### 6.2 AgentStatus

```ts
export type AgentStatus =
  | 'online'
  | 'offline'
  | 'mock'
  | 'thinking'
  | 'disabled';
```

### 6.3 AgentCategory

```ts
export type AgentCategory =
  | 'orchestrator'
  | 'coding'
  | 'review'
  | 'document'
  | 'design'
  | 'custom';
```

### 6.4 AgentTool

```ts
export interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}
```

### 6.5 AgentPermission

```ts
export interface AgentPermission {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  canGenerateArtifacts: boolean;
  canDeploy: boolean;
}
```

### 6.6 AgentModelConfig

```ts
export interface AgentModelConfig {
  provider: AgentProvider;
  modelName: string;
  apiBaseUrl?: string;
  apiKeyPlaceholder?: string;
  temperature: number;
  maxTokens: number;
}
```

### 6.7 AgentListItem

用于 Agent 联系人列表的轻量数据。

```ts
export interface AgentListItem {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: AgentStatus;
  category: AgentCategory;
  provider: AgentProvider;
  enabled: boolean;
  lastUsedAt?: string;
}
```

### 6.8 AgentDetail

用于 Agent 详情和配置页面。

```ts
export interface AgentDetail extends AgentListItem {
  systemPrompt: string;
  modelConfig: AgentModelConfig;
  tools: AgentTool[];
  permissions: AgentPermission;
}
```

### 6.9 ConversationMode

```ts
export type ConversationMode = 'single' | 'group';
```

### 6.10 Conversation

```ts
export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
  createdAt?: string;
}
```

### 6.11 MessageRole

```ts
export type MessageRole =
  | 'user'
  | 'agent'
  | 'orchestrator'
  | 'system';
```

### 6.12 MessageType

```ts
export type MessageType =
  | 'text'
  | 'code'
  | 'artifact'
  | 'task-plan'
  | 'status'
  | 'image'      // 图片消息
  | 'document';  // 文档消息 (ppt, pdf 等)
```

### 6.13 MessageAttachment

附件类型定义，支持上传图片、PDF、PPT 等文件。

```ts
export interface MessageAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'ppt' | 'other';
  url: string;
  size?: number;
  meta?: {
    width?: number;
    height?: number;
    pages?: number;
  };
}
```

### 6.14 ArtifactReference

产物引用类型，支持回复引用指定产物的代码片段。

```ts
export interface ArtifactReference {
  artifactId: string;
  artifactTitle: string;
  version: number;
  quotedText: string;
  startLine?: number;
  endLine?: number;
}
```

### 6.15 Message

```ts
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  language?: string;
  artifactId?: string;
  createdAt: string;
  attachments?: MessageAttachment[];
  quotedMessage?: {
    id: string;
    senderName: string;
    content: string;
  };
  artifactRef?: ArtifactReference;
  isPinned?: boolean;
}
```

### 6.14 ArtifactType

```ts
export type ArtifactType =
  | 'code'
  | 'html'
  | 'markdown'
  | 'diff'
  | 'deploy';
```

### 6.15 ArtifactMeta

用于 Artifact 列表，不包含大内容。

```ts
export interface ArtifactMeta {
  id: string;
  conversationId: string;
  title: string;
  type: ArtifactType;
  description?: string;
  size?: number;
  createdAt: string;
}
```

### 6.16 ArtifactDetail

用于 Artifact 详情，包含完整内容。

```ts
export interface ArtifactDetail extends ArtifactMeta {
  content: string;
}
```

---

## 7. HTTP API

## 7.1 健康检查

### GET /health

用于检查服务是否正常。

#### 请求

```http
GET /api/v1/health
```

#### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2026-05-24T10:00:00Z"
  }
}
```

---

# 7.2 Agent 管理 API

## 7.2.1 获取 Agent 联系人列表

### GET /agents

用于获取 Agent 联系人列表。该接口返回轻量信息，不返回完整 systemPrompt、tools、permissions。

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页数量 |
| category | string | 否 | - | Agent 类型筛选 |
| provider | string | 否 | - | Agent 来源筛选 |
| keyword | string | 否 | - | 按名称或描述搜索 |
| enabled | boolean | 否 | - | 是否启用 |

#### 请求示例

```http
GET /api/v1/agents?page=1&pageSize=20&category=coding
```

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "agent-orchestrator",
        "name": "Orchestrator",
        "avatar": "O",
        "description": "负责任务理解、拆解、调度和结果汇总",
        "tags": ["任务拆解", "调度", "汇总"],
        "status": "online",
        "category": "orchestrator",
        "provider": "mock",
        "enabled": true,
        "lastUsedAt": "2026-05-24 10:00"
      },
      {
        "id": "agent-claude-code",
        "name": "Claude Code",
        "avatar": "C",
        "description": "负责代码生成、代码修改和工程理解",
        "tags": ["代码生成", "代码修改", "工程理解"],
        "status": "mock",
        "category": "coding",
        "provider": "claude-code",
        "enabled": true,
        "lastUsedAt": "2026-05-24 10:10"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

---

## 7.2.2 获取 Agent 详情

### GET /agents/{agentId}

用于获取某个 Agent 的完整配置。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| agentId | string | 是 | Agent ID |

#### 请求示例

```http
GET /api/v1/agents/agent-claude-code
```

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "agent-claude-code",
    "name": "Claude Code",
    "avatar": "C",
    "description": "负责代码生成、代码修改和工程理解",
    "tags": ["代码生成", "代码修改", "工程理解"],
    "status": "mock",
    "category": "coding",
    "provider": "claude-code",
    "enabled": true,
    "lastUsedAt": "2026-05-24 10:10",
    "systemPrompt": "你是一个专业的软件工程 Agent，负责根据用户需求生成和修改代码。",
    "modelConfig": {
      "provider": "claude-code",
      "modelName": "claude-code",
      "apiBaseUrl": "",
      "apiKeyPlaceholder": "sk-****",
      "temperature": 0.7,
      "maxTokens": 4096
    },
    "tools": [
      {
        "id": "file_read",
        "name": "读取文件",
        "description": "允许 Agent 读取项目文件内容",
        "enabled": true
      },
      {
        "id": "file_write",
        "name": "写入文件",
        "description": "允许 Agent 修改或生成文件",
        "enabled": true
      },
      {
        "id": "code_review",
        "name": "代码审查",
        "description": "允许 Agent 对代码进行审查",
        "enabled": true
      }
    ],
    "permissions": {
      "canReadFiles": true,
      "canWriteFiles": true,
      "canRunCommands": false,
      "canGenerateArtifacts": true,
      "canDeploy": false
    }
  }
}
```

---

## 7.2.3 更新 Agent 配置

### PUT /agents/{agentId}

用于更新 Agent 联系人配置。

#### 请求体

```json
{
  "name": "Claude Code Pro",
  "avatar": "C",
  "description": "增强版代码生成 Agent",
  "tags": ["代码生成", "工程理解", "代码修改"],
  "enabled": true,
  "systemPrompt": "你是一个专业的软件工程 Agent。",
  "modelConfig": {
    "provider": "claude-code",
    "modelName": "claude-code",
    "apiBaseUrl": "",
    "apiKeyPlaceholder": "sk-****",
    "temperature": 0.8,
    "maxTokens": 8192
  },
  "tools": [
    {
      "id": "file_read",
      "name": "读取文件",
      "description": "允许读取文件",
      "enabled": true
    }
  ],
  "permissions": {
    "canReadFiles": true,
    "canWriteFiles": true,
    "canRunCommands": false,
    "canGenerateArtifacts": true,
    "canDeploy": false
  }
}
```

#### 响应

返回更新后的 AgentDetail。

```json
{
  "code": 0,
  "message": "Agent 配置更新成功",
  "data": {
    "id": "agent-claude-code",
    "name": "Claude Code Pro",
    "avatar": "C",
    "description": "增强版代码生成 Agent",
    "tags": ["代码生成", "工程理解", "代码修改"],
    "status": "mock",
    "category": "coding",
    "provider": "claude-code",
    "enabled": true,
    "lastUsedAt": "2026-05-24 10:10",
    "systemPrompt": "你是一个专业的软件工程 Agent。",
    "modelConfig": {
      "provider": "claude-code",
      "modelName": "claude-code",
      "apiBaseUrl": "",
      "apiKeyPlaceholder": "sk-****",
      "temperature": 0.8,
      "maxTokens": 8192
    },
    "tools": [],
    "permissions": {
      "canReadFiles": true,
      "canWriteFiles": true,
      "canRunCommands": false,
      "canGenerateArtifacts": true,
      "canDeploy": false
    }
  }
}
```

---

# 7.3 Conversation 会话 API

## 7.3.1 获取会话列表

### GET /conversations

用于获取会话列表。

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页数量 |
| mode | string | 否 | - | single / group |
| keyword | string | 否 | - | 搜索会话标题 |

#### 请求示例

```http
GET /api/v1/conversations?page=1&pageSize=20
```

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "conv-login-page",
        "title": "React 登录页生成",
        "mode": "single",
        "agentIds": ["agent-claude-code"],
        "lastMessage": "已生成 LoginPage.tsx",
        "createdAt": "2026-05-24 09:30",
        "updatedAt": "2026-05-24 10:00"
      },
      {
        "id": "conv-group-homepage",
        "title": "多 Agent 官网生成任务",
        "mode": "group",
        "agentIds": [
          "agent-orchestrator",
          "agent-design",
          "agent-claude-code",
          "agent-review",
          "agent-doc"
        ],
        "lastMessage": "任务已完成，已生成 3 个产物",
        "createdAt": "2026-05-24 09:50",
        "updatedAt": "2026-05-24 10:10"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

---

## 7.3.2 创建新会话

### POST /conversations

用于创建单聊或群聊会话。

#### 请求体

```json
{
  "title": "Todo List 页面生成",
  "mode": "group",
  "agentIds": [
    "agent-orchestrator",
    "agent-design",
    "agent-claude-code",
    "agent-review",
    "agent-doc"
  ]
}
```

#### 规则

1. `mode = single` 时，`agentIds` 只能包含一个 Agent。
2. `mode = group` 时，`agentIds` 可以包含多个 Agent。
3. 群聊会话建议必须包含 `agent-orchestrator`。
4. 禁用状态的 Agent 不允许加入会话。

#### 响应示例

```json
{
  "code": 0,
  "message": "会话创建成功",
  "data": {
    "id": "conv-todo-page",
    "title": "Todo List 页面生成",
    "mode": "group",
    "agentIds": [
      "agent-orchestrator",
      "agent-design",
      "agent-claude-code",
      "agent-review",
      "agent-doc"
    ],
    "lastMessage": "",
    "createdAt": "2026-05-24 10:30",
    "updatedAt": "2026-05-24 10:30"
  }
}
```

---

## 7.3.3 获取会话详情

### GET /conversations/{conversationId}

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "conv-todo-page",
    "title": "Todo List 页面生成",
    "mode": "group",
    "agentIds": [
      "agent-orchestrator",
      "agent-design",
      "agent-claude-code",
      "agent-review",
      "agent-doc"
    ],
    "lastMessage": "任务已完成",
    "createdAt": "2026-05-24 10:30",
    "updatedAt": "2026-05-24 10:40"
  }
}
```

---

## 7.3.4 更新会话信息

### PUT /conversations/{conversationId}

用于修改会话标题或 Agent 成员。

#### 请求体

```json
{
  "title": "Todo List 页面优化",
  "agentIds": [
    "agent-orchestrator",
    "agent-design",
    "agent-claude-code",
    "agent-review"
  ]
}
```

#### 响应

返回更新后的 Conversation。

---

## 7.3.5 压缩会话上下文

### POST /conversations/{conversationId}/compress

用于对当前会话的历史消息进行智能压缩，将多条历史消息总结成精简摘要，减少 Token 占用，同时保留关键信息。

#### 请求示例

```http
POST /api/v1/conversations/conv-todo-page/compress
```

#### 响应示例

```json
{
  "code": 0,
  "message": "上下文已成功压缩",
  "data": {
    "originalMessageCount": 42,
    "compressedMessageCount": 8,
    "summary": "用户需求为生成一个 React 登录页，包含邮箱密码输入框、验证码、登录按钮、记住我选项，历史消息中已生成 LoginPage.tsx 代码和样式产物。"
  }
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| originalMessageCount | number | 压缩前的历史消息总数 |
| compressedMessageCount | number | 压缩后保留的精简消息/摘要数量 |
| summary | string | 生成的上下文压缩摘要文本 |

---

## 7.3.6 删除会话

### DELETE /conversations/{conversationId}

#### 响应示例

```json
{
  "code": 0,
  "message": "会话删除成功",
  "data": true
}
```

---

# 7.4 Message 消息 API

## 7.4.1 获取会话历史消息

### GET /conversations/{conversationId}/messages

用于获取某个会话的历史消息。

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 50 | 每页数量 |
| beforeId | string | 否 | - | 游标，获取早于该消息 ID 的消息 |

#### 请求示例

```http
GET /api/v1/conversations/conv-todo-page/messages?page=1&pageSize=50
```

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "msg-user-001",
        "conversationId": "conv-todo-page",
        "senderId": "user",
        "senderName": "User",
        "role": "user",
        "type": "text",
        "content": "帮我生成一个 Todo List 页面",
        "createdAt": "2026-05-24 10:31"
      },
      {
        "id": "msg-orch-001",
        "conversationId": "conv-todo-page",
        "senderId": "agent-orchestrator",
        "senderName": "Orchestrator",
        "role": "orchestrator",
        "type": "task-plan",
        "content": "我已理解需求，将任务拆解给 DesignAgent、Claude Code、ReviewAgent 和 DocAgent。",
        "createdAt": "2026-05-24 10:31"
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 50,
    "hasMore": false
  }
}
```

---

## 7.4.2 通知已 @ 指定 Agent（实时预通知）

### POST /conversations/{conversationId}/mention

当用户在输入框实时 @ 某个 Agent 选中时，立即发送该 POST 请求通知后端，让后端可以提前预热、预热 Agent 上下文或更新 Agent 在线状态为被提及。

#### 请求体

```json
{
  "agentId": "agent-claude-code"
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| agentId | string | 是 | 被 @ 的 Agent ID |

#### 响应示例

```json
{
  "code": 0,
  "message": "已通知 Agent 准备就绪",
  "data": {
    "agentId": "agent-claude-code",
    "status": "preparing"
  }
}
```

---

## 7.4.3 发送消息：HTTP 非流式版本

### POST /conversations/{conversationId}/messages

MVP 阶段建议使用该接口完成发送消息和 Agent Mock 回复。

#### 请求体

```json
{
  "content": "帮我生成一个 Todo List 页面，需要设计、代码、审查和说明文档。",
  "targetAgentId": "agent-claude-code"
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| content | string | 是 | 用户消息内容 |
| targetAgentId | string | 否 | 可选，在群聊里 @ 指定 Agent 单独工作，不传走完整 Orchestrator 调度 |
| attachments | MessageAttachment[] | 否 | 可选，图片、PDF、PPT 等附件列表 |

#### 处理逻辑

1. 后端保存用户消息。
2. 后端根据会话模式判断单聊或群聊。
3. 单聊模式调用或模拟一个 Agent 回复。
4. 群聊模式调用或模拟 Orchestrator 和多个 Agent 回复。
5. 后端生成 Artifact。
6. 后端返回 userMessage、agentMessages 和 artifacts。

#### 响应示例

```json
{
  "code": 0,
  "message": "消息发送成功",
  "data": {
    "userMessage": {
      "id": "msg-user-002",
      "conversationId": "conv-todo-page",
      "senderId": "user",
      "senderName": "User",
      "role": "user",
      "type": "text",
      "content": "帮我生成一个 Todo List 页面，需要设计、代码、审查和说明文档。",
      "createdAt": "2026-05-24 10:35"
    },
    "agentMessages": [
      {
        "id": "msg-orch-002",
        "conversationId": "conv-todo-page",
        "senderId": "agent-orchestrator",
        "senderName": "Orchestrator",
        "role": "orchestrator",
        "type": "status",
        "content": "我已理解需求，正在拆解任务。",
        "createdAt": "2026-05-24 10:35"
      },
      {
        "id": "msg-orch-003",
        "conversationId": "conv-todo-page",
        "senderId": "agent-orchestrator",
        "senderName": "Orchestrator",
        "role": "orchestrator",
        "type": "task-plan",
        "content": "DesignAgent：负责页面结构设计\nClaude Code：负责 React 代码生成\nReviewAgent：负责代码审查\nDocAgent：负责 README 文档说明",
        "createdAt": "2026-05-24 10:35"
      },
      {
        "id": "msg-design-001",
        "conversationId": "conv-todo-page",
        "senderId": "agent-design",
        "senderName": "DesignAgent",
        "role": "agent",
        "type": "text",
        "content": "页面建议包含任务输入框、任务列表、完成状态切换和清空按钮。",
        "createdAt": "2026-05-24 10:36"
      },
      {
        "id": "msg-code-001",
        "conversationId": "conv-todo-page",
        "senderId": "agent-claude-code",
        "senderName": "Claude Code",
        "role": "agent",
        "type": "code",
        "language": "tsx",
        "content": "export default function TodoPage() {\n  return <div>Todo List</div>;\n}",
        "createdAt": "2026-05-24 10:36"
      },
      {
        "id": "msg-review-001",
        "conversationId": "conv-todo-page",
        "senderId": "agent-review",
        "senderName": "ReviewAgent",
        "role": "agent",
        "type": "text",
        "content": "代码结构清晰，但建议补充空状态处理和组件拆分。",
        "createdAt": "2026-05-24 10:37"
      },
      {
        "id": "msg-doc-001",
        "conversationId": "conv-todo-page",
        "senderId": "agent-doc",
        "senderName": "DocAgent",
        "role": "agent",
        "type": "text",
        "content": "我已生成 README 文档摘要，说明页面功能、运行方式和组件结构。",
        "createdAt": "2026-05-24 10:37"
      }
    ],
    "artifacts": [
      {
        "id": "artifact-todo-tsx",
        "conversationId": "conv-todo-page",
        "title": "TodoPage.tsx",
        "type": "code",
        "description": "Todo List 页面组件",
        "size": 1024,
        "createdAt": "2026-05-24 10:38"
      },
      {
        "id": "artifact-readme",
        "conversationId": "conv-todo-page",
        "title": "README.md",
        "type": "markdown",
        "description": "页面说明文档",
        "size": 512,
        "createdAt": "2026-05-24 10:38"
      }
    ]
  }
}
```

---

# 7.5 Artifact 产物 API

## 7.5.1 获取会话产物元数据列表

### GET /conversations/{conversationId}/artifacts

用于获取当前会话生成的 Artifact 列表。该接口只返回元数据，不返回完整 content。

#### 请求示例

```http
GET /api/v1/conversations/conv-todo-page/artifacts
```

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "artifact-todo-tsx",
      "conversationId": "conv-todo-page",
      "title": "TodoPage.tsx",
      "type": "code",
      "description": "Todo List 页面组件",
      "size": 1024,
      "createdAt": "2026-05-24 10:38"
    },
    {
      "id": "artifact-readme",
      "conversationId": "conv-todo-page",
      "title": "README.md",
      "type": "markdown",
      "description": "页面说明文档",
      "size": 512,
      "createdAt": "2026-05-24 10:38"
    }
  ]
}
```

---

## 7.5.2 获取 Artifact 详情

### GET /artifacts/{artifactId}

用于获取 Artifact 的完整内容。

#### 请求示例

```http
GET /api/v1/artifacts/artifact-todo-tsx
```

#### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "artifact-todo-tsx",
    "conversationId": "conv-todo-page",
    "title": "TodoPage.tsx",
    "type": "code",
    "description": "Todo List 页面组件",
    "size": 1024,
    "content": "import React, { useState } from 'react';\n\nexport default function TodoPage() {\n  const [items, setItems] = useState([]);\n  return <div>Todo List</div>;\n}",
    "createdAt": "2026-05-24 10:38"
  }
}
```

---

## 7.5.3 更新 Artifact 内容

### PUT /artifacts/{artifactId}

用于更新 Artifact 内容。MVP 阶段可选。

#### 请求体

```json
{
  "content": "export default function TodoPage() { return <div>Updated</div>; }"
}
```

#### 响应

返回更新后的 ArtifactDetail。

---

## 8. WebSocket API

## 8.1 WebSocket 基础信息

### 连接地址

开发环境：

```text
ws://localhost:8000/ws
```

带 token：

```text
ws://localhost:8000/ws?token={jwt-token}
```

生产环境：

```text
wss://your-domain.com/ws
```

### WebSocket 设计原则

1. 客户端通过 WebSocket 发起流式消息任务。
2. 服务端通过事件推送 Agent 状态、消息 chunk、完成事件和 Artifact 事件。
3. 大内容不通过 WebSocket 传输。
4. Artifact 生成后只推送 artifactId，前端再通过 HTTP 获取详情。
5. 每次用户发起任务时，客户端生成 eventId，用于追踪本次事件流。

---

## 8.2 连接成功事件

### connected

服务端在 WebSocket 连接建立后主动发送。

```json
{
  "type": "connected",
  "sessionId": "sess-abc123",
  "serverTime": "2026-05-24T10:00:00Z",
  "version": "1.0.0"
}
```

---

## 8.3 心跳事件

### 客户端发送 ping

```json
{
  "type": "ping"
}
```

### 服务端返回 pong

```json
{
  "type": "pong",
  "timestamp": 1716523200000
}
```

建议客户端每 25 秒发送一次 ping。

---

## 8.4 客户端事件

## 8.4.1 发起消息流式输出

### conversation.message.create

客户端发送该事件，表示用户向某个会话发送消息，并希望以流式方式接收 Agent 回复。

```json
{
  "type": "conversation.message.create",
  "eventId": "evt-local-123456",
  "data": {
    "conversationId": "conv-todo-page",
    "content": "帮我生成一个 Todo List 页面",
    "targetAgentId": "agent-claude-code",
    "quotedMessageId": "msg-xxx",
    "artifactRef": {
      "artifactId": "artifact-123",
      "artifactTitle": "LoginPage.tsx",
      "version": 1,
      "quotedText": "export default function LoginPage()",
      "startLine": 10
    },
    "attachments": []
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| type | string | 固定为 conversation.message.create |
| eventId | string | 客户端生成的事件流 ID |
| data.conversationId | string | 会话 ID |
| data.content | string | 用户消息内容 |

---

## 8.5 服务端事件

## 8.5.1 用户消息已创建

### conversation.message.user_created

服务端确认用户消息已经持久化。

```json
{
  "type": "conversation.message.user_created",
  "eventId": "evt-local-123456",
  "data": {
    "message": {
      "id": "msg-user-003",
      "conversationId": "conv-todo-page",
      "senderId": "user",
      "senderName": "User",
      "role": "user",
      "type": "text",
      "content": "帮我生成一个 Todo List 页面",
      "createdAt": "2026-05-24 10:45"
    }
  }
}
```

---

## 8.5.2 Agent 开始思考

### agent.thinking.started

```json
{
  "type": "agent.thinking.started",
  "eventId": "evt-local-123456",
  "data": {
    "conversationId": "conv-todo-page",
    "agentId": "agent-orchestrator",
    "agentName": "Orchestrator"
  }
}
```

---

## 8.5.3 Agent 状态变化

### agent.status.changed

```json
{
  "type": "agent.status.changed",
  "data": {
    "agentId": "agent-claude-code",
    "newStatus": "thinking",
    "timestamp": "2026-05-24T10:05:00Z"
  }
}
```

---

## 8.5.4 消息增量 Chunk

### conversation.message.chunk

服务端推送 Agent 消息的增量内容。

```json
{
  "type": "conversation.message.chunk",
  "eventId": "evt-local-123456",
  "data": {
    "messageId": "msg-agent-456",
    "conversationId": "conv-todo-page",
    "senderId": "agent-claude-code",
    "senderName": "Claude Code",
    "role": "agent",
    "messageType": "code",
    "language": "tsx",
    "chunk": "export default function",
    "sequence": 1,
    "isFullContent": false
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| messageId | string | 正在生成的消息 ID |
| chunk | string | 当前增量文本 |
| sequence | number | 从 1 开始递增 |
| isFullContent | boolean | 是否为完整内容 |
| messageType | string | text / code / task-plan 等 |
| language | string | 代码语言，可选 |

---

## 8.5.5 单条消息完成

### conversation.message.completed

```json
{
  "type": "conversation.message.completed",
  "eventId": "evt-local-123456",
  "data": {
    "messageId": "msg-agent-456",
    "finishReason": "stop",
    "fullMessage": {
      "id": "msg-agent-456",
      "conversationId": "conv-todo-page",
      "senderId": "agent-claude-code",
      "senderName": "Claude Code",
      "role": "agent",
      "type": "code",
      "language": "tsx",
      "content": "export default function TodoPage() { return <div>Todo</div>; }",
      "createdAt": "2026-05-24 10:46"
    }
  }
}
```

finishReason 可选值：

```ts
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'error';
```

---

## 8.5.6 Artifact 已生成

### artifact.created

WebSocket 只推送 Artifact 元数据，不推送大内容。

```json
{
  "type": "artifact.created",
  "eventId": "evt-local-123456",
  "data": {
    "artifact": {
      "id": "artifact-dashboard",
      "conversationId": "conv-todo-page",
      "title": "Dashboard.tsx",
      "type": "code",
      "description": "仪表盘页面组件",
      "size": 2048,
      "createdAt": "2026-05-24 10:47"
    }
  }
}
```

前端收到该事件后，可以：

1. 将 ArtifactMeta 追加到右侧 Artifact 列表。
2. 如果用户点击预览，再请求：

```http
GET /api/v1/artifacts/{artifactId}
```

---

## 8.5.7 当前任务全部完成

### conversation.all_tasks.completed

```json
{
  "type": "conversation.all_tasks.completed",
  "eventId": "evt-local-123456",
  "data": {
    "conversationId": "conv-todo-page",
    "summary": "所有 Agent 任务已完成",
    "totalMessages": 8,
    "totalArtifacts": 3
  }
}
```

---

## 8.6 Tool Calling 事件：P2 预留

## 8.6.1 Tool 调用开始

### tool.calling.started

```json
{
  "type": "tool.calling.started",
  "eventId": "evt-local-123456",
  "data": {
    "toolCallId": "call-001",
    "conversationId": "conv-todo-page",
    "agentId": "agent-claude-code",
    "toolName": "file_read",
    "input": {
      "path": "/src/App.tsx"
    }
  }
}
```

## 8.6.2 Tool 调用完成

### tool.calling.completed

```json
{
  "type": "tool.calling.completed",
  "eventId": "evt-local-123456",
  "data": {
    "toolCallId": "call-001",
    "conversationId": "conv-todo-page",
    "agentId": "agent-claude-code",
    "toolName": "file_read",
    "output": "文件内容..."
  }
}
```

---

## 8.7 Workflow 事件：P2 预留

### workflow.step.updated

```json
{
  "type": "workflow.step.updated",
  "eventId": "evt-local-123456",
  "data": {
    "workflowId": "wf-123",
    "conversationId": "conv-todo-page",
    "stepIndex": 2,
    "totalSteps": 5,
    "stepName": "Claude Code 代码生成中",
    "status": "running"
  }
}
```

status 可选：

```ts
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed';
```

---

## 9. WebSocket Event 命名规范

采用 `domain.resource.action` 风格。

| 类型 | 事件名 | 说明 |
|---|---|---|
| 全局 | connected | 连接成功 |
| 全局 | ping | 心跳请求 |
| 全局 | pong | 心跳响应 |
| 客户端命令 | conversation.message.create | 创建用户消息并触发 Agent 回复 |
| 服务端确认 | conversation.message.user_created | 用户消息已创建 |
| 服务端流式 | conversation.message.chunk | Agent 消息增量 |
| 服务端完成 | conversation.message.completed | 单条 Agent 消息完成 |
| Agent 状态 | agent.thinking.started | Agent 开始思考 |
| Agent 状态 | agent.status.changed | Agent 状态变化 |
| Artifact | artifact.created | 产物已生成 |
| 任务 | conversation.all_tasks.completed | 当前任务全部完成 |
| Tool | tool.calling.started | 工具调用开始 |
| Tool | tool.calling.completed | 工具调用完成 |
| Workflow | workflow.step.updated | 工作流步骤更新 |

---

## 10. 错误码规范

| 错误码 | 类型 | 说明 |
|---|---|---|
| 0 | success | 成功 |
| 40000 | client_error | 请求参数验证失败 |
| 40001 | not_found | 资源不存在 |
| 40002 | invalid_state | 当前状态不允许该操作 |
| 40003 | disabled_agent | Agent 已禁用，无法加入会话 |
| 40100 | unauthorized | 未授权 |
| 40101 | token_expired | Token 已过期 |
| 40300 | forbidden | 权限不足 |
| 40400 | route_not_found | 接口不存在 |
| 50000 | server_error | 服务端内部错误 |
| 50001 | agent_call_failed | Agent 调用失败 |
| 50002 | agent_timeout | Agent 执行超时 |
| 50003 | websocket_error | WebSocket 事件处理失败 |
| 50004 | artifact_create_failed | Artifact 创建失败 |

错误响应示例：

```json
{
  "code": 40003,
  "message": "Agent 已禁用，无法加入会话",
  "data": null
}
```

---

## 11. 前端接入建议

## 11.1 推荐 service 目录结构

```text
src/services/
├── index.ts
├── http/
│   ├── agentService.ts
│   ├── conversationService.ts
│   ├── messageService.ts
│   └── artifactService.ts
└── ws/
    ├── wsClient.ts
    ├── wsTypes.ts
    ├── useMessageStream.ts
    └── useAgentStatus.ts
```

## 11.2 HTTP Client 封装建议

```ts
import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err)
);

export default http;
```

## 11.3 环境变量建议

`.env.development`

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws
VITE_USE_MOCK=true
```

`.env.production`

```env
VITE_API_BASE_URL=/api/v1
VITE_WS_URL=/ws
VITE_USE_MOCK=false
```

## 11.4 Mock 切换建议

前端可以保留 Mock 开关：

```ts
const useMock = import.meta.env.VITE_USE_MOCK === 'true';
```

这样后端不可用时，前端仍可独立演示。

---

## 12. 前后端联调顺序

建议按以下顺序联调：

1. GET /health
2. GET /agents
3. GET /agents/{agentId}
4. PUT /agents/{agentId}
5. GET /conversations
6. POST /conversations
7. GET /conversations/{conversationId}/messages
8. POST /conversations/{conversationId}/messages
9. GET /conversations/{conversationId}/artifacts
10. GET /artifacts/{artifactId}
11. WebSocket connected / ping / pong
12. WebSocket conversation.message.create
13. WebSocket conversation.message.chunk
14. WebSocket artifact.created
15. WebSocket conversation.all_tasks.completed

---

## 13. MVP Demo 数据建议

后端可以预置以下 Agent：

| id | name | category | provider |
|---|---|---|---|
| agent-orchestrator | Orchestrator | orchestrator | mock |
| agent-design | DesignAgent | design | mock |
| agent-claude-code | Claude Code | coding | claude-code |
| agent-codex | Codex | coding | codex |
| agent-opencode | OpenCode | coding | opencode |
| agent-review | ReviewAgent | review | mock |
| agent-doc | DocAgent | document | mock |

预置会话：

| id | title | mode |
|---|---|---|
| conv-login-page | React 登录页生成 | single |
| conv-group-homepage | 多 Agent 官网生成任务 | group |

预置 Artifact：

| id | title | type |
|---|---|---|
| artifact-login-tsx | LoginPage.tsx | code |
| artifact-homepage-tsx | HomePage.tsx | code |
| artifact-readme | README.md | markdown |
| artifact-preview-html | preview.html | html |

---

## 14. 版本历史

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0.0 | 2026-05-24 | 初始版本，定义 HTTP + WebSocket 混合架构，并按 P0/P1/P2 分阶段实现 |
| v1.1.0 | 2026-05-25 | 新增 @指定Agent 功能，扩展 MessageAttachment / ArtifactReference 等类型，支持附件上传、消息回复、产物引用功能 |
| v1.2.0 | 2026-05-25 | 新增 POST /conversations/{conversationId}/mention 接口，用户实时选中 @Agent 时立即通知后端，支持 Agent 提前预热上下文 |
| v1.3.0 | 2026-05-25 | 新增 POST /conversations/{conversationId}/compress 压缩上下文接口，一键精简历史消息，减少 Token 占用，以系统消息展示压缩结果 |

---

## 15. 总结

本 API 规范将 AgentHub 的接口设计分为两个层次：

1. HTTP API：负责稳定的数据查询、配置管理、消息历史和 Artifact 详情。
2. WebSocket API：负责实时流式消息、Agent 状态和任务进度事件。

MVP 阶段建议优先完成 HTTP 闭环，保证前后端能稳定演示：

```text
用户发送消息
↓
后端生成多 Agent 回复
↓
前端展示消息流
↓
后端生成 Artifact
↓
前端展示和预览 Artifact
```

在此基础上，再逐步引入 WebSocket，实现更真实的多 Agent 实时协作体验。

