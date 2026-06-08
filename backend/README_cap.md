# NorthCore / AgentHub

NorthCore / AgentHub 是一个面向 AI Agent 协作开发的工作台。项目围绕「会话、Agent、Workspace、Sandbox Run、Artifact、Deployment」形成闭环：用户在聊天中提出需求，系统判断是普通对话、产物型任务还是部署任务，再由 Orchestrator 和成员 Agent 按工具权限完成规划、执行、产物同步和部署。

和普通聊天应用不同，AgentHub 的目标不是只返回一段文本，而是让 AI Agent 能在受控 workspace 中持续生成、修改、验证和交付项目文件。workspace 是项目级持久工作区，conversation 是交互入口，run 是一次任务执行记录，artifact 是 workspace 中可展示和版本化的产物。

## 核心功能

### 1. 多类型会话与 Workspace 绑定

项目支持三类会话：

- `single chat`：用户手动创建的单 Agent 会话，适合一对一完成任务。
- `group chat`：多个 Agent 协作的群聊，会自动加入 Orchestrator 负责规划和调度。
- `agent contact chat`：Agent 联系人长期会话，适合普通问答、记忆和上下文延续。

会话可以绑定 workspace。绑定后，用户后续提出的生成、修改、部署类任务都会围绕同一个 workspace 继续推进，而不是每轮任务重新开始。

### 2. Agent 管理与 Tool Catalog 权限体系

后端支持 Agent 的列表、详情、创建、更新、启用状态、分类、provider、runtime、system prompt、model config 和 tools 配置。

Agent 的能力由 Tool Catalog 描述，`tools` 是权限 source of truth，旧字段 `permissions` 主要作为兼容摘要。典型工具能力包括：

- `workspace.read`：读取 workspace 文件、上下文和依赖信息。
- `workspace.write`：写入 workspace 文件。
- `command.run`：在 sandbox 中执行命令。
- `environment.setup`：安装依赖或准备运行环境。
- `web.search`：普通聊天中的联网搜索增强。
- `deploy.run`：发起 workspace 部署。
- `platform.runtime_write`：允许 Codex、Claude Code、OpenCode 等 platform runtime 自由修改 workspace。

群聊部署时，如果用户没有显式指定 Agent，后端只会在成员中自动选择唯一一个拥有 `deploy.run` 的 Agent；如果有多个候选，会要求用户明确指定。

### 3. 普通消息、WebSocket 与流式状态

消息模块同时支持 HTTP 和 WebSocket：

- 用户消息会持久化到数据库。
- 普通 chat 会返回 Agent 回复。
- Sandbox Run、Deployment、Artifact 更新会通过状态消息和 WebSocket 事件推送给前端。
- 系统状态消息不会进入模型上下文，避免污染后续 Agent 判断。

前端可以通过 WebSocket 接收 `run.created`、`run.step.updated`、`artifact.created`、`deployment.updated` 等事件，用于刷新右侧 artifact 区、run 面板和部署状态。

### 4. Execution Mode 智能分流

用户发送消息后，后端会判断任务应该进入哪条流程：

- `chat`：普通解释、问答、分析、翻译、讨论。
- `sandbox`：生成文件、修改代码、创建项目、产生产物。
- `deployment`：部署当前 workspace，返回可访问 URL。

分流逻辑优先尊重前端显式 payload，其次结合会话类型、Agent 配置和 Orchestrator 判断。这样可以避免普通解释类问题误进入 sandbox，也能让产物型任务自动进入执行链路。

### 5. Orchestrator DAG 协作调度

在 group chat 中，Orchestrator 是系统调度器，负责：

- 理解用户任务。
- 拆解 DAG step。
- 选择合适成员 Agent。
- 汇总执行结果。
- 推送任务状态。

Orchestrator 本身不直接读写 workspace、不执行命令、不部署服务。真正执行文件读写、命令和部署的是拥有对应工具权限的成员 Agent。

### 6. Sandbox Run、工具调用与安全执行

产物型任务会创建 Sandbox Run。Run 会绑定 workspace，并在 Docker sandbox 中执行。

Sandbox Run 支持：

- run、step、container 生命周期管理。
- DAG step 状态流转。
- 工具调用记录。
- 文件读写、命令执行、依赖检查、环境准备。
- 失败、取消、冲突、blocked 等状态。
- run 输出同步到 workspace 文件版本和 artifact。

工具调用会经过后端权限校验，不能只依赖模型提示词自觉。比如没有 `workspace.write` 的 Agent 不能调用写文件工具，没有 `command.run` 的 Agent 不能执行命令。

### 7. Workspace Mutation Lock 与 DAG Step 并行

为了避免多个任务同时修改同一个 workspace，后端实现了 workspace mutation lock：

- `read run` 不占用写锁。
- `write run` 和 `deploy run` 必须按 workspace 串行。
- queued run 等待锁期间不会创建 sandbox、不会规划 DAG、不会读取动态 workspace context。
- lock 带 heartbeat、lease 和 fencing token，避免旧任务丢锁后继续写入。

同一个 run 内部支持有限 DAG step 并行。调度器会根据 `mutationMode`、`targetPaths`、`readPaths` 和 `SANDBOX_MAX_PARALLEL_STEPS` 判断 step 是否可以并行，不能证明安全时会保守串行。

