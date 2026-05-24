# AgentHub API 接口规范 - HTTP + WebSocket 混合架构版

## 1. 系统通信架构说明

### 1.1 架构设计原则
AgentHub 采用 **HTTP + WebSocket 混合架构**，参考 OpenAI Realtime API、LangGraph Studio、Cursor 等业界领先产品的设计理念，兼顾：
- 简单 CRUD/查询操作的易用性（HTTP）
- 多 Agent 实时流式输出的低延迟体验（WebSocket）
- 避免单一 WebSocket 方案带来的分页、重连、鉴权刷新过度复杂问题
- 面向未来扩展 workflow、MCP、tool calling 等高级特性

### 1.2 架构分层
```
┌─────────────────────────────────────────────────┐
│              AgentHub 前端应用                  │
├───────────────────┬─────────────────────────────┤
│   HTTP Client     │    WebSocket Client         │
│  (RESTful CRUD)   │  (Event-Driven Streaming)  │
└───────────────────┴─────────────────────────────┘
          │                      │
          ▼                      ▼
┌───────────────────┬─────────────────────────────┐
│  FastAPI / Node   │    WebSocket Server         │
│  HTTP Server      │    Event Stream             │
│  (CRUD, 查询,     │  (流式输出, 状态推送,       │
│   分页, 配置)     │   任务进度, 工作流事件)     │
└───────────────────┴─────────────────────────────┘
```

### 1.3 职责清晰划分
| 模块 | 协议 | 职责 |
|---|---|---|
| 数据 CRUD | HTTP | Agent 管理、会话管理、产物元数据操作等常规增删改查 |
| 列表查询 | HTTP | 分页获取会话列表、消息历史、Agent 列表 |
| 详情查询 | HTTP | 获取产物完整大内容、下载文件、导出数据 |
| 配置管理 | HTTP | 更新 Agent 配置、系统设置、API Key 管理 |
| 流式输出 | WebSocket | 消息增量 chunk 推送、多 Agent 实时打字效果 |
| 状态推送 | WebSocket | Agent 状态变化、会话在线用户同步 |
| 任务进度 | WebSocket | 工作流执行进度、tool calling 实时事件 |
| 实时协作 | WebSocket | 未来扩展多人协作、光标同步等 |

---

## 2. HTTP API 文档

### 2.1 基础信息
- Base URL: `http://localhost:8000/api/v1`
- 协议: HTTP/HTTPS
- Content-Type: `application/json`
- 认证方式: Header 中携带 `Authorization: Bearer {token}`
- 字符编码: UTF-8

### 2.2 通用响应格式

#### 成功响应
```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

#### 分页响应
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

#### 错误响应
```json
{
  "code": 40001,
  "message": "资源不存在",
  "data": null
}
```

---

### 2.3 Agent 管理 API

#### 2.3.1 获取 Agent 列表
**接口**: `GET /agents`

**查询参数**:
| 参数名 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | integer | 否 | 1 | 页码 |
| pageSize | integer | 否 | 20 | 每页数量 |
| category | string | 否 | - | 按 Agent 类别筛选 |

**响应示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "agent-orchestrator",
        "name": "Orchestrator",
        "avatar": "https://example.com/avatar1.png",
        "description": "任务调度与智能拆解汇总",
        "tags": ["任务拆解", "调度", "汇总"],
        "status": "online",
        "category": "orchestrator",
        "enabled": true,
        "lastUsedAt": "2026-05-22 15:30"
      }
    ],
    "total": 7,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

#### 2.3.2 获取 Agent 详情
**接口**: `GET /agents/{agentId}`

**路径参数**: `agentId` - Agent 唯一标识

**响应示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "agent-orchestrator",
    "name": "Orchestrator",
    "avatar": "https://example.com/avatar1.png",
    "description": "任务调度与智能拆解汇总",
    "tags": ["任务拆解", "调度", "汇总"],
    "status": "online",
    "category": "orchestrator",
    "enabled": true,
    "systemPrompt": "你是 Orchestrator，负责理解用户需求...",
    "modelConfig": {
      "provider": "mock",
      "modelName": "Orchestrator-v1",
      "temperature": 0.7,
      "maxTokens": 8192
    },
    "tools": [],
    "permissions": {}
  }
}
```

#### 2.3.3 更新 Agent 配置
**接口**: `PUT /agents/{agentId}`

**请求体**:
```json
{
  "name": "Orchestrator Pro",
  "description": "增强版任务调度 Agent",
  "systemPrompt": "你是增强版的 Orchestrator...",
  "modelConfig": {
    "temperature": 0.8,
    "maxTokens": 16384
  }
}
```

**响应**: 返回更新后的 Agent 完整信息

---

### 2.4 会话管理 API

#### 2.4.1 获取会话列表
**接口**: `GET /conversations`

