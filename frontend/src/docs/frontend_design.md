# AgentHub 前端设计文档

## 1. 文档说明

### 1.1 文档目的

本文档用于说明 AgentHub 多 Agent 协作平台 Web 前端的设计方案，包括技术栈选择、页面布局、组件拆分、数据结构、状态管理、交互流程、Mock 逻辑、样式规范和后续扩展方案。

本文档基于 `frontend-requirements.md` 编写，目标是将需求文档中的功能要求进一步转化为可开发、可实现、可验收的前端工程方案。

### 1.2 设计目标

前端设计需要满足以下目标：

1. 支持 IM 聊天式交互。
2. 支持多会话并行管理。
3. 支持单 Agent 对话。
4. 支持多 Agent 群聊协作。
5. 支持 Orchestrator 任务拆解过程展示。
6. 支持消息流中的文本、代码、任务卡片、Artifact 卡片等多种消息类型。
7. 支持右侧 Agent 信息展示和 Artifact 预览。
8. 支持 Mock 数据驱动，便于第一阶段独立完成前端 Demo。
9. 代码结构清晰，方便后续接入后端 API 和真实 Agent API。

---

## 2. 技术栈设计

### 2.1 基础技术栈

第一阶段推荐使用：

```text
React + TypeScript + Vite + Tailwind CSS
```

选择理由：

- React 适合构建组件化前端页面。
- TypeScript 有利于定义清晰的数据模型，降低维护成本。
- Vite 启动快，适合课程项目和快速迭代。
- Tailwind CSS 适合快速构建现代化 UI，不需要编写大量自定义 CSS。

### 2.2 推荐依赖

第一阶段建议安装以下依赖：

```bash
npm install lucide-react react-markdown highlight.js
```

用途说明：

| 依赖 | 用途 |
|---|---|
| lucide-react | 图标库，用于会话、Agent、Artifact、发送按钮等图标 |
| react-markdown | 渲染 Markdown 类型消息和 README 预览 |
| highlight.js | 代码块高亮 |

### 2.3 暂不引入的技术

第一阶段不建议引入：

| 技术 | 暂不引入原因 |
|---|---|
| Redux | 当前状态规模较小，useState 足够 |
| Zustand | 可以后续扩展再引入 |
| React Query | 第一阶段不接真实后端 |
| Monaco Editor | 第一阶段只展示代码，不做复杂编辑 |
| WebSocket | 第一阶段不做真实流式通信 |
| Next.js | 当前项目更偏 Demo，Vite 更轻量 |

---

## 3. 项目目录设计

### 3.1 推荐目录结构

```text
agenthub-frontend/
├── docs/
│   ├── frontend-requirements.md
│   ├── frontend-design.md
│   └── frontend-test-record.md
│
├── ai-collaboration/
│   ├── 01-requirement-analysis.md
│   ├── 02-ui-generation-prompt.md
│   ├── 03-component-refactor-prompt.md
│   ├── 04-interaction-implementation-prompt.md
│   ├── 05-bug-fix-record.md
│   └── 06-final-summary.md
│
├── src/
│   ├── assets/
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   └── RightPanel.tsx
│   │   │
│   │   ├── chat/
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── TaskPlanCard.tsx
│   │   │   └── ArtifactMessage.tsx
│   │   │
│   │   ├── agent/
│   │   │   ├── AgentList.tsx
│   │   │   └── AgentCard.tsx
│   │   │
│   │   ├── artifact/
│   │   │   ├── ArtifactList.tsx
│   │   │   ├── ArtifactCard.tsx
│   │   │   └── ArtifactPreview.tsx
│   │   │
│   │   └── modal/
│   │       └── NewConversationModal.tsx
│   │
│   ├── mock/
│   │   └── data.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── mockReply.ts
│   │   ├── time.ts
│   │   └── id.ts
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── package.json
├── tailwind.config.js
└── README.md
```

### 3.2 目录职责说明

| 目录 | 职责 |
|---|---|
| docs | 存放前端需求、设计、测试文档 |
| ai-collaboration | 存放 AI 协作开发记录 |
| components/layout | 页面整体布局相关组件 |
| components/chat | 聊天消息相关组件 |
| components/agent | Agent 展示相关组件 |
| components/artifact | Artifact 展示和预览组件 |
| components/modal | 弹窗类组件 |
| mock | Mock 数据 |
| types | TypeScript 类型定义 |
| utils | 工具函数 |

---

## 4. 页面布局设计

