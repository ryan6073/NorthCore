# Sandbox Run V1 前端交接文档

本文档用于前端接入 AgentHub 的“沙箱任务执行工作区”。普通聊天接口保持不变；当用户希望执行一个任务、生成文件、查看 DAG 步骤、日志、文件树或冲突时，前端使用本文档里的 Run API。

## 1. 接入结论

- 普通聊天继续走：`POST /api/v1/conversations/{conversationId}/messages`
- 沙箱任务走新接口：`POST /api/v1/conversations/{conversationId}/runs`
- 当前 V1 只建议在 `mode=agent` 和 `mode=group` 会话中使用。
- 每个 run 都会创建一个空 Docker 工作区。
- V1 开发阶段 Docker 默认允许联网，用于依赖安装和自动安装 `uv`；生产模式可通过 `SANDBOX_NETWORK=none` / `SANDBOX_ALLOW_NETWORK=false` 切回禁网。
- 联网沙箱风险更高：依赖安装脚本可能执行外部代码，任务代码可能访问外部地址或泄露生成内容。因此后端不注入 `.env`、token、SSH key，不挂载项目根目录，不挂载 `docker.sock`，并保留命令超时、输出限制和资源限制。
- Docker 会带基础资源限制，并使用持久 Shell session 保留同一 run 内的 `cwd` 和环境状态。
- 每个 step 默认串行执行，避免共享 shell/env/timeout 在并行 step 之间互相影响；后续恢复并行前需要实现每 step 独立 shell 或容器。
- 每个 step 使用受控工具循环执行：`inspect_environment/read_dependency_manifest/setup_environment/list_files/scan_workspace/read_workspace_file/import_workspace_file/read_file/write_file/run_command/validate_command/finish`。
- 沙箱不挂载项目根目录，不会直接修改真实代码。
- Agent 通过 `write_file` 写出的文件会进入沙箱文件版本系统；命令生成的实际文件需要先 `scan_workspace -> import_workspace_file`，run 完成后才会同步成现有 Artifact。
- 每个同步出的 ArtifactVersion 会带 `metadata.sourceFilePath/sourceSandboxFileId/sourceStepId`，用于区分同一次 run 的多个产物来源。
- 冲突不会自动覆盖，前端需要提供人工解决入口。
- 当前不开放容器端口。HTML Artifact 如需联动同 run 的 CSS/JS，前端从 ArtifactVersion metadata 读取来源信息后调用后端 preview bundle 接口。
- Run 实时显示必须以 `conversationId + runId` 做归属判断。前端不要用单个全局 `activeRun` 覆盖所有会话的右侧面板。
- `conversation.subscribe` 成功后，后端会补发当前会话最近一个 active run 的 `run.created` 快照，用于切回会话或重连后恢复运行面板。

## 2. 前端需要新增的视图

建议新增一个 Run 面板，挂在会话右侧或消息流中的任务卡片里。

需要展示：

- Run 总状态：`pending/running/completed/failed/conflict/cancelled`
- DAG/步骤列表：展示每个 step 的状态、执行 Agent、任务描述、错误信息。
- Step 日志：监听 WebSocket 的 `run.step.log`
- 文件树：展示 run 输出文件。
- 文件预览：点击文件后读取当前内容。
- 冲突列表：展示冲突文件，并提供 current/incoming/manual 三种解决方式。
- Artifact 面板：run 完成后继续复用现有 Artifact 展示逻辑。

### 2.1 推荐前端状态模型

不要只维护一个全局 `activeRun`。推荐按会话和 run 拆开：

```ts
interface SandboxRunState {
  runsByConversationId: Record<string, string[]>;
  activeRunIdByConversationId: Record<string, string | null>;
  runDetailsById: Record<string, AgentRunDetail>;
  runFilesByRunId: Record<string, SandboxFile[]>;
  runConflictsByRunId: Record<string, SandboxConflict[]>;
  runFileContentsByRunId: Record<string, Record<string, string>>;
}
```

右侧面板渲染时使用：

```ts
const activeRunId = activeRunIdByConversationId[activeConversationId];
const activeRun = activeRunId ? runDetailsById[activeRunId] : null;
```

切换会话时：

