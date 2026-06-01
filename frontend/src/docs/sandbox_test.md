# Sandbox Workspace & Auto-Trigger Functional Testing Guide

This guide details the verification test scenarios for session-level durable workspaces and message auto-triggered sandbox runs inside the NorthCore AgentHub web client.

---

## 1. Test Setup & Environment

Ensure the web application is running in local development mode:
- **Backend API Server**: running and accessible at `http://localhost:8000` (or as configured in `.env.development`).
- **Frontend App**: running at `http://localhost:5173`.
- **WS server**: fully connected (Titlebar should indicate WS is connected).

---

## 2. Test Case 1: Session-Level Workspace Selection & Inline Creation

### Objectives
- Verify users can create and select a durable Sandbox Workspace when creating new conversations.
- Confirm newly created workspaces register successfully on the backend and persist.

### Step-by-Step Instructions
1. Open the web app and click the **"➕ 新建会话"** (New Conversation) button in the left panel.
2. Choose either **"单聊 (1v1)"** or **"群聊 (多Agent)"**.
3. Locate the new **"关联 Sandbox 工作区 (文件沙箱)"** section.
4. Click **"➕ 新建工作区"** (Create new workspace).
5. Type a unique workspace name (e.g., `NorthCore UI Sandbox`).
6. Select any Agent and click **"创建单聊"** (Create Chat).

### Expected Results
- The conversation is created successfully.
- In the active chat header, a beautiful workspace select badge should display **"📁 NorthCore UI Sandbox"** as the bound workspace.
- Dropdown options should list this workspace.

---

## 3. Test Case 2: Unified Message Auto-Triggered Sandbox Run

### Objectives
- Validate that standard user messages containing artifact creation requests automatically trigger a Sandbox Run.
- Verify the right-side Run Panel expands automatically upon detection.

### Step-by-Step Instructions
1. Select the conversation created in Test Case 1.
2. In the chat text area, type:
   > "帮我生成一个漂亮的登录页面，需要带用户名、密码输入框和登录/注册按钮。"
3. Click the standard **"发送"** (Send) button (or press `Enter`).

### Expected Results
- The server classifies the prompt's intent as `artifact_generation`.
- The chat displays a system status message: **"已识别为产物型任务，正在创建沙箱运行..."**.
- The right panel automatically slides open and switches focus to the **"Sandbox"** tab.
- The step list and progress indicators (DAG) start rendering real-time progression from WebSocket events.

---

## 4. Test Case 3: Interactive Recursive Folder Tree Navigation

### Objectives
- Verify that Sandbox-generated files are displayed as a fully interactive hierarchical directory tree structure rather than a flat list.
- Confirm collapsing and expansion of nested directories works.

### Step-by-Step Instructions
1. Once the auto-triggered run in Test Case 2 achieves completion (reaches `completed` status), click the **"生成文件"** (Generated Files) tab in the right panel.
2. Look at the file list.

### Expected Results
- Instead of a flat list, the panel displays folder structures (e.g. `src/` as a directory and nested code files inside).
- Clicking directories toggles expansion (`ChevronDown` / `ChevronRight`).
- Clicking files correctly loads the text contents of the sandbox files inside the preview viewer.
- Clicking the **"返回文件树"** button successfully navigates back.

---

## 5. Test Case 4: Durable Workspace Reuse

### Objectives
- Verify that consecutive Runs in the same conversation automatically reuse the exact same Sandbox Workspace path.

### Step-by-Step Instructions
1. In the same conversation, submit a second prompt:
   > "在刚才的登录页面里，增加一条密码强度校验的前端 JS 逻辑。"
2. Wait for the second Sandbox Run to finish.
3. Call the backend API or check the file tree logs.

### Expected Results
- The new Sandbox Run is executed in the *same* workspace path.
- The previous files (`README.md`, `package.json`, etc.) remain in the directory alongside the newly updated files.
- The directory tree retains the persistent state of all session workspace artifacts.
