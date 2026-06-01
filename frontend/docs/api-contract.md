# AgentHub API 协作契约

**版本**: v3.0.0  
**更新日期**: 2026-05-26  
**状态**: 正式发布版

---

## 目录

1. [基础约定](#1-基础约定)
2. [统一响应结构](#2-统一响应结构)
3. [核心数据模型](#3-核心数据模型)
4. [HTTP API 详细文档](#4-http-api-详细文档)
5. [WebSocket 事件文档](#5-websocket-事件文档)
6. [错误码表](#6-错误码表)
7. [版本历史](#7-版本历史)
8. [前后端 API 差异及待开发 API](#8-前后端-api-差异及待开发-api)

---

## 1. 基础约定

### 1.1 Base URL
所有接口的基础路径前缀统一为：
```
http://localhost:8000/api/v1
```

### 1.2 Content-Type
所有 POST/PUT 请求统一使用：
```
Content-Type: application/json
```

### 1.3 字段命名规范
前后端统一使用 `camelCase` 驼峰命名风格。

### 1.4 ID 格式
所有资源 ID 使用字符串形式，例如：
- Agent: `agent-orchestrator`, `agent-claude-code`
- Conversation: `conv-xxxxxx`
- Message: `msg-xxxxxx`
- Artifact: `art-xxxxxx`
- ArtifactVersion: `ver-xxxxxx`

### 1.5 时间格式
统一使用 ISO 8601 格式：
```
YYYY-MM-DD HH:mm:ss
```

### 1.6 MVP 阶段说明
单用户模式，暂不启用用户认证机制。

---

## 2. 统一响应结构

### 2.1 通用成功响应
所有接口默认使用该结构：
```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| code | number | 状态码，0 表示业务成功 |
| message | string | 响应描述信息 |
| data | any | 实际返回数据体 |

### 2.2 分页响应结构
分页查询接口必须返回：
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

| 字段 | 类型 | 说明 |
|---|---|---|
| list | array | 当前页数据列表 |
| total | number | 数据总条数 |
| page | number | 当前页码，从 1 开始 |
| pageSize | number | 每页数据条数 |
| hasMore | boolean | 是否有下一页 |

### 2.3 错误响应结构
业务失败时返回：
```json
{
  "code": 40001,
  "message": "资源不存在",
  "data": null
}
```

---

## 3. 核心数据模型

### 3.1 Agent
AI 联系人/能力对象，表示系统中的不同 AI 角色。

```typescript
interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: 'online' | 'offline' | 'mock' | 'thinking' | 'disabled';
  category: 'orchestrator' | 'coding' | 'review' | 'document' | 'design' | 'custom';
  provider: 'mock' | 'claude-code' | 'codex' | 'opencode' | 'local-qwen' | 'custom';
  enabled: boolean;
  lastUsedAt?: string;
  systemPrompt: string;
  modelConfig: AgentModelConfig;
  tools: AgentTool[];
  permissions: AgentPermission;
}
```

| 字段 | 说明 | 前端用途 |
|---|---|---|
| id | Agent 唯一标识 | 选择聊天对象、配置面板 |
| name | Agent 展示名称 | 联系人卡片、消息头像标题 |
| avatar | 头像图片 URL | 消息气泡头像、联系人列表头像 |
| description | Agent 能力描述 | 联系人卡片副标题展示 |
| tags | 能力标签数组 | 标签展示、筛选分类 |
| status | 运行状态 | 状态指示器（绿点/灰点等） |
| category | Agent 分类 | 左侧 Agent 目录分类筛选 |
| provider | 底层模型/服务商 | 配置面板展示平台信息 |
| enabled | 是否启用 | 禁用态 UI 展示 |
| lastUsedAt | 最近使用时间 | Agent 列表排序 |
| systemPrompt | 系统提示词 | 配置面板可编辑 |
| modelConfig | 模型配置对象 | 配置面板可编辑 |
| tools | 工具列表 | 展示 Agent 可用工具 |
| permissions | 权限能力 | 控制操作按钮展示 |

### 3.2 AgentModelConfig
Agent 的模型参数配置：

```typescript
interface AgentModelConfig {
  provider: AgentProvider;
  modelName: string;
  apiBaseUrl?: string;
  apiKeyPlaceholder?: string;
  temperature: number;
  maxTokens: number;
}
```

### 3.3 AgentTool
Agent 可使用的工具项：

```typescript
interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}
```

### 3.4 AgentPermission
Agent 的权限控制集合：

```typescript
interface AgentPermission {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  canGenerateArtifacts: boolean;
  canDeploy: boolean;
}
```

### 3.5 Conversation
聊天窗口/任务上下文对象。

```typescript
interface Conversation {
  id: string;
  title: string;
  mode: 'single' | 'group';
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
  createdAt?: string;
  contextUsage?: ContextUsage;
}
```

| 字段 | 说明 | 前端用途 |
|---|---|---|
| id | 会话唯一标识 | 切换会话、拉取消息 |
| title | 会话标题 | 左侧会话列表标题 |
| mode | 会话模式：single=单聊，group=群聊 | 区分单聊/群聊不同 UI 风格 |
| agentIds | 参与本次会话的 Agent ID 数组 | 激活参与聊天的对象 |
| lastMessage | 最近一条消息的摘要 | 会话列表副标题展示 |
| updatedAt | 会话最后活跃时间 | 会话列表排序 |
| createdAt | 会话创建时间 | 详情面板展示 |
| contextUsage | 上下文使用统计 | 右上角环形进度展示 |

### 3.6 ContextUsage
上下文 Token/字符数使用统计：

```typescript
interface ContextUsage {
  contextUsagePercent: number;
  contextUsageChars: number;
  contextLimitChars: number;
}
```

### 3.7 Message
聊天消息记录对象。

```typescript
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'agent' | 'orchestrator' | 'system';
  type: 'text' | 'code' | 'artifact' | 'task-plan' | 'status' | 'image' | 'document';
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

| 字段 | 说明 | 前端用途 |
|---|---|---|
| id | 消息唯一标识 | 渲染 key，Pin 关联 |
| conversationId | 所属会话 ID | 消息隔离归属 |
| senderId | 发送者 ID | 判断发送者身份 |
| senderName | 发送者名称 | 消息气泡标题 |
| role | 角色类型 | 气泡样式区分 |
| type | 消息内容类型 | 决定渲染方式 |
| content | 消息正文内容 | 直接展示文本 |
| language | 代码语言标识 | 代码块语法高亮 |
| artifactId | 关联产物 ID | 点击跳转产物详情 |
| createdAt | 消息发送时间 | 排序和时间线展示 |
| attachments | 附件数组 | 图片/文件卡片展示 |
| quotedMessage | 引用消息 | 回复时展示被引用内容 |
| artifactRef | 产物引用详情 | 代码片段关联 |
| isPinned | 是否已被 Pin | 置顶消息高亮标识 |

### 3.8 MessageAttachment
用户上传的图片/文件附件：

```typescript
interface MessageAttachment {
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

### 3.9 ArtifactReference
消息中的产物引用：

```typescript
interface ArtifactReference {
  artifactId: string;
  artifactTitle: string;
  version: number;
  quotedText: string;
  startLine?: number;
  endLine?: number;
}
```

### 3.10 Artifact
产物元数据对象（不含完整内容）。

```typescript
interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: 'code' | 'html' | 'markdown' | 'diff' | 'deploy' | 'image' | 'mermaid';
  description?: string;
  tags?: string[];
  currentVersionId: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  runId?: string;
}
```

### 3.11 ArtifactVersion
产物的版本快照。

```typescript
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
  metadata?: Record<string, any>;
  createdAt: string;
}
```

### 3.12 ArtifactDetail
产物详情对象，包含当前版本完整内容。

```typescript
interface ArtifactDetail extends Artifact {
  currentVersion: ArtifactVersion;
  content: string;
  size?: number;
}
```

### 3.13 SendMessageResponse
发送消息非流式返回结果。

```typescript
interface SendMessageResponse {
  userMessage: Message;
  agentMessages: Message[];
  artifacts: Artifact[];
  contextUsage?: ContextUsage;
}
```

### 3.14 CompressContextResult
上下文压缩执行结果。

```typescript
interface CompressContextResult {
  summary: ConversationSummary;
  compressed: boolean;
  contextUsage?: ContextUsage;
}
```

### 3.15 ConversationSummary
会话摘要对象。

```typescript
interface ConversationSummary {
  id: string;
  conversationId: string;
  summary: string;
  coveredUntilMessageId: string;
  coveredMessageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

### 3.16 MemoryItem
长期记忆条目。

```typescript
interface MemoryItem {
  id: string;
  conversationId: string;
  category: 'preference' | 'project' | 'profile' | 'constraint';
  content: string;
  confidence: number;
  sourceMessageId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 3.17 PinItem
置顶消息记录。

```typescript
interface PinItem {
  id: string;
  conversationId: string;
  messageId: string;
  createdAt: string;
  message: Message;
}
```

### 3.18 HealthCheckData
健康检查返回数据。

```typescript
interface HealthCheckData {
  status: 'healthy';
  version: string;
  timestamp: string;
}
```

### 3.19 AgentRunStepStatus
沙箱执行步骤状态。

```typescript
type AgentRunStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'conflict'
  | 'blocked';
```

### 3.20 AgentRunStep
沙箱执行步骤详情。

```typescript
interface AgentRunStep {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  status: AgentRunStepStatus;
  description: string;
  log?: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}
```

### 3.21 RunDag
沙箱任务步骤的有向无环图 (DAG) 结构。

```typescript
interface RunDag {
  nodes: {
    id: string;
    label: string;
    agentId: string;
    status: AgentRunStepStatus;
    dependencies: string[];
  }[];
}
```

### 3.22 Sandbox
沙箱容器环境元数据。

```typescript
interface Sandbox {
  id: string;
  dockerContainerId?: string;
  status: 'active' | 'terminated';
  createdAt: string;
  updatedAt: string;
}
```

### 3.23 SandboxFile
沙箱生成/修改的文件。

```typescript
interface SandboxFile {
  id: string;
  sandboxId: string;
  runId: string;
  path: string;
  contentHash: string;
  currentVersion: number;
  artifactId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 3.24 SandboxFileVersion
沙箱内文件的具体版本快照。

```typescript
interface SandboxFileVersion {
  id: string;
  fileId: string;
  version: number;
  content: string;
  createdAt: string;
}
```

### 3.25 SandboxFileDetail
沙箱内文件的详细内容（继承自 SandboxFile）。

```typescript
interface SandboxFileDetail extends SandboxFile {
  content: string;
  version?: SandboxFileVersion;
}
```

### 3.26 SandboxConflict
沙箱文件写冲突记录。

```typescript
interface SandboxConflict {
  id: string;
  runId: string;
  sandboxId: string;
  fileId?: string | null;
  filePath: string;
  baseVersion: number;
  currentVersion: number;
  incomingContent: string;
  incomingHash: string;
  createdByStepId?: string | null;
  status: 'open' | 'resolved';
  resolution?: 'current' | 'incoming' | 'manual' | null;
  createdAt: string;
  resolvedAt?: string | null;
}
```

### 3.27 AgentRunDetail
沙箱任务执行 (Run) 的完整详情。

```typescript
interface AgentRunDetail {
  id: string;
  sandboxId: string;
  conversationId: string;
  ownerUserId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'conflict' | 'cancelled';
  prompt: string;
  dag: RunDag;
  summary: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  sandbox?: Sandbox;
  steps: AgentRunStep[];
  files: SandboxFile[];
  conflicts: SandboxConflict[];
}
```

---

## 4. HTTP API 详细文档

---

### 4.1 健康检查接口

#### GET /health

**接口名称**: 服务健康检查

**接口用途**: 探测后端服务是否正常运行，获取服务版本信息。

**使用场景**:
1. 前端应用启动时首先调用，判断后端是否可用
2. 设置定时心跳探测，监控服务存活状态
3. 网络恢复重连时先校验后端健康度

**请求参数**: 无

**请求体示例**: 空

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2026-05-26 10:30:00"
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|---|---|---|
| status | string | 服务状态，固定返回 "healthy" |
| version | string | 当前后端服务版本号 |
| timestamp | string | 服务端当前时间戳 |

**错误情况**:
- 无特殊错误，服务不可用时直接返回网络异常

**优先级**: P0

---

### 4.2 Agent 管理接口

#### GET /agents

**接口名称**: 获取 Agent 列表（分页）

**接口用途**: 获取系统中所有可用 Agent 的分页数据，支持多条件筛选。

**使用场景**:
1. 左侧 Agent 目录页面加载全部联系人列表
2. 新建会话时弹出 Agent 选择弹窗
3. 支持按 category、provider、enabled 等条件过滤

**Query 参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |
| category | string | 否 | 按 Agent 分类筛选 |
| provider | string | 否 | 按模型服务商筛选 |
| keyword | string | 否 | 名称/描述关键词模糊搜索 |
| enabled | boolean | 否 | 只返回启用的 Agent |
| includeDisabled | boolean | 否 | 传 true 时返回所有 Agent（包括已禁用的） |

**请求示例**:
```
GET /api/v1/agents?includeDisabled=true
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "agent-claude-code",
        "name": "Claude Code",
        "avatar": "https://...",
        "description": "专业代码生成与工程理解",
        "tags": ["代码生成", "代码修改"],
        "status": "online",
        "category": "coding",
        "provider": "claude-code",
        "enabled": true,
        "lastUsedAt": "2026-05-22 14:45",
        "systemPrompt": "你是 Claude Code...",
        "modelConfig": {
          "provider": "claude-code",
          "modelName": "claude-3-5-sonnet-20241022",
          "apiBaseUrl": "https://api.anthropic.com/v1",
          "temperature": 0.2,
          "maxTokens": 200000
        },
        "tools": [],
        "permissions": {}
      }
    ],
    "total": 7,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

**优先级**: P0

---

#### GET /agents/{agentId}

**接口名称**: 获取 Agent 详情

**接口用途**: 获取指定单个 Agent 的完整配置信息。

**使用场景**:
1. 点击 Agent 卡片打开详情面板
2. 进入 Agent 配置编辑页面预填充数据

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| agentId | string | 是 | Agent 唯一标识 ID |

**请求示例**:
```
GET /api/v1/agents/agent-claude-code
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "agent-claude-code",
    "name": "Claude Code",
    "avatar": "https://...",
    "description": "专业代码生成与工程理解",
    "tags": ["代码生成", "代码修改", "工程理解"],
    "status": "online",
    "category": "coding",
    "provider": "claude-code",
    "enabled": true,
    "lastUsedAt": "2026-05-22 14:45",
    "systemPrompt": "你是 Claude Code，专注于高质量代码生成...",
    "modelConfig": {
      "provider": "claude-code",
      "modelName": "claude-3-5-sonnet-20241022",
      "apiBaseUrl": "https://api.anthropic.com/v1",
      "apiKeyPlaceholder": "sk-ant-...",
      "temperature": 0.2,
      "maxTokens": 200000
    },
    "tools": [
      { "id": "file_read", "name": "读文件", "description": "读取文件内容", "enabled": true }
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

**错误情况**:
- 40001: Agent 不存在

**优先级**: P0

---

#### PUT /agents/{agentId}

**接口名称**: 更新 Agent 配置

**接口用途**: 修改指定 Agent 的系统提示词、模型参数、启用状态等配置。

**使用场景**:
1. 用户在配置面板编辑 Agent 信息后保存
2. 临时开启/禁用某个 Agent
3. 自定义 Agent 能力标签和工具开关

**路径参数**: agentId - Agent 唯一 ID

**请求体示例**:
```json
{
  "name": "Claude Code Pro",
  "description": "升级版代码生成助手",
  "systemPrompt": "你是经过升级的 Claude Code...",
  "modelConfig": {
    "temperature": 0.3,
    "maxTokens": 128000
  },
  "enabled": true
}
```

**响应体示例**: 返回更新后的完整 Agent 对象（结构同 GET /agents/{agentId}）

**错误情况**:
- 40001: Agent 不存在
- 40002: 当前 Agent 状态不允许修改

**优先级**: P0

---

#### POST /agents

**接口名称**: 创建新自定义 Agent

**接口用途**: 用户创建完全自定义的新 Agent。

**使用场景**:
1. Agent 目录页面的"新建 Agent"按钮
2. 自定义 Agent 配置向导完成后提交

**请求体示例**:
```json
{
  "name": "我的专属 Agent",
  "avatar": "https://...",
  "description": "专为我的项目定制",
  "tags": ["自定义", "项目专用"],
  "status": "online",
  "category": "custom",
  "provider": "custom",
  "enabled": true,
  "systemPrompt": "你是我的专属助手...",
  "modelConfig": {
    "provider": "custom",
    "modelName": "gpt-4o",
    "temperature": 0.7,
    "maxTokens": 128000
  },
  "tools": [],
  "permissions": {
    "canReadFiles": true,
    "canWriteFiles": true,
    "canRunCommands": true,
    "canGenerateArtifacts": true,
    "canDeploy": false
  }
}
```

**响应体示例**: 返回创建成功的完整 Agent 对象

**优先级**: P1

---

#### DELETE /agents/{agentId}

**接口名称**: 删除 Agent

**接口用途**: 永久移除指定 Agent。

**使用场景**:
1. 在 Agent 详情面板点击删除按钮
2. 弹出确认模态框确认后执行删除

**路径参数**: agentId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": true
}
```

**优先级**: P1

---

### 4.3 Conversation 会话管理接口

#### GET /conversations

**接口名称**: 获取会话列表（分页）

**接口用途**: 获取用户所有历史会话列表，支持分页和筛选。

**使用场景**:
1. 应用左侧边栏展示最近会话列表
2. 会话历史页面加载全部历史记录
3. 搜索框按关键词搜索历史会话

**Query 参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |
| mode | string | 否 | 按模式筛选 single/group |
| keyword | string | 否 | 会话标题关键词搜索 |

**请求示例**:
```
GET /api/v1/conversations?page=1&pageSize=20
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "conv-single-login",
        "title": "React登录页生成",
        "mode": "single",
        "agentIds": ["agent-claude-code"],
        "lastMessage": "已生成LoginPage.tsx",
        "updatedAt": "2026-05-22 14:30",
        "createdAt": "2026-05-22 14:00",
        "contextUsage": {
          "contextUsagePercent": 45,
          "contextUsageChars": 45000,
          "contextLimitChars": 100000
        }
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

**优先级**: P0

---

#### POST /conversations

**接口名称**: 创建新会话

**接口用途**: 新建一个单聊或群聊会话。

**使用场景**:
1. 用户点击左侧边栏"新建会话"按钮
2. 弹出新建会话模态框，选择参与的 Agent

**请求体示例**:
```json
{
  "title": "多Agent官网生成任务",
  "mode": "group",
  "agentIds": ["agent-orchestrator", "agent-design", "agent-codex", "agent-review"]
}
```

**响应体示例**: 返回新创建的 Conversation 对象

**优先级**: P0

---

#### GET /conversations/{conversationId}

**接口名称**: 获取会话详情

**接口用途**: 获取指定会话的完整元信息。

**使用场景**:
1. 切换到某个会话时，拉取该会话基础信息
2. 会话设置面板展示会话配置

**路径参数**: conversationId

**响应体示例**: 返回完整的 Conversation 对象

**错误情况**:
- 40001: 会话不存在

**优先级**: P0

---

#### PUT /conversations/{conversationId}

**接口名称**: 更新会话信息

**接口用途**: 修改会话的标题、参与 Agent 列表等属性。

**使用场景**:
1. 左侧会话项右键重命名
2. 会话设置面板添加/移除参与的 Agent

**路径参数**: conversationId

**请求体示例**:
```json
{
  "title": "修改后的新会话标题",
  "agentIds": ["agent-orchestrator", "agent-claude-code"]
}
```

**响应体示例**: 返回更新后的 Conversation 对象

**优先级**: P0

---

#### DELETE /conversations/{conversationId}

**接口名称**: 删除会话

**接口用途**: 永久删除指定会话及其关联数据。

**使用场景**:
1. 左侧会话列表右键菜单的删除选项
2. 弹出二次确认后执行删除

**路径参数**: conversationId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": true
}
```

**优先级**: P0

---

#### GET /conversations/{conversationId}/context/usage

**接口名称**: 获取上下文使用统计

**接口用途**: 获取当前会话当前的上下文 Token 占用情况。

**使用场景**:
1. 聊天面板右上角展示上下文环形进度条
2. 上下文占用过高时提示用户进行压缩

**路径参数**: conversationId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "contextUsagePercent": 68,
    "contextUsageChars": 68000,
    "contextLimitChars": 100000
  }
}
```

**优先级**: P1

---

#### POST /conversations/{conversationId}/context/compress

**接口名称**: 手动压缩会话上下文

**接口用途**: 后端对当前会话的历史消息进行智能摘要，生成压缩后的上下文，降低 Token 占用。

**使用场景**:
1. 用户点击右上角"压缩上下文"按钮
2. 上下文使用率超过 80% 时主动提示用户执行

**路径参数**: conversationId

**请求体示例**: 空对象 `{}`

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "summary": {
      "id": "sum-1",
      "conversationId": "conv-xxx",
      "summary": "本次会话主要讨论了React登录页面组件的开发，包括表单验证、样式美化...",
      "coveredUntilMessageId": "msg-25",
      "coveredMessageCount": 25,
      "version": 1,
      "createdAt": "2026-05-22 15:00",
      "updatedAt": "2026-05-22 15:00"
    },
    "compressed": true,
    "contextUsage": {
      "contextUsagePercent": 22,
      "contextUsageChars": 22000,
      "contextLimitChars": 100000
    }
  }
}
```

**优先级**: P1

---

#### GET /conversations/{conversationId}/memories

**接口名称**: 获取长期记忆列表

**接口用途**: 展示当前会话的所有已提取的长期记忆条目。

**使用场景**:
1. 侧边栏"长期记忆管理"面板展示所有记忆
2. 允许用户浏览和管理系统自动提取的记忆

**路径参数**: conversationId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "mem-1",
      "conversationId": "conv-xxx",
      "category": "preference",
      "content": "用户偏好使用TypeScript开发React项目",
      "confidence": 0.95,
      "sourceMessageId": "msg-5",
      "active": true,
      "createdAt": "2026-05-22 14:30",
      "updatedAt": "2026-05-22 14:30"
    }
  ]
}
```

**优先级**: P1

---

#### DELETE /conversations/{conversationId}/memories/{memoryId}

**接口名称**: 删除长期记忆

**接口用途**: 将指定记忆标记为非活动状态，不再进入模型上下文。

**使用场景**:
1. 长期记忆列表中点击某条记忆的删除按钮
2. 用户认为该记忆不准确，希望移除

**路径参数**: conversationId, memoryId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": true
}
```

**优先级**: P1

---

#### PUT /conversations/{conversationId}/memories/{memoryId}

**接口名称**: 修改长期记忆

**接口用途**: 修改指定长期记忆的内容、分类或状态。

**使用场景**:
1. 长期记忆列表中点击某条记忆的编辑/保存按钮，修正记忆内容。

**路径参数**: conversationId, memoryId

**请求体示例**:
```json
{
  "content": "用户倾向于使用 TypeScript 进行 React 前端组件设计，且要求高可重用性。",
  "category": "preference",
  "active": true
}
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "mem-1",
    "conversationId": "conv-xxx",
    "category": "preference",
    "content": "用户倾向于使用 TypeScript 进行 React 前端组件设计，且要求高可重用性。",
    "confidence": 1.0,
    "sourceMessageId": "msg-12",
    "active": true,
    "createdAt": "2026-05-22 14:28",
    "updatedAt": "2026-05-28 19:55"
  }
}
```

**优先级**: P1

---

#### GET /conversations/{conversationId}/pins

**接口名称**: 获取已置顶消息列表

**接口用途**: 获取用户所有标记为重要、已 Pin 的消息。

**使用场景**:
1. 侧边栏"重要消息"面板展示所有 Pin 的消息
2. 快速定位和跳转查看历史关键信息

**路径参数**: conversationId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "pin-1",
      "conversationId": "conv-xxx",
      "messageId": "msg-8",
      "createdAt": "2026-05-22 14:40",
      "message": {
        "id": "msg-8",
        "conversationId": "conv-xxx",
        "senderId": "agent-codex",
        "senderName": "Codex",
        "role": "agent",
        "type": "text",
        "content": "核心架构决定采用前后端分离...",
        "createdAt": "2026-05-22 14:35"
      }
    }
  ]
}
```

