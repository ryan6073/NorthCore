# AgentHub API 协作契约

**版本**: v4.4.0  
**更新日期**: 2026-06-01  
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
  canWebSearch?: boolean;
}
```

### 3.5 WebSearchResult
联网搜索的单条结果条目：

```typescript
interface WebSearchResult {
  title: string;
  body: string;
  href: string;
}
```

### 3.6 WebSearchMetadata
联网搜索的完整元数据对象，记录 Agent 的联网决策过程和搜索结果：

```typescript
interface WebSearchMetadata {
  shouldSearch: boolean;
  decisionReason: string;
  mode: 'auto' | 'force' | 'off';
  used: boolean;
  provider: 'ddgs' | 'serpapi' | string;
  query: string;
  cacheHit: boolean;
  results: WebSearchResult[];
  error: string | null;
}
```

| 字段 | 说明 |
|---|---|
| shouldSearch | 模型决策是否需要联网 |
| decisionReason | 模型做出这个决策的理由 |
| mode | 用户指定的联网模式：auto=自动决策, force=强制联网, off=禁止联网 |
| used | 实际是否执行了联网操作 |
| provider | 使用的联网搜索引擎提供商 |
| query | 实际执行的搜索关键词 |
| cacheHit | 搜索结果是否命中缓存 |
| results | 搜索结果数组 |
| error | 联网过程中发生的错误，成功时为 null |

### 3.7 Conversation
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

### 3.8 ContextUsage
上下文 Token/字符数使用统计：

```typescript
interface ContextUsage {
  contextUsagePercent: number;
  contextUsageChars: number;
  contextLimitChars: number;
}
```

### 3.9 Message
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
  webSearchMetadata?: WebSearchMetadata;
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
| webSearchMetadata | 该消息对应的联网搜索元数据 | 展示联网决策、搜索结果、来源引用 |

### 3.10 MessageAttachment
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

### 3.11 ArtifactReference
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

### 3.12 Artifact
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

### 3.13 ArtifactVersion
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

### 3.14 ArtifactDetail
产物详情对象，包含当前版本完整内容。

```typescript
interface ArtifactDetail extends Artifact {
  currentVersion: ArtifactVersion;
  content: string;
  size?: number;
}
```

### 3.15 SendMessageResponse
发送消息非流式返回结果。

```typescript
interface SendMessageResponse {
  userMessage: Message;
  agentMessages: Message[];
  artifacts: Artifact[];
  contextUsage?: ContextUsage;
  webSearchMetadata?: WebSearchMetadata;
}
```

### 3.16 CompressContextResult
上下文压缩执行结果。

```typescript
interface CompressContextResult {
  summary: ConversationSummary;
  compressed: boolean;
  contextUsage?: ContextUsage;
}
```

### 3.17 ConversationSummary
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

### 3.18 MemoryItem
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

### 3.19 PinItem
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

### 3.20 HealthCheckData
健康检查返回数据。

```typescript
interface HealthCheckData {
  status: 'healthy';
  version: string;
  timestamp: string;
}
```

### 3.21 AgentRunStepStatus
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

### 3.22 AgentRunStep
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

### 3.23 RunDag
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

### 3.24 Sandbox
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

### 3.25 SandboxFile
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

### 3.26 SandboxFileVersion
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

### 3.27 SandboxFileDetail
沙箱内文件的详细内容（继承自 SandboxFile）。

```typescript
interface SandboxFileDetail extends SandboxFile {
  content: string;
  version?: SandboxFileVersion;
}
```

### 3.28 SandboxConflict
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

### 3.29 AgentRunDetail
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
      "canDeploy": false,
      "canWebSearch": true
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
    "canDeploy": false,
    "canWebSearch": true
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
        "senderId": "agent-orchestrator",
        "senderName": "Orchestrator",
        "role": "orchestrator",
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
1. 用户在多聊会话的成员管理面板中选择未参与的智能体并点击"添加"。

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
1. 用户在多聊会话的成员管理面板中点击某个智能体旁的"移除"按钮。

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

**接口名称**: 发送消息（非流式，支持联网模式）

**接口用途**: 发送用户消息，后端同步处理完成后一次性返回所有结果。支持三种联网模式：auto=自动决策是否联网，force=强制联网，off=完全禁止联网。

**使用场景**:
1. 在 WebSocket 不可用时的降级方案
2. 用户明确指定"强制联网"来获取实时信息

**路径参数**: conversationId

**请求体示例**:
```json
{
  "content": "2026年6月最新的 React 版本是多少？",
  "targetAgentId": "agent-claude-code",
  "quotedMessageId": "msg-12",
  "artifactRef": null,
  "attachments": [],
  "webSearchMode": "auto"
}
```

| 字段 | 说明 |
|---|---|
| content | 用户输入的消息文本内容 |
| targetAgentId | 可选，指定要直接回复的 Agent ID |
| quotedMessageId | 可选，引用/回复的消息 ID |
| artifactRef | 可选，消息中关联的产物片段引用 |
| attachments | 可选，附带上传的附件列表 |
| webSearchMode | 可选，联网模式：auto=自动决策, force=强制联网, off=禁止联网，默认 auto |

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
      "content": "2026年6月最新的 React 版本是多少？",
      "createdAt": "2026-06-01 10:00"
    },
    "agentMessages": [
      {
        "id": "msg-agent-1",
        "conversationId": "conv-xxx",
        "senderId": "agent-claude-code",
        "senderName": "Claude Code",
        "role": "agent",
        "type": "text",
        "content": "根据搜索结果，2026年6月 React 的最新稳定版本是 React 19.2.1，于2026年5月下旬发布。本次联网共找到 5 条相关结果...",
        "createdAt": "2026-06-01 10:01",
        "webSearchMetadata": {
          "shouldSearch": true,
          "decisionReason": "问题询问的是2026年6月的实时版本信息，属于动态最新数据，无法仅凭训练知识回答，因此决定联网搜索",
          "mode": "auto",
          "used": true,
          "provider": "ddgs",
          "query": "React latest stable version 2026 June",
          "cacheHit": false,
          "results": [
            {
              "title": "React 官方博客 - 发布 React 19.2.1",
              "body": "React 团队很高兴地宣布 React 19.2.1 现已发布。这是一个包含重要性能优化和 bug 修复的稳定更新。本次更新重点改进了 Concurrent Mode 下的渲染性能...",
              "href": "https://react.dev/blog/2026/05/28/react-19-2-1"
            },
            {
              "title": "React Releases - GitHub 标签页",
              "body": "最新的 React 发布版本：v19.2.1 (2026-05-28), v19.2.0 (2026-05-15)...",
              "href": "https://github.com/facebook/react/releases"
            }
          ],
          "error": null
        }
      }
    ],
    "artifacts": [],
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
1. 用户在登录页点击"一键访客体验"按钮

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
1. 用户在设置或侧边栏点击"退出登录"

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
      "canDeploy": false,
      "canWebSearch": true
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

### 4.8 Agent 联网(Web Search) 专属测试接口

#### POST /web-search/test

**接口名称**: 执行联网搜索测试

**接口用途**: 提供直接测试 Agent 联网功能的专属接口，用于验证搜索引擎可用性、联网结果正确性和延迟性能。

**使用场景**:
1. Agent 配置面板中"联网测试"按钮，快速验证当前联网配置是否正常
2. Mock 模式下直接运行各种联网搜索场景进行演示和测试

**请求体示例**:
```json
{
  "query": "2026年6月 最新技术趋势",
  "provider": "ddgs",
  "forceRefresh": false
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| query | 是 | 要搜索的关键词 |
| provider | 否 | 指定搜索引擎提供商，默认 ddgs |
| forceRefresh | 否 | 是否强制刷新，忽略缓存，默认 false |

**响应体示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "shouldSearch": true,
    "decisionReason": "用户主动发起的联网测试请求，因此强制进行联网搜索",
    "mode": "force",
    "used": true,
    "provider": "ddgs",
    "query": "2026年6月 最新技术趋势",
    "cacheHit": false,
    "results": [
      {
        "title": "2026 年大前端技术趋势深度解析 - 知乎",
        "body": "2026 年最值得关注的技术趋势包括：React 19 生态全面普及，AI 辅助编程成为生产环境标配，边缘计算与 WebAssembly 深度结合...",
        "href": "https://zhihu.com/xxx/2026-frontend-trends"
      },
      {
        "title": "2026 全球 AI 开发者大会核心要点",
        "body": "生成式 AI 应用框架迎来新一轮爆发，多模态 Agent 协作成为主流开发范式...",
        "href": "https://ai-dev-conference-2026.example.com/keynotes"
      }
    ],
    "error": null,
    "latencyMs": 856
  }
}
```

**优先级**: P1

---

### 4.9 沙箱任务管理接口

---

#### POST /conversations/{conversationId}/runs

**接口名称**: 创建并启动沙箱运行任务 (Run)

**接口用途**: 针对指定会话，在后台启动一个 Docker 容器并初始化任务，返回初始化后的任务详情。

**使用场景**:
1. 用户在会话中点击"沙箱执行"或发送任务指令。
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
2. 前端取第一条作为