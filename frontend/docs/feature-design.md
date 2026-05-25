# AgentHub 功能设计文档

**版本**: v2.0.0  
**更新日期**: 2026-05-25  
**文档状态**: 正式版

---

## 1. 项目概述

AgentHub 是一个多 Agent 智能协作平台，旨在让多个 AI Agent 协同工作，高效完成复杂开发任务。平台支持单聊和群聊两种模式，用户可以通过 Orchestrator 智能调度不同专业领域的 Agent 协同处理需求，自动生成高质量的代码、文档和交互产物。

### 核心设计理念
- 去重防抖：通过 ref 缓存机制避免重复请求
- 自动降级：真实 API 不可用时自动无缝回退 Mock 模式
- 多 Agent 分工：每个 Agent 有明确的专业领域和能力边界
- 产物版本化：所有代码、文档产物自动记录版本历史

---

## 2. 当前功能范围

✅ 已完整实现的功能：
- Agent 联系人目录与详情配置
- 单聊/群聊会话管理
- 输入框 @Agent 动态搜索与候选列表
- 上下文一键压缩
- 消息 Pin 标记
- Artifact 产物生成、预览、版本管理
- Mock / 真实 API 双模式无缝切换
- WebSocket 流式输出
- 文件/图片附件上传与展示
- 消息回复与产物引用
- 全量 TypeScript 类型体系

---

## 3. 页面与模块设计

### 3.1 整体布局结构
```
AppLayout (根布局)
 ├── LeftSidebar (左侧边栏)
 │    ├── 会话列表
 │    ├── Agent 联系人目录
 │    └── Agent 详情面板
 ├── 主内容区域 (弹性)
 │    ├── ChatPanel (聊天面板)
 │    └── RightPanel (右侧 Artifact 产物面板)
 └── 全局模态框层
      ├── NewConversationModal (新建会话)
      └── ArtifactFullScreenModal (产物全屏预览)
```

### 3.2 核心组件清单
| 组件路径 | 功能说明 |
|---|---|
| src/components/layout/AppLayout.tsx | 根布局容器 |
| src/components/layout/LeftSidebar.tsx | 左侧边栏导航 |
| src/components/layout/RightPanel.tsx | 右侧产物面板 |
| src/components/agent/AgentList.tsx | Agent 联系人列表 |
| src/components/agent/AgentCard.tsx | Agent 卡片 |
| src/components/agent/AgentDirectory.tsx | Agent 目录总览 |
| src/components/agent/AgentDetailPanel.tsx | Agent 详情配置面板 |
| src/components/agent/AgentConfigForm.tsx | Agent 模型配置表单 |
| src/components/agent/AgentContactCard.tsx | Agent 联系人简化卡片 |
| src/components/chat/ChatPanel.tsx | 核心聊天面板 |
| src/components/chat/MessageBubble.tsx | 消息气泡渲染 |
| src/components/chat/AttachmentCard.tsx | 附件卡片 |
| src/components/chat/ArtifactMessage.tsx | 产物消息 |
| src/components/chat/TaskPlanCard.tsx | 任务计划卡片 |
| src/components/chat/CodeBlock.tsx | 代码块高亮 |
| src/components/artifact/ArtifactList.tsx | 产物列表 |
| src/components/artifact/ArtifactCard.tsx | 产物卡片 |
| src/components/artifact/ArtifactPreview.tsx | 产物预览组件 |
| src/components/artifact/CodeEditorContainer.tsx | 代码编辑器容器 |
| src/components/artifact/CodeDiffViewer.tsx | 代码差异对比 |
| src/components/modal/NewConversationModal.tsx | 新建会话弹窗 |
| src/components/modal/ArtifactFullScreenModal.tsx | 产物全屏预览弹窗 |

---

## 4. Agent 联系人设计

### 4.1 Agent 类型定义
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

### 4.2 内置 Agent 清单
- **Orchestrator**：任务调度与智能拆解汇总（category: orchestrator）
- **Claude Code**：专业代码生成与工程理解（category: coding）
- **Codex**：Bug 修复与云端代码任务（category: coding）
- **OpenCode**：本地代码 Agent 与文件修改（category: coding）
- **ReviewAgent**：代码审查与质量检查（category: review）
- **DocAgent**：文档与 README 生成（category: document）
- **DesignAgent**：UI 交互设计专家（category: design）

---

## 5. Agent 配置设计

### 5.1 Agent 模型配置
- 支持自定义 System Prompt
- 配置 Temperature（0.0 - 0.9）
- 配置 Max Tokens
- 自定义 API Base URL
- 输入 API Key（占位符模式）

