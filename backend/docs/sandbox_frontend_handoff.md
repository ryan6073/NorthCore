# Sandbox Run V1 前端交接文档

本文档用于前端接入 AgentHub 的“沙箱任务执行工作区”。普通聊天接口保持不变；当用户希望执行一个任务、生成文件、查看 DAG 步骤、日志、文件树或冲突时，前端使用本文档里的 Run API。

## 1. 接入结论

- 普通聊天继续走：`POST /api/v1/conversations/{conversationId}/messages`
- 沙箱任务走新接口：`POST /api/v1/conversations/{conversationId}/runs`
- 当前 V1 只建议在 `mode=agent` 和 `mode=group` 会话中使用。
- 每个 run 都会创建一个空 Docker 工作区。
- Docker 默认禁网：`--network none`
- 沙箱不挂载项目根目录，不会直接修改真实代码。
- Agent 输出文件会进入沙箱文件版本系统，run 完成后同步成现有 Artifact。
- 每个同步出的 ArtifactVersion 会带 `metadata.sourceFilePath/sourceSandboxFileId/sourceStepId`，用于区分同一次 run 的多个产物来源。
- 冲突不会自动覆盖，前端需要提供人工解决入口。

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

## 3. HTTP API

### 3.1 创建并启动 Run

```http
POST /api/v1/conversations/{conversationId}/runs
```

Request:

```json
{
  "prompt": "创建一个 README.md，内容说明这是沙箱测试"
}
```

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

### 3.5 获取冲突列表

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

### 3.6 解决冲突

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

### 3.7 取消 Run

```http
POST /api/v1/runs/{runId}/cancel
```

Response: `BaseApiResponse<AgentRunDetail>`

说明：

- 后端会把 run 标记为 `cancelled`。
- 如果容器还在，会尝试停止容器。

## 4. WebSocket 事件

前端继续使用现有 WebSocket 连接。沙箱相关事件如下：

```text
run.created
run.step.started
run.step.log
run.step.completed
run.step.failed
run.step.conflict
run.completed
run.failed
artifact.created
```

建议处理方式：

- `run.created`：创建/更新 run 卡片。
- `run.step.started`：把对应 step 标记为 running。
- `run.step.log`：追加到日志区。
- `run.step.completed`：把 step 标记为 completed。
- `run.step.failed`：把 step 标记为 failed 或 blocked，并展示 error。
- `run.step.conflict`：刷新冲突列表。
- `run.completed`：刷新 run 详情、文件列表、Artifact 列表。
- `run.failed`：展示失败原因；如果 status 是 `conflict`，引导用户去冲突面板。
- `artifact.created`：追加或刷新 Artifact 面板。

WebSocket 只是实时通道，页面刷新后仍以 `GET /api/v1/runs/{runId}` 作为最终状态来源。

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
2. 前端调用 `POST /api/v1/conversations/{conversationId}/runs`
3. 立即展示 run 卡片。
4. 监听 WebSocket 更新状态。
5. 同时可用 `GET /api/v1/runs/{runId}` 做轮询兜底。

查看文件：

1. run 有文件后，调用 `GET /api/v1/runs/{runId}/files`
2. 点击文件，调用 `GET /api/v1/runs/{runId}/files/{filePath}`
3. 根据后缀选择预览方式：markdown/html/code/text。

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
- V1 容器默认禁网。
- V1 不把真实项目目录挂进容器。
- V1 不做自动三方合并，冲突交给前端人工解决。
- V1 调度器跑在 FastAPI 进程内，后续高并发时再迁移到独立 worker。
- V1 依赖后端启动进程具备 Docker daemon 权限。

## 9. 与现有功能的关系

- 普通聊天不变。
- Artifact 展示不变，run 完成后后端会把输出文件同步为 Artifact。
- 前端区分多个产物时，优先使用 `Artifact.id`；需要追溯来源时读取 `ArtifactDetail.currentVersion.metadata.sourceFilePath`、`sourceSandboxFileId` 和 `sourceStepId`。
- 会话消息流不需要强制改造；前端可以先把 Run 面板作为独立任务视图接入。
- 后续如果要“用户在群聊里发任务自动创建 run”，可以在前端或后端再加一层入口策略。
