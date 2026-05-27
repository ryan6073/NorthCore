# AgentHub 前端设计文档（第四阶段 - Agent 名片与一对一对话系统）

**版本**: v4.0.0  
**更新日期**: 2026-05-26  
**状态**: 设计阶段

---

## 1. 文档说明

### 1.1 核心设计理念
本文档用于指导 AgentHub 第四阶段的前端升级：**新增 Agent 名片系统与一对一独立对话系统**，完全区别于现有的多 Agent 群聊会话体系。

两个核心原则：
- **向后完全兼容**：现有的 Conversation 会话（单聊/群聊）逻辑完全不变，所有 P0 接口正常工作
- **全新独立体系**：Agent 名片 + Agent 一对一对话作为全新顶层入口，形成平行且互补的两条路径

### 1.2 设计目标
第四阶段需要达成的核心目标：

1. **Agent 名片界面**：类似主流聊天软件的个人资料卡片风格，取代原有的简陋 AgentDetailPanel
2. **Agent 独立对话界面**：一对一专属对话，生命周期完全与 Agent 绑定，一个用户和一个 Agent 有且仅有一个专属对话
3. **双路径并存**：原有的 Conversation 会话体系（单聊/群聊）完全保留，新增 Agent 专属对话作为轻量化快速入口
4. **配置设置入口**：在名片界面中保留完整的 Agent 参数设置入口，用户可以随时修改 Agent 的系统提示词、模型配置等

---

## 2. 核心概念定义

### 2.1 两套对话体系对比

| 维度 | 原有 Conversation 会话体系 | 新增 Agent 专属对话体系 |
|---|---|---|
| 关系 | 多 Agent 灵活组合（单聊/群聊） | 一个用户 ↔ 一个 Agent 严格一对一 |
| 生命周期 | 用户主动创建/删除，可重命名 | 与 Agent 绑定，Agent 创建即存在 |
| 数量 | N 个（由用户任意创建） | 每个 Agent 对应且仅对应 1 个 |
| 入口 | 左侧会话列表新建 | 点击 Agent 头像 → 名片 → 发消息 |
| 功能 | 支持多 Agent 协同任务、产物生成 | 专注于与单个 Agent 的纯聊天对话 |
| 兼容性 | 100% 保持不变 | 全新独立模块，不影响原有逻辑 |

### 2.2 Agent 专属对话 (AgentChat) 定义
**AgentChat** 是用户与单个 Agent 之间的一对一专属聊天上下文：
- 不参与 Orchestrator 调度
- 仅存在两个角色：User 和该 Agent
- 没有产物、没有多 Agent 分发，专注于轻量对话
- 历史消息持久化，跟随 Agent 一起存在

---

## 3. 数据模型扩展设计

### 3.1 AgentChat 数据模型
完全新增类型，独立于现有 Conversation：

```typescript
export interface AgentChat {
  id: string;                // 专属对话 ID，格式 agent-chat-{agentId}
  agentId: string;           // 关联的 Agent ID
  lastMessage: string;        // 最近一条消息摘要
  updatedAt: string;         // 最后活跃时间
  createdAt: string;         // 创建时间
}
```

### 3.2 AgentChatMessage 数据模型
一对一专属对话的消息，结构复用现有 Message 类型但独立存储：

```typescript
export interface AgentChatMessage {
  id: string;
  agentChatId: string;       // 关联专属对话 ID
  senderId: string;          // "user" 或 agentId
  senderName: string;
  role: 'user' | 'agent';
  type: 'text';
  content: string;
  createdAt: string;
}
```

### 3.3 Store 状态扩展
在 `useAgentHubStore` 中新增字段，完全不触碰现有 conversation 相关逻辑：

```typescript
interface AgentHubStore {
  // ============ 原有字段完全保留 ============
  // ... 现有的 agents, conversations, messages, artifacts 等全部不变

  // ============ 第四阶段新增字段 ============
  agentChats: AgentChat[];
  currentAgentChatId: string | null;
  agentChatMessages: Record<string, AgentChatMessage[]>; // key: agentChatId
  showAgentProfile: boolean;          // 控制是否显示名片弹窗
  viewingAgentId: string | null;       // 当前正在查看名片的 Agent ID

  // actions
  setShowAgentProfile: (show: boolean) => void;
  setViewingAgentId: (agentId: string | null) => void;
  openAgentProfile: (agentId: string) => void;
  closeAgentProfile: () => void;
  getOrCreateAgentChat: (agentId: string) => Promise<AgentChat>;
  sendAgentChatMessage: (agentChatId: string, content: string) => Promise<void>;
  getAgentChatMessages: (agentChatId: string) => Promise<AgentChatMessage[]>;
}
```