- 先根据新 `activeConversationId` 切换右侧 run。
- 如果目标会话没有 active run，清空或隐藏 Sandbox 面板。
- 不要让旧会话的 run 继续显示在新会话右侧。

## 3. HTTP API

### 3.1 创建并启动 Run

```http
POST /api/v1/conversations/{conversationId}/runs
```

Request:

```json
{
  "prompt": "创建一个 README.md，内容说明这是沙箱测试",
  "environmentProfile": {
    "packageManager": "uv",
    "pythonVersion": "3.11",
    "allowNetwork": true
  }
}
```

`environmentProfile` 可选。不传时后端默认使用 `packageManager=uv`、`allowNetwork=true` 和当前后端配置的 `SANDBOX_IMAGE`。如果镜像缺少 `uv`，后端会优先尝试自动安装；安装失败会 fallback 到 `python -m venv + pip`，最终失败时返回结构化错误，不抛 500。如果任务或项目文档明确要求 conda，前端可以传 `packageManager=conda`，但后端不会自动安装 conda 镜像能力。

Response: `BaseApiResponse<AgentRunDetail>`

```ts
interface AgentRunDetail {
  id: string;
  sandboxId: string;
  conversationId: string;
  ownerUserId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'conflict' | 'cancelled';
  prompt: string;
  dag: RunDag;
  summary: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  sandbox?: Sandbox;
  steps: AgentRunStep[];
  files: SandboxFile[];
  conflicts: SandboxConflict[];
}
```

说明：

- 后端返回后，调度器会在后台继续执行。
- 前端应立即展示 run 卡片，并通过 WebSocket 或轮询刷新状态。
- 如果后端无法启动 Docker，run 会进入 `failed`，错误信息在 `error` 或 step `error` 中。
- 每个 step 的 `output.commandResults` 会记录环境安装、普通命令和验证命令结果：`command`、`exitCode`、`stdout`、`stderr`、`stdoutPreview`、`stderrPreview`、`timedOut`、`cwd`、`startedAt`、`finishedAt`、`durationMs`。
- 每个 step 的 `output.toolCalls` 会记录工具调用历史；`output.validations` 会记录显式验证命令；`output.workspaceScan` 会记录最近一次实际 workspace 扫描；`output.finish` 会记录 Agent 最终提交的 `success/summary/changedFiles/nextActions/validationCommandId/validationSkippedReason`。

```ts
interface SandboxToolCall {
  id: string;
  name:
    | 'inspect_environment'
    | 'read_dependency_manifest'
    | 'setup_environment'
    | 'list_files'
    | 'scan_workspace'
    | 'read_workspace_file'
    | 'import_workspace_file'
    | 'read_file'
    | 'write_file'
    | 'run_command'
    | 'validate_command'
    | 'finish';
  tool: SandboxToolCall['name'];
  arguments: Record<string, any>;
  args: Record<string, any>;
  status: 'running' | 'success' | 'failed';
  result: Record<string, any>;
  error?: string | null;
  createdAt: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
}

interface SandboxStepOutput {
  toolCalls: SandboxToolCall[];
  commandResults: CommandResult[];
  changedFiles: string[];
  validations?: Array<{
    id: string;
    command: string;
    success: boolean;
    result: CommandResult;
    createdAt: string;
  }>;
  workspaceScan?: {
    tracked: Array<{ path: string; size: number }>;
    untracked: Array<{ path: string; size: number }>;
    skipped: Array<{ path: string; reason: string }>;
  };
  environmentState?: {
    workspace: string;
    pythonVenv?: string | null;
    venvActivated?: boolean;
    packageManager?: string;
    network?: string;
    allowNetwork?: boolean;
    lastSetupStatus?: 'running' | 'success' | 'failed';
  };
  finish?: {
    success: boolean;
    summary: string;
    nextActions?: string[];
    validationCommandId?: string;
    validationSkippedReason?: string;
    validationRequired?: boolean;
  };
}
```

成功规则：

