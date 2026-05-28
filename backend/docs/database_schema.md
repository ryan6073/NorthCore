# AgentHub SQLite Schema

本文档描述当前后端 SQLite 表结构。API 对外返回 `camelCase`，数据库内部统一使用 `snake_case`。JSON 列使用 `*_json` 后缀。

默认数据库文件：

```text
backend/agenthub.db
```

## 关系概览

```text
users 1..n user_sessions
users 1..n conversations
users 0..n agents
agents n..m conversations via conversation_agents
conversations 1..n messages
conversations 1..n artifacts
artifacts 1..n artifact_versions
conversations 1..1 conversation_summaries
conversations 1..n long_term_memories
conversations 1..n pinned_messages
messages 0..n attachments
```

## users

保存用户账号。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 用户 ID |
| email | TEXT UNIQUE | 登录邮箱 |
| password_hash | TEXT | PBKDF2 密码哈希 |
| name | TEXT | 昵称/姓名 |
| avatar | TEXT | 头像 URL |
| role | TEXT | `admin/user/guest` |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## user_sessions

保存登录 session。token 只存哈希，不明文存储。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Session ID |
| user_id | TEXT | 用户 ID |
| token_hash | TEXT UNIQUE | Token SHA256 哈希 |
| created_at | TEXT | 创建时间 |
| expires_at | TEXT | 过期时间 |

## agents

保存 AI 联系人。`owner_user_id = NULL` 表示系统预置 Agent；非空表示用户自建 Agent。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Agent ID |
| owner_user_id | TEXT | 创建者用户 ID，系统预置为 NULL |
| name | TEXT | 展示名称 |
| avatar | TEXT | 头像 URL |
| description | TEXT | 能力描述 |
| tags_json | TEXT | 能力标签 JSON |
| status | TEXT | `online/offline/thinking/disabled` |
| category | TEXT | Agent 分类 |
| provider | TEXT | Provider 类型 |
| enabled | INTEGER | 是否启用 |
| last_used_at | TEXT | 最近使用时间 |
| system_prompt | TEXT | System Prompt |
| model_config_json | TEXT | 模型配置 JSON |
| tools_json | TEXT | 工具列表 JSON |
| permissions_json | TEXT | 权限配置 JSON |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## conversations

保存 IM 聊天窗口。会话分为长期联系人单聊和手动短期会话。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 会话 ID |
| owner_user_id | TEXT | 所属用户 ID |
| title | TEXT | 会话标题 |
| mode | TEXT | `single/group` |
| conversation_type | TEXT | `contact/manual` |
| contact_agent_id | TEXT | contact 长期单聊绑定的 Agent ID |
| last_message | TEXT | 最近消息摘要 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 最近活跃时间 |

约束说明：

- `contact` 会话不允许用户通过会话删除接口删除。
- `manual` 会话包括用户手动创建的单聊和群聊，允许删除。
- `(owner_user_id, contact_agent_id)` 在 `contact` 会话下保持唯一。

## conversation_agents

保存会话与 Agent 的多对多关系。

| 字段 | 类型 | 说明 |
|---|---|---|
| conversation_id | TEXT | 会话 ID |
| agent_id | TEXT | Agent ID |

主键：`(conversation_id, agent_id)`。

## messages

保存聊天流消息。

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
| artifact_id | TEXT | 关联产物 ID |
| metadata_json | TEXT | 引用消息、系统事件、版本 ID 等扩展信息 |
| created_at | TEXT | 创建时间 |

系统状态消息：

- 使用 `role=system`、`sender_id=system`、`type=status`。
- 只用于聊天流展示，不进入模型上下文、长期记忆或上下文压缩。

## artifacts

保存产物元数据和当前版本指针。内容以 `artifact_versions` 为准，`content/size` 字段保留用于兼容旧数据。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 产物 ID |
| conversation_id | TEXT | 所属会话 |
| message_id | TEXT | 来源消息 |
| run_id | TEXT | AgentRun 预留 |
| title | TEXT | 产物标题 |
| type | TEXT | `html/code/markdown/diff/deploy` |
| description | TEXT | 产物说明 |
| tags_json | TEXT | 标签 JSON |
| current_version_id | TEXT | 当前版本 ID |
| latest_version | INTEGER | 最新版本号 |
| size | INTEGER | 兼容旧字段 |
| content | TEXT | 兼容旧字段 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## artifact_versions

保存产物每次生成或编辑后的内容快照。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 版本 ID |
| artifact_id | TEXT | 产物 ID |
| version | INTEGER | 版本号 |
| content | TEXT | 版本内容 |
| language | TEXT | 语言 |
| size | INTEGER | 内容大小 |
| change_summary | TEXT | 变更说明 |
| created_by | TEXT | 创建者 ID |
| created_by_type | TEXT | `user/agent/orchestrator` |
| parent_version_id | TEXT | 父版本 ID |
| metadata_json | TEXT | 扩展信息 |
| created_at | TEXT | 创建时间 |

唯一约束：`(artifact_id, version)`。

## attachments

预留用户图片/文件输入能力。当前阶段只建表，不做完整上传流程。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 附件 ID |
| conversation_id | TEXT | 所属会话 |
| message_id | TEXT | 关联消息 |
| kind | TEXT | `image/file` |
| name | TEXT | 文件名 |
| mime_type | TEXT | MIME 类型 |
| size | INTEGER | 文件大小 |
| storage_path | TEXT | 服务端存储路径 |
| url | TEXT | 前端访问 URL |
| created_at | TEXT | 创建时间 |

## conversation_summaries

保存群聊上下文压缩摘要。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 摘要 ID |
| conversation_id | TEXT UNIQUE | 会话 ID |
| summary | TEXT | 摘要内容 |
| covered_until_message_id | TEXT | 摘要覆盖到的最后消息 ID |
| covered_message_count | INTEGER | 已覆盖消息数 |
| version | INTEGER | 摘要版本 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## long_term_memories

保存模型判断值得长期保留的会话记忆。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 记忆 ID |
| conversation_id | TEXT | 会话 ID |
| category | TEXT | `preference/project/profile/constraint` |
| content | TEXT | 记忆内容 |
| confidence | REAL | 置信度 |
| source_message_id | TEXT | 来源消息 ID |
| active | INTEGER | 是否启用 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

唯一约束：`(conversation_id, category, content)`。

## pinned_messages

保存用户手动 pin 的关键消息。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Pin ID |
| conversation_id | TEXT | 会话 ID |
| message_id | TEXT | 消息 ID |
| created_at | TEXT | 创建时间 |

唯一约束：`(conversation_id, message_id)`。
