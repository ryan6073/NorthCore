# AgentHub Frontend

AgentHub Frontend 是 NorthCore 项目的 Web 前端，负责承载多智能体协作、会话聊天、Agent 管理、产物预览、沙箱运行、文件预览和工作区浏览等核心交互。项目使用 Vite + React + TypeScript 开发，样式体系基于 Tailwind CSS，状态管理使用 Zustand。

这个前端既支持连接真实后端，也支持 Mock 模式。Mock 模式适合在后端不可用时进行界面开发、交互验证和预览能力调试。

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 构建工具 | Vite |
| UI 框架 | React 18 |
| 类型系统 | TypeScript |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| HTTP 请求 | Axios |
| 图标 | lucide-react |
| Markdown 渲染 | react-markdown、remark-gfm |
| 代码高亮 | highlight.js |
| 图表渲染 | Mermaid |
| 差异对比 | react-diff-viewer-continued |
| 演示文稿预览 | pptx-preview |

## 快速开始

进入前端目录：

```bash
cd frontend
```

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认开发地址：

```text
http://localhost:9006
```

生产构建：

```bash
npm run build
```

本地预览构建产物：

```bash
npm run preview
```

## 环境变量

前端会读取 Vite 环境变量。可以在 `frontend/.env.local` 中配置本地环境：

```env
VITE_API_BASE_URL=/api/v1
VITE_USE_MOCK=false
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | 后端 API 基础路径。真实环境可配置为完整后端地址。 |
| `VITE_USE_MOCK` | `false` | 是否启用 Mock 模式。设为 `true` 时使用前端内置模拟数据。 |

示例：

```env
VITE_API_BASE_URL=https://example.com/api/v1
VITE_USE_MOCK=true
```

修改环境变量后需要重启开发服务器。

## 目录结构

```text
frontend
├── docs
│   ├── api-contract.md          # 前后端 API 契约
│   └── feature-design.md        # 功能设计文档
├── src
│   ├── components               # 页面组件和业务组件
│   │   ├── agent                # Agent 列表、详情、配置、办公室状态
│   │   ├── artifact             # 产物列表、预览、版本、代码差异
│   │   ├── auth                 # 登录视图
│   │   ├── chat                 # 会话详情、消息气泡、附件、部署卡片
│   │   ├── common               # 通用组件
│   │   ├── file                 # PDF、PPT 等文件预览
│   │   ├── layout               # 主布局、侧边栏、标题栏、右侧面板
│   │   ├── modal                # 弹窗组件
│   │   └── sandbox              # 沙箱运行、部署状态、部署预览
│   ├── mock                     # Mock 数据和模拟场景
│   ├── services                 # HTTP、WebSocket 和业务服务
│   │   ├── http                 # REST API 封装
│   │   └── ws                   # WebSocket 客户端和流式消息处理
│   ├── store                    # Zustand 状态管理
│   ├── types                    # 全局类型定义
│   ├── utils                    # 时间、ID、平台判断等工具函数
│   ├── App.tsx                  # 应用主入口组件
│   ├── index.css                # 全局样式
│   └── main.tsx                 # React 挂载入口
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## 应用结构

前端主界面由 `App.tsx` 组织，整体布局以 `components/layout` 下的组件为主：

- `AppLayout`：应用主布局容器。
- `LeftNavBar`：左侧主导航。
- `LeftSidebar`：会话、Agent、工作区等左侧内容区。
- `ChatPanel`：聊天详情页，负责消息列表、输入框、附件、时间分隔条和滚动定位。
- `RightPanel`：右侧详情区域，用于展示 Agent 配置、产物、文件预览等内容。
- `WorkspacePanel`：工作区相关视图。
- `NotificationPanel`：通知和运行状态展示。

常见交互路径：

```text
登录
  -> 进入主界面
  -> 选择会话或新建会话
  -> 在 ChatPanel 中发送消息
  -> 消息通过 HTTP 或 WebSocket 更新
  -> Agent 返回文本、状态、任务计划、附件或产物
  -> 右侧面板查看产物、版本、预览和部署结果
```

## 核心模块

### 会话与消息

会话和消息相关逻辑主要位于：