**查询参数**:
| 参数名 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | integer | 否 | 1 | 页码 |
| pageSize | integer | 否 | 20 | 每页数量 |

**响应示例**: 标准分页格式

#### 2.4.2 创建新会话
**接口**: `POST /conversations`

**请求体**:
```json
{
  "title": "我的新任务",
  "mode": "group",
  "agentIds": ["agent-orchestrator", "agent-design", "agent-claude-code"]
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "会话创建成功",
  "data": {
    "id": "conv-new-123456",
    "title": "我的新任务",
    "mode": "group",
    "agentIds": ["agent-orchestrator", "agent-design", "agent-claude-code"],
    "lastMessage": "",
    "updatedAt": "2026-05-24 10:00"
  }
}
```

#### 2.4.3 获取会话详情
**接口**: `GET /conversations/{conversationId}`

#### 2.4.4 更新会话信息
**接口**: `PUT /conversations/{conversationId}`

#### 2.4.5 删除会话
**接口**: `DELETE /conversations/{conversationId}`

---

### 2.5 消息历史 API

#### 2.5.1 获取会话历史消息
**接口**: `GET /conversations/{conversationId}/messages`

**查询参数**:
| 参数名 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | integer | 否 | 1 | 页码 |
| pageSize | integer | 否 | 50 | 每页数量 |
| beforeId | string | 否 | - | 分页游标，获取早于该 ID 的消息 |

**响应示例**: 标准分页格式，返回完整历史消息列表（用于首次加载或断线重连时快速同步状态）

---

### 2.6 产物（Artifact）管理 API

#### 2.6.1 获取会话产物元数据列表
**接口**: `GET /conversations/{conversationId}/artifacts`

**说明**: 只返回产物的元数据（id, title, type, createdAt 等轻量字段），不传输大内容

#### 2.6.2 获取产物完整详情（含大内容）
**接口**: `GET /artifacts/{artifactId}`

**说明**: 通过 HTTP 拉取产物的完整大内容，避免 WebSocket 传输大文件导致阻塞