**优先级**: P1

---

#### POST /conversations/{conversationId}/messages/{messageId}/pin

**接口名称**: 置顶一条消息

**接口用途**: 将指定消息标记为重要，加入 Pin 列表。

**使用场景**:
1. 消息气泡右键菜单选择"Pin 这条消息"
2. 点击消息旁图钉图标执行置顶

**路径参数**: conversationId, messageId

**响应体示例**: 返回创建成功的 PinItem 对象

**优先级**: P1

---

#### DELETE /conversations/{conversationId}/messages/{messageId}/pin

**接口名称**: 取消置顶

**接口用途**: 移除指定消息的 Pin 标记。

**使用场景**:
1. 从 Pin 列表中取消某条重要消息标记
2. 再次点击已置顶消息的图钉图标

**路径参数**: conversationId, messageId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": true
}
```

**优先级**: P1

---

#### POST /conversations/{conversationId}/agents

**接口名称**: 添加成员智能体

**接口用途**: 向指定多聊会话中添加一个新的参与智能体。

**使用场景**:
1. 用户在多聊会话的成员管理面板中选择未参与的智能体并点击“添加”。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 是 | 会话唯一标识 ID |

**请求体示例**:
```json
{
  "agentId": "agent-claude-code"
}
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "conv-group-1",
    "title": "群聊会话",
    "mode": "group",
    "agentIds": ["agent-orchestrator", "agent-claude-code"],
    "createdAt": "2026-05-29 12:00:00",
    "updatedAt": "2026-05-29 12:05:00"
  }
}
```

**错误情况**:
- 40001: 会话或智能体不存在

**优先级**: P1

---

#### DELETE /conversations/{conversationId}/agents/{agentId}

**接口名称**: 删除成员智能体

**接口用途**: 从指定多聊会话中移除一个参与智能体。注意，此操作并非删除该智能体本身。

**使用场景**:
1. 用户在多聊会话的成员管理面板中点击某个智能体旁的“移除”按钮。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 是 | 会话唯一标识 ID |
| agentId | string | 是 | 待移除的智能体唯一标识 ID |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "conv-group-1",
    "title": "群聊会话",
    "mode": "group",
    "agentIds": ["agent-orchestrator"],
    "createdAt": "2026-05-29 12:00:00",
    "updatedAt": "2026-05-29 12:05:00"
  }
}
```