### 5.2 工具开关配置
每个 Agent 的 Tools 支持独立启用/禁用：
- 文件读写工具
- 代码审查工具
- 命令执行工具
- 网页预览/部署工具

---

## 6. 会话设计

### 6.1 会话模式
| 模式 | 说明 |
|---|---|
| single | 单聊模式，仅单个 Agent 工作 |
| group | 群聊模式，Orchestrator 调度多个 Agent 协同 |

### 6.2 会话创建流程
1. 点击左侧边栏「新建会话」按钮
2. 弹出 NewConversationModal 弹窗
3. 输入会话标题、选择模式
4. 勾选要加入该会话的 Agent 列表
5. 提交请求，创建新会话并自动激活

---

## 7. 消息系统设计

### 7.1 消息类型
| type | 说明 |
|---|---|
| text | 纯文本消息 |
| code | 代码消息 |
| artifact | 产物关联消息 |
| task-plan | Orchestrator 任务计划卡片 |
| status | 系统/状态消息 |
| image | 图片消息 |
| document | 文档/PPT/PDF 消息 |

### 7.2 消息发送模式
1. **HTTP 模式**：POST /conversations/{id}/messages（非流式）
2. **WebSocket 流式模式**：conversation.message.create（实时分块推送）

### 7.3 支持的扩展字段
- targetAgentId / targetAgentID（指定回复的 Agent）
- attachments（附件列表）
- quotedMessage（回复引用）
- artifactRef（产物引用）

---

## 8. 单聊流程设计

用户 → 发送需求 → 指定单个 Agent → 直接生成内容/产物 → 完成

---

## 9. 群聊多 Agent 协作流程设计

用户 → 发送需求 → Orchestrator 接收 → 分析需求 → 拆解成子任务 → 分发到不同专业 Agent → 各 Agent 独立产出 → Orchestrator 汇总全部结果 → 结束任务

---

## 10. Orchestrator 调度设计

Orchestrator 是群聊的核心枢纽，职责包括：
1. 理解用户原始需求
2. 智能拆解复杂任务为多个子任务
3. 根据 Agent 专业领域分配任务
4. 监听所有 Agent 的执行进度
5. 汇总最终输出结果，向用户做最终呈现

---

## 11. @Agent 候选列表交互设计

### 11.1 用户交互流程
1. 用户在输入框中输入字符 `@`
2. 弹出 @Agent 选择器弹窗
3. 继续输入搜索关键词，实时调用后端 POST /mention 接口
4. 返回过滤后的 AgentMentionItem 列表
5. 使用方向键上下选择，Enter 确认选中
6. 自动在输入框插入 `@AgentName ` 带空格后缀

### 11.2 去重与容错机制
- 真实接口失败自动回退本地 Agent 数据
- 只排除 Orchestrator，展示当前会话内所有在线 Agent

---

## 12. Artifact 产物设计

### 12.1 产物类型
| type | 说明 |
|---|---|
| code | 代码文件产物 |
| html | 可交互 HTML 产物 |
| markdown | Markdown 文档产物 |
| diff | 代码差异产物 |
| deploy | 部署产物 |

### 12.2 Artifact 结构
```typescript
interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: ArtifactType;
  description?: string;
  size?: number;
  createdAt: string;
}
```

---

## 13. Artifact 获取逻辑

1. 打开会话时调用 GET /conversations/{id}/artifacts
2. 列表展示全部关联产物
3. 用户点击产物卡片 → 调用 GET /artifacts/{id} 获取完整内容
4. 在右侧 RightPanel 或全屏 Modal 中展示产物

---

## 14. Artifact 更新逻辑

1. 用户在 CodeEditorContainer 中编辑产物内容
2. 编辑完成保存
3. 自动生成新版本，递增版本号
4. 追加系统 status 消息提示「已生成新版本 vX」

---

## 15. Artifact 版本管理设计

每个 Artifact 保留完整版本历史记录：
- 版本号 1, 2, 3... 依次递增
- 记录版本作者、创建时间
- CodeDiffViewer 支持任意两个版本的并排对比
- 保留所有历史版本，永不删除

---

## 16. 上下文压缩功能设计

### 16.1 触发方式
用户点击聊天面板右上角 Header「压缩上下文」按钮。

### 16.2 接口路径
POST /conversations/{conversationId}/context/compress

### 16.3 响应数据
```typescript
{
  summary: ConversationSummary;
  compressed: boolean;
}
```

### 16.4 用户体验
压缩完成后，系统自动追加一条 type='status' 的 system 消息，展示：
- 原始覆盖消息数
- 摘要内容
- 不删除任何历史消息，仅后续模型 Token 占用优化

---

## 17. Pin 消息标记功能设计

