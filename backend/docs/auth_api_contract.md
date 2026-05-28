# AgentHub Auth API Contract

本文档用于前端接入用户登录、注册、游客体验与登录态校验。

## 基础信息

- Base URL: `/api/v1`
- 鉴权方式: Bearer Token
- 登录成功后，前端需要在后续请求头中携带：

```http
Authorization: Bearer <token>
```

统一响应结构：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

失败响应示例：

```json
{
  "code": 40005,
  "message": "邮箱或密码错误",
  "data": null
}
```

## 用户模型

```ts
interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: string;
  updatedAt: string;
}
```

登录、注册、游客登录成功后返回：

```ts
interface AuthSession {
  user: User;
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
}
```

## 1. 注册账号

`POST /auth/register`

用途：创建新用户，并直接返回登录态。

Request Body:

```json
{
  "email": "user@example.com",
  "password": "123456",
  "name": "张三",
  "avatar": "https://example.com/avatar.png"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| email | string | 是 | 用户邮箱，作为登录账号 |
| password | string | 是 | 至少 6 位 |
| name | string | 否 | 昵称/姓名；不传时后端用邮箱前缀 |
| avatar | string | 否 | 头像 URL |

Response Data:

```json
{
  "user": {
    "id": "user-xxx",
    "email": "user@example.com",
    "name": "张三",
    "avatar": "https://example.com/avatar.png",
    "role": "user",
    "createdAt": "2026-05-27 12:00:00",
    "updatedAt": "2026-05-27 12:00:00"
  },
  "token": "xxx",
  "tokenType": "Bearer",
  "expiresAt": "2026-06-10 12:00:00"
}
```

常见错误：

| code | message |
| --- | --- |
| 40000 | 邮箱格式不正确 |
| 40000 | 密码至少 6 位 |
| 40004 | 邮箱已注册 |

## 2. 账号登录

`POST /auth/login`

用途：使用邮箱和密码登录。

Request Body:

```json
{
  "email": "admin@northcore.ai",
  "password": "admin123"
}
```

Response Data: `AuthSession`

默认管理员账号：

```text
email: admin@northcore.ai
password: admin123
```

常见错误：

| code | message |
| --- | --- |
| 40005 | 邮箱或密码错误 |

## 3. 游客登录

`POST /auth/guest`

用途：一键游客体验。后端会返回游客用户和 token。

Request Body: 无

Response Data: `AuthSession`

说明：

- 当前 Demo 阶段使用一个共享游客账号。
- 游客账号 `role = guest`。

## 4. 获取当前用户

`GET /auth/me`

用途：前端启动时校验当前 token 是否有效。

Headers:

```http
Authorization: Bearer <token>
```

Response Data: `User`

未登录或 token 失效：

```json
{
  "code": 40101,
  "message": "未登录",
  "data": null
}
```

或：

```json
{
  "code": 40101,
  "message": "登录已过期",
  "data": null
}
```

## 5. 退出登录

`POST /auth/logout`

用途：删除当前 token 对应的 session。

Headers:

```http
Authorization: Bearer <token>
```

Response Data:

```json
true
```

## 资源隔离规则

前端登录后，以下接口都建议携带 `Authorization`：

```text
GET/POST/PUT/DELETE /agents
GET/POST/PUT/DELETE /conversations
GET /conversations/{conversationId}/messages
POST /conversations/{conversationId}/messages
GET /conversations/{conversationId}/artifacts
GET/PUT /artifacts/{artifactId}
```

隔离规则：

- `conversations.ownerUserId = 当前登录用户 id`
- 用户只能看到自己的会话。
- 用户只能操作自己会话下的消息、产物、记忆和 pinned messages。
- 系统预置 Agent 对所有用户可见。
- 用户自建 Agent 只对创建者可见。
- 未携带 token 调业务接口时，后端当前会回退到默认管理员，兼容旧 Demo 联调。

Agent 返回中新增：

```ts
ownerUserId: string | null
```

说明：

- `ownerUserId = null` 表示系统预置 Agent。
- `ownerUserId = 当前用户 id` 表示用户自建 Agent。

Conversation 返回中新增：

```ts
ownerUserId: string
```

说明：

- 会话归属于对应用户。
- 前端通常不需要手动传该字段，后端会根据 token 自动写入。

## 前端建议流程

1. 用户打开登录页。
2. 调 `POST /auth/login`、`POST /auth/register` 或 `POST /auth/guest`。
3. 保存返回的 `token`。
4. 后续请求统一加：

```http
Authorization: Bearer <token>
```

5. 页面刷新时先调 `GET /auth/me`。
6. 如果 `code = 0`，进入主应用。
7. 如果 `code = 40101`，回到登录页。