- `run_command` 只代表普通命令执行结果，不自动算验证。
- `validate_command` 会生成 `validationId`，成功后写入 `output.validations`。
- `finish(success=true)` 必须带 `validationCommandId`，且该验证必须成功并发生在最后一次文件修改或导入之后。
- 纯 Markdown/Mermaid/text 等不可运行任务可以不验证，但必须带 `validationSkippedReason` 明确说明原因。
- 如果缺少验证或跳过原因，step 会进入 `failed`，并在 `output.finish.validationRequired=true` 中标记。

### 3.2 获取 Run 详情

```http
GET /api/v1/conversations/{conversationId}/runs
```

Response: `BaseApiResponse<PageResult<AgentRunDetail>>`

用于页面刷新后恢复当前会话的沙箱任务列表。默认按创建时间倒序，前端可以取第一条作为右侧面板默认展示的最近 run。支持 `page/pageSize` 查询参数。

```http
GET /api/v1/runs/{runId}
```

Response: `BaseApiResponse<AgentRunDetail>`

用于页面刷新、轮询兜底、打开已有 run 详情。

### 3.3 获取文件列表

```http
GET /api/v1/runs/{runId}/files
```

Response: `BaseApiResponse<SandboxFile[]>`

```ts
interface SandboxFile {
  id: string;
  sandboxId: string;
  runId: string;
  path: string;
  contentHash: string;
  currentVersion: number;
  artifactId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 读取文件内容

```http
GET /api/v1/runs/{runId}/files/{filePath}
```

Response: `BaseApiResponse<SandboxFileDetail>`

```ts
interface SandboxFileDetail extends SandboxFile {
  content: string;
  version?: SandboxFileVersion;
}
```

注意：

- `filePath` 是沙箱内相对路径，例如 `README.md`、`src/index.html`
- 前端传路径时需要 URL encode。

### 3.5 HTML 多文件预览 Bundle

```http
GET /api/v1/runs/{runId}/preview/{filePath}
```

用途：给沙箱生成的 HTML Artifact 组装多文件预览。后端只从 `sandbox_files/sandbox_file_versions` 读取 tracked 文件，不直接读取 Docker workspace。

前端推荐触发条件：

- 当前 Artifact `type = html`
- 当前 ArtifactVersion metadata 中存在：

```ts
{
  source: 'sandbox',
  sourceRunId: string;
  sourceFilePath: string;
}
```

请求示例：

```http
GET /api/v1/runs/run-xxx/preview/index.html
```

Response: `BaseApiResponse<SandboxHtmlPreview>`

```ts
interface SandboxHtmlPreview {
  html: string;
  sourceFilePath: string;
  resolvedAssets: Array<{
    ref: string;
    path: string;
    kind: 'stylesheet' | 'script';
  }>;
  missingAssets: Array<{
    ref: string;
    path: string;
    kind: 'stylesheet' | 'script';
  }>;
  warnings: string[];
}
```

解析规则：

- `<link rel="stylesheet" href="styles.css">` 会被替换成内联 `<style>`。
- `<script src="app.js"></script>` 会被替换成内联 `<script>`。
- `<script type="module" src="app.js"></script>` 会保留 `type="module"`。
- 支持同 run 内相对路径，例如 `styles.css`、`./app.js`、`../shared.css`。
- 跳过外部 URL、绝对路径、`data:`、`blob:`、`http(s):`、`//cdn...`，原因写入 `warnings`。
- 如果引用文件未进入 `sandbox_files`，不会读取 Docker workspace，会写入 `missingAssets`。

前端接入建议：

1. 打开 HTML Artifact 时，先用 `currentVersion.content` 做兜底预览。
2. 如果 metadata 有 `sourceRunId/sourceFilePath`，调用本接口。
3. `code = 0` 时把 `data.html` 放入 iframe `srcDoc`。
4. 接口失败、资源缺失或非 sandbox HTML 时，继续展示原始 `currentVersion.content`。

### 3.6 获取冲突列表

```http
GET /api/v1/runs/{runId}/conflicts
```

Response: `BaseApiResponse<SandboxConflict[]>`

```ts
interface SandboxConflict {
  id: string;
  runId: string;
  sandboxId: string;
  fileId?: string | null;
  filePath: string;
  baseVersion: number;
  currentVersion: number;
  incomingContent: string;
  incomingHash: string;
  createdByStepId?: string | null;
  status: 'open' | 'resolved';
  resolution?: 'current' | 'incoming' | 'manual' | null;
  createdAt: string;
  resolvedAt?: string | null;
}
```