---

## 4. Agent 名片界面设计

### 4.1 入口触发
**触发点**：用户在任何位置点击 Agent 的头像（AgentDirectory、AgentList、消息气泡中的头像），都弹出 Agent 名片界面，取代旧的右侧滑出 DetailPanel。

**名片形态**：居中居中的精美模态卡片，类似微信/WhatsApp 查看个人资料的风格。

### 4.2 名片布局结构
```
+-----------------------------------------------------+
|  [×关闭]                                  [设置⚙]     |
|                                                     |
|                  ┌─────────────┐                     |
|                  │   AVATAR    │  大圆形头像         |
|                  └─────────────┘                     |
|                                                     |
|              Agent 完整名称 (加粗大字号)              |
|                                                     |
|        @ 标签 · 分类 · 状态指示器 (绿点)              |
|                                                     |
|     ┌─────────────────────────────────────────┐     |
|     │  "专业代码生成与工程理解，专注于高质量..."  │     |
|     │  能力描述 (多行自动折行)                  │     |
|     └─────────────────────────────────────────┘     |
|                                                     |
|  能力标签区域 (Tag 流式排列)                          |
|  [代码生成] [代码修改] [工程理解] [Bug修复]          |
|                                                     |
|  底部操作栏 (两个大按钮)                              |
|  ┌───────────────┐   ┌───────────────┐            |
|  │   💬 发消息    │   │   → 邀请入会话 │            |
|  └───────────────┘   └───────────────┘            |
+-----------------------------------------------------+
```

### 4.3 名片组件分层细节
**文件名**：`src/components/agent/AgentProfileCard.tsx`

**结构说明**：

1. **Header 区域**：
   - 左上角：标准关闭图标 ×
   - 右上角：设置按钮（齿轮图标），点击后整个名片平滑切换为设置编辑模式
   
2. **Avatar 头部区域**：
   - 超大圆形头像（w-24 h-24）带阴影
   - 头像下方是 Agent 全名
   - 名称下面一行是：状态指示器 + Provider 标签 + Category 标签
   
3. **描述卡片区域**：
   - 浅灰色圆角容器，展示 Agent 描述文字
   - 文字自动换行，max-h-32 可滚动
   
4. **能力标签流式布局**：
   - 用 flex flex-wrap gap-2 排列所有 tags
   - 每个 tag 是带背景色的 pill 样式

5. **底部操作双按钮**：
   - **发消息**：点击后直接跳转到该 Agent 的一对一专属对话界面
   - **邀请入会话**：弹出选择器，选择已有会话，把这个 Agent 添加进该会话的参与列表

### 4.4 设置编辑模式
点击右上角的齿轮图标，整个名片卡片的所有信息立即从展示态变为可编辑表单：

- Agent 名称 → 文本输入框
- 描述 → 多行 textarea
- 系统提示词 → 大代码文本域
- 模型配置 → 表单组（Provider、ModelName、Temperature、MaxTokens）
- 工具开关列表 → 复选框列表
- 权限开关 → 权限网格
- 底部新增「取消」和「保存」按钮
保存成功后切回展示态，调用原有的 `PUT /agents/{agentId}` 接口。

---

## 5. Agent 一对一专属对话界面设计

### 5.1 界面整体形态
完全复用现有 ChatPanel 中成熟的聊天界面交互组件（消息气泡、输入框、表情等），但上下文简化，专门服务于 User ↔ Agent 的一对一轻量聊天。

**入口路径**：
Agent 名片 → 点击「💬 发消息」 → 全屏/路由跳转到专属对话界面