```text
src/components/chat
src/store/useAgentHubStore.ts
src/services/http/conversationService.ts
src/services/http/messageService.ts
src/services/ws
```

支持能力：

- 单 Agent 会话。
- 多 Agent 会话。
- 用户消息、Agent 消息、状态消息、任务计划消息。
- 图片、文件等附件展示。
- 产物消息展示。
- 消息置顶。
- 消息时间分隔条。
- 历史消息加载。
- 进入会话后默认定位到最新消息。
- WebSocket 流式消息更新。

聊天详情页的显示逻辑集中在 `ChatPanel.tsx` 和 `MessageBubble.tsx` 中。涉及滚动、消息分组、时间分隔条、附件展示、Markdown 渲染时，优先检查这两个组件。

### Agent 管理

Agent 相关组件位于：

```text
src/components/agent
```

主要能力：

- Agent 列表展示。
- Agent 详情查看。
- Agent 配置编辑。
- 会话级 Agent 配置。
- Agent 联系人卡片。
- Agent 办公室状态展示。
- 多 Agent 会话中的 Agent 协作状态展示。

常见组件：

- `AgentList.tsx`：Agent 列表。
- `AgentDetailPanel.tsx`：Agent 详情和配置面板。
- `AgentConfigForm.tsx`：Agent 配置表单。
- `AgentContactCard.tsx`：联系人卡片。
- `AgentOfficePlayground.tsx`：办公室状态展示。

### 产物预览

产物相关组件位于：

```text
src/components/artifact
src/components/chat/ArtifactMessage.tsx
src/components/modal/ArtifactFullScreenModal.tsx
```

支持的预览类型包括：

- HTML
- Markdown
- Mermaid
- 代码文件
- 图片
- 文档类文件
- PPT 类文件
- 纯文本文件

主要能力：

- 查看产物列表。
- 查看产物版本。
- 查看当前版本内容。
- 全屏预览。
- 代码高亮。
- 代码差异对比。
- Mermaid 图形渲染和缩放。
- Markdown 表格、列表、代码块等渲染。

如果 HTML 或 Markdown 预览异常，优先检查：

```text
src/components/artifact/ArtifactPreview.tsx
src/components/chat/MarkdownRenderer.tsx
src/mock
src/services/http/artifactService.ts
```

### 文件预览

文件预览组件位于：

```text
src/components/file
```

支持能力：

- PDF 预览。
- PPT 预览。
- 文件内容预览。
- 与工作区文件树联动。

常见组件：

- `FilePreviewPanel.tsx`
- `PdfPreview.tsx`
- `PptxPreview.tsx`

### 沙箱与部署

沙箱和部署相关组件位于：

```text
src/components/sandbox
src/store/useDeploymentStore.ts
src/services/http/deploymentService.ts
src/services/http/sandboxService.ts
```

支持能力：

- 沙箱运行状态展示。
- 部署任务展示。
- 部署日志展示。
- 部署结果预览。
- HTML 预览链接展示。
- Mock 模式下的沙箱场景模拟。

### 工作区

工作区相关能力包括：

- 文件树展示。
- 文件预览。
- 沙箱文件读取。
- 部署产物查看。

主要组件：

```text
src/components/layout/FileTreePanel.tsx
src/components/layout/WorkspacePanel.tsx
src/services/http/workspaceService.ts
src/services/http/filePreviewService.ts
```

## 状态管理

项目使用 Zustand 管理全局业务状态。

主要 Store：

```text
src/store/useAgentHubStore.ts
src/store/useDeploymentStore.ts
```

`useAgentHubStore.ts` 负责：

- 当前用户。
- 登录与退出。
- Mock 模式切换。
- Agent 列表。
- 会话列表。
- 当前会话。
- 消息列表。
- 产物列表。
- Pin、Memory、回复上下文。
- Agent 配置面板状态。
- 新建会话弹窗状态。

`useDeploymentStore.ts` 负责：

- 沙箱运行状态。
- 部署任务。
- 部署日志。
- 文件冲突。
- 部署结果。

新增全局状态时建议先判断：

- 是否真的需要跨组件共享。
- 是否应该放在现有 Store 中。
- 是否可以作为局部组件状态保留。
- 是否需要在退出登录、切换账号、切换会话时清理。