### 3.7 解决冲突

```http
POST /api/v1/runs/{runId}/conflicts/{conflictId}/resolve
```

保留当前版本：

```json
{
  "resolution": "current"
}
```

使用 incoming 内容：

```json
{
  "resolution": "incoming"
}
```

使用手动编辑内容：

```json
{
  "resolution": "manual",
  "content": "前端编辑后的完整文件内容"
}
```

Response: `BaseApiResponse<SandboxConflict>`

说明：

- `current` 不写入 incoming 内容，只把冲突标记为 resolved。
- `incoming` 会把冲突里的 incoming 内容写成新文件版本。
- `manual` 会把前端提交的完整内容写成新文件版本。

### 3.8 取消 Run

```http
POST /api/v1/runs/{runId}/cancel
```

Response: `BaseApiResponse<AgentRunDetail>`

说明：

- 后端会把 run 标记为 `cancelled`。
- 如果容器还在，会尝试停止容器。
- 默认会保留 cancelled run 的 workspace，方便排查。

## 4. WebSocket 事件

前端继续使用现有 WebSocket 连接。沙箱相关事件如下：

```text
run.created
run.step.started
run.step.tool.started
run.step.tool.completed
run.step.tool.failed
run.step.log
run.step.completed
run.step.failed
run.step.conflict
run.completed
run.failed
artifact.created
```

所有 `run.*` 事件都会带归属字段，前端必须用它们过滤或归档：

```ts
interface RunEventData {
  conversationId: string;
  runId: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'conflict' | 'cancelled';
  run?: AgentRunDetail;
  steps?: AgentRunStep[];
  files?: SandboxFile[];
  conflicts?: SandboxConflict[];
  stepId?: string;
  log?: string;
}
```

推荐过滤规则：

```ts
if (event.data.conversationId !== activeConversationId) {
  // 不展示到当前右侧面板；可缓存到对应 conversation 的 run map
  return;
}
```

建议处理方式：

- `run.created`：创建/更新对应 conversation 的 run，并设为该 conversation 的 active run。
- `run.step.started`：把对应 step 标记为 running，优先使用事件里的 `run/steps` 合并本地状态。
- `run.step.tool.started`：展示 Agent 正在调用的工具。
- `run.step.tool.completed`：追加工具结果，刷新文件树或 step output。
- `run.step.tool.failed`：展示工具错误；如果是写文件冲突，刷新冲突列表。
- `run.step.log`：直接追加到 `runId + stepId` 对应日志区，不要等轮询刷新。
- `run.step.completed`：把 step 标记为 completed，合并事件里的 run 快照。
- `run.step.failed`：把 step 标记为 failed 或 blocked，并展示 error。
- `run.step.conflict`：刷新对应 run 的冲突列表。
- `run.completed`：刷新 run 详情、文件列表、Artifact 列表。
- `run.failed`：展示失败原因；如果 status 是 `conflict`，引导用户去冲突面板。
- `artifact.created`：追加或刷新 Artifact 面板。

WebSocket 是实时通道；页面刷新、断线重连或状态不确定时，仍以 `GET /api/v1/runs/{runId}` 作为最终状态来源。

重连建议：

1. `/ws` 重连成功后，重新发送当前会话的 `conversation.subscribe`。
2. 收到后端补发的 active run `run.created` 快照后，更新当前会话 run 状态。
3. 如需更稳，可再调用 `GET /api/v1/conversations/{conversationId}/runs` 取最近 run，并对当前 active run 调 `GET /api/v1/runs/{runId}` 拉完整详情。

## 5. Step 状态

```ts
type AgentRunStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'conflict'
  | 'blocked';
```

说明：

- `pending`：等待依赖完成。
- `running`：正在执行。
- `completed`：执行成功。
- `failed`：当前 step 自己失败。
- `conflict`：当前 step 写文件产生冲突。
- `blocked`：依赖 step 失败或冲突，因此没有执行。

## 6. 前端推荐流程

创建任务：