**响应示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "art-login-page",
    "conversationId": "conv-single-login",
    "title": "LoginPage.tsx",
    "type": "code",
    "content": "import React, { useState } from 'react';\n\nconst LoginPage: React.FC = () => {\n  // 完整大内容...\n}",
    "createdAt": "2026-05-22 14:30"
  }
}
```

#### 2.6.3 更新产物内容
**接口**: `PUT /artifacts/{artifactId}`

---

### 2.7 健康检查 API
**接口**: `GET /health`

**响应示例**:
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

## 3. WebSocket Event 文档

### 3.1 WebSocket 连接基础

#### 连接 URL
```
ws://localhost:8000/ws?token={jwt-token}
```

#### 核心设计原则
1. **Server Push Event 不再使用 requestId** - 所有事件都是单向通知
2. **Event-Driven 风格** - 参考 OpenAI Realtime API 的事件命名规范
3. **增量 Chunk 带 sequence 字段** - 保证消息顺序不丢包
4. **大内容不通过 WebSocket** - WebSocket 只传 artifactId，详情通过 HTTP 拉取

#### 连接成功握手
连接建立后，服务端立即发送 `connected` 事件：
```json
{
  "type": "connected",
  "sessionId": "sess-abc123def456",
  "serverTime": "2026-05-24T10:00:00Z",
  "version": "1.0.0"
}
```

---

### 3.2 心跳机制
**客户端每 25 秒发送 ping**：
```json
{
  "type": "ping"
}
```

**服务端返回 pong**：
```json
{
  "type": "pong",
  "timestamp": 1716523200000
}
```

---

### 3.3 客户端发送的命令事件

#### 3.3.1 启动消息流式输出
**客户端发送**:
```json
{
  "type": "conversation.message.create",
  "eventId": "evt-local-123456",
  "data": {
    "conversationId": "conv-single-login",
    "content": "帮我生成一个Todo List页面"
  }
}
```

> 说明：`eventId` 是客户端本地生成的唯一 ID，用于追踪本次请求的完整事件流，不是用于简单的请求-响应配对

---

### 3.4 服务端推送的流式输出事件

#### 3.4.1 用户消息已确认
```json
{
  "type": "conversation.message.user_created",
  "eventId": "evt-local-123456",
  "data": {
    "messageId": "msg-user-789",
    "conversationId": "conv-single-login"
  }
}
```

#### 3.4.2 Agent 开始思考
```json
{
  "type": "agent.thinking.started",
  "data": {
    "agentId": "agent-orchestrator",
    "agentName": "Orchestrator"
  }
}
```

#### 3.4.3 消息增量 Chunk（核心流式事件）
```json
{
  "type": "conversation.message.chunk",
  "data": {
    "messageId": "msg-agent-456",
    "chunk": "我已经",
    "sequence": 1,
    "isFullContent": false
  }
}
```

**字段说明**:
- `sequence`: 从 1 开始递增的序列号，客户端可用来检测丢包
- `finishReason`: 消息结束时的原因字段（stop / length / tool_calls）

#### 3.4.4 单条 Agent 消息输出完成
```json
{
  "type": "conversation.message.completed",
  "data": {
    "messageId": "msg-agent-456",
    "finishReason": "stop",
    "fullMessage": {
      "id": "msg-agent-456",
      "conversationId": "conv-single-login",
      "senderId": "agent-orchestrator",
      "senderName": "Orchestrator",
      "role": "orchestrator",
      "type": "text",
      "content": "我已经理解了您的需求...",
      "createdAt": "2026-05-24 10:30"
    }
  }
}
```

#### 3.4.5 产物生成事件（只传 artifactId，不传大内容）
```json
{
  "type": "artifact.created",
  "data": {
    "artifactId": "art-dashboard",
    "title": "Dashboard.tsx",
    "type": "code",
    "conversationId": "conv-single-login"
  }
}
```

> 客户端收到此事件后，再通过 HTTP GET `/api/v1/artifacts/art-dashboard` 拉取完整大内容

#### 3.4.6 全部任务完成
```json
{
  "type": "conversation.all_tasks.completed",
  "eventId": "evt-local-123456",
  "data": {
    "conversationId": "conv-single-login",
    "summary": "所有 Agent 任务已完成",
    "totalMessages": 8,
    "totalArtifacts": 3
  }
}
```

---

### 3.5 Agent 状态实时同步事件

#### 3.5.1 Agent 状态变化
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

### 3.6 Tool Calling 事件（预留扩展）

#### 3.6.1 Tool 开始调用
```json
{
  "type": "tool.calling.started",
  "data": {
    "toolCallId": "call-001",
    "toolName": "file_read",
    "input": {
      "path": "/src/App.tsx"
    }
  }
}
```

#### 3.6.2 Tool 调用完成
```json
{
  "type": "tool.calling.completed",
  "data": {
    "toolCallId": "call-001",
    "output": "文件内容..."
  }
}
```

---

### 3.7 Workflow 进度事件（预留扩展）

```json
{
  "type": "workflow.step.updated",
  "data": {
    "workflowId": "wf-123",
    "stepIndex": 2,
    "totalSteps": 5,
    "stepName": "CodeAgent 代码生成中",
    "status": "running"
  }
}
```

---

## 4. 通用数据模型

完整的 TypeScript 类型定义，与项目中现有 `src/types/index.ts` 完全兼容：

```typescript
export type ConversationMode = 'single' | 'group';
export type MessageRole = 'user' | 'agent' | 'orchestrator' | 'system';
export type MessageType = 'text' | 'code' | 'artifact' | 'task-plan' | 'status';
export type ArtifactType = 'code' | 'html' | 'markdown' | 'diff' | 'deploy';
export type AgentProvider = 'mock' | 'claude-code' | 'codex' | 'opencode' | 'local-qwen' | 'custom';
export type AgentStatus = 'online' | 'offline' | 'mock' | 'thinking';
export type AgentCategory = 'orchestrator' | 'coding' | 'review' | 'document' | 'design' | 'custom';

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface AgentPermission {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  canGenerateArtifacts: boolean;
  canDeploy: boolean;
}

export interface AgentModelConfig {
  provider: AgentProvider;
  modelName: string;
  apiBaseUrl?: string;
  apiKeyPlaceholder?: string;
  temperature: number;
  maxTokens: number;
}

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: AgentStatus;
  category: AgentCategory;
  enabled: boolean;
  lastUsedAt?: string;
  systemPrompt: string;
  modelConfig: AgentModelConfig;
  tools: AgentTool[];
  permissions: AgentPermission;
}

export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
}

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
}

export interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: ArtifactType;
  content: string;
  createdAt: string;
}
```

---

## 5. 推荐的前端 Services 结构

```
src/
├── services/
│   ├── index.ts                  # Axios 实例基础配置，统一拦截器
│   │
│   ├── http/
│   │   ├── agentService.ts       # Agent CRUD 查询 HTTP API
│   │   ├── conversationService.ts # 会话管理 HTTP API
│   │   ├── messageService.ts     # 历史消息分页 HTTP API
│   │   └── artifactService.ts     # 产物详情拉取 HTTP API
│   │
│   └── ws/
│       ├── wsClient.ts            # WebSocket 核心封装
│       ├── wsTypes.ts             # WebSocket Event 类型定义
│       ├── useMessageStream.ts    # 消息流式输出 React Hook
│       └── useAgentStatus.ts       # Agent 状态实时同步 Hook
```

### 5.1 Axios HTTP 基础配置示例
```typescript
// src/services/index.ts
import axios from 'axios';