### 4.1 总体布局

AgentHub 前端采用三栏式布局：

```text
┌──────────────────────────────────────────────────────────────────────┐
│                              AgentHub                                │
├──────────────────┬───────────────────────────────┬───────────────────┤
│ Sidebar          │ ChatPanel                     │ RightPanel        │
│                  │                               │                   │
│ 会话列表          │ 当前会话标题                   │ Agent 列表         │
│ 新建会话          │ 消息流                         │ Artifact 列表      │
│ 搜索框            │ 输入框                         │ Artifact 预览      │
│                  │                               │                   │
└──────────────────┴───────────────────────────────┴───────────────────┘
```

### 4.2 布局尺寸建议

桌面端建议尺寸：

```text
左侧 Sidebar：280px
中间 ChatPanel：flex-1
右侧 RightPanel：340px
页面高度：100vh
```

Tailwind 可表示为：

```tsx
<div className="h-screen flex bg-slate-100">
  <aside className="w-[280px] border-r bg-white">...</aside>
  <main className="flex-1 flex flex-col">...</main>
  <aside className="w-[340px] border-l bg-white">...</aside>
</div>
```

### 4.3 页面区域职责

| 区域 | 职责 |
|---|---|
| Sidebar | 会话导航、新建会话、搜索会话 |
| ChatPanel | 展示聊天消息、输入新消息、触发 Agent 回复 |
| RightPanel | 展示当前会话 Agent、Artifact 列表和预览 |

---

## 5. 组件设计

### 5.1 App.tsx

#### 职责

`App.tsx` 负责管理第一阶段的全局状态，并将状态和事件处理函数传递给子组件。

主要负责：

1. 保存 conversations。
2. 保存 messages。
3. 保存 artifacts。
4. 保存 activeConversationId。
5. 保存 selectedArtifactId。
6. 处理会话切换。
7. 处理发送消息。
8. 处理新建会话。
9. 组合 AppLayout。

#### 不应该负责

`App.tsx` 不应该直接写大量 UI 细节，例如消息气泡、Agent 卡片、Artifact 卡片的具体样式。

---

### 5.2 AppLayout.tsx

#### 职责

负责三栏整体布局。

#### Props 建议

```ts
interface AppLayoutProps {
  sidebar: React.ReactNode;
  chat: React.ReactNode;
  rightPanel: React.ReactNode;
}
```

#### 设计说明

使用组合式布局，避免 AppLayout 与业务数据强耦合。

---

### 5.3 Sidebar.tsx

#### 职责

负责左侧会话列表区域。

包括：

1. AgentHub 标题。
2. 新建会话按钮。
3. 搜索框。
4. 会话列表。
5. 当前会话选中态。

#### Props 建议

```ts
interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (conversationId: string) => void;
  onOpenNewConversation: () => void;
}
```

#### 内部状态

```ts
const [keyword, setKeyword] = useState('');
```

用于过滤会话列表。

---

### 5.4 ChatPanel.tsx

#### 职责

负责中间聊天主区域。

包括：

1. 当前会话标题栏。
2. 消息列表。
3. 输入框。
4. 发送事件触发。

#### Props 建议

```ts
interface ChatPanelProps {
  conversation: Conversation | undefined;
  agents: Agent[];
  messages: Message[];
  artifacts: Artifact[];
  onSendMessage: (content: string) => void;
}
```

---

### 5.5 MessageList.tsx

#### 职责

负责渲染当前会话的所有消息。

#### Props 建议

```ts
interface MessageListProps {
  messages: Message[];
  artifacts: Artifact[];
}
```

#### 交互要求

1. 消息按照 createdAt 或插入顺序展示。
2. 新消息出现时自动滚动到底部。
3. 空消息时展示欢迎提示。

---

### 5.6 MessageBubble.tsx

#### 职责

负责单条消息的展示。

根据 `message.type` 渲染不同样式：

| type | 展示组件 |
|---|---|
| text | 普通文本气泡 |
| code | CodeBlock |
| task-plan | TaskPlanCard |
| artifact | ArtifactMessage |
| status | 状态提示 |

#### Props 建议

```ts
interface MessageBubbleProps {
  message: Message;
  artifact?: Artifact;
}
```

---

### 5.7 ChatInput.tsx

#### 职责

负责底部输入框。

包括：

1. 文本输入。
2. 发送按钮。
3. Enter 发送。
4. Shift + Enter 换行。
5. 空消息拦截。

#### Props 建议

