# AgentHub 前端需求文档

## 1. 文档说明

### 1.1 文档目的

本文档用于定义 AgentHub 多 Agent 协作平台的前端需求，明确前端需要实现的页面结构、核心功能、交互流程、数据模型、边界条件、非功能需求和验收标准。

本文档将作为后续前端开发、AI 协作生成代码、功能验收、答辩说明和技术文档编写的基础依据。

### 1.2 适用范围

本文档仅覆盖 AgentHub 的 Web 前端部分，主要包括：

- IM 聊天式主界面
- 会话列表与会话切换
- 单 Agent 对话
- 多 Agent 群聊协作
- Orchestrator 任务拆解展示
- 消息流展示
- 代码块展示
- Artifact 产物卡片展示
- Agent 信息面板
- Artifact 预览面板
- Mock 数据驱动的前端交互

第一阶段不包含真实后端接口、不包含真实大模型 API 调用、不包含真实部署能力、不包含用户权限系统。

---

## 2. 项目背景

AgentHub 是一个多 Agent 协作平台，平台采用 IM 聊天作为核心交互方式。用户可以像使用飞书、微信或 Slack 一样，通过新建会话、发送消息、切换聊天对象的方式与不同 AI Agent 进行交互。

在 AgentHub 中，每个 Agent 可以被理解为一个具备特定能力的“聊天对象”。用户既可以与单个 Agent 进行一对一对话，也可以在一个群聊中引入多个 Agent，由 Orchestrator 负责理解需求、拆解任务、分派子任务，并将多个 Agent 的产出聚合展示。

前端的核心价值是将多 Agent 协作过程以可视化、可交互、可演示的方式呈现出来，让用户能够直观看到：

- 当前有哪些会话
- 当前正在和哪个 Agent 或哪些 Agent 协作
- 用户提出了什么需求
- Orchestrator 如何拆解任务
- 不同 Agent 如何分别完成设计、代码、审查、文档等任务
- 最终生成了哪些代码、文档、网页预览等产物

---

## 3. 产品定位

AgentHub 前端是一个面向 AI 协作开发场景的 Web 工作台。

它不是普通聊天机器人页面，而是一个以 IM 交互为入口、以多 Agent 协作为核心、以产物生成为目标的协作平台前端。

### 3.1 产品关键词

- IM 聊天式交互
- 多 Agent 协作
- Orchestrator 任务调度
- 多会话并行
- 上下文连续
- Artifact 产物展示
- 代码 / 文档 / 网页预览
- 前端可演示 Demo

### 3.2 目标用户

第一阶段目标用户主要包括：

- 课程项目评审老师
- 答辩现场观众
- 平台开发者
- 希望通过 AI Agent 辅助生成代码、文档、网页的用户

### 3.3 典型使用场景

用户进入 AgentHub 后，可以新建一个会话，选择 CodeAgent，让它生成一个 React 页面；也可以新建一个多 Agent 群聊，输入“帮我生成一个 Todo List 页面”，平台中的 Orchestrator 会自动将任务拆解给 DesignAgent、CodeAgent、ReviewAgent 和 DocAgent，多个 Agent 依次在聊天流中回复，最后生成代码文件、README 文档和网页预览卡片。

---

## 4. 前端建设目标

### 4.1 第一阶段目标

第一阶段目标是完成一个可运行、可展示、可扩展的前端 MVP。

具体目标：

1. 搭建 AgentHub Web 前端项目。
2. 实现三栏式 IM 工作台布局。
3. 使用 Mock 数据模拟会话、消息、Agent 和 Artifact。
4. 支持会话切换。
5. 支持发送消息。
6. 支持单 Agent 对话模拟。
7. 支持多 Agent 群聊协作模拟。
8. 支持 Orchestrator 任务拆解过程展示。
9. 支持代码块、任务卡片、Artifact 卡片等富消息展示。
10. 支持右侧 Agent 信息和 Artifact 预览。
11. 预留后续接入后端 API 和真实 Agent API 的扩展位置。

### 4.2 第二阶段目标

第二阶段可在第一阶段基础上继续扩展：

1. 接入真实后端接口。
2. 将 Mock 数据替换为 API 数据。
3. 支持真实会话持久化。
4. 支持真实大模型 API 或本地模型 API 调用。
5. 支持流式输出。
6. 支持 WebSocket 或 SSE。
7. 支持代码 Diff 视图。
8. 支持更完整的 Artifact 版本管理。

