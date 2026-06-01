# AgentHub Backend Architecture

本文档说明当前后端代码结构、模块职责和典型请求流。当前阶段的目标是让入口层、业务能力和数据访问边界清晰，便于后续继续拆分与维护。

## 整体分层

```text
app/main.py
  └─ 应用装配：FastAPI、CORS、startup、router 注册

app/api/
  └─ API 层：HTTP / WebSocket 路由、鉴权入口、统一响应

app/services/
  └─ 业务功能层：Agent、消息、上下文、记忆、产物、Run、WebSocket 事件

app/core/
  └─ 模型和编排底层能力：LLM client、Orchestrator prompt 与意图识别

app/database.py
  └─ 数据访问层：SQLite schema、迁移、seed、CRUD 和序列化
```

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `app/main.py` | 创建 FastAPI 应用，注册中间件、startup 和所有 router。 |
| `app/config.py` | 读取 `.env` 配置，提供端口、模型、SQLite、Sandbox 等设置。 |
| `app/api/deps.py` | Bearer token 解析、当前用户解析。当前仍保留无 token 回退默认管理员的 Demo 逻辑。 |
| `app/api/responses.py` | 统一 `ok()` / `fail()` 响应结构。 |
| `app/api/routes/` | 按资源拆分 HTTP / WebSocket 入口，路由层只做参数读取、权限入口和 service 调用。 |
| `app/services/` | 承载核心业务功能。第一阶段先保证结构拆开，后续可继续把 `message_service.py` 中的共享流程细拆。 |
| `app/core/orchestrator.py` | Orchestrator 意图识别、任务拆解和 fallback 逻辑。 |
| `app/core/llm_client.py` | OpenAI-compatible client 单例，避免多处重复初始化。 |
| `app/database.py` | 当前仍是单文件 repository，负责表结构、迁移、seed 和所有数据库读写。 |
| `app/websocket/handler.py` | 旧 Demo `/ws/chat` handler，当前主应用不再调用，后续清理阶段可删除。 |

## 路由模块

| 文件 | URL 范围 |
| --- | --- |
| `api/routes/system.py` | `GET /api/v1/health` |
| `api/routes/auth.py` | `/api/v1/auth/register`、`/auth/login`、`/auth/guest`、`/auth/me`、`/auth/profile`、`/auth/logout` |
| `api/routes/agents.py` | `/api/v1/agents`、Agent 联系人会话、用户 Agent 联系人查询 |
| `api/routes/conversations.py` | 会话 CRUD、群聊成员配置、上下文压缩、记忆、pins、消息列表 |
| `api/routes/messages.py` | `POST /api/v1/conversations/{conversationId}/messages` |
| `api/routes/artifacts.py` | Artifact 列表、详情、版本列表、版本详情、手动更新 |
| `api/routes/runs.py` | Sandbox Run 创建、查询、取消、文件读取、冲突解决 |
| `api/routes/ws.py` | `/ws` 主 WebSocket 协议、`/ws/chat` 弃用提示、根路径健康页 |

## 服务模块

| 文件 | 功能 |
| --- | --- |
| `services/agent_service.py` | Agent 可用性判断、目标 Agent 选择、`@mention` 识别、群聊 Orchestrator 注入、会话级 Agent 配置校验。 |
| `services/context_service.py` | context usage 计算、模型上下文构造、长期上下文摘要、自动/手动压缩。 |
| `services/memory_service.py` | 长期记忆提取、记忆保存调度。 |
| `services/artifact_service.py` | 产物引用解析、代码块提取、标题命名、新建 Artifact、引用已有 Artifact 时新增版本。 |
| `services/message_service.py` | HTTP / WebSocket 共用消息主流程、模型调用、消息落库、Artifact 事件、长期记忆调度。第一阶段保留较多共享 helper。 |
| `services/run_service.py` | Sandbox Run 的 Agent 选择、事件 payload、DAG step id 命名、活跃 run 清理入口。 |
| `services/ws_service.py` | WebSocket 订阅、取消订阅、房间广播和运行中 run 恢复推送。 |
| `services/sandbox_service.py` | Docker 容器启动/停止、基础安全参数、工作区安全读写。 |
| `services/sandbox_runtime.py` | 每个容器的持久 Shell session、命令执行、cwd 保持、超时输出收集。 |
| `services/sandbox_tools.py` | Sandbox step 的受控工具层：环境探测、依赖清单读取、环境初始化、列文件、读写文件、执行命令和 finish。 |
| `services/file_version_service.py` | Sandbox 文件版本写入、读取和冲突解决。 |
| `services/run_scheduler.py` | 根据 DAG 调度 step，驱动 Agent 进入 tool-calling 执行循环，并同步输出为 Artifact。 |

## 典型流程

### 登录鉴权

1. 前端调用 `api/routes/auth.py` 中的登录、注册或游客登录接口。
2. 路由调用 `database.py` 校验用户并创建 session。
3. 后续业务路由通过 `api/deps.py` 解析 `Authorization: Bearer <token>`。
4. 当前 Demo 阶段无 token 时仍回退默认管理员，收尾阶段再改为强制鉴权或配置开关。