```ts
interface ChatInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}
```

---

### 5.8 CodeBlock.tsx

#### 职责

负责代码块展示。

包括：

1. 展示语言。
2. 保留缩进。
3. 复制代码按钮。
4. 可选代码高亮。

#### Props 建议

```ts
interface CodeBlockProps {
  code: string;
  language?: string;
}
```

---

### 5.9 TaskPlanCard.tsx

#### 职责

负责展示 Orchestrator 的任务拆解结果。

#### 数据来源

第一阶段可以直接从 message.content 中解析，或者让 message 增加 metadata 字段。

建议第一阶段简单处理：

```ts
content: "DesignAgent：负责页面设计\nCodeAgent：负责代码生成\nReviewAgent：负责代码审查"
```

后续可扩展为结构化字段：

```ts
metadata: {
  tasks: [
    { agentId: 'design-agent', task: '负责页面设计' },
    { agentId: 'code-agent', task: '负责代码生成' }
  ]
}
```

---

### 5.10 RightPanel.tsx

#### 职责

负责右侧信息区。

包括：

1. 当前会话 Agent 列表。
2. 当前会话 Artifact 列表。
3. 当前选中 Artifact 预览。

#### Props 建议

```ts
interface RightPanelProps {
  agents: Agent[];
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  onSelectArtifact: (artifactId: string) => void;
}
```

---

### 5.11 NewConversationModal.tsx

#### 职责

负责新建会话弹窗。

包括：

1. 输入会话标题。
2. 选择会话模式。
3. 选择 Agent 或群聊模板。
4. 创建会话。
5. 取消创建。

#### Props 建议

```ts
interface NewConversationModalProps {
  open: boolean;
  agents: Agent[];
  onClose: () => void;
  onCreateConversation: (payload: CreateConversationPayload) => void;
}
```

---

## 6. 类型设计

### 6.1 基础类型

```ts
export type ConversationMode = 'single' | 'group';

export type MessageRole = 'user' | 'agent' | 'orchestrator' | 'system';

export type MessageType =
  | 'text'
  | 'code'
  | 'artifact'
  | 'task-plan'
  | 'status';

export type ArtifactType = 'code' | 'html' | 'markdown' | 'diff' | 'deploy';
```

### 6.2 Agent 类型

```ts
export interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
}
```

### 6.3 Conversation 类型

```ts
export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
}
```