1. 用户在会话中点击“沙箱执行”或类似按钮。
2. 前端立即创建一个临时 pending run 卡片，文案建议为“正在创建任务 / 正在生成 DAG”。
3. 调用 `POST /api/v1/conversations/{conversationId}/runs`。
4. 后端返回真实 run 后，用真实 `runId` 替换临时卡片，并设为当前会话 active run。
5. 如果 POST 失败，临时卡片进入 failed 并显示错误。
6. 监听 WebSocket 更新状态；`run.step.log` 应即时追加。
7. 同时可用 `GET /api/v1/runs/{runId}` 做轮询兜底。

切换会话：

1. 取消展示当前会话的右侧 active run。
2. 切到新会话后，根据 `activeRunIdByConversationId[newConversationId]` 恢复对应 run。
3. 如果新会话没有 active run，隐藏 Sandbox 面板或显示空态。
4. 发送 `conversation.subscribe` 后，等待后端补发 active run 快照；收到后再更新该会话 run 状态。

查看文件：

1. run 有文件后，调用 `GET /api/v1/runs/{runId}/files`
2. 点击文件，调用 `GET /api/v1/runs/{runId}/files/{filePath}`
3. 根据后缀选择预览方式：markdown/html/code/text。

查看 HTML Artifact：

1. Artifact 列表和内容仍走现有 Artifact API。
2. 如果 HTML Artifact 的当前版本 metadata 有 `sourceRunId/sourceFilePath`，调用 `GET /api/v1/runs/{sourceRunId}/preview/{sourceFilePath}`。
3. 使用返回的 `html` 作为 iframe `srcDoc`。
4. 如果接口失败，回退到 ArtifactVersion 原始 `content`。

解决冲突：

1. 监听 `run.step.conflict` 或 run 状态为 `conflict`
2. 调用 `GET /api/v1/runs/{runId}/conflicts`
3. 展示 current/incoming/manual 操作
4. 调 resolve 接口
5. 刷新 run 详情、文件列表和冲突列表

## 7. 调试建议

后端 Docker 基础验证：

```bash
docker run --rm --network none python:3.11-slim python --version
```

后端启动建议从有 Docker 权限的终端启动：

```bash
cd ~/NorthCore/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

最小接口测试：

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/conversations/{conversationId}/runs" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"创建一个 README.md，内容说明这是沙箱测试"}'
```

然后拿返回的 `runId` 查询：

```bash
curl "http://127.0.0.1:8000/api/v1/runs/{runId}"
curl "http://127.0.0.1:8000/api/v1/runs/{runId}/files"
```

## 8. V1 限制

- V1 默认空工作区，不从 Git 仓库初始化。
- V1 开发阶段容器默认允许联网，方便安装依赖；生产模式可通过 `SANDBOX_NETWORK=none` / `SANDBOX_ALLOW_NETWORK=false` 切回禁网。
- V1 默认单 step 串行执行，配置项 `SANDBOX_MAX_PARALLEL_STEPS` 保留但默认值为 `1`。
- V1 默认 completed run 会清理 workspace；failed/conflict/cancelled 会保留 workspace 便于排查。
- V1 不把真实项目目录挂进容器。
- V1 不做自动三方合并，冲突交给前端人工解决。
- V1 不开放容器端口；HTML/Markdown/Mermaid 仍通过 Artifact 入口预览。多文件 HTML 通过 preview bundle 接口读取 tracked sandbox files。
- V1 调度器跑在 FastAPI 进程内，后续高并发时再迁移到独立 worker。
- V1 依赖后端启动进程具备 Docker daemon 权限。
- `backend/docs/sandbox.py` 和 `backend/docs/prompts.py` 只是沙箱参考资料，不是当前运行时代码。

## 9. 与现有功能的关系

- 普通聊天不变。
- Artifact 展示不变，run 完成后后端会把输出文件同步为 Artifact。
- 前端区分多个产物时，优先使用 `Artifact.id`；需要追溯来源时读取 `ArtifactDetail.currentVersion.metadata.sourceFilePath`、`sourceSandboxFileId` 和 `sourceStepId`。
- 会话消息流不需要强制改造；前端可以先把 Run 面板作为独立任务视图接入。
- 后续如果要“用户在群聊里发任务自动创建 run”，可以在前端或后端再加一层入口策略。
