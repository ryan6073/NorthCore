# 对话消息自动触发 Sandbox Run 前端交接文档

本文档说明后端把 Sandbox Run 内嵌到对话消息流程后的前端接入方式。前端仍然可以继续使用原有消息入口；新能力只是在返回数据和 WebSocket 事件里新增字段，不删除旧接口。

## 1. 核心变化

之前：

- 普通聊天走 `POST /api/v1/conversations/{conversationId}/messages` 或 WebSocket `conversation.message.create`。
- Sandbox Run 需要前端单独调用 `POST /api/v1/conversations/{conversationId}/runs`。

现在：

- 用户仍然只在对话里发消息。
- 后端会判断本轮消息是普通聊天还是产物型任务。
- 普通聊天继续走原来的 Agent 回复流程。
- 产物型任务会自动创建 Sandbox Run，并把 run 事件广播到当前 conversation。
- `/runs` 接口仍然保留，作为高级/调试入口。

```text
用户消息
  -> 后端判断 executionMode
     -> chat: 原普通聊天流程
     -> sandbox: 自动 create run + 当前 conversation 接收 run events
```

## 2. HTTP 消息接口

接口不变：

```http
POST /api/v1/conversations/{conversationId}/messages
```

### 2.1 普通聊天返回

旧字段仍然保留：

```ts
interface SendMessageResponse {
  userMessage: Message | null;
  agentMessages: Message[];
  artifacts: Artifact[];
  contextUsage: ContextUsage;

  executionMode?: 'chat' | 'sandbox';
  intent?: ExecutionIntent;
  reason?: string;
  run?: AgentRunDetail;
  workspaceId?: string;
}
```

普通聊天示例：

```json
{
  "code": 0,
  "message": "消息发送成功",
  "data": {
    "userMessage": {},
    "agentMessages": [],
    "artifacts": [],
    "contextUsage": {},
    "executionMode": "chat",
    "intent": "analysis",
    "reason": "分类置信度过低，按普通聊天处理"
  }
}
```

前端处理：

- `executionMode` 缺失时按旧逻辑处理。
- `executionMode = chat` 时继续展示普通 Agent 回复。
- 不要因为新增字段影响旧消息流渲染。

### 2.2 自动触发 Sandbox 返回

如果后端识别为产物型任务，会返回：

```json
{
  "code": 0,
  "message": "沙箱任务已创建",
  "data": {
    "userMessage": {},
    "agentMessages": [
      {
        "role": "system",
        "type": "status",
        "content": "已识别为产物型任务，正在创建沙箱运行..."
      }
    ],
    "artifacts": [],
    "contextUsage": {},
    "executionMode": "sandbox",
    "intent": "artifact_generation",
    "reason": "用户要求生成登录页面，需要创建文件和可预览产物",
    "run": {},
    "workspaceId": "workspace-xxxx"
  }
}
```

前端处理：

- 先正常插入 `userMessage`。
- 展示 `agentMessages` 中的 status 消息。
- 如果 `executionMode = sandbox` 且存在 `run`，打开或刷新右侧 Sandbox Run 面板。
- 后续 run 状态以 WebSocket 事件或轮询 `/runs/{runId}` 更新。

## 3. 显式控制参数

前端可以在 message payload 里显式控制是否进入 sandbox：

```json
{
  "content": "帮我生成一个登录页面",
  "useSandbox": true
}
```

支持：

```ts
useSandbox: boolean;
executionMode: 'chat' | 'sandbox';
runMode: 'chat' | 'sandbox';
```

优先级：

```text
显式参数 > 模型判断 > fallback
```

建议：

- 普通输入框默认不传，让后端自动判断。
- 如果前端有“强制普通回复 / 强制沙箱执行”按钮，再传这些字段。
- `useSandbox=false` 可用于避免误触发 sandbox。

## 4. 意图类型

后端可能返回：

```ts
type ExecutionIntent =
  | 'qa'
  | 'analysis'
  | 'code_explanation'
  | 'code_review'
  | 'artifact_generation'
  | 'code_modification'
  | 'project_creation'
  | 'debug_run'
  | 'build_or_test'
  | 'other';
```

前端可以只展示 `executionMode`，暂时不展示 `intent/reason`。如果需要调试面板，可以把 `reason` 展示为灰色小字。

## 5. WebSocket 行为

入口不变：

```text
/ws
```

发送消息事件不变：

```json
{
  "type": "conversation.message.create",
  "eventId": "evt-1",
  "data": {
    "conversationId": "conv-xxx",
    "content": "帮我生成一个登录页面"
  }
}
```

### 5.1 普通聊天

继续保持旧事件：

```text
conversation.message.user_created
agent.thinking.started
conversation.message.chunk
conversation.message.completed
artifact.created
conversation.all_tasks.completed
```

新增一个分类事件：

```text
execution.mode.decided
```

示例：

```json
{
  "type": "execution.mode.decided",
  "eventId": "evt-1",
  "data": {
    "conversationId": "conv-xxx",
    "executionMode": "chat",
    "intent": "analysis",
    "confidence": 0.72,
    "reason": "用户在询问方案分析，不需要创建文件"
  }
}
```

### 5.2 Sandbox 任务