## 服务层

HTTP 服务统一放在：

```text
src/services/http
```

当前服务包括：

- `authService.ts`：登录、用户认证。
- `agentService.ts`：Agent 查询和配置。
- `conversationService.ts`：会话列表、新建会话、会话详情。
- `messageService.ts`：消息发送和拉取。
- `artifactService.ts`：产物和版本。
- `attachmentService.ts`：附件。
- `deploymentService.ts`：部署。
- `sandboxService.ts`：沙箱。
- `workspaceService.ts`：工作区。
- `filePreviewService.ts`：文件预览。
- `modelService.ts`：模型配置。
- `healthService.ts`：服务健康检查。

基础 HTTP 实例位于：

```text
src/services/index.ts
```

这里会处理：

- API 基础路径。
- 请求超时。
- `Authorization` 请求头。
- 业务响应解包。
- 401 认证失效处理。
- 沙箱相关请求日志。

WebSocket 相关逻辑位于：

```text
src/services/ws
```

主要用于：

- 消息流式返回。
- Agent 状态更新。
- 会话运行状态同步。

## 类型定义

全局类型集中在：

```text
src/types/index.ts
```

常见类型包括：

- `Agent`
- `Conversation`
- `Message`
- `Artifact`
- `ArtifactVersion`
- `SandboxFile`
- `SandboxConflict`
- `SandboxHtmlPreview`

新增接口字段时，需要同步检查：

- 后端 API 契约。
- HTTP service 返回类型。
- Store 中的数据结构。
- 组件渲染逻辑。
- Mock 数据。

## Mock 模式

Mock 模式用于本地开发和 UI 调试，不依赖真实后端。

开启方式：

```env
VITE_USE_MOCK=true
```

Mock 数据位于：

```text
src/mock
```

主要文件：

- `index.ts`：Agent、会话、消息、产物等基础 Mock 数据。
- `sandboxMockData.ts`：沙箱运行、部署和文件场景。
- `webSearchMockData.ts`：联网搜索相关模拟数据。

修改 Mock 数据时要注意：

- 中文内容必须直接写中文，不要写成 Unicode 转义。
- 消息、产物、版本之间的 ID 要能对应。
- `artifactId` 要能在产物列表中找到。
- `version.artifactId` 要能对应到正确产物。
- HTML、Markdown、Mermaid 内容要保持格式完整。

## API 文档

接口契约文档位于：

```text
docs/api-contract.md
```

功能设计文档位于：

```text
docs/feature-design.md
```

真实接口联调时建议优先确认：

- API 基础路径是否正确。
- 登录后是否写入 token。
- 请求头是否带上 `Authorization`。
- 后端返回结构是否符合 `BaseApiResponse`。
- 会话、消息、产物、版本字段是否与前端类型一致。

## 开发规范

### 组件开发

- 优先复用现有组件和样式，不轻易新增一套视觉规则。
- 页面级布局放在 `components/layout`。
- 聊天消息相关 UI 放在 `components/chat`。
- Agent 相关 UI 放在 `components/agent`。
- 产物相关 UI 放在 `components/artifact`。
- 通用组件放在 `components/common`。

### 状态与数据

- 跨页面共享状态放到 Store。
- 单组件内部状态优先用 React 本地状态。
- 异步请求优先封装到 `services/http`。
- WebSocket 推送优先封装到 `services/ws`。
- 切换账号、退出登录、新建会话、切换会话时，要检查旧状态是否需要清理。

### 样式

- 优先使用 Tailwind CSS。
- 保持组件内样式和现有设计语言一致。
- 避免在多个组件中复制大段样式。
- 复杂交互组件可以抽取局部子组件。

### 编码

- 所有文件使用 UTF-8 编码。
- 不使用 UTF-16、GBK 或带 BOM 的 UTF-8。
- 中文直接写中文，不使用 `\uXXXX` 转义。
- 文件写入时必须保证 UTF-8。

## 常用开发任务

### 新增一个 HTTP 接口

1. 在 `src/services/http` 中新增或更新对应 service。
2. 在 `src/types` 中补充类型。
3. 在 Store 或组件中调用 service。
4. 如果支持 Mock 模式，同步补充 `src/mock` 数据。
5. 检查真实模式和 Mock 模式是否都能运行。

