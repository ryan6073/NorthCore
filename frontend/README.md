# AgentHub Frontend

AgentHub Frontend 是 NorthCore 项目的 Web 前端，提供多智能体协作、会话聊天、Agent 管理、产物预览、沙箱部署和文件预览等能力。项目基于 Vite、React、TypeScript 和 Tailwind CSS 构建。

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Axios
- react-markdown + remark-gfm
- Mermaid
- highlight.js
- lucide-react

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

构建生产包：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

## 环境变量

前端会读取以下环境变量：

```env
VITE_API_BASE_URL=/api/v1
VITE_USE_MOCK=false
```

说明：

- `VITE_API_BASE_URL`：后端 API 地址，默认是 `/api/v1`。
- `VITE_USE_MOCK`：是否启用 Mock 模式，设为 `true` 时使用前端内置模拟数据。

可在 `frontend/.env.local` 中配置本地环境变量。

## 目录结构

```text
frontend
├── docs                      # 前后端接口契约和功能设计文档
├── src
│   ├── components            # 页面组件和业务组件
│   │   ├── agent             # Agent 列表、配置、详情和办公室状态
│   │   ├── artifact          # 产物列表、预览、版本和代码差异
│   │   ├── auth              # 登录视图
│   │   ├── chat              # 聊天详情、消息气泡、附件和部署卡片
│   │   ├── common            # 通用组件
│   │   ├── file              # PDF、PPT 等文件预览
│   │   ├── layout            # 主布局、侧边栏、标题栏和右侧面板
│   │   ├── modal             # 弹窗组件
│   │   └── sandbox           # 沙箱运行和部署视图
│   ├── mock                  # Mock 模式数据和场景
│   ├── services              # HTTP、WebSocket 和业务服务封装
│   ├── store                 # Zustand 状态管理
│   ├── types                 # 全局类型定义
│   └── utils                 # 时间、ID、平台判断等工具函数
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 核心功能

### 会话与消息

- 支持单 Agent 会话和多 Agent 会话。
- 支持用户消息、Agent 消息、状态消息、任务计划、附件和产物消息。
- 聊天详情页包含时间分隔条、消息定位、历史消息加载和消息渲染逻辑。

### Agent 管理

- 支持 Agent 列表、详情、配置和会话级配置。
- 支持新建会话时选择 Agent。
- 支持 Agent 办公室状态展示，用于呈现多 Agent 协作时的状态感。

### 产物预览

- 支持代码、HTML、Markdown、Mermaid、图片、文档和演示文件等产物类型。
- 支持产物版本查看、全屏预览和代码差异查看。
- Mermaid 预览支持图形渲染和缩放交互。

### 文件与沙箱

- 支持工作区文件树展示。
- 支持沙箱运行状态、部署结果和 HTML 预览。
- 支持 PDF、PPT 等文件预览能力。

### Mock 模式

Mock 模式用于本地开发和界面联调，不依赖真实后端。开启方式：

```env
VITE_USE_MOCK=true
```

Mock 数据主要位于：

```text
src/mock
```

## 后端接口

接口契约文档位于：

```text
docs/api-contract.md
```

前端 HTTP 服务封装位于：

```text
src/services/http
```

WebSocket 相关逻辑位于：

```text
src/services/ws
```

## 开发规范

- 新增 UI 优先复用现有组件和样式体系。
- 状态管理优先集中在 `src/store` 中，避免组件之间重复维护同一份业务状态。
- HTTP 请求优先放在 `src/services/http` 中封装。
- WebSocket 消息处理优先放在 `src/services/ws` 中维护。
- 新增类型应放在 `src/types`，避免在多个组件中重复定义。
- 产物、消息和附件相关逻辑改动后，需要同时检查 Mock 模式和真实接口模式。

## 常用命令

```bash
npm run dev
npm run build
npm run preview
```

## 常见问题

### 开发服务器端口是多少？

Vite 配置中固定使用 `9006` 端口，配置文件为 `vite.config.ts`。

### 如何切换 Mock 模式？

在 `.env.local` 中设置：

```env
VITE_USE_MOCK=true
```

修改环境变量后需要重启开发服务器。

### 如何修改 API 地址？

在 `.env.local` 中设置：

```env
VITE_API_BASE_URL=https://example.com/api/v1
```

如果不设置，默认请求 `/api/v1`。

## 相关文档

- `docs/api-contract.md`：API 契约文档
- `docs/feature-design.md`：功能设计文档