### 4.3 第三阶段目标

第三阶段属于增强功能，可视时间选择实现：

1. 支持真实网页 iframe 预览。
2. 支持 Monaco Editor 代码编辑器。
3. 支持选中代码后对话式修改。
4. 支持一键部署状态展示。
5. 支持多端适配。
6. 支持 Agent 自定义创建页面。

---

## 5. 功能范围

### 5.1 第一阶段需要实现的功能

第一阶段必须实现以下功能：

| 模块 | 功能 | 是否必须 |
|---|---|---|
| 主布局 | 三栏式工作台 | 必须 |
| 会话列表 | 展示会话列表 | 必须 |
| 会话列表 | 搜索会话 | 建议实现 |
| 会话列表 | 新建会话入口 | 必须 |
| 会话切换 | 点击切换当前会话 | 必须 |
| 聊天窗口 | 展示当前会话标题 | 必须 |
| 聊天窗口 | 展示消息流 | 必须 |
| 聊天窗口 | 用户输入消息 | 必须 |
| 聊天窗口 | 发送消息 | 必须 |
| 消息类型 | 普通文本消息 | 必须 |
| 消息类型 | 代码块消息 | 必须 |
| 消息类型 | 任务拆解消息 | 必须 |
| 消息类型 | Artifact 卡片消息 | 必须 |
| 单聊模式 | 模拟单 Agent 回复 | 必须 |
| 群聊模式 | 模拟 Orchestrator 调度 | 必须 |
| 群聊模式 | 模拟多 Agent 依次回复 | 必须 |
| 右侧面板 | 展示 Agent 列表 | 必须 |
| 右侧面板 | 展示 Artifact 列表 | 必须 |
| 右侧面板 | 点击 Artifact 查看预览 | 必须 |

### 5.2 第一阶段暂不实现的功能

第一阶段明确不做以下功能：

1. 不做登录注册。
2. 不做真实用户权限。
3. 不接真实数据库。
4. 不接真实大模型 API。
5. 不接 Claude Code、Codex、OpenCode 等真实 Agent 平台。
6. 不做真实代码执行。
7. 不做真实文件上传下载。
8. 不做真实部署。
9. 不做复杂多人协同。
10. 不做移动端完整适配。
11. 不做桌面端。
12. 不做复杂状态管理库。

---

## 6. 页面整体结构需求

### 6.1 页面布局

