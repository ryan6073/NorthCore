# AgentHub 前端设计文档（第三阶段 - 聊天与编辑体验完善）

## 1. 文档说明

### 1.1 文档目的

本文档用于指导 AgentHub 多 Agent 协作平台 Web 前端第三阶段的设计与开发。在第一、二阶段实现了基础通信、状态管理与双向布局之后，第三阶段将重点聚焦于**聊天体验的完善**与**深度开发交互**：包括多样化消息类型渲染、跨日期时间线隔离、气泡悬停菜单（回复、Pin 长期记忆）、产物内容选区引用定位以及交互式代码直接编辑。

本文档将作为前端开发、交互设计以及前后端集成测试的权威参考规范。

### 1.2 设计目标

第三阶段的前端升级应达成以下核心目标：

1. **多样化消息卡片渲染**：消息气泡支持渲染普通文本、图像附件、带高亮的代码块、独立交互式 HTML、以及 PPT/PDF 文档附件卡片（带缩略图/页面数、下载和预览入口）。
2. **清晰的时间交互**：聊天记录能够跨日期自动插入日期分隔栏；气泡在鼠标悬停时，左侧/侧边平滑滑出精准秒级时间，右侧浮现多功能悬浮菜单。
3. **记忆与回复交互**：支持消息悬停“回复”（建立气泡引用关联）和“Pin（存为长期记忆）”，打通前端 Store 和后端持久化存储。
4. **产物局部引用与精准定位**：在预览代码/文档产物时，支持选中文本并一键“引用”，引用时自动提取产物 ID、标题、版本号、引用行范围及文本片段。该引用信息将作为 Meta 随消息发送给 Agent，以便 Agent 能够在生成新版产物时做针对性修改与高亮定位。
5. **内联代码编辑**：产物预览区支持一键切换“编辑模式”，支持用户直接在网页端修改代码，保存时自动创建并推送新版本 `v(X+1)` 至全局 Store 及后端服务。

---

## 2. 扩展数据模型设计 (TypeScript)

为了支持第三阶段的全新特性，需要扩展 `src/types/index.ts` 中的核心数据结构。

### 2.1 消息类型与附件定义

```typescript
// 扩展原有的 MessageType
export type MessageType = 
  | 'text' 
  | 'code' 
  | 'artifact' 
  | 'task-plan' 
  | 'status'
  | 'image'      // 图片消息
  | 'document';  // 文档消息 (ppt, pdf 等)

// 消息附件定义
export interface MessageAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'ppt' | 'other';
  url: string;
  size?: number;
  meta?: {
    width?: number;
    height?: number;
    pages?: number; // PDF/PPT 页数
  };
}

// 产物选区引用定义
export interface ArtifactReference {
  artifactId: string;
  artifactTitle: string;
  version: number;
  quotedText: string;
  startLine?: number;
  endLine?: number;
}
```

### 2.2 消息模型扩展

```typescript
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
  
  // ============ 第三阶段新增字段 ============
  attachments?: MessageAttachment[]; // 消息附件列表
  quotedMessage?: {                  // 回复引用的消息概要
    id: string;
    senderName: string;
    content: string;
  };
  artifactRef?: ArtifactReference;   // 引用的产物及其选区信息
  isPinned?: boolean;                // 是否已被 Pin (存为长期记忆)
}
```

---

## 3. 聊天界面核心交互设计

### 3.1 跨日期显示逻辑 (Date Dividers)

当聊天记录跨越不同日期时，应在消息列表之间自动计算并渲染一个“日期分隔栏”。

#### 3.1.1 渲染计算法则
在 `MessageList` 遍历渲染消息时，计算当前消息 `messages[i]` 与上一条消息 `messages[i-1]` 的 `createdAt` 日期（`YYYY-MM-DD` 格式）：
- 若 `messages[i-1]` 不存在，或两者的日期不一致，则在 `messages[i]` 上方渲染一个日期分隔组件。
- 格式化输出为：当天显示“今天”，前一天显示“昨天”，其余显示“YYYY年MM月DD日”（如 `2026年05月25日`）。