### 8. 文件版本、Artifact 与 Rollback

Agent 在 workspace 中生成或修改文件后，后端会记录文件版本，并把适合作为产物展示的文件同步为 artifact。

Artifact 以 workspace 为主归属：

- 同一 workspace 下的 conversation 可以看到和继续修改相关 artifact。
- `conversation_id` 记录 artifact 来源，而不是唯一归属。
- artifact 支持版本记录和当前版本。
- run rollback 后，本次 run 新建的 artifact 会被撤销，更新过的 artifact 会回退 current version。

这让用户可以在右侧 artifact 区查看 AI 生成的页面、文档、代码或其他产物，并在后续对话中继续迭代。

### 9. Workspace 一键部署与联网搜索增强

项目支持 workspace 级一键部署。部署流程会读取 workspace 内容，生成或使用部署配置，构建并启动服务，最终返回预览 URL。部署记录、日志、状态、停止操作都会持久化并反馈到会话中。

联网搜索只增强普通 chat，不进入 sandbox DAG。用户可以通过 `webSearchMode` 控制：

- `auto`：按消息内容判断是否需要搜索。
- `force`：强制搜索。
- `off`：关闭本轮搜索。

搜索结果会经过缓存、摘要和引用 URL 注入，适合回答最新信息、版本、新闻、文档和外部事实核验类问题。

## 产品闭环

当前项目主流程如下：

```text
创建会话
  -> 绑定或创建 workspace
  -> 发送用户任务
  -> 判断 executionMode
  -> 普通 chat / sandbox run / deployment
  -> Orchestrator 拆解 DAG
  -> 成员 Agent 按工具权限执行
  -> workspace 文件生成或修改
  -> 文件版本同步
  -> artifact 展示
  -> workspace 一键部署
  -> 返回部署 URL
  -> 后续对话继续修改
  -> rollback 撤销本次 run 影响
```

## 技术栈

### Backend

- FastAPI
- SQLite
- WebSocket
- Docker Sandbox
- LLM Client
- Agent Tool Catalog
- Workspace Mutation Lock
- Artifact Versioning
- Deployment Service
- Web Search Cache

### Frontend

- Vite
- React
- TypeScript
- WebSocket 实时事件
- Workspace / Artifact / Run / Deployment 视图

### Agent Runtime

- Native Runtime
- Codex
- Claude Code
- OpenCode
- 普通 LLM Chat

## 项目结构

```text
.
├── backend/
│   ├── app/
│   │   ├── api/routes/        # HTTP / WebSocket 路由
│   │   ├── core/              # Orchestrator、LLM 等核心逻辑
│   │   ├── services/          # Agent、Message、Run、Sandbox、Artifact、Deploy 等业务流程
│   │   ├── runtimes/          # Native / Platform runtime 适配
│   │   ├── database.py        # SQLite schema、迁移和数据访问
│   │   ├── config.py          # 环境变量配置
│   │   └── main.py            # FastAPI 入口
│   ├── ai-collab/             # AI 协作开发规则、流程和实操手册
│   └── README.md              # 后端说明
├── frontend/                  # Web 前端
├── mobile/                    # 移动端相关代码
├── desktop/                   # 桌面端相关代码
├── sandboxes/                 # 本地 sandbox workspace
└── README.md                  # 项目总览
```

## 后端启动

后端默认使用 `9007` 端口。启动前请根据 `backend/.env.example` 创建 `backend/.env`，并填写模型服务配置。

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 9007 --reload
```

健康检查：

```bash
curl http://localhost:9007/api/v1/health
```

默认管理员账号：

```text
email: admin@northcore.ai
password: admin123
```

## 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端真实模式建议配置：

```text
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:9007/api/v1
VITE_WS_URL=ws://localhost:9007/ws
```

## 推荐 Demo 流程

1. 登录系统，创建或进入一个 group chat。
2. 选择多个 Agent，并确认 Orchestrator 自动加入群聊。
3. 绑定或创建 workspace。
4. 输入一个产物型需求，例如生成一个简单 Web 应用或修改已有项目。
5. 观察系统自动进入 Sandbox Run，并展示 DAG step、执行状态和工具调用。
6. 查看 workspace 文件树和右侧 artifact 区。
7. 继续发送修改需求，验证同一 workspace 的连续迭代能力。
8. 点击一键部署，等待部署完成并打开预览 URL。
9. 执行 rollback，展示本次 run 的文件和 artifact 影响被撤销。

## 项目亮点

- 不是单轮文本问答，而是完整的 AI Agent 工作流。
- workspace 是项目级持久资产，可以跨会话复用。
- Agent 工具权限由后端 Tool Catalog 统一管理。
- Orchestrator 只负责规划和调度，不直接越权执行。
- write/deploy run 通过 workspace mutation lock 串行，降低并发写冲突。
- run 生成的 workspace 文件可以自动变成 artifact。
- artifact 和 deployment 都围绕 workspace 展示，适合做完整 Demo 闭环。
- `backend/ai-collab` 沉淀了 AI 协作开发规则、流程和实操手册。