AgentHub 前端主页面采用三栏布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ AgentHub                                                     │
├───────────────┬────────────────────────────┬─────────────────┤
│ 左侧会话列表   │ 中间聊天窗口                │ 右侧详情面板      │
│               │                            │                 │
│ 新建会话       │ 当前会话标题                 │ Agent 列表       │
│ 搜索框         │ 消息流                       │ Artifact 列表    │
│ 会话列表       │ 输入框                       │ Artifact 预览    │
└───────────────┴────────────────────────────┴─────────────────┘
```

### 6.2 左侧区域定位

左侧区域是会话导航区，用于管理和切换不同会话。

左侧区域应体现 IM 产品特征，类似微信、飞书、Slack 的会话列表。

### 6.3 中间区域定位

中间区域是核心交互区，用于展示用户和 Agent 的对话内容。

中间区域是用户完成任务的主要入口，包括消息阅读、消息输入、任务反馈和 Agent 协作过程展示。

### 6.4 右侧区域定位

右侧区域是上下文辅助区，用于展示当前会话的 Agent 成员、能力标签、生成产物和产物预览。

右侧区域帮助用户理解当前任务由哪些 Agent 参与，以及最终产生了哪些可用结果。

---

## 7. 左侧会话列表需求

### 7.1 基础展示

左侧会话列表应包含以下元素：

1. 平台名称：AgentHub。
2. 新建会话按钮。
3. 会话搜索框。
4. 会话列表。
5. 每个会话项显示：
   - 会话头像或图标
   - 会话标题
   - 会话模式标签
   - 最后一条消息摘要
   - 最近更新时间

### 7.2 会话类型

会话分为两类：

1. 单聊会话。
2. 群聊会话。

单聊会话表示用户与单个 Agent 对话。

群聊会话表示用户与多个 Agent 协作，通常包含 Orchestrator 和多个子 Agent。

### 7.3 会话列表交互

会话列表需要支持以下交互：

1. 点击会话项后切换当前会话。
2. 当前选中的会话需要有明显选中态。
3. 鼠标悬停时需要有 hover 效果。
4. 搜索框输入关键词后，可以按会话标题过滤会话。
5. 点击新建会话按钮后，打开新建会话弹窗。

### 7.4 会话项状态

会话项至少包含以下状态：

- 默认状态
- Hover 状态
- 选中状态

后续可扩展：

- 未读状态
- 置顶状态
- 归档状态

第一阶段只要求默认、hover、选中状态。

---

## 8. 新建会话需求

### 8.1 新建会话入口

左侧区域提供“新建会话”按钮。

用户点击后弹出新建会话 Modal。

### 8.2 新建会话 Modal 内容

Modal 中需要提供以下选项：

1. 会话标题输入框。
2. 会话模式选择：
   - 单聊模式
   - 群聊模式
3. Agent 选择：
   - CodeAgent
   - ReviewAgent
   - DocAgent
   - 多 Agent 群聊模板
4. 创建按钮。
5. 取消按钮。

### 8.3 新建会话逻辑

用户创建新会话后：

1. 左侧会话列表新增该会话。
2. 当前会话自动切换为新建会话。
3. 中间聊天窗口显示空消息或欢迎消息。
4. 右侧面板显示该会话对应的 Agent 列表。

### 8.4 第一阶段简化规则

第一阶段可以只提供以下三种模板：

1. 单聊 CodeAgent。
2. 单聊 ReviewAgent。
3. 多 Agent 群聊。

---

## 9. 中间聊天窗口需求

### 9.1 聊天窗口结构

中间聊天窗口应包含：

1. 顶部会话信息栏。
2. 消息列表区域。
3. 底部输入区域。

### 9.2 顶部会话信息栏

顶部信息栏需要展示：

1. 当前会话标题。
2. 当前会话模式标签。
3. 当前参与 Agent 数量。
4. 可选的更多操作按钮。

### 9.3 消息列表区域

消息列表区域用于展示当前会话下的所有消息。

需要支持的消息来源：

1. 用户。
2. 普通 Agent。
3. Orchestrator。
4. 系统。

需要支持的消息类型：

1. 普通文本消息。
2. 代码块消息。
3. 任务拆解消息。
4. Artifact 产物消息。
5. 状态消息。

### 9.4 底部输入区域

底部输入区域需要包含：

1. 文本输入框。
2. 发送按钮。
3. 可选快捷操作按钮。

第一阶段发送逻辑：

1. 用户输入文本。
2. 点击发送或按 Enter。
3. 将用户消息追加到消息列表。
4. 根据当前会话模式触发 Mock Agent 回复。
5. 回复完成后更新 Artifact 列表。

### 9.5 输入框交互规则

输入框应满足：

1. 空内容不能发送。
2. 发送后清空输入框。
3. 发送后消息列表自动滚动到底部。
4. Shift + Enter 可换行。
5. Enter 可发送消息。

第一阶段如果实现成本较高，可以先只支持点击按钮发送。

---

## 10. 消息展示需求

### 10.1 用户消息

用户消息应显示在右侧或使用明显区别于 Agent 的气泡样式。

用户消息包含：

- 用户名称
- 消息内容
- 发送时间

### 10.2 Agent 消息

Agent 消息应显示在左侧。

Agent 消息包含：

- Agent 头像
- Agent 名称
- Agent 能力标签，可选
- 消息内容
- 发送时间

### 10.3 Orchestrator 消息

Orchestrator 是群聊模式中的主协调 Agent，需要有更明显的身份标识。

Orchestrator 消息应展示为调度类消息，可以使用特殊边框、背景或标签突出。

### 10.4 系统状态消息

系统状态消息用于展示：

- 正在分析任务
- 正在调用 Agent
- 已完成生成
- 已生成 Artifact

第一阶段可以用静态状态消息模拟。

### 10.5 代码块消息

代码块消息需要支持：

1. 显示语言类型，例如 tsx、js、md。
2. 保留代码格式。
3. 支持复制按钮。
4. 视觉上与普通文本区分。

第一阶段可以使用 pre + code 实现。

后续可以接入 highlight.js 或 Monaco Editor。

### 10.6 Artifact 卡片消息

Artifact 卡片用于展示 Agent 生成的产物。

卡片内容包括：

1. 产物标题。
2. 产物类型。
3. 产物描述。
4. 创建时间。
5. 点击查看按钮。

Artifact 类型包括：

- code
- html
- markdown
- diff
- deploy

第一阶段建议支持 code、html、markdown 三类。

---

## 11. 单聊模式需求

### 11.1 单聊模式定义

单聊模式表示用户只与一个 Agent 进行对话。

典型场景：

- 用户让 CodeAgent 生成 React 组件。
- 用户让 ReviewAgent 检查代码。
- 用户让 DocAgent 生成 README 文档。

### 11.2 单聊流程

单聊模式的前端流程如下：

```text
用户输入需求
↓
前端追加用户消息
↓
Mock 当前 Agent 回复
↓
如果回复中包含产物，则生成 Artifact
↓
更新消息流和右侧 Artifact 面板
```

### 11.3 示例流程

用户输入：

```text
帮我写一个 React 登录页面。
```

CodeAgent 回复：

```text
好的，下面是一个基础的 React 登录页面组件。
```

随后显示代码块：

```tsx
export default function LoginPage() {
  return <div>Login Page</div>;
}
```

并生成 Artifact：

```text
LoginPage.tsx
```

---

## 12. 群聊模式需求

### 12.1 群聊模式定义

群聊模式表示一个会话中包含多个 Agent。用户发送任务后，由 Orchestrator 负责理解需求、拆解任务、调用不同 Agent，并汇总结果。

群聊模式是本项目区别于普通 Chatbot 的关键功能。

### 12.2 群聊参与角色

第一阶段群聊建议包含以下角色：

1. Orchestrator：任务理解、任务拆解、调度和汇总。
2. DesignAgent：页面结构和交互设计。
3. CodeAgent：前端代码生成。
4. ReviewAgent：代码审查和优化建议。
5. DocAgent：文档生成。

### 12.3 群聊协作流程

群聊模式下，用户发送消息后，前端模拟以下流程：

```text
用户：帮我生成一个 Todo List 页面。