- 用户可以对任意重要消息执行 Pin 操作
- 标记为 isPinned = true
- 再次点击取消 Pin 状态
- 接口：POST /messages/{msgId}/pin 与 DELETE /messages/{msgId}/pin
- 后续预留「已 Pin 消息」专门面板展示所有重点内容

---

## 18. 长期记忆管理设计（接口已预留）

完整的 4 个长期记忆管理接口已封装在 conversationService.ts：
- GET /conversations/{id}/memories → 获取全部记忆
- DELETE /conversations/{id}/memories/{memoryId} → 软删除
- MemoryCategory 支持 4 种类型：preference / project / profile / constraint

当前暂未实现 UI 面板，接口层完整保留可后续快速接入。

---

## 19. Mock / API 双模式设计

USE_MOCK 环境变量决定运行模式：
- true：完全使用本地 mock 数据，不发起任何真实 HTTP 请求
- false：优先调用真实后端接口，健康检查失败自动无缝回退 Mock 模式

Fail-Safe 机制：任意单个 API 调用失败，立即返回 Mock 结果演示，不阻塞主流程。

---

## 20. Service 层设计

所有业务逻辑模块化分层：
- http/agentService.ts → Agent CRUD
- http/conversationService.ts → 会话、压缩上下文、长期记忆、Pin
- http/messageService.ts → 消息、@Agent 候选列表
- http/artifactService.ts → 产物、版本管理
- http/healthService.ts → 健康检查
- ws/wsClient.ts → WebSocket 客户端封装

---

## 21. API 依赖说明

所有 API 统一前缀 `/api/v1`，统一响应结构：
```typescript
interface BaseApiResponse<T> {
  code: number;      // 0 = 成功
  message: string;
  data: T;
}
```

后端默认运行端口 9007，前端 Vite 开发服务器端口 9006。

---

## 22. WebSocket 与流式输出设计

AgentHubWSClient 完整特性：
- 自动指数退避重连（1s → 2s → 4s → ... → 最大 30s）
- 心跳 Ping 机制，25s 间隔检测活跃
- 事件订阅 Map 管理，支持多 Handler 监听同一事件类型
- Token 自动附加到连接 URL Query
- HTTPS 环境自动将 ws:// 升级为 wss://

已支持事件类型：
- connected / ping / pong
- conversation.message.user_created
- conversation.message.chunk
- conversation.message.completed
- agent.thinking.started
- artifact.created
- conversation.all_tasks.completed
- agent.status.changed

---

## 23. 多端支持设计

当前暂未实现移动端专属适配，基础响应式布局已预留扩展空间。后续可基于现有组件快速追加移动端适配层。

---

## 24. 本地文件交互设计

支持的附件类型：
- 图片格式（image/*）
- PDF 文档
- PPT/PPTX 演示文稿
- 其他通用文件类型

用户点击附件按钮 → 选择本地文件 → 生成预览卡片 → 发送消息时随 attachments 数组一起提交后端。

---

## 25. 系统通知设计

所有系统事件统一以 `role: 'system' + type: 'status'` 消息追加到主消息流：
- 上下文压缩完成通知
- 产物新版本生成通知
- 全部任务完成汇总通知

无额外悬浮弹窗打扰，系统状态与主对话流自然融合。

---

## 26. 状态管理设计

基于 Zustand 全局单一 Store useAgentHubStore：
- 所有核心状态集中管理
- 避免 Prop Drilling 多层透传
- 所有 Action 集中定义，调用统一入口
- 支持多组件订阅同一状态分片

---

## 27. 错误与空状态设计

空状态提示页面引导用户快速上手发送第一条消息。
所有异步操作全包 try-catch，错误不崩溃，控制台输出 warn 日志，优雅降级展示友好提示。

---

## 28. 当前已实现功能汇总

✅ 完整覆盖：
1. Agent 联系人全 CRUD 配置
2. 单聊 + 群聊会话管理
3. @Agent 动态搜索候选列表
4. 上下文一键压缩（系统消息展示结果）
5. Pin / Unpin 消息标记
6. Artifact 产物预览 + 版本管理 + 代码差异对比
7. 文件/图片附件上传
8. WebSocket 流式消息输出
9. 消息回复引用 + 产物引用
10. 全量 TypeScript 类型体系，零 any 类型

---

## 29. 后续扩展规划

📋 预留接口，可快速接入：
1. 「长期记忆管理」完整 UI 面板
2. 「已 Pin 消息」专门聚合视图
3. 移动端专属响应式适配层
4. 多语言 i18n 国际化框架
5. 夜间/亮色主题双模式切换
6. 全局通知中心系统