### 5.2 界面布局
```
┌─────────────────────────────────────────────────────────────────┐
│  ← 返回  Agent 名称 [状态绿点]          [查看名片👤]              │  <-- Header
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [消息气泡区域 完全复用现有的 MessageBubble 组件]                 │
│                                                                 │
│  User: 你好，帮我解释一下什么是 React hooks                        │
│  Agent Claude: Hooks 是 React 16.8 引入的函数...                  │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [附件] [表情]                             [发送]                │  <-- 输入区
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 与原群聊界面的区别
1. **顶部 Header**：只有「返回」按钮，Agent 名称，以及右侧的「查看名片」快捷入口，没有产物侧边栏入口、没有多 Agent 选择控件
2. **右侧边栏**：完全没有右侧产物面板，更专注于纯对话
3. **消息类型**：暂仅支持 text 纯文本消息，简化体验
4. **没有 Pin/长期记忆**：简化，一对一对话不需要复杂功能

### 5.4 组件文件名
- 新增 `src/components/chat/AgentChatPanel.tsx`

---

## 6. 路由与导航设计

新增路由，完全独立于现有会话路由：

| 路由路径 | 作用 |
|---|---|
| `/agent-chat/:agentId` | Agent 一对一专属对话全屏页面 |

说明：
- 点击名片的「发消息」按钮，执行 navigate(`/agent-chat/${agent.id}`)
- 一对一对话页面左上角的「返回」按钮，点击后 navigate(-1) 回到上一页（AgentDirectory 或者 Agent 名片）

---

## 7. 向后兼容性保障策略

为了 100% 保证现有 Conversation 会话逻辑完全不改变，我们严格遵守以下规则：

1. **禁止修改**：现有的 Conversation、Message、Artifact 等相关的 TypeScript 类型定义完全不动
2. **禁止修改**：现有的 5 个 service 文件（agentService, conversationService, messageService, artifactService, healthService）完全保留，一个字符都不改动
3. **完全独立**：新增的 AgentChat 相关逻辑全部写在独立的新文件中
   - `src/services/http/agentChatService.ts`
   - 完全新的组件目录，不碰旧组件
4. **Store 只追加**：zustand store 中只扩展新增字段，完全保留原有所有 state 和 action
5. **UI 不冲突**：Agent 名片弹窗和 AgentChat 页面完全是新 UI，不覆盖原有任何界面

---

## 8. 组件文件清单

新增文件，完全不修改旧文件：

```
src/
├── components/
│   ├── agent/
│   │   ├── AgentProfileCard.tsx       # [NEW] Agent 精美名片弹窗
│   │   (原有的 AgentDetailPanel.tsx 可以保留作为历史冗余兼容，不再使用)
│   │
│   └── chat/
│       └── AgentChatPanel.tsx         # [NEW] 一对一专属对话面板 (轻量版聊天)
│
├── services/http/
│   └── agentChatService.ts            # [NEW] 专属对话 API 服务层
│
└── pages/
    └── AgentChatPage.tsx              # [NEW] 一对一对话全屏页面容器
```

---

## 9. API 设计 (新增独立接口，不碰原有)

### 9.1 获取或创建 Agent 专属对话
`GET /api/v1/agents/{agentId}/chat`
- 作用：获取该 Agent 对应的一对一对话，不存在则自动创建一个
- 返回：`AgentChat` 对象

### 9.2 获取专属对话消息历史
`GET /api/v1/agent-chats/{agentChatId}/messages`
- 分页拉取一对一对话的消息列表

### 9.3 在专属对话中发送消息
`POST /api/v1/agent-chats/{agentChatId}/messages`
- 发送用户消息，非流式返回该 Agent 的回复
- （后续可扩展支持 WebSocket 流式输出一对一对话）

---

## 10. 开发优先级路线图

**P0 核心路径（MVP）**：
1. 数据模型扩展 + Store 新增字段
2. 实现 AgentProfileCard 名片展示模式
3. 点击任何 Agent 头像都能弹出名片
4. 名片的设置编辑模式复用已有 PUT /agents 接口
5. AgentChatPanel 基础聊天界面，复用 MessageBubble
6. 从名片点「发消息」进入一对一对话

**P1 体验优化**：
1. AgentChat 流式输出支持
2. 最近 Agent 对话历史列表展示
3. 从 Agent 目录快速查看最近对话

---

## 11. 总结

AgentHub 第四阶段通过新增 **Agent 名片界面** + **一对一专属对话** 的全新体系，在完全不改动现有会话逻辑的前提下，构建了第二条轻量化、低门槛的快速交互路径。

用户现在有两种选择：
- **复杂任务**：走原有的多 Agent 群聊会话路径，利用 Orchestrator 调度多 Agent 协同，生成产物
- **轻量聊天**：点击任意 Agent 头像 → 查看精美名片 → 一键发消息进入一对一专属对话

两条路径完全互补，让 AgentHub 同时具备了「重型生产力工作台」和「轻量 AI 聊天工具」的双重属性。