Orchestrator：我已理解你的需求，正在拆解任务。

Orchestrator：任务拆解如下：
- DesignAgent：负责页面结构设计
- CodeAgent：负责 React 代码生成
- ReviewAgent：负责代码质量检查
- DocAgent：负责 README 文档说明

DesignAgent：我建议页面包含输入框、任务列表、完成状态和清空按钮。

CodeAgent：下面是生成的 React 代码。

ReviewAgent：代码结构清晰，但建议进一步拆分组件，并补充空状态处理。

DocAgent：我已生成 README 文档摘要。

Orchestrator：任务已完成，已生成以下产物：App.tsx、README.md、preview.html。
```

### 12.4 群聊消息展示要求

1. 每个 Agent 的消息必须显示不同头像。
2. 每个 Agent 的名称必须清晰可见。
3. Orchestrator 的任务拆解消息需要以卡片形式展示。
4. CodeAgent 的代码结果需要以代码块展示。
5. 最终产物需要以 Artifact 卡片展示。
6. 消息应该按时间顺序展示。

### 12.5 群聊模拟方式

第一阶段不需要真实并发调用 Agent。

可以通过前端 Mock 逻辑模拟多个 Agent 依次回复。

后续可扩展为：

- 串行调用多个 Agent API
- 并行调用多个 Agent API
- 使用后端 Orchestrator 统一调度
- 使用 WebSocket 或 SSE 返回中间状态

---

## 13. 右侧 Agent 面板需求

### 13.1 Agent 列表展示

右侧面板需要展示当前会话参与的 Agent。

每个 Agent 卡片包含：

1. Agent 头像。
2. Agent 名称。
3. Agent 描述。
4. 能力标签。

### 13.2 Agent 状态展示

第一阶段可以展示静态状态：

- idle
- thinking
- done

如果实现成本较高，第一阶段可以只展示 Agent 列表，不展示实时状态。

### 13.3 单聊与群聊差异

单聊会话中，右侧只展示一个 Agent。

群聊会话中，右侧展示多个 Agent，并突出 Orchestrator。

---

## 14. Artifact 面板需求

### 14.1 Artifact 列表

右侧面板需要展示当前会话生成的 Artifact。

每个 Artifact 包含：

1. 标题。
2. 类型。
3. 创建时间。
4. 简要描述或内容摘要。

### 14.2 Artifact 类型

第一阶段支持以下类型：

| 类型 | 说明 |
|---|---|
| code | 代码文件，如 App.tsx、LoginPage.tsx |
| markdown | 文档文件，如 README.md |
| html | 网页预览文件，如 preview.html |

后续可扩展：

| 类型 | 说明 |
|---|---|
| diff | 代码差异视图 |
| deploy | 部署状态卡片 |
| image | 图片产物 |
| ppt | PPT 产物 |

### 14.3 Artifact 预览

点击 Artifact 后，右侧下方显示预览内容。

不同类型预览方式：

- code：显示代码内容。
- markdown：显示 Markdown 文本。
- html：显示 HTML 预览或源码。

第一阶段可以统一用文本预览，不要求真实 iframe 渲染。

### 14.4 Artifact 与消息关系

Artifact 可以由某条消息生成。

例如 CodeAgent 生成代码块后，同时生成 App.tsx Artifact。

数据上可以通过 artifactId 或 messageId 关联。

---

## 15. 数据模型需求

### 15.1 Agent 数据模型

Agent 表示一个可参与对话的 AI 角色。

字段建议：

```ts
interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
}
```

### 15.2 Conversation 数据模型

Conversation 表示一个会话。

字段建议：

```ts
interface Conversation {
  id: string;
  title: string;
  mode: 'single' | 'group';
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
}
```

### 15.3 Message 数据模型

Message 表示聊天中的一条消息。

字段建议：

```ts
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'agent' | 'orchestrator' | 'system';
  type: 'text' | 'code' | 'artifact' | 'task-plan' | 'status';
  content: string;
  language?: string;
  artifactId?: string;
  createdAt: string;
}
```

### 15.4 Artifact 数据模型

Artifact 表示 Agent 生成的产物。

字段建议：

```ts
interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: 'code' | 'html' | 'markdown' | 'diff' | 'deploy';
  content: string;
  createdAt: string;
}
```

---

## 16. 前端状态管理需求

### 16.1 第一阶段状态管理方式

第一阶段使用 React useState 管理状态，不引入 Redux、Zustand 等复杂状态管理库。

核心状态包括：

```ts
const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
const [messages, setMessages] = useState<Message[]>(mockMessages);
const [artifacts, setArtifacts] = useState<Artifact[]>(mockArtifacts);
const [activeConversationId, setActiveConversationId] = useState<string>('conv-1');
const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
```

### 16.2 状态更新规则

1. 切换会话时更新 activeConversationId。
2. 发送消息时更新 messages。
3. Agent 回复时追加 messages。
4. 生成产物时更新 artifacts。
5. 点击 Artifact 时更新 selectedArtifactId。
6. 新建会话时更新 conversations，并切换当前会话。

### 16.3 后续扩展

如果项目复杂度提高，可以引入：

- Zustand
- Redux Toolkit
- React Query
- SWR

第一阶段不建议引入。

---

## 17. Mock 回复逻辑需求

### 17.1 Mock 回复目标

Mock 回复用于在没有后端和真实大模型 API 的情况下，模拟 AgentHub 的核心协作流程。

### 17.2 单聊 Mock 逻辑

如果当前会话是 single：

1. 找到当前会话绑定的 Agent。
2. 根据 Agent 类型生成固定回复。
3. 如果是 CodeAgent，返回代码块和 code Artifact。
4. 如果是 ReviewAgent，返回代码审查建议。
5. 如果是 DocAgent，返回 Markdown 文档摘要。

### 17.3 群聊 Mock 逻辑

如果当前会话是 group：

依次追加以下消息：

1. Orchestrator 状态消息。
2. Orchestrator 任务拆解消息。
3. DesignAgent 设计建议。
4. CodeAgent 代码块消息。
5. ReviewAgent 审查建议。
6. DocAgent 文档摘要。
7. Orchestrator 汇总消息。
8. Artifact 卡片消息。

### 17.4 Loading 效果

第一阶段可以选择实现简单 loading：

- 用户发送后显示“Agent 正在思考...”
- 500ms 后追加 Agent 回复

如果实现成本较高，可以先不实现 loading。

---

## 18. 组件拆分需求

### 18.1 推荐目录结构

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ChatPanel.tsx
│   │   └── RightPanel.tsx
│   ├── chat/
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInput.tsx
│   │   ├── CodeBlock.tsx
│   │   └── ArtifactMessage.tsx
│   ├── agent/
│   │   ├── AgentCard.tsx
│   │   └── AgentList.tsx
│   ├── artifact/
│   │   ├── ArtifactCard.tsx
│   │   └── ArtifactPreview.tsx
│   └── modal/
│       └── NewConversationModal.tsx
├── mock/
│   └── data.ts
├── types/
│   └── index.ts
├── utils/
│   └── mockReply.ts
├── App.tsx
├── main.tsx
└── index.css
```