sandbox 分支不会再流式输出普通 assistant 长文本，而是：

```text
conversation.message.user_created
execution.mode.decided
conversation.message.completed   // status 消息
run.created
run.step.started
run.step.tool.started
run.step.log
run.step.completed / run.step.failed
artifact.created
run.completed / run.failed
conversation.all_tasks.completed
```

前端处理：

- 收到 `execution.mode.decided` 且 `executionMode=sandbox` 时，可以打开右侧 Run 面板。
- 收到 `run.created` 时保存 run detail。
- 收到 `run.step.*` 时更新 step 状态和日志。
- 收到 `artifact.created` 时复用现有 Artifact 展示逻辑。
- 未识别的新事件直接忽略，不要断开 WebSocket。

## 6. Run 事件字段

Run 事件 payload 会尽量带以下字段：

```ts
interface RunEventData {
  conversationId: string;
  runId: string;
  workspaceId?: string;
  status?: string;
  run?: AgentRunDetail;
  sandbox?: Sandbox;
  workspace?: Workspace;
  steps?: AgentRunStep[];
  files?: SandboxFile[];
  conflicts?: SandboxConflict[];
  stepId?: string;
  artifactId?: string;
}
```

建议前端以 `conversationId + runId` 做归属判断，不要用单个全局 `activeRun` 覆盖所有会话。

## 7. 撤销 Run 文件改动

Sandbox 文件变更卡片上的“撤销”按钮可以调用：

```http
POST /api/v1/runs/{runId}/rollback
```

后端行为：

- 只允许撤销已经结束的 run；`pending/running` 会返回错误。
- 回滚 `sandbox_files` 到本次 run 修改前的版本。
- 本次 run 新建的文件会被删除。
- 同步恢复/删除物理 workspace 里的文件。
- run 状态会更新为 `cancelled`，summary 为 `用户已撤销本次文件改动`。
- workspace index 会被标记为 stale，等待后续重建。

返回示例：

```json
{
  "code": 0,
  "message": "Run 文件改动已撤销",
  "data": {
    "run": {},
    "rollbackChanges": [
      {
        "path": "src/game.js",
        "action": "restored",
        "restoredVersion": 1
      },
      {
        "path": "src/new.js",
        "action": "deleted",
        "restoredVersion": 0
      }
    ]
  }
}
```

前端处理：

- 调用成功后刷新 `GET /api/v1/runs/{runId}` 和文件树。
- `rollbackChanges.action=restored` 表示文件恢复到旧版本。
- `rollbackChanges.action=deleted` 表示本次 run 新增的文件已被移除。
- 后端会广播 `run.failed` 和 `conversation.all_tasks.completed`，payload 内包含 `rollbackChanges`。

## 8. 和 Workspace 的关系

消息自动触发 sandbox 时，会复用已有 workspace 逻辑：

- conversation 已绑定 workspace：run 使用该 workspace。
- conversation 没有 workspace：后端拒绝创建 run，并提示先选择或新建工作区。
- 多个 conversation 绑定同一个 workspace 时，会看到同一批 workspace 文件。

前端文件树仍然使用：

```http
GET /api/v1/runs/{runId}/files/tree
```

虽然路径里是 `runId`，语义上是通过 run 找到 workspace，然后展示该 workspace 当前文件树。

## 9. 前端推荐状态

```ts
interface ConversationExecutionState {
  executionModeByEventId: Record<string, 'chat' | 'sandbox'>;
  activeRunIdByConversationId: Record<string, string | null>;
  runDetailsById: Record<string, AgentRunDetail>;
  runLogsByRunId: Record<string, string[]>;
  fileTreeByRunId: Record<string, WorkspaceTreeNode>;
}
```

切换会话时：

- 用 `activeRunIdByConversationId[conversationId]` 找当前会话的 run。
- 如果没有 active run，隐藏或清空右侧 Run 面板。
- 不要显示其他会话的 run。

## 10. 联调用例

### 10.1 普通解释不触发 sandbox

发送：

```text
这段代码什么意思？
```

预期：

- `executionMode = chat`
- 不创建 run
- 继续收到普通 assistant 回复或 chunk。

### 10.2 方案分析不触发 sandbox

发送：

```text
你觉得这个 Sandbox Workspace 方案如何？
```

预期：

- `executionMode = chat`
- 不创建 run。

### 10.3 产物任务自动触发 sandbox

发送：

```text
帮我生成一个登录页面
```

预期：

- `executionMode = sandbox`
- 返回或收到 `run.created`
- `run.workspaceId` 存在
- 右侧 Run 面板开始展示状态。

### 10.4 Workspace 复用

同一个 conversation 连续发送：

```text
帮我生成一个登录页面
在刚才的页面基础上加一个注册入口
```

预期：

- 两次 `run.id` 不同。
- 两次 `sandbox.id` 不同。
- 两次 `workspaceId` 相同。
- 两次 `sandbox.workspacePath` 相同。

### 10.5 /runs 仍然可用

直接调用：

```http
POST /api/v1/conversations/{conversationId}/runs
```

预期：

- 仍然创建 run。
- 行为与消息自动触发 run 使用同一套后端逻辑。