### HTTP 发消息

1. `api/routes/messages.py` 接收 `POST /conversations/{id}/messages`。
2. 校验当前用户是否拥有会话。
3. `message_service.py` 处理引用消息、引用 Artifact、目标 Agent 选择和群聊 Orchestrator 分支。
4. `context_service.py` 负责构造模型上下文，必要时自动压缩历史。
5. Agent 回复落库后，`artifact_service.py` 尝试提取产物；有 `artifactRef` 时更新同一个 Artifact 的新版本。
6. `memory_service.py` 异步调度长期记忆提取。

### WebSocket 发消息

1. 前端连接 `/ws?token=<token>`。
2. `api/routes/ws.py` 校验 token，并通过 `ws_service.py` 维护 `userId + conversationId` 房间。
3. 前端发送 `conversation.message.create`。
4. 后端复用 `message_service.py` 的发送流程，并通过 `ws_service.py` 广播 chunk、完成事件和 Artifact 事件。
5. `/ws/chat` 已弃用，只返回迁移提示，不再读写会话。

### Artifact 创建与版本更新

1. Agent 回复包含 HTML、Markdown、Mermaid 或代码块时触发产物解析。
2. 无 `artifactRef` 时创建新的 Artifact 和 v1。
3. 有 `artifactRef.artifactId` 时保持 Artifact `id` 不变，新增 ArtifactVersion，并更新 `currentVersionId` 和 `latestVersion`。
4. Artifact 列表只展示逻辑产物，历史版本通过 versions 接口读取。

### 上下文压缩与长期记忆

1. `context_service.py` 根据会话模式判断是否支持长期上下文。
2. 消息超过保留数量且字符数达到阈值时自动压缩旧消息。
3. Pinned Messages 和长期记忆会注入系统上下文。
4. `memory_service.py` 在消息完成后异步提取可长期保存的用户偏好、项目事实和约束。

### Sandbox Run

1. `api/routes/runs.py` 创建 run，并准备 Docker 工作区。
2. V1 开发阶段 Docker 容器默认允许联网，便于依赖安装；生产模式可通过 `SANDBOX_NETWORK=none` / `SANDBOX_ALLOW_NETWORK=false` 切回禁网。容器仍带 CPU、内存、pids、cap drop、no-new-privileges 等基础限制。
3. `run_scheduler.py` 生成 DAG，当前默认单 step 串行执行；恢复并行前需要实现每 step 独立 shell 或容器。
4. 每个 step 不是一次性输出 files/commands，而是进入工具循环：Agent 调用 `inspect_environment/read_dependency_manifest/setup_environment/list_files/scan_workspace/read_workspace_file/import_workspace_file/read_file/write_file/run_command/validate_command/finish`。
5. `sandbox_tools.py` 执行工具并把结果写入 `step.output.toolCalls`，环境安装、普通命令和验证命令结果同步到 `commandResults`，验证命令同步到 `validations`，环境状态写入 `environmentState`。
6. `list_files/read_file` 表示数据库 tracked 文件；`scan_workspace/read_workspace_file/import_workspace_file` 表示 Docker workspace 实际文件视角。命令生成的文件必须先 import，完成后才会同步为 Artifact。
7. 文件写入进入 `file_version_service.py`，通过 `baseVersion` 做乐观锁；冲突进入 `sandbox_conflicts`。
8. `setup_environment` 只代表环境准备完成；`run_command` 只代表普通命令执行；`finish(success=true)` 必须引用最后一次文件修改之后成功的 `validate_command`，或为纯文档任务提供 `validationSkippedReason`。否则 step failed，并写入 `finish.validationRequired=true`。
9. 完成后只同步 tracked 文件到 Artifact / ArtifactVersion。当前预览仍以 Artifact 为主，不开放容器端口。
10. Run 收尾会按状态清理 workspace：completed 默认清理，failed/conflict/cancelled 默认保留用于排查。

## 当前保留策略

- `database.py` 暂不拆 repository，避免本轮同时改动 schema、迁移和业务结构。
- 无 token 回退默认管理员暂时保留，方便登录联调；生产收尾阶段改为配置开关或强制鉴权。
- `/ws/chat` 已弃用，主协议统一使用 `/ws`。
- 当前默认联网是开发便利优先，不是生产安全默认；沙箱不注入 `.env`、token、SSH key，不挂载项目根目录，不挂载 `docker.sock`。更强隔离、preview server 和独立 worker 后续单独增强。
- `backend/docs/sandbox.py`、`backend/docs/prompts.py` 是沙箱设计参考资料，不作为当前运行时代码导入。
- `SANDBOX_MAX_PARALLEL_STEPS` 当前默认 `1`，避免共享 shell/env/timeout 在并行 step 之间互相影响。
- `message_service.py` 当前仍承载较多共享 helper；下一轮可继续把实现细节迁移到更聚焦的 service 文件中。