### 18.2 组件职责

| 组件 | 职责 |
|---|---|
| App.tsx | 管理全局状态，组合页面 |
| AppLayout.tsx | 页面三栏布局 |
| Sidebar.tsx | 会话列表、新建会话、搜索 |
| ChatPanel.tsx | 当前会话聊天区 |
| MessageList.tsx | 消息列表 |
| MessageBubble.tsx | 单条消息展示 |
| ChatInput.tsx | 输入框和发送按钮 |
| CodeBlock.tsx | 代码块展示 |
| ArtifactMessage.tsx | 消息流中的 Artifact 卡片 |
| RightPanel.tsx | 右侧 Agent 和 Artifact 区域 |
| AgentList.tsx | Agent 列表 |
| AgentCard.tsx | 单个 Agent 卡片 |
| ArtifactCard.tsx | 单个 Artifact 卡片 |
| ArtifactPreview.tsx | Artifact 内容预览 |
| NewConversationModal.tsx | 新建会话弹窗 |

---

## 19. 视觉与交互规范

### 19.1 整体风格

整体风格应符合现代 SaaS / IM 产品设计，要求：

1. 简洁。
2. 清晰。
3. 层次分明。
4. 不花哨。
5. 适合演示。

### 19.2 色彩建议

建议使用浅色主题：

