# Workspace 前端交接文档

本文档用于前端接入“会话级 Sandbox Workspace”。这次后端只改了 workspace/run/files 相关能力；普通聊天、Artifact 详情和 ArtifactVersion 逻辑保持兼容。

## 1. 核心语义变化

之前：

- 每次创建 run 都会创建一个独立 workspace 目录。
- run 的文件列表只代表这一次 run 的产物。

现在：

- `workspace` 是独立实体，表示一个持久文件工作区。
- `single/group conversation` 可以绑定一个 `workspaceId`。
- 一个 workspace 可以被多个 single/group conversation 选择和复用。
- 同一个 conversation 下的多个 run 默认复用同一个 `workspacePath`。
- `run` 仍然是一次任务执行记录。
- `sandbox/container` 仍然按 run 临时创建，但挂载的是 conversation 绑定的 workspace 目录。
- 后端不再自动创建 workspace；`single/group` conversation 创建时必须传入已存在的 `workspaceId`。
- `agent` 联系人会话本轮先不做 workspace 选择入口，前端接入时只考虑 `single/group`。

关系可以理解为：

```text
Workspace 1 --- N Conversations(single/group) --- N Runs --- N Sandboxes
     |
     +-- workspacePath: /tmp/agenthub-sandboxes/workspace-xxxx
```

当前后端允许多个 conversation 绑定同一个 workspace。前端本轮只需要在用户手动创建的 `single/group` 会话里提供 workspace 选择/创建能力。

## 2. 前端需要调整的地方

### 2.1 创建/选择 Workspace

新增 workspace 管理能力：

```http
GET /api/v1/workspaces
POST /api/v1/workspaces
GET /api/v1/workspaces/{workspaceId}
```

创建 workspace：

```http
POST /api/v1/workspaces
```

Request:

```json
{
  "name": "My Workspace"
}
```

Response Data:

```ts
interface Workspace {
  id: string;
  ownerUserId: string;
  name: string;
  workspacePath: string;
  status: 'active' | string;
  createdAt: string;
  updatedAt: string;
}
```

前端建议：

- 在创建 `single/group` 会话时提供“新建 workspace / 选择已有 workspace”的入口。
- 用户必须选择或新建 workspace；不传 `workspaceId` 时，后端会拒绝创建 `single/group` 会话。
- 前端应先 `POST /workspaces` 或选择已有 workspace，再把返回的 `id` 作为 `workspaceId` 传给创建会话接口。

### 2.2 Conversation 增加 workspaceId

创建 `single/group` conversation 时必须传：

```http
POST /api/v1/conversations
```

```json
{
  "title": "前端项目工作区",
  "mode": "single",
  "agentIds": ["agent-claude-code"],
  "workspaceId": "workspace-xxxx"
}
```

更新 conversation 绑定 workspace：

```http
PUT /api/v1/conversations/{conversationId}
```

```json
{
  "workspaceId": "workspace-xxxx"
}
```

Conversation 返回中会带：

```ts
interface Conversation {
  id: string;
  mode: 'agent' | 'single' | 'group';
  workspaceId?: string | null;
}
```

前端注意：

- 新建 `single/group` 会话时 `workspaceId` 不可为空。
- 历史会话如果没有 workspace，创建 run 时会被后端拒绝，并提示选择或新建工作区。
- 更新 workspace 绑定时，后端会校验 workspace 是否属于当前用户。
- 前端本轮只给 `single/group` 会话展示 workspace 创建/选择；`agent` 会话先不展示该入口。

### 2.3 创建 Run

旧请求仍可用：

```http
POST /api/v1/conversations/{conversationId}/runs
```

Request 仍兼容：

```json
{
  "prompt": "生成一个 README.md"
}
```

也可以显式指定 workspace：

```json
{
  "prompt": "生成一个 README.md",
  "workspaceId": "workspace-xxxx",
  "environmentProfile": {
    "packageManager": "uv",
    "allowNetwork": true
  }
}
```