**错误情况**:
- 40001: 会话或智能体不存在

**优先级**: P1

---

### 4.4 消息管理接口

#### GET /conversations/{conversationId}/messages

**接口名称**: 获取会话历史消息（分页）

**接口用途**: 分页加载指定会话的全部聊天记录。

**使用场景**:
1. 首次进入会话加载历史消息
2. 用户向上滚动聊天区域，无限加载更早消息

**Query 参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 50 |
| beforeId | string | 否 | 拉取该 messageId 之前的历史消息 |

**路径参数**: conversationId

**请求示例**:
```
GET /api/v1/conversations/conv-xxx/messages?page=1&pageSize=50&beforeId=msg-100
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "msg-1",
        "conversationId": "conv-xxx",
        "senderId": "user",
        "senderName": "用户",
        "role": "user",
        "type": "text",
        "content": "帮我写一个React登录页面",
        "createdAt": "2026-05-22 14:28"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 50,
    "hasMore": true
  }
}
```

**优先级**: P0

---

#### POST /conversations/{conversationId}/mention

**接口名称**: 获取 @ 提及 Agent 候选列表

**接口用途**: 用户在输入框输入 @ 字符时，弹出当前会话中可被 @ 的 Agent 筛选列表。

**使用场景**:
1. 聊天输入框输入 "@" 自动触发搜索
2. 支持关键词过滤，快速找到目标 Agent