- 页面背景：浅灰色。
- 卡片背景：白色。
- 主色：蓝色或紫色。
- 用户消息：主色背景。
- Agent 消息：白色或浅灰背景。
- Orchestrator：使用轻微高亮色。

### 19.3 间距与排版

要求：

1. 三栏之间边界清晰。
2. 消息之间有足够间距。
3. Agent 名称、时间、内容层次清楚。
4. 代码块需要有独立背景。
5. Artifact 卡片需要有边框和 hover 状态。

### 19.4 响应式要求

第一阶段主要面向桌面端。

最低要求：

- 在 1366×768 分辨率下可正常展示。
- 在 1920×1080 分辨率下视觉效果良好。

移动端第一阶段不要求完整适配。

---

## 20. 错误与边界处理需求

### 20.1 输入为空

当用户输入为空时，点击发送不应生成消息。

### 20.2 会话不存在

如果 activeConversationId 对应会话不存在，应默认选择第一个会话。

### 20.3 Artifact 不存在

如果 selectedArtifactId 对应 Artifact 不存在，预览区显示“请选择一个产物”。

### 20.4 当前会话无消息

消息列表显示欢迎语或空状态提示：

```text
开始与 Agent 协作吧。
```

### 20.5 当前会话无 Artifact

Artifact 面板显示空状态：

```text
当前会话还没有生成产物。
```

---

## 21. 非功能需求

### 21.1 可维护性

代码需要满足：

1. 组件拆分清晰。
2. 类型定义集中管理。
3. Mock 数据集中管理。
4. 工具函数独立维护。
5. 避免在 App.tsx 中堆积大量 UI 细节。

### 21.2 可扩展性

前端结构需要方便后续扩展：

1. Mock 数据可以替换为后端接口。
2. Mock 回复可以替换为真实 Agent API。
3. Artifact 预览可以扩展为真实 iframe 或编辑器。
4. 消息类型可以继续扩展。
5. 会话管理可以接入数据库。

### 21.3 可演示性

前端必须支持课程答辩演示：

1. 页面打开后有默认数据。
2. 默认存在一个单聊案例。
3. 默认存在一个群聊案例。
4. 用户可以现场输入消息触发模拟回复。
5. 可以展示多 Agent 协作过程。
6. 可以展示生成的 Artifact。

### 21.4 代码规范

要求：

