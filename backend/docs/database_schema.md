# AgentHub SQLite Schema

## 设计原则

- SQLite 文件默认位于 `backend/agenthub.db`。
- API 返回 `camelCase`, 数据库内部使用 `snake_case`。
- JSON 列使用 `*_json` 后缀, 例如 `tags_json`。
- 图片/文件通过 `attachments` 表预留, 不写入 `messages.content`。

## 表关系

```text
agents 1..n conversation_agents n..1 conversations
conversations 1..n messages
conversations 1..n artifacts
messages 0..n attachments
```

## agents

保存平台中的 AI 联系人。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Agent ID |
| name | TEXT | 展示名称 |
| avatar | TEXT | 头像 URL |
| description | TEXT | 能力描述 |
| tags_json | TEXT | 能力标签 JSON |
| status | TEXT | 在线状态 |
| category | TEXT | Agent 分类 |
| provider | TEXT | Provider 类型 |
| enabled | INTEGER | 是否启用, 0/1 |
| last_used_at | TEXT | 最近使用时间 |
| system_prompt | TEXT | 系统提示词 |
| model_config_json | TEXT | 模型配置 JSON |
| tools_json | TEXT | 工具列表 JSON |
| permissions_json | TEXT | 权限配置 JSON |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## conversations

保存 IM 聊天窗口。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 会话 ID |
| title | TEXT | 会话标题 |
| mode | TEXT | `single` 或 `group` |
| last_message | TEXT | 最近消息摘要 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 最近活跃时间 |

## conversation_agents

保存会话与 Agent 的多对多关系。

| 字段 | 类型 | 说明 |
|---|---|---|
| conversation_id | TEXT | 会话 ID |
| agent_id | TEXT | Agent ID |

主键: `(conversation_id, agent_id)`。

## messages

保存会话内可回放的聊天记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 消息 ID |
| conversation_id | TEXT | 所属会话 |
| sender_id | TEXT | 发送者 ID |
| sender_name | TEXT | 发送者名称 |
| role | TEXT | `user/agent/orchestrator/system` |
| type | TEXT | `text/code/artifact/task-plan/status` |
| content | TEXT | 文本正文 |
| language | TEXT | 代码语言 |
| artifact_id | TEXT | 关联产物 |
| created_at | TEXT | 创建时间 |

## artifacts

保存 Agent 生成的可预览产物。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 产物 ID |
| conversation_id | TEXT | 所属会话 |
| message_id | TEXT | 来源消息 |
| run_id | TEXT | 未来 AgentRun 预留 |
| title | TEXT | 产物标题 |
| type | TEXT | `html/code/markdown/diff/deploy` |
| description | TEXT | 产物说明 |
| size | INTEGER | 内容字节大小 |
| content | TEXT | 产物内容 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## attachments

预留用户图片/文件输入能力。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 附件 ID |
| conversation_id | TEXT | 所属会话 |
| message_id | TEXT | 关联消息 |
| kind | TEXT | `image` 或 `file` |
| name | TEXT | 文件名 |
| mime_type | TEXT | MIME 类型 |
| size | INTEGER | 文件大小 |
| storage_path | TEXT | 服务端存储路径 |
| url | TEXT | 前端访问 URL |
| created_at | TEXT | 创建时间 |