**路径参数**: conversationId

**请求体示例**:
```json
{
  "keyword": "代码"
}
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "agent-claude-code",
      "name": "Claude Code",
      "avatar": "https://...",
      "description": "专业代码生成与工程理解",
      "tags": ["代码生成", "代码修改"],
      "status": "online"
    }
  ]
}
```

**说明**: 只返回当前会话内参与的 Agent，默认排除 Orchestrator。

**优先级**: P1

---

#### POST /conversations/{conversationId}/messages

**接口名称**: 发送消息（非流式）

**接口用途**: 发送用户消息，后端同步处理完成后一次性返回所有结果。

**使用场景**:
1. 在 WebSocket 不可用时的降级方案
2. 不需要逐字流式输出，希望直接获取完整回答

**路径参数**: conversationId

**请求体示例**:
```json
{
  "content": "帮我生成一个React登录页",
  "targetAgentId": "agent-claude-code",
  "quotedMessageId": "msg-12",
  "artifactRef": null,
  "attachments": []
}
```

| 字段 | 说明 |
|---|---|
| content | 用户输入的消息文本内容 |
| targetAgentId | 可选，指定要直接回复的 Agent ID |
| quotedMessageId | 可选，引用/回复的消息 ID |
| artifactRef | 可选，消息中关联的产物片段引用 |
| attachments | 可选，附带上传的附件列表 |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userMessage": {
      "id": "msg-user-1",
      "conversationId": "conv-xxx",
      "senderId": "user",
      "senderName": "用户",
      "role": "user",
      "type": "text",
      "content": "帮我生成一个React登录页",
      "createdAt": "2026-05-22 14:28"
    },
    "agentMessages": [
      {
        "id": "msg-agent-1",
        "conversationId": "conv-xxx",
        "senderId": "agent-claude-code",
        "senderName": "Claude Code",
        "role": "agent",
        "type": "text",
        "content": "好的，下面为您生成一个完整的React登录页面组件...",
        "createdAt": "2026-05-22 14:29"
      }
    ],
    "artifacts": [
      {
        "id": "art-login-page",
        "conversationId": "conv-xxx",
        "title": "LoginPage.tsx",
        "type": "code",
        "createdAt": "2026-05-22 14:30",
        "updatedAt": "2026-05-22 14:30"
      }
    ],
    "contextUsage": {
      "contextUsagePercent": 45,
      "contextUsageChars": 45000,
      "contextLimitChars": 100000
    }
  }
}
```

**优先级**: P0

---

### 4.5 Artifact 产物管理接口

#### GET /conversations/{conversationId}/artifacts

**接口名称**: 获取会话产物元数据列表

**接口用途**: 获取指定会话所有产物的元数据清单（不含完整内容）。

**使用场景**:
1. 右侧边栏"产物列表"面板展示所有生成的文件
2. 快速预览所有产物概览，不立即加载完整内容

**路径参数**: conversationId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "art-login-page",
      "conversationId": "conv-xxx",
      "title": "LoginPage.tsx",
      "type": "code",
      "description": "登录页面组件",
      "tags": ["react", "typescript"],
      "currentVersionId": "ver-login-page-1",
      "latestVersion": 1,
      "createdAt": "2026-05-22 14:30",
      "updatedAt": "2026-05-22 14:30"
    }
  ]
}
```

**优先级**: P0

---

#### GET /artifacts/{artifactId}

**接口名称**: 获取产物详情

**接口用途**: 获取指定产物的完整信息，包含当前版本的全部内容。

**使用场景**:
1. 用户点击产物卡片，在右侧面板打开产物预览
2. 全屏编辑器加载完整可编辑的产物内容

**路径参数**: artifactId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "art-login-page",
    "conversationId": "conv-xxx",
    "title": "LoginPage.tsx",
    "type": "code",
    "description": "登录页面组件",
    "currentVersionId": "ver-login-page-1",
    "latestVersion": 1,
    "createdAt": "2026-05-22 14:30",
    "updatedAt": "2026-05-22 14:30",
    "currentVersion": {
      "id": "ver-login-page-1",
      "artifactId": "art-login-page",
      "version": 1,
      "content": "import React, { useState } from 'react';\n\nconst LoginPage: React.FC = () => {\n  ...",
      "language": "typescript",
      "size": 1024,
      "createdBy": "agent-claude-code",
      "createdByType": "agent",
      "createdAt": "2026-05-22 14:30"
    },
    "content": "import React, { useState } from 'react';...",
    "size": 1024
  }
}
```

**优先级**: P0

---

#### GET /artifacts/{artifactId}/versions

**接口名称**: 获取产物版本历史

**接口用途**: 列出该产物所有历史版本快照，用于版本回溯对比。

**使用场景**:
1. 产物详情面板的"版本历史"标签页
2. 提供版本回溯功能，查看历史变更

**路径参数**: artifactId

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "ver-login-page-1",
      "artifactId": "art-login-page",
      "version": 1,
      "content": "...",
      "language": "typescript",
      "size": 1024,
      "changeSummary": "初始版本",
      "createdBy": "agent-claude-code",
      "createdByType": "agent",
      "createdAt": "2026-05-22 14:30"
    }
  ]
}
```

**优先级**: P1

---

#### PUT /artifacts/{artifactId}

**接口名称**: 更新产物内容

**接口用途**: 用户手动编辑产物内容后保存，后端自动生成新版本。

**使用场景**:
1. 在代码编辑器直接修改内容，点击保存按钮
2. 变更时可填写变更摘要说明本次修改原因

**路径参数**: artifactId

**请求体示例**:
```json
{
  "content": "import React, { useState } from 'react';\n\n// 这里是用户编辑后的完整新内容...",
  "changeSummary": "添加了表单验证逻辑"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| content | 是 | 修改后的产物完整内容 |
| changeSummary | 否 | 本次变更的简短说明 |

**响应体示例**: 返回更新后的 ArtifactDetail 对象（结构同 GET /artifacts/{artifactId}）

**优先级**: P0

---

### 4.6 用户认证管理接口

---

#### POST /auth/register

**接口名称**: 注册账号

**接口用途**: 创建新用户，并直接返回登录态及 Session 信息。

**使用场景**:
1. 用户在登录页切换到注册标签页
2. 填写邮箱、密码、昵称并选择头像后提交注册

**请求参数**: 无

**请求体示例**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "张三",
  "avatar": "https://example.com/avatar.png"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| email | 是 | 用户邮箱，作为登录账号 |
| password | 是 | 密码，长度至少 6 位 |
| name | 否 | 昵称/姓名，不传时后端用邮箱前缀 |
| avatar | 否 | 头像 URL |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "张三",
      "avatar": "https://example.com/avatar.png",
      "role": "user",
      "createdAt": "2026-05-27 12:00:00",
      "updatedAt": "2026-05-27 12:00:00"
    },
    "token": "bearer-token-xxx",
    "tokenType": "Bearer",
    "expiresAt": "2026-06-10 12:00:00"
  }
}
```

**错误情况**:
- `40000`: 邮箱格式不正确 / 密码至少 6 位
- `40004`: 邮箱已注册

**优先级**: P0

---

#### POST /auth/login

**接口名称**: 账号登录

**接口用途**: 使用邮箱和密码进行用户身份认证，获取登录态。

**使用场景**:
1. 用户在登录页输入账号和密码进行登录操作

**请求参数**: 无

**请求体示例**:
```json
{
  "email": "admin@northcore.ai",
  "password": "admin123"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| email | 是 | 注册邮箱 |
| password | 是 | 登录密码 |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "user-admin",
      "email": "admin@northcore.ai",
      "name": "比特骑士",
      "avatar": "https://example.com/avatar.png",
      "role": "admin",
      "createdAt": "2026-05-27 12:00:00",
      "updatedAt": "2026-05-27 12:00:00"
    },
    "token": "bearer-token-xxx",
    "tokenType": "Bearer",
    "expiresAt": "2026-06-10 12:00:00"
  }
}
```

**错误情况**:
- `40005`: 邮箱或密码错误

**优先级**: P0

---

#### POST /auth/guest

**接口名称**: 游客登录

**接口用途**: 一键游客体验，免密直接登录。

**使用场景**:
1. 用户在登录页点击“一键访客体验”按钮

**请求参数**: 无

**请求体示例**: 空

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "user-guest",
      "email": "guest@northcore.ai",
      "name": "阿尔法极客",
      "avatar": "https://example.com/avatar.png",
      "role": "guest",
      "createdAt": "2026-05-27 12:00:00",
      "updatedAt": "2026-05-27 12:00:00"
    },
    "token": "bearer-token-xxx",
    "tokenType": "Bearer",
    "expiresAt": "2026-06-10 12:00:00"
  }
}
```

**错误情况**: 无

**优先级**: P0

---

#### GET /auth/me

**接口名称**: 获取当前登录用户

**接口用途**: 校验并恢复前端当前的登录会话及用户信息。

**使用场景**:
1. 前端页面刷新时，读取 localStorage 中的 token 调用此接口验证有效性并拉取最新的用户信息

**请求参数**: 无

**Headers**:
- `Authorization`: `Bearer <token>`

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "张三",
    "avatar": "https://example.com/avatar.png",
    "role": "user",
    "createdAt": "2026-05-27 12:00:00",
    "updatedAt": "2026-05-27 12:00:00"
  }
}
```