Run 返回中新增/补全：

```ts
interface AgentRunDetail {
  id: string;
  workspaceId?: string | null;
  sandbox?: Sandbox;
  workspace?: Workspace | null;
  files: SandboxFile[];
}

interface Sandbox {
  id: string;
  runId?: string | null;
  workspaceId?: string | null;
  workspacePath: string;
}
```

前端判断同一会话连续 run 是否复用 workspace，可以看：

```ts
runA.workspaceId === runB.workspaceId
runA.sandbox?.workspacePath === runB.sandbox?.workspacePath
```

### 2.4 文件列表与目录树

旧文件列表接口保留：

```http
GET /api/v1/runs/{runId}/files
```

返回仍是平铺数组：

```ts
type SandboxFileList = SandboxFile[];
```

新增目录树接口：

```http
GET /api/v1/runs/{runId}/files/tree
```

Response Data:

```ts
interface WorkspaceTreeNode {
  name: string;
  type: 'directory' | 'file';
  path?: string;
  children?: WorkspaceTreeNode[];
  file?: SandboxFile;
}
```

示例：

```json
{
  "name": "workspace",
  "type": "directory",
  "children": [
    {
      "name": "src",
      "type": "directory",
      "path": "src",
      "children": [
        {
          "name": "App.tsx",
          "type": "file",
          "path": "src/App.tsx"
        }
      ]
    },
    {
      "name": "README.md",
      "type": "file",
      "path": "README.md"
    }
  ]
}
```

前端建议：

- 右侧文件面板优先使用 `/files/tree` 渲染目录树。
- 点击文件仍然使用原接口读取内容：

```http
GET /api/v1/runs/{runId}/files/{filePath}
```

- `filePath` 使用相对路径，例如 `src/App.tsx`，不要带 `/` 前缀。

## 3. 推荐前端状态模型

```ts
interface WorkspaceState {
  workspacesById: Record<string, Workspace>;
  workspaceIds: string[];
}

interface SandboxRunState {
  runsByConversationId: Record<string, string[]>;
  activeRunIdByConversationId: Record<string, string | null>;
  runDetailsById: Record<string, AgentRunDetail>;
  fileTreeByRunId: Record<string, WorkspaceTreeNode>;
  runFileContentsByRunId: Record<string, Record<string, string>>;
}
```

切换会话时：

- 使用 `conversation.workspaceId` 展示当前绑定 workspace。
- 使用 `activeRunIdByConversationId[conversationId]` 展示该会话当前 run。
- 不要用一个全局 active run 覆盖所有会话。

## 4. 兼容性说明

- 老前端不传 `workspaceId` 创建 run：不再继续工作，后端会提示先选择或新建工作区。
- 老前端继续调用 `/runs/{runId}/files`：仍返回平铺列表。
- 新前端可以改用 `/runs/{runId}/files/tree` 渲染目录树。
- Artifact 相关接口保持不变。
- 同一路径文件被后续 run 修改时，后端会更新已有 Artifact 的新版本，而不是无脑创建重复 Artifact。

## 5. 前端联调建议

1. `GET /api/v1/workspaces`，确认可以拉到 workspace 列表。
2. `POST /api/v1/workspaces` 创建一个 workspace。
3. `POST /api/v1/conversations` 创建 `single/group` 会话，并传 `workspaceId`。
4. `POST /api/v1/conversations/{conversationId}/runs` 创建第一个 run。
5. 同一个 conversation 再创建第二个 run。
6. 分别查看两个 run：

```ts
run1.workspaceId === run2.workspaceId
run1.sandbox.workspacePath === run2.sandbox.workspacePath
run1.sandbox.id !== run2.sandbox.id
run1.id !== run2.id
```

7. 调用：

```http
GET /api/v1/runs/{runId}/files/tree
```

确认前端右侧文件面板按目录树展示。