```typescript
// 计算辅助函数示例
export function getMessageDateDivider(currTime: string, prevTime?: string): string | null {
  const currDate = currTime.split(' ')[0]; // 提取 YYYY-MM-DD
  const prevDate = prevTime ? prevTime.split(' ')[0] : null;

  if (currDate !== prevDate) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (currDate === today) return '今天';
    if (currDate === yesterday) return '昨天';
    return currDate.replace(/-/g, ' 年 ').concat(' 日').replace(' 年 ', ' 年 ').replace(' 年 ', ' 月 '); // 格式化为：2026年05月25日
  }
  return null;
}
```

#### 3.1.2 UI 样式规范
- 居中居于两条消息之间，上下外边距 `my-5`。
- 字体：`text-[10px] font-semibold text-slate-400 select-none bg-slate-50 border border-slate-200/50 px-2.5 py-0.5 rounded-full shadow-inner`。

---

### 3.2 气泡悬停动效与多功能组件 (Hover Multitool & Time)

每个聊天气泡容器在鼠标悬停（Hover）时，触发微交互，动态显露细节与操作按钮。

```text
+-------------------------------------------------------------------------------+
| [Avatar]  DocAgent   13:42:15                                                |
|           +-------------------------------------------------------+           |
|  13:42:15 | 消息内容区域                                           | [回复]     |
|   (左侧)  |                                                       | [Pin]      |
|  (Hover显)| +---------------------------------------------------+ | [更多]     |
|           | | 产物引用卡片                                       | | (Hover显)  |
|           | +---------------------------------------------------+ |           |
|           +-------------------------------------------------------+           |
+-------------------------------------------------------------------------------+
```

#### 3.2.1 时间滑出动效 (Hover Time)
- **触发**：鼠标 Hover 消息整行容器 (`group`)。
- **左侧时间显示**：对于 Agent 消息，精准时间（`HH:mm:ss`）从气泡左边缘滑出（或者淡入），不引起界面排版错动；对于 User 消息，精准时间从气泡右边缘滑出。
- **过渡动画**：`transition-all duration-200 ease-out opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0`。

#### 3.2.2 悬停功能菜单 (Hover Action Bar)
- **触发**：鼠标 Hover 消息整行容器时，在气泡边缘（如果是左侧气泡则显在右外侧，右侧气泡显在左外侧）淡入一个操作条。
- **动作按钮**：
  1. **回复**：点击后将此条消息内容和发送人追加到输入框顶部的 `replyContext` 中，实现类似于 Slack/微信 的消息回复流。
  2. **Pin (长期记忆)**：点击后触发 API 并把 `isPinned` 状态设为 `true`。Pin 成功的消息会加上带金色发光效果的 Pin 标识，且被加入会话的长期记忆库。
  3. **复制**：快捷复制当前气泡纯文本内容。

---

### 3.3 多样化消息卡片渲染设计 (Diverse Cards)

#### 3.3.1 图片消息 (`image`)
- 渲染一个优雅的图片容器，带轻量级边框阴影。
- 鼠标悬停显示大图预览放大镜，支持点击弹窗灯箱（Lightbox）缩放。

#### 3.3.2 文档消息 (`document` - PPT / PDF)
- 渲染为功能型的文档卡片。
- 左侧为文件类型图标（PPT 使用橙红色卡，PDF 使用中国红卡），右侧为文件名、文件大小、页数信息（例如：`18页`）。
- 底部带“在线预览”和“下载”按钮，悬停时产生立体缩进感。

---

## 4. 产物引用与精准定位设计 (Artifact Quoting)

当用户与 Agent 针对某一产物进行迭代对话时，最核心的交互是**基于产物内容进行定点提问**。

### 4.1 产物端划词引用微交互
1. **划词监听**：在 `ArtifactPreview` 处于 `source` 或 `preview` 的文本渲染区域（如 `pre` 或 Markdown 视图），监听用户的选区事件 (`onMouseUp` / `onSelectionChange`)。
2. **悬浮引用按钮 (Floating Popover)**：
   - 若用户选中了某段文本，立即计算选区坐标，在选区正上方弹出一个精致的 `Quote` 悬浮药丸按钮：“**引用所选内容**”。
   - 样式：`bg-slate-900 text-white text-[11px] px-3 py-1 rounded-full shadow-lg border border-slate-700 hover:bg-slate-800 transition-all flex items-center gap-1 cursor-pointer z-50`。