**错误情况**:
- `40101`: 未登录 / 登录已过期

**优先级**: P0

---

#### POST /auth/logout

**接口名称**: 退出登录

**接口用途**: 销毁服务端的当前登录会话并废弃 token。

**使用场景**:
1. 用户在设置或侧边栏点击“退出登录”

**请求参数**: 无

**Headers**:
- `Authorization`: `Bearer <token>`

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": true
}
```

**错误情况**: 无

**优先级**: P0

---

### 4.7 会话级别 Agent 配置管理接口

#### GET /conversations/{conversationId}/agents/{agentId}/config

**接口名称**: 获取会话级 Agent 配置

**接口用途**: 获取某个特定群聊或单聊会话中，针对指定 Agent 的个性化（Override）配置。

**使用场景**:
1. 用户在群聊或单聊中，点击 Agent 的设置按钮打开配置面板时，拉取该会话下的 Override 配置（若不存在则前端降级读取该 Agent 的全局配置）。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 是 | 会话唯一标识 ID |
| agentId | string | 是 | Agent 唯一标识 ID |

**请求示例**:
```
GET /api/v1/conversations/conv-group-1/agents/agent-claude-code/config
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "agent-claude-code",
    "name": "Claude Code (会话专属)",
    "avatar": "https://...",
    "description": "专业代码生成与工程理解",
    "tags": ["代码生成", "代码修改"],
    "status": "online",
    "category": "coding",
    "provider": "claude-code",
    "enabled": true,
    "systemPrompt": "在此会话中，请使用简洁 of 中文回答...",
    "modelConfig": {
      "provider": "claude-code",
      "modelName": "claude-3-5-sonnet-20241022",
      "temperature": 0.1,
      "maxTokens": 100000
    },
    "tools": [],
    "permissions": {
      "canReadFiles": true,
      "canWriteFiles": false,
      "canRunCommands": false,
      "canGenerateArtifacts": true,
      "canDeploy": false
    }
  }
}
```

**错误情况**:
- 40001: 会话或 Agent 不存在

**优先级**: P1

---

#### PUT /conversations/{conversationId}/agents/{agentId}/config

**接口名称**: 保存会话级 Agent 配置

**接口用途**: 更新或保存某个特定群聊或单聊会话中，针对指定 Agent 的个性化（Override）配置。

**使用场景**:
1. 用户在群聊或单聊的 Agent 配置面板中修改了参数（如系统提示词、温度等）并保存时调用此接口。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 是 | 会话唯一标识 ID |
| agentId | string | 是 | Agent 唯一标识 ID |

**请求体示例**:
```json
{
  "systemPrompt": "在此会话中，请使用简洁的中文回答...",
  "modelConfig": {
    "temperature": 0.1
  }
}
```

**响应体示例**: 返回更新后的完整会话级 Agent 配置对象，结构同 GET 请求。

**错误情况**:
- 40001: 会话或 Agent 不存在

**优先级**: P1

---

### 4.8 沙箱任务管理接口

---

#### POST /conversations/{conversationId}/runs

**接口名称**: 创建并启动沙箱运行任务 (Run)

**接口用途**: 针对指定会话，在后台启动一个 Docker 容器并初始化任务，返回初始化后的任务详情。

**使用场景**:
1. 用户在会话中点击“沙箱执行”或发送任务指令。
2. 前端发起请求，后端在后台异步调度执行，前端拿到任务 ID 后进行 WebSocket 或轮询状态监控。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 是 | 会话唯一标识 ID |

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| prompt | string | 是 | 沙箱任务需要执行的自然语言指令 |
| environmentProfile | object | 否 | 沙箱环境配置文件 |

**请求示例**:
```json
{
  "prompt": "创建一个 README.md，内容说明这是沙箱测试",
  "environmentProfile": {
    "packageManager": "uv",
    "pythonVersion": "3.11",
    "allowNetwork": true
  }
}
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "run-xxxxxx",
    "sandboxId": "sb-xxxxxx",
    "conversationId": "conv-xxxxxx",
    "ownerUserId": "user-xxxxxx",
    "status": "pending",
    "prompt": "创建一个 README.md，内容说明这是沙箱测试",
    "dag": {
      "nodes": [
        {
          "id": "step-1",
          "label": "编写 README",
          "agentId": "agent-claude-code",
          "status": "pending",
          "dependencies": []
        }
      ]
    },
    "summary": "创建沙箱测试说明文档",
    "createdAt": "2026-05-29 15:30:00",
    "updatedAt": "2026-05-29 15:30:00",
    "steps": [],
    "files": [],
    "conflicts": []
  }
}
```

**字段说明**:
- `environmentProfile` 可选，不传时后端默认使用 `packageManager=uv`、`allowNetwork=true`
- 每个 run 都会创建一个空 Docker 工作区

**优先级**: P0

---

#### GET /conversations/{conversationId}/runs

**接口名称**: 获取会话沙箱运行任务列表

**接口用途**: 页面刷新后恢复当前会话的沙箱任务列表，默认按创建时间倒序。

**使用场景**:
1. 页面刷新后，获取当前会话历史沙箱任务。
2. 前端取第一条作为右侧面板默认展示的最近 run。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| conversationId | string | 是 | 会话唯一标识 ID |

**Query 参数**:
- `page` (number, 可选): 页码，默认 1
- `pageSize` (number, 可选): 每页条数，默认 20

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "run-xxxxxx",
        "sandboxId": "sb-xxxxxx",
        "conversationId": "conv-xxxxxx",
        "ownerUserId": "user-xxxxxx",
        "status": "running",
        "prompt": "创建一个 README.md，内容说明这是沙箱测试",
        "dag": {
          "nodes": []
        },
        "summary": "创建沙箱测试说明文档",
        "createdAt": "2026-05-29 15:30:00",
        "updatedAt": "2026-05-29 15:30:05",
        "startedAt": "2026-05-29 15:30:02",
        "steps": [],
        "files": [],
        "conflicts": []
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "hasMore": false
  }
}
```

**优先级**: P0

---

#### GET /runs/{runId}/preview/{filePath}

**接口名称**: HTML 多文件预览 Bundle

**接口用途**: 给沙箱生成的 HTML Artifact 组装多文件预览，后端只从 `sandbox_files/sandbox_file_versions` 读取 tracked 文件。

**使用场景**:
1. 当前 Artifact `type = html` 且 metadata 中存在 `sourceRunId/sourceFilePath` 时调用。
2. 返回的 HTML 放入 iframe `srcDoc` 进行预览。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |
| filePath | string | 是 | 沙箱内相对文件路径（需 URL 编码） |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "html": "<html>...</html>",
    "sourceFilePath": "index.html",
    "resolvedAssets": [
      {
        "ref": "styles.css",
        "path": "styles.css",
        "kind": "stylesheet"
      }
    ],
    "missingAssets": [],
    "warnings": []
  }
}
```

**字段说明**:
- `<link rel="stylesheet" href="styles.css">` 会被替换成内联 `<style>`
- `<script src="app.js"></script>` 会被替换成内联 `<script>`
- 跳过外部 URL、绝对路径、`data:`、`blob:`、`http(s):`、`//cdn...`，原因写入 `warnings`

**优先级**: P0

---

#### GET /runs/{runId}

**接口名称**: 获取沙箱运行任务 (Run) 详情

**接口用途**: 获取指定运行任务的最新状态、执行步骤 (DAG)、输出文件及冲突情况。

**使用场景**:
1. 打开历史沙箱任务页面时加载任务状态。
2. 对正在运行的任务进行轮询兜底，确保前端界面状态同步。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "run-xxxxxx",
    "sandboxId": "sb-xxxxxx",
    "conversationId": "conv-xxxxxx",
    "ownerUserId": "user-xxxxxx",
    "status": "running",
    "prompt": "创建一个 README.md，内容说明这是沙箱测试",
    "dag": {
      "nodes": [
        {
          "id": "step-1",
          "label": "编写 README",
          "agentId": "agent-claude-code",
          "status": "running",
          "dependencies": []
        }
      ]
    },
    "summary": "创建沙箱测试说明文档",
    "createdAt": "2026-05-29 15:30:00",
    "updatedAt": "2026-05-29 15:30:05",
    "startedAt": "2026-05-29 15:30:02",
    "steps": [
      {
        "id": "step-1",
        "runId": "run-xxxxxx",
        "agentId": "agent-claude-code",
        "agentName": "Claude Code",
        "status": "running",
        "description": "正在生成并编写 README.md 文件...",
        "createdAt": "2026-05-29 15:30:02",
        "updatedAt": "2026-05-29 15:30:05",
        "startedAt": "2026-05-29 15:30:02"
      }
    ],
    "files": [],
    "conflicts": []
  }
}
```

**优先级**: P0

---

#### GET /runs/{runId}/files

**接口名称**: 获取沙箱内输出的文件列表

**接口用途**: 查询沙箱当前已生成的所有文件。

**使用场景**:
1. 在沙箱任务文件树面板展示生成的所有代码/文档文件。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "file-xxxxxx",
      "sandboxId": "sb-xxxxxx",
      "runId": "run-xxxxxx",
      "path": "README.md",
      "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "currentVersion": 1,
      "artifactId": null,
      "createdAt": "2026-05-29 15:30:10",
      "updatedAt": "2026-05-29 15:30:10"
    }
  ]
}
```

