# AgentHub 前后端 API 协作契约

**版本**: v2.0.0  
**更新日期**: 2026-05-25  
**状态**: 正式版

## 1. Base URL

所有接口的基础路径前缀统一为：
```
/api/v1
```

## 2. 统一响应结构

```typescript
interface BaseApiResponse<T> {
  code: number;      // 0 表示成功，非0表示业务错误
  message: string;   // 响应描述信息
  data: T;          // 实际返回数据体
}
```

---

## 3. 接口列表

### 3.1 获取会话列表
`GET /conversations`
- 分页获取当前用户的所有会话
- Query 参数: page, pageSize, mode, keyword

### 3.2 创建新会话
`POST /conversations`
- 新建单聊或群聊会话

### 3.3 获取会话详情
`GET /conversations/{conversationId}`
- 获取单个会话元信息

### 3.4 更新会话信息
`PUT /conversations/{conversationId}`
- 修改会话标题、成员等属性

### 3.5 删除会话
`DELETE /conversations/{conversationId}`
- 逻辑/物理删除指定会话

---

### 3.6 获取 @Agent 候选列表
`POST /conversations/{conversationId}/mention`
- 用户在输入框输入 @ 时，弹出当前会话可选的 Agent 列表
- Request Body: `{ keyword?: string; query?: string; }`
- Response Data: `AgentMentionItem[]`
- 说明：只返回当前会话内的 Agent，默认排除 Orchestrator

### 3.7 发送消息
`POST /conversations/{conversationId}/messages`
- 发送用户文本消息
- Request Body: `{ content: string; targetAgentId?: string; targetAgentID?: string; }`
- 推荐前端明确传 targetAgentId，指定 Agent 直接回复

---

### 3.8 手动压缩上下文
`POST /conversations/{conversationId}/context/compress`
- 用户点击"压缩上下文"按钮，后端执行上下文摘要
- Request Body: 空对象 `{}`
- Response Data: `{ summary: ConversationSummary; compressed: boolean; }`
- 说明：只支持群聊，不删除历史消息，仅影响后续模型上下文

### 3.9 获取长期记忆列表
`GET /conversations/{conversationId}/memories`
- 展示"长期记忆管理"面板数据
- Response Data: `MemoryItem[]`

### 3.10 删除长期记忆
`DELETE /conversations/{conversationId}/memories/{memoryId}`
- 软删除指定记忆，不再进入模型上下文

### 3.11 获取已 pinned 消息列表
`GET /conversations/{conversationId}/pins`
- 获取用户重点标记的重要消息

### 3.12 Pin 一条消息
`POST /conversations/{conversationId}/messages/{messageId}/pin`
- 用户标记重要消息，重复 Pin 不会重复创建

### 3.13 取消 Pin
`DELETE /conversations/{conversationId}/messages/{messageId}/pin`
- 移除指定消息的 pin 状态

---

### 3.14 获取会话下的产物列表
`GET /conversations/{conversationId}/artifacts`
- 获取指定会话中的所有产物（Artifact）元数据列表
- Response Data: `ArtifactMeta[]`

### 3.15 获取单个产物详情
`GET /artifacts/{artifactId}`
- 获取指定产物的详细内容及元数据
- Response Data: `ArtifactDetail`

### 3.16 修改/保存产物内容
`PUT /artifacts/{artifactId}`
- 用户手动编辑产物后，保存更新产物内容（后端会生成新的版本）
- Request Body: `{ content: string }`
- Response Data: `ArtifactDetail`

---

## 4. 新增类型定义

```typescript
type MemoryCategory = 'preference' | 'project' | 'profile' | 'constraint';

interface AgentMentionItem {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: 'online' | 'offline';
}

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

interface CompressContextResult {
  summary: ConversationSummary;
  compressed: boolean;
}

interface MemoryItem {
  id: string;
  conversationId: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  sourceMessageId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PinItem {
  id: string;
  conversationId: string;
  messageId: string;
  createdAt: string;
  message: Message;
}

interface ArtifactMeta {
  id: string;
  conversationId: string;
  title: string;
  type: 'code' | 'html' | 'markdown' | 'diff' | 'deploy';
  description?: string;
  size?: number;
  createdAt: string;
}

interface ArtifactDetail extends ArtifactMeta {
  content: string;
}
```

---

## 5. 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0.0 | 2026-05-24 | 初始基础接口定义 |
| v1.3.0 | 2026-05-25 | 临时添加 mention 和 compress 接口用于快速开发 |
| v2.0.0 | 2026-05-25 | 完全对齐后端正式接口文档，新增 mention 搜索、/context/compress、长期记忆、Pin 消息 等 8 个完整新接口 |
| v2.1.0 | 2026-05-25 | 补充产物（Artifact）相关接口（获取列表、获取详情、更新内容）以及全屏编辑支持 |
| v2.2.0 | 2026-05-28 | [新增及补充说明] 补充智能体配置管理 API 以及会话（Chat/Agent Chat）的置顶、归档 API 接口支持 |

---

## 6. [新增] 智能体配置与会话管理补充接口 (v2.2.0 补充)

### 6.1 获取智能体列表
`GET /agents`
- 获取系统所有智能体（联系人）列表
- Query 参数: page, pageSize, category, provider, keyword, enabled
- Response Data: `PaginatedData<AgentListItem>`

### 6.2 新建智能体
`POST /agents`
- 创建新的智能体配置
- Request Body: `Omit<Agent, 'id' | 'lastUsedAt'>`
- Response Data: `Agent`

### 6.3 获取单个智能体详情
`GET /agents/{agentId}`
- 获取单个智能体的完整配置参数
- Response Data: `Agent`

### 6.4 更新智能体配置
`PUT /agents/{agentId}`
- 修改智能体配置（如名称、描述、System Prompt、模型参数及工具集等）
- Request Body: `Partial<Agent>`
- Response Data: `Agent`

### 6.5 删除智能体
`DELETE /agents/{agentId}`
- 注销/删除指定的智能体
- Response Data: `BaseApiResponse<boolean>`

---

### 6.6 会话置顶/取消置顶
`PUT /conversations/{conversationId}/pin`
- 对普通 Chat 或 Agent Chat 进行置顶/取消置顶操作
- Request Body: `{ isPinned: boolean }`
- Response Data: `Conversation`

### 6.7 会话归档/激活
`PUT /conversations/{conversationId}/archive`
- 对普通 Chat 或 Agent Chat 进行归档/激活操作
- Request Body: `{ isArchived: boolean }`
- Response Data: `Conversation`

### 6.8 获取智能体专属会话 (联系人会话) [v2.2.0 补充]
`GET /users/{userId}/agents/{agentId}/contact`
- 获取或者初始化指定用户与特定 Agent 的一对一专属联系人会话
- Response Data: `AgentContactResponse` (包含 contactId, conversationId, 以及 Conversation 详细对象)