```text
                  +-------------+
                  |  引用选区   |  <--- 选区上方的 Floating Popover
                  +------v------+
     const [username, setUsername] = useState('');
     |---------------------------|  <--- 用户选中的代码片段
```

### 4.2 引用数据装载与取消
1. 点击“引用所选内容”后，前端自动获取：
   - 产物的 `artifactId` 和标题（例如 `LoginPage.tsx`）。
   - 当前预览的版本号（例如 `v2`）。
   - 选中的文本字符串 (`quotedText`)。
   - 对应的起始行号与结束行号（若是代码比对器或编辑器中选区，可从 Line 序号节点向上回溯提取）。
2. **输入框上方装载**：在 `ChatInput` 消息框顶部渲染一个类似信封的“引用状态栏”：
   - 样式：`bg-slate-50 border-t border-l border-r border-slate-200 rounded-t-xl px-4 py-2 flex items-center justify-between text-[11px] text-slate-500`。
   - 内容：显示 `引用自 LoginPage.tsx (v2) 第 12-14 行`，并截断显示选中文本前 20 字。
   - 右侧带 `X` 按钮，点击可一键清除引用状态。

---

### 4.3 消息体渲染与定位
当带有引用的消息发出后，渲染如下：
- **气泡内置引用卡片**：在用户发送的文本气泡内，顶部先渲染一个深灰/暗灰色的引用块，包含产物图标、产物名、版本号以及被引用的代码/文本片段（带等宽字体渲染和行号背景）。
- **反向定位机制**：点击引用卡片上的“定位”按钮，右侧产物面板如果未打开则自动打开，并自动切到对应的产物、对应的版本，甚至平滑滚动并高亮闪烁对应的行数区间！

```typescript
// 产物反向定位伪代码
const handleLocateArtifactRef = (ref: ArtifactReference) => {
  // 1. 设置 store 中选中的产物与版本
  setSelectedArtifactId(ref.artifactId);
  setSelectedArtifactVersion(ref.version);
  
  // 2. 延时等待 DOM 渲染后滚动到行号
  setTimeout(() => {
    const lineElement = document.querySelector(`[data-line-number="${ref.startLine}"]`);
    if (lineElement) {
      lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lineElement.classList.add('bg-yellow-500/20', 'transition-all');
      setTimeout(() => {
        lineElement.classList.remove('bg-yellow-500/20');
      }, 2000);
    }
  }, 100);
};
```

---

## 5. 产物内联代码编辑设计 (Code Editing)

为了支持开发者直接微调产物代码，我们在 `ArtifactPreview` 中新增交互式编辑架构。

### 5.1 编辑模式切换与 UI 态

1. **入口**：在 `ArtifactPreview` 顶部控制栏，当产物类型为 `code` 或 `markdown` 时，右侧操作组新增一个 **“编辑” (Edit)** 按钮（带 `Edit3` 图标）。
2. **视图切换**：点击后，`renderContent()` 区域从只读的 `pre` 视图切换为编辑器视图：
   - 对于文本编辑，可渲染一个高性能的 `Monaco Editor` 实例，或者精仿的 Monaco 文本编辑域（含左侧行号计数器、当前修改行背景加深、实时语法检测）。
   - 样式上进入“专注编辑状态”，气泡或预览面板边缘微发光。

```text
+-------------------------------------------------------------------------------+
|  LoginPage.tsx (v3) [预览] [源码] [对比]                  [取消] [保存新版本]  |
+-------------------------------------------------------------------------------+
|  1 | import React, { useState } from 'react';                                 |
|  2 |                                                                          |
|  3 | const LoginPage: React.FC = () => {                                      |
|  4 |   const [username, setUsername] = useState('admin|');  <-- 光标编辑处     |
|  5 |                                                                          |
+-------------------------------------------------------------------------------+
```

### 5.2 保存与版本提交机制