### 6.4 Message 类型

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
}
```

### 6.5 Artifact 类型

```ts
export interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: ArtifactType;
  content: string;
  createdAt: string;
}
```

### 6.6 新建会话 Payload

```ts
export interface CreateConversationPayload {
  title: string;
  mode: ConversationMode;
  agentIds: string[];
}
```

---

## 7. 状态管理设计

### 7.1 第一阶段状态

第一阶段使用 React `useState`。

```ts
const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
const [messages, setMessages] = useState<Message[]>(mockMessages);
const [artifacts, setArtifacts] = useState<Artifact[]>(mockArtifacts);
const [activeConversationId, setActiveConversationId] = useState<string>('conv-1');
const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
```

### 7.2 派生数据

当前会话：

```ts
const activeConversation = conversations.find(
  item => item.id === activeConversationId
);
```

当前会话消息：

```ts
const activeMessages = messages.filter(
  item => item.conversationId === activeConversationId
);
```

当前会话 Agent：

```ts
const activeAgents = mockAgents.filter(agent =>
  activeConversation?.agentIds.includes(agent.id)
);
```

当前会话 Artifact：

```ts
const activeArtifacts = artifacts.filter(
  item => item.conversationId === activeConversationId
);
```

当前选中 Artifact：

```ts
const selectedArtifact = artifacts.find(
  item => item.id === selectedArtifactId
);
```

### 7.3 状态更新原则

1. 所有会话、消息、Artifact 状态集中在 App.tsx。
2. 子组件尽量通过 props 接收数据。
3. 子组件通过回调函数通知 App.tsx 更新状态。
4. 不在多个组件中重复维护同一份数据。
5. Mock 回复逻辑放入 `utils/mockReply.ts`，不要写死在 UI 组件中。

---

## 8. Mock 数据设计

### 8.1 Mock Agent

建议提供以下 Agent：

| Agent | 职责 |
|---|---|
| Orchestrator | 任务理解、拆解、调度、汇总 |
| DesignAgent | 页面结构和交互设计 |
| CodeAgent | 前端代码生成 |
| ReviewAgent | 代码审查和优化建议 |
| DocAgent | 文档生成 |

### 8.2 Mock Conversation

建议默认提供两个会话：

1. 单聊：React 登录页生成。
2. 群聊：多 Agent 官网生成任务。

### 8.3 Mock Message

默认消息应覆盖以下类型：

1. 用户文本消息。
2. Orchestrator 任务拆解消息。
3. Agent 文本消息。
4. CodeAgent 代码消息。
5. Artifact 卡片消息。

### 8.4 Mock Artifact

默认 Artifact 应包含：

1. HomePage.tsx。
2. README.md。
3. preview.html。

---

## 9. 核心交互流程设计

### 9.1 会话切换流程

```text
用户点击 Sidebar 中的会话
↓
调用 onSelectConversation(conversationId)
↓
更新 activeConversationId
↓
ChatPanel 显示对应 messages
↓
RightPanel 显示对应 agents 和 artifacts
↓
selectedArtifactId 可重置为空或默认选择第一个 artifact
```

设计建议：

- 切换会话后，可默认选中该会话的第一个 Artifact。
- 如果该会话没有 Artifact，则预览区显示空状态。

---

### 9.2 发送消息流程

```text
用户在 ChatInput 输入内容
↓
点击发送或按 Enter
↓
ChatInput 校验内容是否为空
↓
调用 onSendMessage(content)
↓
App.tsx 追加用户消息
↓
根据当前 conversation.mode 判断回复逻辑
↓
调用 generateMockReply
↓
追加 Agent 回复消息
↓
如有产物，追加 artifacts
↓
更新会话 lastMessage 和 updatedAt
```

---

### 9.3 单聊回复流程

```text
用户发送消息
↓
判断当前会话为 single
↓
获取当前会话绑定的 Agent
↓
根据 Agent 类型生成回复
↓
追加 Agent 消息
↓
如为 CodeAgent，生成 code Artifact
```

示例：

```text
User：帮我写一个登录页面。
CodeAgent：好的，下面是 React 代码。
CodeAgent：返回 LoginPage.tsx 代码块。
系统生成 Artifact：LoginPage.tsx。
```

---

### 9.4 群聊回复流程

```text
用户发送消息
↓
判断当前会话为 group
↓
Orchestrator 发送状态消息
↓
Orchestrator 发送任务拆解卡片
↓
DesignAgent 发送设计方案
↓
CodeAgent 发送代码块
↓
ReviewAgent 发送审查建议
↓
DocAgent 发送文档摘要
↓
Orchestrator 发送汇总消息
↓
生成多个 Artifact
```

群聊流程是项目演示重点，需要在 UI 上清楚呈现。

---

### 9.5 Artifact 预览流程

```text
用户点击右侧 ArtifactCard
↓
调用 onSelectArtifact(artifactId)
↓
更新 selectedArtifactId
↓
ArtifactPreview 根据类型渲染内容
```

不同类型渲染策略：

| type | 渲染方式 |
|---|---|
| code | pre + code |
| markdown | react-markdown |
| html | iframe 或源码预览 |
| diff | 后续支持 |
| deploy | 后续支持 |

第一阶段 html 可以先显示源码或简单 iframe。

---

## 10. Mock 回复工具设计

### 10.1 文件位置

```text
src/utils/mockReply.ts
```

### 10.2 函数设计

建议定义：

```ts
interface MockReplyResult {
  messages: Message[];
  artifacts: Artifact[];
}

export function generateMockReply(params: {
  conversation: Conversation;
  agents: Agent[];
  userContent: string;
}): MockReplyResult {
  if (conversation.mode === 'single') {
    return generateSingleAgentReply(params);
  }

  return generateGroupAgentReply(params);
}
```

### 10.3 单聊回复函数

```ts
function generateSingleAgentReply(params: {
  conversation: Conversation;
  agents: Agent[];
  userContent: string;
}): MockReplyResult {
  // 根据当前 Agent 返回不同回复
}
```

### 10.4 群聊回复函数

```ts
function generateGroupAgentReply(params: {
  conversation: Conversation;
  agents: Agent[];
  userContent: string;
}): MockReplyResult {
  // 返回 Orchestrator + 多 Agent 的模拟协作消息
}
```

### 10.5 ID 和时间工具

建议单独创建：

```text
src/utils/id.ts
src/utils/time.ts
```

示例：

```ts
export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

