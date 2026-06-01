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
conversations 1..n conversation_agent_overrides
conversations 1..n messages
conversations 1..n artifacts
artifacts 1..n artifact_versions
conversations 1..n sandboxes
sandboxes 1..1 agent_runs
agent_runs 1..n agent_run_steps
agent_runs 1..n sandbox_files
sandbox_files 1..n sandbox_file_versions
agent_runs 0..n sandbox_conflicts
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
系统启动时会按默认 Agent ID 执行幂等 seed，旧库会自动补齐缺失的系统预置 Agent，不覆盖已有默认 Agent 的运行中配置。

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

## agent_user_overrides

保存系统预置 Agent 的用户级配置覆盖。用户修改默认 Agent 时写入这里，不会修改公共系统 Agent 模板。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 覆盖记录 ID |
| owner_user_id | TEXT | 用户 ID |
| base_agent_id | TEXT | 被覆盖的系统 Agent ID |
| name | TEXT | 用户级名称覆盖 |
| avatar | TEXT | 用户级头像覆盖 |
| description | TEXT | 用户级描述覆盖 |
| tags_json | TEXT | 用户级标签 JSON |
| status | TEXT | 用户级状态覆盖 |
| category | TEXT | 用户级分类覆盖 |
| provider | TEXT | 用户级 provider 覆盖 |
| enabled | INTEGER | 用户级启用状态 |
| last_used_at | TEXT | 用户级最近使用时间 |
| system_prompt | TEXT | 用户自己的 System Prompt |
| model_config_json | TEXT | 用户级模型配置 JSON |
| tools_json | TEXT | 用户级工具配置 JSON |
| permissions_json | TEXT | 用户级权限配置 JSON |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

唯一约束：`(owner_user_id, base_agent_id)`。

## conversations

保存 IM 聊天窗口。`agent/group` 是持久上下文会话，`single` 是临时单聊。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 会话 ID |
| owner_user_id | TEXT | 所属用户 ID |
| title | TEXT | 会话标题 |
| mode | TEXT | `agent/single/group` |
| conversation_type | TEXT | 兼容旧字段，`contact/manual` |
| contact_agent_id | TEXT | `agent` 长期联系人会话绑定的 Agent ID |
| visible | INTEGER | 是否在会话列表展示，仅作用于 `mode=agent` |
| is_pinned | INTEGER | 会话是否置顶 |
| is_archived | INTEGER | 会话是否归档 |
| system_prompt | TEXT | 会话级 System Prompt 覆盖 |
| last_message | TEXT | 最近消息摘要 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 最近活跃时间 |

约束说明：

- `mode=agent` 会话通过删除接口只设置 `visible=0`，不删除历史。
- `mode=agent/group` 会话参与长期记忆、会话摘要、Pinned Messages 和最近有效消息上下文。
- `mode=single` 会话不参与长期记忆、会话摘要或 Pinned Messages 注入。
- `mode=single/group` 会话包括用户手动创建的单聊和群聊，允许删除。
- `(owner_user_id, contact_agent_id)` 在 `mode=agent` 会话下保持唯一。

## conversation_agents

保存会话与 Agent 的多对多关系。

| 字段 | 类型 | 说明 |
|---|---|---|
| conversation_id | TEXT | 会话 ID |
| agent_id | TEXT | Agent ID |

主键：`(conversation_id, agent_id)`。

## conversation_agent_overrides

保存群聊内普通 Agent 的会话级专属配置。该表只影响指定 `group` 会话内的指定 Agent，不修改全局 Agent 或用户级 Agent 覆盖。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 覆盖记录 ID |
| conversation_id | TEXT | 群聊会话 ID |
| agent_id | TEXT | 被覆盖的普通 Agent ID |
| name | TEXT | 群聊内名称覆盖 |
| avatar | TEXT | 群聊内头像覆盖 |
| description | TEXT | 群聊内描述覆盖 |
| tags_json | TEXT | 群聊内标签 JSON |
| status | TEXT | 群聊内状态覆盖 |
| category | TEXT | 群聊内分类覆盖 |
| provider | TEXT | 群聊内 provider 覆盖 |
| enabled | INTEGER | 群聊内启用状态 |
| last_used_at | TEXT | 群聊内最近使用时间 |
| system_prompt | TEXT | 群聊内 System Prompt |
| model_config_json | TEXT | 群聊内模型配置 JSON |
| tools_json | TEXT | 群聊内工具配置 JSON |
| permissions_json | TEXT | 群聊内权限配置 JSON |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

唯一约束：`(conversation_id, agent_id)`。`agent-orchestrator` 不写入该表。

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
| run_id | TEXT | 关联 AgentRun |
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

## sandboxes

保存可运行任务工作区。第一版使用本机 Docker；V1 开发阶段默认允许联网以安装依赖，生产模式可通过配置切回禁网。容器只挂载该 run 的空工作区目录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 沙箱 ID |
| owner_user_id | TEXT | 所属用户 |
| conversation_id | TEXT | 所属会话 |
| run_id | TEXT | 当前关联 run |
| status | TEXT | `pending/starting/running/completed/failed/conflict/cancelled` |
| container_id | TEXT | Docker 容器 ID |
| image | TEXT | Docker 镜像 |
| network | TEXT | 网络策略，默认 `none` |
| workspace_path | TEXT | 宿主机工作区路径 |
| error | TEXT | 错误信息 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

## agent_runs

保存一次用户任务运行。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Run ID |
| sandbox_id | TEXT | 沙箱 ID |
| conversation_id | TEXT | 所属会话 |
| owner_user_id | TEXT | 所属用户 |
| status | TEXT | `pending/running/completed/failed/conflict/cancelled` |
| prompt | TEXT | 用户原始任务 |
| dag_json | TEXT | Orchestrator DAG JSON |
| summary | TEXT | 运行摘要 |
| error | TEXT | 错误信息 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| started_at | TEXT | 开始时间 |
| finished_at | TEXT | 结束时间 |

## agent_run_steps

保存 DAG 子任务节点。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | Step ID |
| run_id | TEXT | Run ID |
| agent_id | TEXT | 执行 Agent |
| agent_name | TEXT | Agent 名称 |
| task | TEXT | 子任务描述 |
| depends_on_json | TEXT | 依赖 Step ID 数组 |
| expected_outputs_json | TEXT | 期望输出文件 |
| status | TEXT | `pending/running/completed/failed/conflict/blocked` |
| claimed_by | TEXT | 认领 Agent ID |
| output_json | TEXT | Agent 结构化输出 |
| logs | TEXT | 命令日志 |
| error | TEXT | 错误信息 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| started_at | TEXT | 开始时间 |
| finished_at | TEXT | 结束时间 |

## sandbox_files / sandbox_file_versions

保存沙箱文件索引和版本快照。文件写入采用乐观锁：提交内容必须带 `baseVersion`，不匹配时生成冲突，不覆盖当前版本。

## sandbox_conflicts

保存多个 step 并行修改同一文件时产生的冲突。第一版不自动三方合并，由前端选择 current/incoming/manual 解决。

## attachments

保存用户图片/文件输入的元数据。当前阶段不做完整上传、下载或文件内容解析流程。

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
| meta_json | TEXT | 前端传入的附件扩展元数据 |
| created_at | TEXT | 创建时间 |

## conversation_summaries

保存持久上下文会话的压缩摘要，适用于 `mode=agent/group`。

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