**优先级**: P0

---

#### GET /runs/{runId}/files/{filePath}

**接口名称**: 读取沙箱内文件内容

**接口用途**: 读取沙箱生成或修改的指定文件的详细内容及版本信息。

**使用场景**:
1. 用户在沙箱文件树上点击某文件，前端预览具体代码内容。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |
| filePath | string | 是 | 沙箱内相对文件路径（需 URL 编码，例如 `src%2FApp.tsx`） |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "file-xxxxxx",
    "sandboxId": "sb-xxxxxx",
    "runId": "run-xxxxxx",
    "path": "README.md",
    "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "currentVersion": 1,
    "artifactId": null,
    "createdAt": "2026-05-29 15:30:10",
    "updatedAt": "2026-05-29 15:30:10",
    "content": "# Sandbox Test\n这是沙箱测试说明文件",
    "version": {
      "id": "ver-xxxxxx",
      "fileId": "file-xxxxxx",
      "version": 1,
      "content": "# Sandbox Test\n这是沙箱测试说明文件",
      "createdAt": "2026-05-29 15:30:10"
    }
  }
}
```

**优先级**: P0

---

#### GET /runs/{runId}/conflicts

**接口名称**: 获取冲突列表

**接口用途**: 查询当前任务在向工作区提交代码时产生的所有未解决冲突。

**使用场景**:
1. 当任务进入 `conflict` 状态，或 WebSocket 收到 `run.step.conflict` 事件时，拉取冲突列表进行冲突处理。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "conf-xxxxxx",
      "runId": "run-xxxxxx",
      "sandboxId": "sb-xxxxxx",
      "fileId": "file-xxxxxx",
      "filePath": "README.md",
      "baseVersion": 1,
      "currentVersion": 2,
      "incomingContent": "# Sandbox Test\n这是大模型在沙箱中新增和修改的内容",
      "incomingHash": "f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb",
      "createdByStepId": "step-1",
      "status": "open",
      "resolution": null,
      "createdAt": "2026-05-29 15:30:15"
    }
  ]
}
```

**优先级**: P0

---

#### POST /runs/{runId}/conflicts/{conflictId}/resolve

**接口名称**: 解决文件冲突

**接口用途**: 对冲突文件提交合并决策（支持保留现有、采用传入、或手动合并编辑后的内容）。

**使用场景**:
1. 用户在冲突解决面板中，点击“保留当前”、“采用传入”或“手动修改”后提交。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |
| conflictId | string | 是 | 冲突项唯一标识 ID |

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| resolution | string | 是 | 冲突解决策略：`current` (保留当前)、`incoming` (采用传入新内容)、`manual` (手动编辑) |
| content | string | 否 | 当 `resolution` 为 `manual` 时，必填。表示手动合并后的完整文件内容 |

**请求示例**:
```json
{
  "resolution": "incoming"
}
```

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "conf-xxxxxx",
    "runId": "run-xxxxxx",
    "sandboxId": "sb-xxxxxx",
    "fileId": "file-xxxxxx",
    "filePath": "README.md",
    "baseVersion": 1,
    "currentVersion": 3,
    "incomingContent": "# Sandbox Test\n这是大模型在沙箱中新增和修改的内容",
    "incomingHash": "f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb",
    "createdByStepId": "step-1",
    "status": "resolved",
    "resolution": "incoming",
    "createdAt": "2026-05-29 15:30:15",
    "resolvedAt": "2026-05-29 15:31:00"
  }
}
```

**优先级**: P0

---

#### POST /runs/{runId}/cancel

**接口名称**: 取消运行中的任务

**接口用途**: 强行停止正在运行的沙箱容器，并将任务状态置为 `cancelled`。

**使用场景**:
1. 任务卡住或用户改变主意时，点击“取消”按钮。

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| runId | string | 是 | 运行任务唯一标识 ID |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "run-xxxxxx",
    "status": "cancelled",
    "updatedAt": "2026-05-29 15:32:00",
    "finishedAt": "2026-05-29 15:32:00"
  }
}
```

**优先级**: P0

---

## 5. WebSocket 事件文档

### 5.1 WebSocket 连接地址

```
ws://localhost:8000/ws
```

### 5.2 事件统一结构
所有 WebSocket 事件使用统一格式：
```json
{
  "type": "event.name",
  "eventId": "evt_xxx",
  "data": {}
}
```

---

### 5.1 connected

**事件方向**: 服务端推送 → 客户端

**事件用途**: WebSocket 连接成功后，服务端立即主动推送该事件，通知客户端连接已建立。