1. 使用 TypeScript。
2. 不使用 any 或尽量少使用 any。
3. 组件命名使用 PascalCase。
4. 函数和变量命名使用 camelCase。
5. 类型命名清晰。
6. 删除无用代码。
7. 保持 ESLint 无明显报错。

---

## 22. 与后端的接口预留

第一阶段不接后端，但前端需要预留接口替换位置。

后续可能需要的接口包括：

```text
GET /api/conversations
获取会话列表

GET /api/conversations/:id/messages
获取某会话消息

POST /api/conversations
创建新会话

POST /api/conversations/:id/messages
发送消息

GET /api/agents
获取 Agent 列表

GET /api/conversations/:id/artifacts
获取当前会话产物
```

前端第一阶段可以在代码中保留 services 目录，但不强制实现。

后续建议目录：

```text
src/services/
├── conversationService.ts
├── messageService.ts
├── agentService.ts
└── artifactService.ts
```

---

## 23. 典型演示流程

### 23.1 演示流程一：单聊生成代码

1. 用户进入 AgentHub。
2. 点击左侧“React 登录页生成”会话。
3. 中间显示历史消息。
4. 用户输入：

```text
帮我生成一个登录页面。
```

5. CodeAgent 回复说明文本。
6. CodeAgent 返回代码块。
7. 右侧生成 LoginPage.tsx Artifact。
8. 用户点击 Artifact 查看代码预览。

### 23.2 演示流程二：多 Agent 群聊协作

1. 用户点击“多 Agent 官网生成任务”会话。
2. 用户输入：

```text
帮我生成一个 AgentHub 官网首页，需要设计、代码、审查和文档。
```

3. Orchestrator 回复并拆解任务。
4. DesignAgent 输出设计方案。
5. CodeAgent 输出 React 代码。
6. ReviewAgent 输出审查建议。
7. DocAgent 输出 README 摘要。
8. Orchestrator 汇总结果。
9. 右侧出现 HomePage.tsx、README.md、preview.html。
10. 用户点击不同 Artifact 查看预览。

### 23.3 演示流程三：上下文连续修改

1. 用户在同一会话中继续输入：

```text
把按钮改成蓝色，并增加一个清空按钮。
```

2. 前端模拟 CodeAgent 基于上下文继续修改。
3. 生成新的代码块或更新 Artifact。

第一阶段可以只做简单模拟，不要求真实理解上下文。

---

## 24. 验收标准

### 24.1 页面验收

| 验收项 | 标准 |
|---|---|
| 三栏布局 | 左、中、右区域清晰 |
| 会话列表 | 能显示多个 mock 会话 |
| 聊天窗口 | 能显示当前会话消息 |
| 右侧面板 | 能显示 Agent 和 Artifact |
| 页面风格 | 简洁、美观、适合演示 |

### 24.2 功能验收

| 验收项 | 标准 |
|---|---|
| 会话切换 | 点击左侧会话后，中间和右侧内容同步变化 |
| 发送消息 | 输入文本后能追加用户消息 |
| 单聊回复 | 单聊模式下能模拟 Agent 回复 |
| 群聊回复 | 群聊模式下能模拟多个 Agent 依次回复 |
| 任务拆解 | Orchestrator 能展示任务拆解结果 |
| 代码块 | 能展示格式化代码 |
| Artifact | 能展示并点击预览产物 |
| 新建会话 | 能创建新的 mock 会话 |

### 24.3 代码验收

| 验收项 | 标准 |
|---|---|
| TypeScript | 类型定义清楚，无明显类型错误 |
| 组件拆分 | 不将所有 UI 写在 App.tsx |
| Mock 数据 | 数据集中放在 src/mock/data.ts |
| 类型定义 | 类型集中放在 src/types/index.ts |
| 可维护性 | 文件结构清晰，方便后续扩展 |

### 24.4 文档验收

| 验收项 | 标准 |
|---|---|
| 需求文档 | 明确说明前端功能范围 |
| 设计文档 | 说明页面布局、组件结构和数据流 |
| AI 协作记录 | 保留关键 Prompt、修改记录和问题修复过程 |
| 演示说明 | 能说明如何运行和演示功能 |

---

## 25. 开发里程碑

### 25.1 Milestone 1：需求与设计

目标：完成前端需求文档和设计文档。

交付物：

- docs/frontend-requirements.md
- docs/frontend-design.md

### 25.2 Milestone 2：项目骨架

