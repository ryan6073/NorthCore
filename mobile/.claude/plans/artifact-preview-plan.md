# 移动端产物预览实现方案

## 目标

参照 frontend 的实现，为移动端添加完整的产物预览能力，包括：产物类型定义、API 服务、状态管理、产物卡片渲染、类型专属预览、全屏查看。

## 当前状态

- **类型系统**：已有 `MessageType.artifact`、`ArtifactReference`、`ArtifactCreatedEvent`
- **消息气泡**：artifact 类型消息仅呈现静态卡片（文件名 + 摘要文本，最多4行）
- **Store**：`artifact.created` WS 事件仅 `console.log`，不存储产物数据
- **API**：无产物相关接口
- **已有依赖**：`react-native-webview` v13.16.1 已安装

## 实现步骤

### Step 1: 补充类型定义

**文件**: `src/types/index.ts`

新增 `ArtifactType`、`Artifact`、`ArtifactVersion`、`ArtifactDetail`（与 frontend 对齐），补充 `ArtifactReference` 字段：

| 类型 | 说明 |
|------|------|
| `ArtifactType` | `'code' \| 'html' \| 'markdown' \| 'diff' \| 'image' \| 'mermaid' \| 'document' \| 'ppt'` |
| `Artifact` | 产物元数据（id, conversationId, runId, title, type, latestVersion, currentVersionId 等） |
| `ArtifactVersion` | 版本（id, artifactId, version, content, language, createdAt 等） |
| `ArtifactDetail` | extends Artifact, 含 currentVersion + content |

### Step 2: 创建产物 API 服务

**文件**: `src/api/artifactApi.ts`

| 方法 | 接口 |
|------|------|
| `getArtifactMetaList(conversationId)` | `GET /conversations/{id}/artifacts` |
| `getArtifactDetail(artifactId)` | `GET /artifacts/{id}` |
| `getArtifactVersions(artifactId)` | `GET /artifacts/{id}/versions` |

### Step 3: Store 状态增强

**文件**: `src/stores/useMessageStore.ts`

- 新增 state 字段：`artifacts: Artifact[]`（当前会话产物列表）
- 新 action：`loadArtifacts(conversationId)` → 调用 artifactApi
- 修复 `artifact.created` WS handler → 将产物加入 `artifacts` 列表
- 修复 `all_tasks.completed` → 处理 `data.artifacts`
- 修复 `sendMessage` → 处理响应中的 `artifacts` 字段

### Step 4: 创建 ArtifactPreview 组件

**文件**: `src/components/ArtifactPreview.tsx`

核心产物渲染组件，根据 Artifact.type 使用不同渲染方式：

| type | 渲染方式 |
|------|---------|
| `code` | WebView + highlight.js（类似 MarkdownRenderer 的 buildCodeHtml）|
| `html` | WebView + srcDoc（沙箱化 iframe） |
| `markdown` | WebView + marked.js |
| `mermaid` | WebView + mermaid.js 渲染 |
| `image` | React Native Image 组件 |
| `document` | WebView + 文档风格 markdown |
| `ppt` | Text 幻灯片展示（`---` 分割） |
| `diff` | WebView + 差异高亮 |

Props:
- `artifact: Artifact`
- `version: ArtifactVersion | null`
- `loading: boolean`
- `maxHeight?: number`

### Step 5: 创建 ArtifactMessage 组件

**文件**: `src/components/ArtifactMessage.tsx`

内嵌在聊天中的产物卡片组件：
- 查找匹配的 Artifact 对象
- 显示产物标题、类型图标、预览内容
- 点击打开全屏预览
- 如果未加载，显示加载占位

### Step 6: 创建 ArtifactFullScreenModal

**文件**: `src/components/ArtifactFullScreenModal.tsx`

全屏产物预览模态框：
- 导航头（返回按钮 + 标题 + 版本切换）
- 内容区域复用 ArtifactPreview
- 支持手势关闭
- 支持版本选择和切换

### Step 7: 更新 MessageBubble

**文件**: `src/components/MessageBubble.tsx`

- artifact 类型消息使用新的 `ArtifactMessage` 组件替代静态卡片
- 传递 artifacts 状态和打开全屏的回调

### Step 8: 集成到聊天页面

**文件**: `src/app/chats/[conversationId].tsx`

- 添加 ArtifactFullScreenModal
- 加载会话时 fetch artifacts
- 连接 artifact 点击事件到全屏模态框

## 关键设计决策

1. **轻量实现**：不照搬 frontend 的完整 ArtifactList 侧栏、编辑、冲突解决、版本 diff（这些在移动端使用场景少）。聚焦：**查看预览** 和 **全屏体验**。

2. **WebView 复用**：MarkdownRenderer 已展示了 WebView 渲染 HTML/代码的方式，ArtifactPreview 复用相同模式。

3. **按需加载**：Artifact 元数据在 fetchMessages 时一并获取，具体版本内容在预览时按需加载。

4. **无 Mermaid 客户端**：移动端 mermaid.js 包体积较大，采用后端渲染或服务端渲染方案，或直接使用 CDN WebView 方式。

## 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types/index.ts` | 修改 | 新增 ArtifactType、Artifact、ArtifactVersion、ArtifactDetail |
| `src/api/artifactApi.ts` | 新增 | 产物 CRUD API |
| `src/stores/useMessageStore.ts` | 修改 | 新增 artifacts state、loadArtifacts action、WS artifact handler |
| `src/components/ArtifactPreview.tsx` | 新增 | 核心产物渲染组件 |
| `src/components/ArtifactMessage.tsx` | 新增 | 聊天内嵌产物卡片 |
| `src/components/ArtifactFullScreenModal.tsx` | 新增 | 全屏产物查看器 |
| `src/components/MessageBubble.tsx` | 修改 | artifact 类型使用 ArtifactMessage |
| `src/app/chats/[conversationId].tsx` | 修改 | 集成全屏模态框、加载 artifacts |