**payload 示例**:
```json
{
  "type": "connected",
  "sessionId": "agenthub-session-001",
  "serverTime": "2026-05-26 10:30:00",
  "version": "1.0.0"
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|---|---|---|
| sessionId | string | 本次 WebSocket 会话唯一标识 |
| serverTime | string | 服务端当前时间 |
| version | string | 服务端版本号 |

**触发时机**: 客户端刚建立 WebSocket 连接，握手完成后立即推送。

**前端处理方式**:
- 将 sessionId 存入状态
- 标记连接状态为已连接
- 恢复发送待队列中的消息

**优先级**: P1

---

### 5.2 ping

**事件方向**: 客户端 → 服务端

**事件用途**: 客户端主动发送心跳探测，维持长连接存活。

**payload 示例**:
```json
{
  "type": "ping"
}
```

**前端处理方式**:
- 设置 30 秒定时器自动发送 ping
- 超过 60 秒未收到 pong 则尝试重连

**优先级**: P1

---

### 5.3 pong

**事件方向**: 服务端 → 客户端

**事件用途**: 服务端响应客户端的 ping 心跳。

**payload 示例**:
```json
{
  "type": "pong",
  "timestamp": 1716695400000
}
```

**字段说明**: timestamp 是 Unix 时间戳（毫秒）

**优先级**: P1

---

### 5.4 conversation.message.create

**事件方向**: 客户端 → 服务端

**事件用途**: 客户端通过 WebSocket 发起流式消息发送，启动整个消息的流式生成流程。

**payload 示例**:
```json
{
  "type": "conversation.message.create",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "content": "帮我生成一个React登录页面"
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|---|---|---|
| eventId | string | 本次请求的唯一事件 ID，用于追踪后续相关事件 |
| conversationId | string | 目标会话 ID |
| content | string | 用户消息文本内容 |

**优先级**: P1

---

### 5.5 conversation.message.user_created

**事件方向**: 服务端推送 → 客户端

**事件用途**: 服务端成功创建用户消息，立即通知前端，前端可以先渲染这条用户消息。

**payload 示例**:
```json
{
  "type": "conversation.message.user_created",
  "eventId": "evt-001",
  "data": {
    "message": {
      "id": "msg-user-001",
      "conversationId": "conv-xxx",
      "senderId": "user",
      "senderName": "用户",
      "role": "user",
      "type": "text",
      "content": "帮我生成一个React登录页面",
      "createdAt": "2026-05-26 10:30:00"
    }
  }
}
```

**优先级**: P1

---

### 5.6 agent.status.changed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 通知客户端某个 Agent 的运行状态发生了变化（如进入 thinking 状态）。

**payload 示例**:
```json
{
  "type": "agent.status.changed",
  "data": {
    "agentId": "agent-claude-code",
    "newStatus": "thinking",
    "timestamp": "2026-05-26 10:30:05"
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|---|---|---|
| agentId | string | 状态发生变化的 Agent ID |
| newStatus | string | 新状态值（online/offline/thinking...） |
| timestamp | string | 状态变更时间 |

**使用场景**: 左侧 Agent 联系人卡片显示思考中动画，状态指示器变化

**优先级**: P1

---

### 5.7 agent.thinking.started

**事件方向**: 服务端推送 → 客户端

**事件用途**: 专门通知指定 Agent 已开始执行任务、正在思考。

**payload 示例**:
```json
{
  "type": "agent.thinking.started",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "agentId": "agent-claude-code",
    "agentName": "Claude Code"
  }
}
```

**优先级**: P1

---

### 5.8 conversation.message.chunk

**事件方向**: 服务端推送 → 客户端

**事件用途**: 模型流式输出的内容片段，逐字/逐段返回给前端进行追加渲染。

**payload 示例**:
```json
{
  "type": "conversation.message.chunk",
  "eventId": "evt-001",
  "data": {
    "messageId": "msg-agent-001",
    "conversationId": "conv-xxx",
    "senderId": "agent-claude-code",
    "senderName": "Claude Code",
    "role": "agent",
    "messageType": "text",
    "language": "",
    "chunk": "好的，下面",
    "sequence": 1,
    "isFullContent": false
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|---|---|---|
| messageId | string | 该 Agent 消息的唯一 ID |
| chunk | string | 本次输出的内容片段 |
| sequence | number | 片段序列号，用于排序防乱序 |
| isFullContent | boolean | 该 chunk 是否包含完整内容（最后一个大段时为 true） |

**前端处理方式**:
- 找到对应 messageId 的消息气泡
- 将 chunk 内容 append 到末尾
- 消息区域自动滚动到底部

**优先级**: P1

---

### 5.9 conversation.message.completed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 单条 Agent 消息全部输出完毕，通知前端该消息生成结束。

**payload 示例**:
```json
{
  "type": "conversation.message.completed",
  "eventId": "evt-001",
  "data": {
    "messageId": "msg-agent-001",
    "finishReason": "stop",
    "fullMessage": {
      "id": "msg-agent-001",
      "conversationId": "conv-xxx",
      "senderId": "agent-claude-code",
      "senderName": "Claude Code",
      "role": "agent",
      "type": "text",
      "content": "好的，下面为您生成一个完整的React登录页面组件...",
      "createdAt": "2026-05-26 10:30:10"
    }
  }
}
```

**finishReason 取值**:
- stop: 正常完成
- length: 输出达到最大长度截断
- tool_calls: 触发工具调用
- error: 生成出错

**优先级**: P1

---

### 5.10 artifact.created

**事件方向**: 服务端推送 → 客户端

**事件用途**: Agent 在本次消息处理过程中生成了一个新产物，通知前端新增产物。

**payload 示例**:
```json
{
  "type": "artifact.created",
  "eventId": "evt-001",
  "data": {
    "artifact": {
      "id": "art-login-page",
      "conversationId": "conv-xxx",
      "title": "LoginPage.tsx",
      "type": "code",
      "createdAt": "2026-05-26 10:30:15"
    }
  }
}
```

**前端处理方式**:
- 将新 artifact 添加到状态管理中
- 右侧产物列表面板自动刷新展示
- 可选播放一个生成成功的提示动画

**优先级**: P1

---

### 5.11 conversation.all_tasks.completed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 本次由 conversation.message.create 触发的所有任务（所有 Agent 回复、所有产物生成）全部完成，标记整个流程结束。

**payload 示例**:
```json
{
  "type": "conversation.all_tasks.completed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "summary": "本次任务生成了1个React登录页组件产物...",
    "totalMessages": 3,
    "totalArtifacts": 1,
    "contextUsage": {
      "contextUsagePercent": 45,
      "contextUsageChars": 45000,
      "contextLimitChars": 100000
    }
  }
}
```

**前端处理方式**:
- 将流式生成状态标记为 idle 空闲
- 更新上下文使用统计环形图
- 恢复输入框可输入状态

**优先级**: P1

---

### 5.12 error

**事件方向**: 服务端推送 → 客户端

**事件用途**: WebSocket 协议层面或业务逻辑出错时，推送错误事件通知前端。

**payload 示例**:
```json
{
  "type": "error",
  "eventId": "evt-001",
  "data": {
    "code": 50001,
    "message": "Agent 调用失败"
  }
}
```

**优先级**: P1

---

### 5.13 run.created

**事件方向**: 服务端推送 → 客户端

**事件用途**: 沙箱任务创建并初始化完成，通知前端。

**payload 示例**:
```json
{
  "type": "run.created",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "run": {
      "id": "run-xxx",
      "status": "pending",
      "prompt": "创建一个 README.md"
    }
  }
}
```

**字段说明**:
- 所有 `run.*` 事件都带 `conversationId` 和 `runId`，用于归属判断

**前端处理方式**:
- 创建/更新对应 conversation 的 run
- 设为该 conversation 的 active run

**优先级**: P1

---

### 5.14 run.step.started

**事件方向**: 服务端推送 → 客户端

**事件用途**: 某个沙箱步骤开始执行。

**payload 示例**:
```json
{
  "type": "run.step.started",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "status": "running"
  }
}
```

**前端处理方式**:
- 把对应 step 标记为 running
- 使用事件里的 `run/steps` 合并本地状态

**优先级**: P1

---

### 5.15 run.step.tool.started

**事件方向**: 服务端推送 → 客户端

**事件用途**: Agent 在某 step 中开始调用具体工具。

**payload 示例**:
```json
{
  "type": "run.step.tool.started",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "toolName": "write_file"
  }
}
```

**前端处理方式**:
- 展示 Agent 正在调用的工具

**优先级**: P1

---

### 5.16 run.step.tool.completed

**事件方向**: 服务端推送 → 客户端

**事件用途**: Agent 在某 step 中完成了工具调用。

**payload 示例**:
```json
{
  "type": "run.step.tool.completed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "toolName": "write_file"
  }
}
```

**前端处理方式**:
- 追加工具结果
- 刷新文件树或 step output

**优先级**: P1

---

### 5.17 run.step.tool.failed

**事件方向**: 服务端推送 → 客户端

**事件用途**: Agent 在某 step 中的工具调用失败。

**payload 示例**:
```json
{
  "type": "run.step.tool.failed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "toolName": "write_file",
    "error": "Permission denied"
  }
}
```

**前端处理方式**:
- 展示工具错误
- 如果是写文件冲突，刷新冲突列表

**优先级**: P1

---

### 5.18 run.step.log

**事件方向**: 服务端推送 → 客户端

**事件用途**: 实时追加沙箱步骤日志输出。

**payload 示例**:
```json
{
  "type": "run.step.log",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "log": "[Agent] Writing file README.md..."
  }
}
```

**前端处理方式**:
- 直接追加到 `runId + stepId` 对应日志区
- 不要等轮询刷新

**优先级**: P1

---

### 5.19 run.step.completed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 沙箱步骤执行完成。

**payload 示例**:
```json
{
  "type": "run.step.completed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "status": "completed",
    "steps": []
  }
}
```

**前端处理方式**:
- 把 step 标记为 completed
- 合并事件里的 run 快照

**优先级**: P1

---

### 5.20 run.step.failed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 沙箱步骤执行失败。

**payload 示例**:
```json
{
  "type": "run.step.failed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "stepId": "step-1",
    "status": "failed",
    "error": "Command exit code 1"
  }
}
```

**前端处理方式**:
- 把 step 标记为 failed 或 blocked
- 展示 error

**优先级**: P1

---

### 5.21 run.step.conflict

**事件方向**: 服务端推送 → 客户端

**事件用途**: 沙箱步骤产生文件冲突。

**payload 示例**:
```json
{
  "type": "run.step.conflict",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "conflicts": []
  }
}
```

**前端处理方式**:
- 刷新对应 run 的冲突列表

**优先级**: P1

---

### 5.22 run.completed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 整个沙箱任务执行完成。

**payload 示例**:
```json
{
  "type": "run.completed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "run": {}
  }
}
```

**前端处理方式**:
- 刷新 run 详情、文件列表、Artifact 列表

**优先级**: P1

---

### 5.23 run.failed

**事件方向**: 服务端推送 → 客户端

**事件用途**: 整个沙箱任务执行失败。

**payload 示例**:
```json
{
  "type": "run.failed",
  "eventId": "evt-001",
  "data": {
    "conversationId": "conv-xxx",
    "runId": "run-xxx",
    "error": "Docker container timed out"
  }
}
```

**前端处理方式**:
- 展示失败原因
- 如果 status 是 `conflict`，引导用户去冲突面板

**优先级**: P1

---

## 6. 错误码表

| 错误码 | message | 说明 |
|---|---|---|
| 0 | success | 业务操作成功 |
| 40000 | 请求参数错误 | 客户端传入的参数不合法 |
| 40001 | 资源不存在 | 请求的 Agent/Conversation/Message/Artifact ID 找不到 |
| 40002 | 当前状态不允许操作 | Agent 已禁用或会话已锁定，无法执行该操作 |
| 40003 | Agent 已禁用 | 尝试使用一个被禁用的 Agent |
| 40100 | 未授权 | （预留）需要用户登录认证 |
| 40300 | 权限不足 | 用户没有权限执行该操作 |
| 50000 | 服务端内部错误 | 服务器通用异常 |
| 50001 | Agent 调用失败 | 调用大模型服务商 API 返回失败 |
| 50002 | Agent 执行超时 | Agent 处理请求超过设定的超时时间 |
| 50003 | WebSocket 事件处理失败 | 处理 WebSocket 消息时发生异常 |

---

## 7. 版本历史

| 版本 | 日期 | 更新内容 |
|---|---|---|
| v1.0.0 | 2026-05-24 | 初始基础接口定义 |
| v2.0.0 | 2026-05-25 | 新增 mention、compress 上下文、长期记忆、Pin 消息 等接口 |
| v3.0.0 | 2026-05-26 | 完全重构完整文档，所有接口补充使用场景、完整示例、字段说明，对齐前端全部实际使用代码 |
| v4.0.0 | 2026-05-27 | 接入用户登录/注册系统，支持多用户资源隔离，引入预置 Agent 安全管理策略 |
| v4.2.0 | 2026-05-29 | [新增] 补充群聊和单聊的会话级 Agent 配置管理接口；支持多聊中添加/删除成员智能体操作 |
| v4.3.0 | 2026-05-29 | [新增] 补充沙箱运行任务 (Sandbox Run) 相关类型定义及 HTTP API，并标识其为待后端实现接口 |

---

## 8. 前后端 API 差异及待开发 API

### 8.1 前后端 API 差异说明

1. **删除 Agent (DELETE /agents/{agentId}) 行为差异**：
   - **前端原设计**：预期为永久物理删除。
   - **后端契约**：实现为软删除（禁用状态，`enabled = false`，`status = "disabled"`），这使得已删除 Agent 的历史对话消息在前端依然可以正常显示。
2. **会话分类模式 (ConversationMode) 差异**：
   - **前端实现**：支持 `single` (普通单聊)、`group` (多智能体群聊)、`agent` (一对一智能体专属持久会话)。
   - **后端契约**：仅声明 `single` 与 `group` 两种模式。目前前端的 `agent` 专属会话在后端是以 `mode = "single"` 或者通过前缀规则进行持久化存储的。
3. **长期记忆与 Pin 消息逻辑归属**：
   - **前端实现**：为保持向后兼容和体验完整性，对于新注册用户在 Mock 模式下，记忆与 Pinned Message 在前端本地有完整隔离实现。
   - **后端契约**：当 API 模式激活时，上述资源通过 `conversationId` 间接关联到 `ownerUserId` 进行用户级隔离。

### 8.2 后端需实现但目前尚未实现的前端所需 API

1. **WebSocket 连接级别的多房间/多用户会话安全隔离**：
   - **现状**：目前 WebSocket 支持通过 url 携带 token 建立连接。
   - **前端诉求**：后端在向群聊广播消息或分发事件时，需要确保在 WebSocket 服务端建立严格的 Channel 订阅鉴权。即使在同一 WebSocket 服务器下，用户 A 也绝不能接收到用户 B 的 `conversation.message.chunk` 等推送事件，完全杜绝越权信息泄露。
2. **多用户自建智能体的大模型 Key (API-Key) 安全托管与代充值代理 API**：
   - **现状**：自建 Agent 允许用户自定义 modelConfig (如模型名称、供应商)。
   - **前端诉求**：后端需要设计安全的 API-Key 加密托管机制，或者提供统一的代调用中转/代理鉴权层，避免前端在 `modelConfig` 中直接将敏感的 `apiKey` 明文传递给后端。
3. **用户个人资料修改接口 (PUT /auth/profile) [v4.1.0 新增需求]**：
   - **现状**：前端“设置”面板中支持用户修改昵称、更换头像。
   - **前端诉求**：后端提供修改当前用户头像和昵称的 API，修改成功后持久化至数据库。
     - **请求方法**：`PUT`
     - **请求路径**：`/auth/profile`
     - **请求体**：
       ```json
       {
         "name": "string",
         "email": "string",
         "avatar": "string"
       }
       ```
     - **响应体**：`BaseApiResponse<UserInfo>`（包含修改后的用户最新资料数据）
4. **会话置顶/取消置顶接口 (PUT /conversations/{conversationId}/pin) [v4.1.0 新增需求]**：
   - **现状**：前端已实现置顶/取消置顶交互，但目前仅在 localStorage 中保存状态。
   - **前端诉求**：后端需要提供置顶/取消置顶接口以支持多端同步与状态持久化。
     - **请求方法**：`PUT`
     - **请求路径**：`/conversations/{conversationId}/pin`
     - **请求体**：`{ "isPinned": boolean }`
     - **响应体**：返回更新后的会话对象 `Conversation`
5. **会话归档/激活接口 (PUT /conversations/{conversationId}/archive) [v4.1.0 新增需求]**：
   - **现状**：前端已实现会话归档与重新激活（移出归档）的交互。
   - **前端诉求**：后端提供归档状态持久化接口。
     - **请求方法**：`PUT`
     - **请求路径**：`/conversations/{conversationId}/archive`
     - **请求体**：`{ "isArchived": boolean }`
     - **响应体**：返回更新后的会话对象 `Conversation`
6. **获取智能体专属一对一会话接口 (GET /users/{userId}/agents/{agentId}/contact) [v4.1.0 新增需求]**：
   - **现状**：点击智能体进行专属一对一聊天时，前端在 API 模式下需要拉取该用户与该智能体的专属聊天会话。前端不负责创建该会话，直接由后端按需匹配/返回。
   - **前端诉求**：后端提供获取个人专属联系人会话接口。
     - **请求方法**：`GET`
     - **请求路径**：`/users/{userId}/agents/{agentId}/contact`
     - **响应体**：`BaseApiResponse<AgentContactResponse>`，其中 `data` 结构为：
       ```typescript
       interface AgentContactResponse {
         contactId: string;
         conversationId: string;
         conversation: Conversation;
       }
       ```
7. **修改长期记忆接口 (PUT /conversations/{conversationId}/memories/{memoryId}) [v4.1.0 新增需求]**：
   - **现状**：前端“提取的记忆”面板中支持用户对提取的记忆进行修改和类别变更。
   - **前端诉求**：后端提供更新指定长期记忆的 API，支持修改内容（content）、分类（category）或状态（active）。
     - **请求方法**：`PUT`
     - **请求路径**：`/conversations/{conversationId}/memories/{memoryId}`
     - **请求体**：
       ```json
       {
         "content": "string",
         "category": "preference",
         "active": true
       }
       ```
     - **响应体**：`BaseApiResponse<MemoryItem>`（包含更新后的完整记忆条目）
8. **获取/修改会话级别的智能体专属配置接口 [v4.2.0 新增需求]**：
   - **现状**：前端增加了群聊和单聊的会话级别 Agent 配置界面，目前支持 localStorage 存储 overriding 配置，并支持一键同步至全局。
   - **前端诉求**：后端提供保存和拉取会话级别智能体专属配置的 API，以保持多端同步并支持持久化。
     - **获取会话级别配置**：
       - **请求方法**：`GET`
       - **请求路径**：`/conversations/{conversationId}/agents/{agentId}/config`
       - **响应体**：`BaseApiResponse<Agent>`
     - **修改会话级别配置**：
       - **请求方法**：`PUT`
       - **请求路径**：`/conversations/{conversationId}/agents/{agentId}/config`
       - **请求体**：`Partial<Agent>`
       - **响应体**：`BaseApiResponse<Agent>`
 9. **多聊中添加和删除成员智能体接口 [v4.2.0 新增需求] [待实现]**：
    - **现状**：前端支持在群聊中添加和删除参与智能体，目前支持 Mock 状态和本地状态同步。
    - **前端诉求**：后端提供添加/删除群聊中参与智能体的 REST API。
      - **添加成员智能体**：
        - **请求方法**：`POST`
        - **请求路径**：`/conversations/{conversationId}/agents`
        - **请求体**：`{ "agentId": string }`
        - **响应体**：`BaseApiResponse<Conversation>`
      - **删除成员智能体**：
        - **请求方法**：`DELETE`
        - **请求路径**：`/conversations/{conversationId}/agents/{agentId}`
        - **响应体**：`BaseApiResponse<Conversation>`
 10. **创建并启动沙箱运行任务 [v4.3.0 新增需求] [待实现]**：
     - **现状**：前端支持启动沙箱任务并展示任务状态/DAG。
     - **前端诉求**：后端提供启动 Docker 容器并初始化沙箱运行任务的 API。
       - **请求方法**：`POST`
       - **请求路径**：`/conversations/{conversationId}/runs`
       - **请求体**：`{ "prompt": string }`
       - **响应体**：`BaseApiResponse<AgentRunDetail>`
 11. **获取沙箱运行任务详情 [v4.3.0 新增需求] [待实现]**：
     - **现状**：前端支持查看沙箱任务详细步骤和文件信息。
     - **前端诉求**：后端提供获取运行任务最新状态、DAG、文件和冲突列表的 API。
       - **请求方法**：`GET`
       - **请求路径**：`/runs/{runId}`
       - **响应体**：`BaseApiResponse<AgentRunDetail>`
 12. **获取沙箱内输出的文件列表 [v4.3.0 新增需求] [待实现]**：
     - **现状**：前端支持渲染沙箱输出的文件树。
     - **前端诉求**：后端提供查询沙箱当前生成的所有文件元数据的 API。
       - **请求方法**：`GET`
       - **请求路径**：`/runs/{runId}/files`
       - **响应体**：`BaseApiResponse<SandboxFile[]>`
 13. **读取沙箱内文件内容 [v4.3.0 新增需求] [待实现]**：
     - **现状**：前端支持预览沙箱文件的最新代码或文档内容。
     - **前端诉求**：后端提供读取指定沙箱文件详情及特定版本快照的 API。
       - **请求方法**：`GET`
       - **请求路径**：`/runs/{runId}/files/{filePath}` （注：`filePath` 需要 URL 编码）
       - **响应体**：`BaseApiResponse<SandboxFileDetail>`
 14. **获取冲突列表 [v4.3.0 新增需求] [待实现]**：
     - **现状**：当任务状态为 `conflict` 时，前端支持渲染冲突列表。
     - **前端诉求**：后端提供查询工作区提交代码时产生的所有未解决冲突的 API。
       - **请求方法**：`GET`
       - **请求路径**：`/runs/{runId}/conflicts`
       - **响应体**：`BaseApiResponse<SandboxConflict[]>`
 15. **解决文件冲突 [v4.3.0 新增需求] [待实现]**：
     - **现状**：前端提供了人工解决冲突并选择 `current`、`incoming` 或 `manual` 策略的面板。
     - **前端诉求**：后端提供提交决策并写成新文件版本的冲突解决 API。
       - **请求方法**：`POST`
       - **请求路径**：`/runs/{runId}/conflicts/{conflictId}/resolve`
       - **请求体**：
         ```json
         {
           "resolution": "current" | "incoming" | "manual",
           "content": "string" // 仅在 resolution 为 manual 时必填
         }
         ```
       - **响应体**：`BaseApiResponse<SandboxConflict>`
 16. **取消运行中的任务 [v4.3.0 新增需求] [待实现]**：
     - **现状**：用户在沙箱面板点击取消任务。
     - **前端诉求**：后端提供停止容器并将任务标记为 `cancelled` 的 API。
       - **请求方法**：`POST`
       - **请求路径**：`/runs/{runId}/cancel`
       - **响应体**：`BaseApiResponse<AgentRunDetail>`

---