```ts
export function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

---

## 11. 样式设计

### 11.1 视觉风格

整体风格为现代 SaaS + IM 工作台。

关键词：

- 简洁
- 专业
- 清晰
- 有层次
- 适合演示

### 11.2 色彩建议

| 场景 | 样式建议 |
|---|---|
| 页面背景 | bg-slate-100 |
| 面板背景 | bg-white |
| 边框 | border-slate-200 |
| 用户消息 | bg-blue-600 text-white |
| Agent 消息 | bg-white border |
| Orchestrator 消息 | bg-indigo-50 border-indigo-200 |
| Artifact 卡片 | bg-slate-50 hover:bg-slate-100 |
| 代码块 | bg-slate-950 text-slate-100 |

### 11.3 字体层级

| 元素 | 样式建议 |
|---|---|
| 页面标题 | text-lg font-semibold |
| 会话标题 | text-sm font-medium |
| 消息正文 | text-sm |
| 辅助信息 | text-xs text-slate-500 |
| Agent 标签 | text-xs rounded-full |

### 11.4 交互状态

需要设计以下状态：

1. 会话项 hover。
2. 会话项 selected。
3. 按钮 hover。
4. Artifact hover。
5. 输入框 focus。
6. Modal 打开和关闭。

---

## 12. 空状态设计

### 12.1 无消息状态

当当前会话没有消息时，ChatPanel 显示：

```text
开始与 Agent 协作吧
发送一个任务，AgentHub 将为你拆解并生成产物。
```

### 12.2 无 Artifact 状态

当当前会话没有 Artifact 时，RightPanel 显示：

```text
暂无产物
Agent 生成代码、文档或网页后会显示在这里。
```

### 12.3 未选择 Artifact 状态

当没有选中 Artifact 时，ArtifactPreview 显示：

```text
请选择一个产物进行预览
```

### 12.4 搜索无结果状态

当搜索会话没有结果时，Sidebar 显示：

```text
没有找到相关会话
```

---

## 13. 错误处理设计

### 13.1 空输入处理

用户输入为空或全是空格时，不发送消息。

### 13.2 当前会话不存在

如果 activeConversationId 不存在：

1. 默认选择第一个会话。
2. 如果没有任何会话，显示空状态。

### 13.3 Artifact 不存在

如果 selectedArtifactId 不存在：

1. 预览区显示空状态。
2. 不抛出运行时错误。

### 13.4 数据缺失

如果 Agent 信息缺失：

1. 使用默认头像。
2. 使用 Unknown Agent 名称。

---

## 14. 后续 API 接入设计

第一阶段使用 Mock 数据。

后续接入后端时，可以新增 `src/services` 目录：

```text
src/services/
├── conversationService.ts
├── messageService.ts
├── agentService.ts
└── artifactService.ts
```

### 14.1 会话接口

```ts
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations');
  return res.json();
}
```

### 14.2 消息接口

```ts
export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`);
  return res.json();
}
```

### 14.3 发送消息接口

```ts
export async function sendMessage(conversationId: string, content: string) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  return res.json();
}
```

### 14.4 Artifact 接口

```ts
export async function fetchArtifacts(conversationId: string): Promise<Artifact[]> {
  const res = await fetch(`/api/conversations/${conversationId}/artifacts`);
  return res.json();
}
```

---

## 15. 流式输出扩展设计

后续如果需要模拟真实 Agent 输出，可以支持 SSE 或 WebSocket。

### 15.1 SSE 方案

前端发送消息后，建立 SSE 连接，逐步接收 Agent 输出。

适合场景：

- 大模型流式输出。
- Orchestrator 状态更新。
- 多 Agent 顺序返回。

### 15.2 WebSocket 方案

前端与后端建立 WebSocket，后端推送不同 Agent 的实时状态。

适合场景：

- 多 Agent 并行状态。
- 长任务状态更新。
- 部署状态推送。

### 15.3 第一阶段处理

第一阶段不实现真实流式输出，可以使用 `setTimeout` 模拟多个 Agent 依次回复。

---

## 16. 开发顺序建议

### 16.1 第一步：项目初始化

完成：

1. Vite + React + TS 项目创建。
2. Tailwind 配置。
3. 基础目录创建。
4. 安装 lucide-react、react-markdown、highlight.js。

### 16.2 第二步：类型和 Mock 数据

完成：

1. `src/types/index.ts`。
2. `src/mock/data.ts`。
3. 确保 mock 数据覆盖单聊和群聊。

### 16.3 第三步：基础布局