编辑时，底部或顶部控制条提供两个核心动作：
1. **取消**：若代码有变动，弹窗提示“内容已修改，确认放弃编辑吗？”，确认后回滚到原版只读态。
2. **保存为新版本 (Save as vNext)**：
   - 触发 HTTP API 或 WS 事件，发送最新修改的代码字符串给后端：
     `POST /api/v1/artifacts/{artifactId}/versions`
     Payload: `{ content: string, description: "User manual edit" }`
   - 后端保存成功后，返回新版本产物的元数据（版本号增加，如 `v4`）。
   - 前端 Store 将此产物追加进 `artifacts` 版本树，将全局 `selectedArtifactId` 指向该新产物 ID，并自动退出编辑状态，切回 `preview` 只读视图。
   - 聊天区自动静默或推送一条系统级别气泡：“**用户手动编辑了 LoginPage.tsx，已生成新版本 v4**”，确保协作历史的完整审计。

---

## 6. API 与 WebSocket 协议扩展

### 6.1 WebSocket 消息发送载荷扩展 (`conversation.message.create`)

在发送用户消息时，增加附件与引用元数据：

```json
{
  "eventId": "evt_12345678",
  "type": "conversation.message.create",
  "data": {
    "conversationId": "conv-group-website",
    "content": "请把登录框中这一段的初始值改一下",
    "quotedMessageId": "msg-original-id", // 回复的消息ID，可选
    "artifactRef": {                     // 划词引用的产物片段，可选
      "artifactId": "art-login-page",
      "artifactTitle": "LoginPage.tsx",
      "version": 2,
      "quotedText": "const [username, setUsername] = useState('');",
      "startLine": 4,
      "endLine": 4
    }
  }
}
```

### 6.2 新增 HTTP API 终结点

为了满足 Pin 记忆与版本保存需求，后端服务需要支持以下 REST 接口：

#### 6.2.1 长期记忆 (Pin) 接口
- **Pin 消息**：`POST /api/v1/conversations/{conversationId}/pins` 
  - Payload: `{ messageId: string }`
- **取消 Pin**：`DELETE /api/v1/conversations/{conversationId}/pins/{messageId}`
- **获取长期记忆树**：`GET /api/v1/conversations/{conversationId}/pins`

#### 6.2.2 产物手动保存接口
- **创建新版本**：`POST /api/v1/artifacts/{artifactId}/versions`
  - Payload: `{ content: string, description?: string }`
  - Response: 返回新版 `ArtifactMeta` 数据。

---

## 7. 前端组件与目录演进规划

第三阶段将涉及对现有关键组件的改写及新组件的扩充：

```text
src/
├── components/
│   ├── chat/
│   │   ├── MessageList.tsx           # 修改：遍历渲染时计算并插入 DateDivider
│   │   ├── MessageBubble.tsx         # 修改：增加悬浮多功能按钮与滑出时间，渲染多种卡片
│   │   ├── AttachmentCard.tsx        # [NEW] 渲染图片、PPT、PDF附件的精美微缩卡片
│   │   ├── ChatInput.tsx             # 修改：顶部支持渲染“回复引用”和“划词引用”信封条
│   │   └── ArtifactRefBubble.tsx     # [NEW] 用户气泡内展示划词引用的预览框
│   │
│   └── artifact/
│       ├── ArtifactPreview.tsx       # 修改：监听划词Selection弹出引用框，支持内联编辑模式
│       └── CodeEditorContainer.tsx   # [NEW] 内联代码编辑器（支持行号、改动高亮）
```

---

## 8. 总结

AgentHub 第三阶段的前端设计通过聚焦于**聊天体验的完善**与**内联编辑的打通**，填补了人机协作中最关键的“**反馈与修改闭环**”。

通过**划词引用技术**，用户不再需要繁琐地用文字向 Agent 描述“第几行哪个变量应该怎么改”，而是可以直接像代码评审一样对产物进行拉选并附带提问，大幅提升了大模型定位修改的准确率。
通过**内联直接编辑**，给用户留出了“人工接管”的终极权限，使得 AgentHub 从一个单向的“AI 输出机”演进为一个真正的“人机共创 IDE 工作台”。