const http = axios.create({
  baseURL: '/api/v1',
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
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      // 统一处理 Token 刷新
    }
    return Promise.reject(err);
  }
);

export default http;
```

### 5.2 WebSocket Client 封装示例
```typescript
// src/services/ws/wsClient.ts
type WSEventHandler = (data: any) => void;

class AgentHubWSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WSEventHandler>>();
  private reconnectAttempts = 0;
  private heartbeatTimer: any = null;
  private readonly MAX_RECONNECT_DELAY = 30000;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        resolve();
      };
      this.ws.onmessage = (event) => this.dispatchEvent(event.data);
      this.ws.onclose = () => this.scheduleReconnect();
      this.ws.onerror = reject;
    });
  }

  send(eventType: string, data?: any, eventId?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: eventType,
        eventId: eventId ?? `evt-${Date.now()}`,
        data,
      }));
    }
  }

  on(eventType: string, handler: WSEventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  off(eventType: string, handler: WSEventHandler) {
    this.handlers.get(eventType)?.delete(handler);
  }

  private dispatchEvent(raw: string) {
    const evt = JSON.parse(raw);
    const handlers = this.handlers.get(evt.type);
    handlers?.forEach((h) => h(evt));
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send('ping');
    }, 25000);
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts++), this.MAX_RECONNECT_DELAY);
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    clearInterval(this.heartbeatTimer);
    this.ws?.close();
  }
}

export const wsClient = new AgentHubWSClient();
```

---

## 6. WebSocket Event Naming 规范

采用 **`domain.resource.action`** 分层命名风格，完全参考 OpenAI / LangGraph 工业界惯例：

| 事件类型 | 命名示例 | 说明 |
|---|---|---|
| 客户端发出命令 | `conversation.message.create` | 创建并发送消息 |
| 服务端确认创建 | `conversation.message.user_created` | 用户消息已持久化 |
| 流式增量 | `conversation.message.chunk` | 消息内容增量块 |
| 单条完成 | `conversation.message.completed` | 单条消息输出完毕 |
| Agent 状态 | `agent.thinking.started` | Agent 开始思考 |
| Agent 状态 | `agent.status.changed` | Agent 状态变化 |
| 产物事件 | `artifact.created` | 新产物已生成 |
| Tool 事件 | `tool.calling.started` | 工具调用开始 |
| Tool 事件 | `tool.calling.completed` | 工具调用完成 |
| Workflow 事件 | `workflow.step.updated` | 工作流步骤更新 |
| 全局事件 | `connected` | 连接成功握手 |
| 全局事件 | `ping` / `pong` | 心跳 |

---

## 7. Request / Response 规范总结

### HTTP API 规范
- 所有列表支持分页，使用 `page` / `pageSize` / `beforeId` 游标
- 统一使用标准 RESTful 语义（GET 查询，POST 创建，PUT 更新，DELETE 删除）
- 大内容（产物详情等）只通过 HTTP 传输，避免 WebSocket 阻塞

### WebSocket Event 规范
- Server Push Event 不带 `requestId`，只带 `eventId`（用于标记事件流归属）
- Chunk 消息必须带 `sequence` 字段保证顺序性
- 消息完成事件必须带 `finishReason` 字段明确结束原因
- 大产物内容只在 WebSocket 推送 `artifactId`，详情由 HTTP 拉取

---

## 8. 错误码规范

统一错误码设计，采用 **5 位数字** 分层：

| 错误码区间 | 分类 | 说明 |
|---|---|---|
| 0 | 成功 | 请求完全成功 |
| 40000 ~ 40999 | 客户端参数错误 | 参数缺失、格式不对、资源不存在 |
| 40100 ~ 40199 | 认证授权错误 | Token 无效、过期、权限不足 |
| 50000 ~ 50999 | 服务端内部错误 | Agent 调用失败、超时、数据库错误 |

详细错误码映射表：
| 错误码 | 说明 |
|---|---|
| 0 | 成功 |
| 40000 | 请求参数验证失败 |
| 40001 | 目标资源不存在 |
| 40100 | 未授权，请先登录 |
| 40101 | Access Token 已过期 |
| 40300 | 权限不足，无法访问该资源 |
| 40400 | 接口路径不存在 |
| 50000 | 服务器内部异常 |
| 50001 | Agent 模型调用失败 |
| 50002 | Agent 任务执行超时 |
| 50003 | WebSocket 事件处理错误 |

---

## 9. 版本历史

| 版本号 | 日期 | 更新说明 |
|---|---|---|
| v3.0.0 | 2026-05-24 | 全新重构，采用 HTTP + WebSocket 混合工业级架构，参考 OpenAI Realtime / LangGraph 设计 |