完成：

1. AppLayout。
2. Sidebar。
3. ChatPanel。
4. RightPanel。

此时页面能展示三栏。

### 16.4 第四步：消息展示

完成：

1. MessageList。
2. MessageBubble。
3. CodeBlock。
4. TaskPlanCard。
5. ArtifactMessage。

### 16.5 第五步：核心交互

完成：

1. 会话切换。
2. 发送消息。
3. 单聊 Mock 回复。
4. 群聊 Mock 回复。

### 16.6 第六步：Artifact 预览

完成：

1. ArtifactList。
2. ArtifactCard。
3. ArtifactPreview。
4. 点击预览。

### 16.7 第七步：新建会话

完成：

1. NewConversationModal。
2. 单聊模板。
3. 群聊模板。
4. 创建后自动切换。

### 16.8 第八步：视觉优化和验收

完成：

1. hover、selected、focus 状态。
2. 空状态。
3. 响应式基本适配。
4. 代码整理。
5. 文档补充。

---

## 17. 与 AI 协作开发的规范

### 17.1 每次让 AI 修改代码的原则

向 AI 提需求时，需要明确：

1. 当前目标。
2. 修改范围。
3. 不允许破坏的已有功能。
4. 期望输出文件。
5. 验收标准。

示例：

```text
请在不改变当前三栏布局的基础上，实现会话切换功能。
要求点击左侧会话后，中间消息和右侧 Agent / Artifact 同步切换。
不要接后端，不要引入新的状态管理库。
请只修改 App.tsx、Sidebar.tsx、ChatPanel.tsx、RightPanel.tsx。
```

### 17.2 AI 协作记录内容

每次开发应记录：

1. Prompt。
2. AI 生成结果。
3. 人工检查发现的问题。
4. 修复方式。
5. 最终是否采用。

### 17.3 推荐记录文件

```text
ai-collaboration/
├── 01-requirement-analysis.md
├── 02-ui-generation-prompt.md
├── 03-component-refactor-prompt.md
├── 04-interaction-implementation-prompt.md
├── 05-bug-fix-record.md
└── 06-final-summary.md
```

---

## 18. 前端验收方案

### 18.1 手动测试清单

| 测试项 | 期望结果 |
|---|---|
| 打开页面 | 三栏布局正常显示 |
| 点击会话 | 中间消息切换 |
| 点击会话 | 右侧 Agent 和 Artifact 切换 |
| 搜索会话 | 会话列表过滤 |
| 发送空消息 | 不发送 |
| 发送普通消息 | 用户消息追加 |
| 单聊发送消息 | 单个 Agent 回复 |
| 群聊发送消息 | 多个 Agent 依次回复 |
| 点击 Artifact | 右侧显示预览 |
| 新建单聊 | 左侧出现新会话 |
| 新建群聊 | 右侧显示多个 Agent |

### 18.2 演示验收清单

答辩演示时必须展示：

1. 左侧多会话列表。
2. 单聊 CodeAgent 生成代码。
3. 群聊 Orchestrator 拆解任务。
4. 多个 Agent 依次回复。
5. CodeAgent 代码块。
6. ReviewAgent 审查建议。
7. DocAgent 文档摘要。
8. Artifact 卡片和预览。

---

## 19. 第一阶段完成标准

满足以下条件即可认为前端第一阶段完成：

1. 项目可以正常启动。
2. 页面结构清晰，符合三栏设计。
3. 支持会话切换。
4. 支持发送消息。
5. 支持单聊模拟回复。
6. 支持群聊多 Agent 模拟回复。
7. 支持 Orchestrator 任务拆解展示。
8. 支持代码块展示。
9. 支持 Artifact 卡片展示和预览。
10. 组件拆分清晰。
11. Mock 数据和类型定义独立维护。
12. 有需求文档、设计文档和 AI 协作记录。

---

## 20. 总结

AgentHub 前端设计的核心不是简单做一个聊天页面，而是通过 IM 界面表达“多 Agent 协作完成任务”的完整过程。

前端第一阶段应优先完成以下闭环：

```text
用户输入任务
↓
Orchestrator 拆解任务
↓
DesignAgent / CodeAgent / ReviewAgent / DocAgent 依次产出
↓
生成 Artifact
↓
用户在右侧查看和预览 Artifact
```

只要这个闭环清晰、稳定、可演示，就能较好支撑 AgentHub 课题对 IM 核心体验、多 Agent 调度和产物内联展示的要求。