### 新增一种产物预览

1. 在类型定义中确认产物类型。
2. 在 `ArtifactPreview.tsx` 中补充分支。
3. 如果需要全屏预览，同步检查 `ArtifactFullScreenModal.tsx`。
4. 如果产物来自消息，同步检查 `ArtifactMessage.tsx`。
5. 为 Mock 模式补充对应产物和版本数据。

### 修改消息展示逻辑

1. 优先检查 `ChatPanel.tsx`。
2. 消息气泡样式检查 `MessageBubble.tsx`。
3. Markdown 内容检查 `MarkdownRenderer.tsx`。
4. 附件展示检查 `AttachmentCard.tsx`。
5. 产物消息检查 `ArtifactMessage.tsx`。
6. 修改滚动逻辑后，需要验证进入会话、重复进入会话、加载历史消息和发送新消息四种场景。

### 修改 Agent 配置逻辑

1. 检查 `AgentDetailPanel.tsx` 和 `AgentConfigForm.tsx`。
2. 检查 `useAgentHubStore.ts` 中的配置状态。
3. 检查新建会话弹窗和多 Agent 会话中的配置入口。
4. 验证切换 Agent、关闭面板、退出登录、切换账号后状态是否正确。

## 验证建议

提交前建议至少执行：

```bash
npm run build
```

如果只想检查 TypeScript：

```bash
npx tsc --noEmit
```

同时建议人工验证：

- 登录真实模式。
- 登录 Mock 模式。
- 新建单 Agent 会话。
- 新建多 Agent 会话。
- 发送普通文本消息。
- 发送带附件消息。
- 查看 HTML、Markdown、Mermaid 产物预览。
- 切换产物版本。
- 打开全屏预览。
- 加载历史消息。
- 退出登录后切换账号。

## 常见问题

### 开发服务器端口是多少？

开发服务器默认端口是 `9006`。配置位于：

```text
vite.config.ts
```

### 为什么修改环境变量后没有生效？

Vite 只会在启动时读取环境变量。修改 `.env.local` 后需要重启开发服务器。

### 如何切换 Mock 模式？

在 `frontend/.env.local` 中设置：

```env
VITE_USE_MOCK=true
```

然后重启开发服务器。

### 如何连接真实后端？

在 `frontend/.env.local` 中设置：

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://example.com/api/v1
```

如果使用本地代理或同源部署，也可以保持默认：

```env
VITE_API_BASE_URL=/api/v1
```

### 真实模式登录后接口 401 怎么排查？

优先检查：

- 登录接口是否成功返回 token。
- token 是否写入 `localStorage`。
- 请求头是否带上 `Authorization`。
- 后端 token 是否过期。
- API 基础路径是否指向正确环境。

### 消息进入会话后没有定位到最新消息怎么办？

优先检查：

```text
src/components/chat/ChatPanel.tsx
```

重点关注：

- 首次进入会话的滚动定位。
- 重复点击同一个会话是否重复拉取。
- 加载历史消息后是否保留当前位置。
- 插入时间分隔条后是否影响高度计算。
- 图片、附件、Mermaid 等异步渲染完成后是否需要再次校准。

### HTML 产物为什么显示源码而不是页面？

优先检查：

```text
src/components/artifact/ArtifactPreview.tsx
src/components/modal/ArtifactFullScreenModal.tsx
```

需要确认：

- 产物类型是否被识别为 HTML。
- 版本内容是否是完整 HTML。
- 预览组件是否使用 HTML 渲染分支。
- Mock 数据中的 `artifactId` 和版本是否对应。

### Mermaid 没有渲染成图怎么办？

优先检查：

```text
src/components/chat/MarkdownRenderer.tsx
src/components/artifact/ArtifactPreview.tsx
```

需要确认：

- Mermaid 代码块语言是否是 `mermaid`。
- Mermaid 内容语法是否有效。
- 渲染库是否正常加载。
- 容器尺寸是否足够。
- 缩放区域是否遮挡图形顶部。

## 相关文档

- `docs/api-contract.md`：API 契约文档。
- `docs/feature-design.md`：功能设计文档。