目标：完成 React + TypeScript + Tailwind 项目初始化和基础目录结构。

交付物：

- 可运行前端项目
- src/types/index.ts
- src/mock/data.ts
- 基础三栏布局

### 25.3 Milestone 3：核心页面

目标：完成会话列表、聊天窗口和右侧面板。

交付物：

- Sidebar
- ChatPanel
- RightPanel
- MessageList
- MessageBubble
- AgentList
- ArtifactList

### 25.4 Milestone 4：核心交互

目标：完成会话切换、发送消息、Mock Agent 回复。

交付物：

- 会话切换
- 消息发送
- 单聊 Mock 回复
- 群聊 Mock 回复

### 25.5 Milestone 5：产物展示

目标：完成代码块和 Artifact 预览。

交付物：

- CodeBlock
- ArtifactCard
- ArtifactPreview

### 25.6 Milestone 6：美化与验收

目标：优化页面视觉效果，整理演示流程和文档。

交付物：

- 完整可演示前端 Demo
- 前端测试记录
- AI 协作记录
- 演示截图

---

## 26. 风险与应对

### 26.1 风险一：一开始做得太复杂

表现：过早接后端、接真实 Agent API、做真实部署，导致核心页面没完成。

应对：第一阶段只做 Mock 前端，优先保证演示闭环。

### 26.2 风险二：页面像普通 ChatGPT，缺少多 Agent 特征

表现：只有一个输入框和一个回复气泡，没有 Orchestrator 和多个 Agent。

应对：必须突出群聊模式、Agent 列表、任务拆解、多个 Agent 依次回复。

### 26.3 风险三：代码全部堆在 App.tsx

表现：组件无法复用，答辩时难解释架构。

应对：严格按照 components、mock、types、utils 拆分。

### 26.4 风险四：没有 AI 协作开发记录

表现：项目虽然完成，但无法体现 AI 协作能力。

应对：从第一天开始记录 Prompt、生成结果、人工修改和问题修复。

### 26.5 风险五：演示时没有默认数据

表现：打开页面后空白，需要现场输入很多内容。

应对：Mock 数据中提前准备单聊和群聊示例。

---

## 27. 第一阶段最终完成定义

当满足以下条件时，可以认为 AgentHub 前端第一阶段完成：

1. 项目可以通过 npm install 和 npm run dev 正常启动。
2. 页面展示三栏式 IM 工作台。
3. 左侧可以查看和切换会话。
4. 中间可以查看聊天消息并发送新消息。
5. 右侧可以查看 Agent 列表和 Artifact 产物。
6. 单聊模式可以模拟 Agent 回复。
7. 群聊模式可以模拟 Orchestrator 和多个 Agent 协作。
8. 消息流中可以展示文本、代码块、任务拆解和 Artifact 卡片。
9. 点击 Artifact 可以查看预览内容。
10. 代码结构清晰，类型和 Mock 数据独立管理。
11. 需求文档、设计文档、AI 协作记录基本完整。

---

## 28. 后续扩展方向

第一阶段完成后，可以按以下方向继续迭代：

1. 接入 FastAPI 后端。
2. 接入数据库保存会话和消息。
3. 接入 OpenAI-compatible API。
4. 接入本地 vLLM 模型。
5. 支持流式输出。
6. 支持真实 Orchestrator 调度逻辑。
7. 支持 Agent 自定义创建。
8. 支持代码 Diff 展示。
9. 支持 Monaco Editor 编辑代码。
10. 支持 iframe 网页预览。
11. 支持 Artifact 版本历史。
12. 支持模拟部署状态卡片。

---

## 29. 总结

AgentHub 前端第一阶段的重点不是实现一个完整商用系统，而是构建一个结构清晰、交互完整、能体现多 Agent 协作特点的前端 MVP。

前端必须围绕以下核心能力展开：

- 用 IM 方式组织用户与 Agent 的交互。
- 用会话列表支持多任务并行。
- 用群聊模式体现多 Agent 协作。
- 用 Orchestrator 消息体现任务拆解和调度。
- 用 Artifact 卡片体现 AI 生成产物。
- 用右侧面板增强 Agent 和产物的可视化管理。

只要第一阶段能够稳定演示“用户发起任务 → Orchestrator 拆解 → 多 Agent 回复 → 生成产物 → 预览产物”这一完整闭环，就已经满足前端 MVP 的核心目标。

