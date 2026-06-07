import { Agent, Conversation, Message, Artifact, ArtifactVersion, HealthCheckData } from '@/types';

export const mockAgents: Agent[] = [
  {
    id: 'agent-orchestrator',
    name: 'Orchestrator',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=orchestrator%20ai%20agent%20avatar%20purple%20style&image_size=square',
    description: '任务调度与智能拆解汇总',
    tags: ['任务拆解', '调度', '汇总'],
    status: 'online',
    category: 'orchestrator',
    provider: 'mock',
    enabled: true,
    systemPrompt: '你是 Orchestrator，负责理解用户需求，智能拆解复杂任务，调度不同Agent协同工作，汇总所有输出结果。',
    modelConfig: {
      provider: 'mock',
      modelName: 'Orchestrator-v1',
      temperature: 0.7,
      maxTokens: 8192
    },
    tools: [
      { id: 'workspace.read', name: '读取工作区', description: '读取工作区文件树、文件内容及扫描元数据', enabled: true },
      { id: 'workspace.write', name: '修改工作区', description: '在工作区直接创建或重写修改源代码文件', enabled: true },
      { id: 'artifact.generate', name: '生成交互产物', description: '生成独立前端交互产物（Artifact）', enabled: true },
      { id: 'command.run', name: '执行系统命令', description: '在安全沙箱内执行任意 Shell 命令行指令', enabled: true }
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: true,
      canRunCommands: true,
      canGenerateArtifacts: true,
      canDeploy: true
    }
  },
  {
    id: 'agent-claude-code',
    name: 'Claude Code',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=claude%20code%20ai%20agent%20avatar%20blue%20tech%20style&image_size=square',
    description: '专业代码生成与工程理解',
    tags: ['代码生成', '代码修改', '工程理解'],
    status: 'online',
    category: 'coding',
    provider: 'claude-code',
    enabled: true,
    systemPrompt: '你是 Claude Code，专注于高质量代码生成、重构和工程理解。',
    modelConfig: {
      provider: 'claude-code',
      modelName: 'claude-3-5-sonnet-20241022',
      temperature: 0.2,
      maxTokens: 200000
    },
    tools: [
      { id: 'workspace.read', name: '读取工作区', description: '读取工作区文件树、文件内容及扫描元数据', enabled: true },
      { id: 'workspace.write', name: '修改工作区', description: '在工作区直接创建或重写修改源代码文件', enabled: true }
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: true,
      canRunCommands: false,
      canGenerateArtifacts: true,
      canDeploy: false
    }
  },
  {
    id: 'agent-codex',
    name: 'Codex',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=openai%20codex%20ai%20coding%20avatar%20green%20style&image_size=square',
    description: 'Bug修复与云端代码任务',
    tags: ['Bug修复', '代码理解', '云端任务'],
    status: 'online',
    category: 'coding',
    provider: 'codex',
    enabled: true,
    systemPrompt: '你是 Codex，擅长快速修复代码Bug和处理云端代码任务。',
    modelConfig: {
      provider: 'codex',
      modelName: 'gpt-4o-codex',
      temperature: 0.1,
      maxTokens: 128000
    },
    tools: [
      { id: 'workspace.read', name: '读取工作区', description: '读取工作区 file tree 和文件内容', enabled: true },
      { id: 'workspace.write', name: '修改工作区', description: '在工作区直接创建或重写修改源代码文件', enabled: true }
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: true,
      canRunCommands: false,
      canGenerateArtifacts: true,
      canDeploy: false
    }
  },
  {
    id: 'agent-review',
    name: 'ReviewAgent',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=code%20reviewer%20agent%20avatar%20professional%20style&image_size=square',
    description: '代码审查与质量检查',
    tags: ['代码审查', '质量检查'],
    status: 'mock',
    category: 'review',
    provider: 'mock',
    enabled: true,
    systemPrompt: '你是 ReviewAgent，负责严格审查代码质量、安全性和最佳实践。',
    modelConfig: {
      provider: 'mock',
      modelName: 'ReviewAgent-v1',
      temperature: 0.0,
      maxTokens: 4096
    },
    tools: [
      { id: 'workspace.read', name: '读取工作区', description: '读取工作区文件树、文件内容及扫描元数据', enabled: true }
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: false,
      canRunCommands: false,
      canGenerateArtifacts: true,
      canDeploy: false
    }
  },
  {
    id: 'agent-doc',
    name: 'DocAgent',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=document%20writer%20agent%20avatar%20clean%20style&image_size=square',
    description: '文档与README生成',
    tags: ['README', '文档生成'],
    status: 'mock',
    category: 'document',
    provider: 'mock',
    enabled: true,
    systemPrompt: '你是 DocAgent，擅长编写清晰专业的项目文档、README和使用说明。',
    modelConfig: {
      provider: 'mock',
      modelName: 'DocAgent-v1',
      temperature: 0.8,
      maxTokens: 8192
    },
    tools: [
      { id: 'workspace.write', name: '修改工作区', description: '在工作区直接创建或重写修改源代码文件', enabled: true }
    ],
    permissions: {
      canReadFiles: false,
      canWriteFiles: true,
      canRunCommands: false,
      canGenerateArtifacts: true,
      canDeploy: false
    }
  }
];

export const mockConversations: Conversation[] = [
  {
    id: 'conv-single-login',
    title: 'React登录页生成',
    mode: 'single',
    agentIds: ['agent-claude-code'],
    lastMessage: '已生成LoginPage.tsx',
    updatedAt: '2026-05-22 14:30',
    createdAt: '2026-05-22 14:00'
  },
  {
    id: 'conv-group-website',
    title: '多Agent官网生成任务',
    mode: 'group',
    agentIds: ['agent-orchestrator', 'agent-design', 'agent-codex', 'agent-review', 'agent-doc'],
    lastMessage: '所有产物已生成完毕',
    updatedAt: '2026-05-22 15:20',
    createdAt: '2026-05-22 14:50'
  },
  {
    id: 'conv-desktop-workspace',
    title: '桌面工作区测试',
    mode: 'single',
    agentIds: ['agent-orchestrator'],
    lastMessage: '已成功扫描本地工作区，发现5个项目文件',
    updatedAt: '2026-05-23 10:45',
    createdAt: '2026-05-23 10:30'
  }
];

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-single-login',
    senderId: 'user',
    senderName: '用户',
    role: 'user',
    type: 'text',
    content: '帮我写一个React登录页面，要有用户名、密码输入框和登录按钮',
    createdAt: '2026-05-22 14:28'
  },
  {
    id: 'msg-2',
    conversationId: 'conv-single-login',
    senderId: 'agent-claude-code',
    senderName: 'Claude Code',
    role: 'agent',
    type: 'text',
    content: '好的，下面为您生成一个完整的React登录页面组件，包含表单验证和基础样式。',
    createdAt: '2026-05-22 14:29'
  },
  {
    id: 'msg-4',
    conversationId: 'conv-single-login',
    senderId: 'agent-claude-code',
    senderName: 'Claude Code',
    role: 'agent',
    type: 'artifact',
    artifactId: 'art-login-page',
    content: '生成产物 LoginPage.tsx',
    createdAt: '2026-05-22 14:30'
  },
  {
    id: 'msg-g1',
    conversationId: 'conv-group-website',
    senderId: 'user',
    senderName: '用户',
    role: 'user',
    type: 'text',
    content: '帮我生成一个AgentHub官网首页，需要设计、代码、审查和文档，还要包含交互式Todo演示',
    createdAt: '2026-05-22 15:10'
  },
  {
    id: 'msg-g2',
    conversationId: 'conv-group-website',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'orchestrator',
    type: 'status',
    content: '我已理解你的需求，正在分析中...',
    createdAt: '2026-05-22 15:11'
  },
  {
    id: 'msg-g3',
    conversationId: 'conv-group-website',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'orchestrator',
    type: 'task-plan',
    content: '任务拆解：\n1. DesignAgent - 负责页面设计\n2. Codex - 负责代码生成\n3. ReviewAgent - 负责代码审查\n4. DocAgent - 负责文档生成\n5. - 交互式Todo应用演示',
    createdAt: '2026-05-22 15:12'
  },
  {
    id: 'msg-g4',
    conversationId: 'conv-group-website',
    senderId: 'agent-codex',
    senderName: 'Codex',
    role: 'agent',
    type: 'text',
    content: '页面建议包含任务输入框、任务列表、完成状态和清空按钮。',
    createdAt: '2026-05-22 15:13'
  },
  {
    id: 'msg-g5-artifact',
    conversationId: 'conv-group-website',
    senderId: 'agent-codex',
    senderName: 'Codex',
    role: 'agent',
    type: 'artifact',
    artifactId: 'art-home-page',
    content: '生成产物 HomePage.tsx',
    createdAt: '2026-05-22 15:15'
  },
  {
    id: 'msg-g6',
    conversationId: 'conv-group-website',
    senderId: 'agent-review',
    senderName: 'ReviewAgent',
    role: 'agent',
    type: 'text',
    content: '代码审查已通过！结构规范，没有发现严重问题。',
    createdAt: '2026-05-22 15:17'
  },
  {
    id: 'msg-g7',
    conversationId: 'conv-group-website',
    senderId: 'agent-doc',
    senderName: 'DocAgent',
    role: 'agent',
    type: 'artifact',
    artifactId: 'art-readme',
    content: '生成产物 index.html',
    createdAt: '2026-05-22 15:19'
  },
  {
    id: 'msg-g8-todo',
    conversationId: 'conv-group-website',
    senderId: 'agent-design',
    senderName: 'DesignAgent',
    role: 'agent',
    type: 'artifact',
    artifactId: 'art-todo-app',
    content: '生成产物 TodoApp.html (交互式待办应用)',
    createdAt: '2026-05-22 15:25'
  },
  {
    id: 'msg-g9-markdown',
    conversationId: 'conv-group-website',
    senderId: 'agent-doc',
    senderName: 'DocAgent',
    role: 'agent',
    type: 'artifact',
    artifactId: 'art-markdown-doc',
    content: '生成产物 项目说明.md',
    createdAt: '2026-05-22 15:30'
  },
  {
    id: 'msg-g10-mermaid',
    conversationId: 'conv-group-website',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'agent',
    type: 'artifact',
    artifactId: 'art-mermaid-diagram',
    content: '生成产物 系统架构图.mmd',
    createdAt: '2026-05-22 15:35'
  },
  {
    id: 'msg-g11',
    conversationId: 'conv-group-website',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'orchestrator',
    type: 'status',
    content: '全部任务已完成！所有产物已生成，可以点击预览查看。',
    createdAt: '2026-05-22 15:40'
  },
  {
    id: 'msg-desktop-1',
    conversationId: 'conv-desktop-workspace',
    senderId: 'user',
    senderName: '用户',
    role: 'user',
    type: 'text',
    content: '请扫描当前本地工作区，列出所有项目文件',
    createdAt: '2026-05-23 10:32'
  },
  {
    id: 'msg-desktop-2',
    conversationId: 'conv-desktop-workspace',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'agent',
    type: 'status',
    content: '🔍 开始扫描本地工作区...',
    createdAt: '2026-05-23 10:33'
  },
  {
    id: 'msg-desktop-3',
    conversationId: 'conv-desktop-workspace',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'agent',
    type: 'text',
    content: '✅ 本地工作区扫描完成！发现以下项目文件：\n\n📁 src/\n  ├─ App.tsx\n  ├─ index.css\n  └─ main.tsx\n📁 public/\n  ├─ favicon.ico\n  └─ index.html\n📄 package.json\n📄 tsconfig.json\n📄 README.md',
    createdAt: '2026-05-23 10:35'
  }
];

export const mockArtifacts: Artifact[] = [
  {
    id: 'art-login-page',
    conversationId: 'conv-single-login',
    title: 'LoginPage.tsx',
    type: 'code',
    description: '登录页面组件',
    currentVersionId: 'ver-login-page-1',
    latestVersion: 1,
    createdAt: '2026-05-22 14:30',
    updatedAt: '2026-05-22 14:30'
  },
  {
    id: 'art-home-page',
    conversationId: 'conv-group-website',
    title: 'HomePage.tsx',
    type: 'code',
    description: '官网首页组件',
    currentVersionId: 'ver-home-page-1',
    latestVersion: 1,
    createdAt: '2026-05-22 15:15',
    updatedAt: '2026-05-22 15:15'
  },
  {
    id: 'art-readme',
    conversationId: 'conv-group-website',
    title: 'index.html',
    type: 'html',
    description: '交互预览页面',
    currentVersionId: 'ver-readme-1',
    latestVersion: 1,
    createdAt: '2026-05-22 15:20',
    updatedAt: '2026-05-22 15:20'
  },
  {
    id: 'art-todo-app',
    conversationId: 'conv-group-website',
    title: 'TodoApp.html',
    type: 'html',
    description: '交互式Todo待办应用',
    currentVersionId: 'ver-todo-app-1',
    latestVersion: 1,
    createdAt: '2026-05-22 15:25',
    updatedAt: '2026-05-22 15:25'
  },
  {
    id: 'art-markdown-doc',
    conversationId: 'conv-group-website',
    title: '项目说明.md',
    type: 'markdown',
    description: '项目说明文档',
    currentVersionId: 'ver-markdown-doc-1',
    latestVersion: 1,
    createdAt: '2026-05-22 15:30',
    updatedAt: '2026-05-22 15:30'
  },
  {
    id: 'art-mermaid-diagram',
    conversationId: 'conv-group-website',
    title: '系统架构图.mmd',
    type: 'mermaid',
    description: '系统架构流程图',
    currentVersionId: 'ver-mermaid-diagram-1',
    latestVersion: 1,
    createdAt: '2026-05-22 15:35',
    updatedAt: '2026-05-22 15:35'
  }
];

export const mockArtifactVersions: ArtifactVersion[] = [
  {
    id: 'ver-login-page-1',
    artifactId: 'art-login-page',
    version: 1,
    content: `import React, { useState } from 'react';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login:', { username, password });
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-96">
        <h2 className="text-2xl font-bold text-center mb-6">登录</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              placeholder="请输入密码"
            />
          </div>
          <button 
            type="submit" 
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium"
          >
            登录
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;`,
    size: 1024,
    createdBy: 'agent-claude-code',
    createdByType: 'agent',
    createdAt: '2026-05-22 14:30'
  },
  {
    id: 'ver-home-page-1',
    artifactId: 'art-home-page',
    version: 1,
    content: `import React from 'react';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <nav className="px-8 py-4 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">AgentHub</h1>
        </div>
      </nav>
      <section className="py-20 text-center">
        <h2 className="text-4xl font-bold text-slate-800 mb-4">多Agent协作平台</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">让多个AI Agent协同工作，高效完成复杂任务</p>
      </section>
    </div>
  );
};

export default HomePage;`,
    size: 2048,
    createdBy: 'agent-codex',
    createdByType: 'agent',
    createdAt: '2026-05-22 15:15'
  },
  {
    id: 'ver-readme-1',
    artifactId: 'art-readme',
    version: 1,
    content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentHub 交互预览</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%); color: #1e293b; }
    nav { height: 64px; background: white; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); }
    nav h1 { color: #2563eb; font-size: 22px; font-weight: 800; }
    main { padding: 40px 24px; max-width: 1100px; margin: 0 auto; }
  </style>
</head>
<body>
  <nav>
    <h1>AgentHub</h1>
  </nav>
  <main>
    <h2>欢迎使用 AgentHub</h2>
  </main>
</body>
</html>`,
    size: 5120,
    createdBy: 'agent-doc',
    createdByType: 'agent',
    createdAt: '2026-05-22 15:20'
  },
  {
    id: 'ver-todo-app-1',
    artifactId: 'art-todo-app',
    version: 1,
    content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>交互式Todo应用</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 16px; }
    .container { max-width: 480px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
    .header { padding: 24px; background: linear-gradient(135deg, #3370ff, #5b5cf0); color: white; }
    .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .header p { font-size: 13px; opacity: 0.9; }
    .input-area { padding: 16px; display: flex; gap: 10px; border-bottom: 1px solid #f0f0f0; }
    .input-area input { flex: 1; padding: 12px 16px; border: 2px solid #e8e8e8; border-radius: 12px; font-size: 15px; outline: none; transition: 0.2s; }
    .input-area input:focus { border-color: #3370ff; }
    .input-area button { padding: 12px 20px; background: #3370ff; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px; transition: 0.2s; }
    .input-area button:hover { background: #2563eb; transform: translateY(-1px); }
    .todo-list { padding: 12px; min-height: 200px; }
    .todo-item { display: flex; align-items: center; padding: 14px 12px; border-radius: 12px; margin-bottom: 8px; background: #f8f9fa; transition: 0.2s; }
    .todo-item:hover { background: #f0f2f5; }
    .todo-item.completed { opacity: 0.6; }
    .todo-item.completed .todo-text { text-decoration: line-through; color: #888; }
    .todo-checkbox { width: 24px; height: 24px; border: 2px solid #d0d7de; border-radius: 50%; margin-right: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
    .todo-item.completed .todo-checkbox { background: #3370ff; border-color: #3370ff; color: white; }
    .todo-text { flex: 1; font-size: 15px; color: #1f2329; }
    .todo-delete { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #ff3b30; opacity: 0; cursor: pointer; transition: 0.2s; font-size: 18px; font-weight: 700; }
    .todo-item:hover .todo-delete { opacity: 1; }
    .todo-delete:hover { background: #fee2e2; }
    .empty-state { text-align: center; padding: 60px 20px; color: #8f959e; }
    .empty-state svg { width: 80px; height: 80px; opacity: 0.3; margin-bottom: 16px; }
    .stats-bar { padding: 14px 16px; background: #f8f9fa; border-top: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
    .stats-text { font-size: 13px; color: #646a73; font-weight: 500; }
    .clear-btn { font-size: 13px; color: #3370ff; background: none; border: none; cursor: pointer; font-weight: 600; }
    .clear-btn:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📝 我的待办</h1>
      <p>点击添加按钮来创建新任务</p>
    </div>
    <div class="input-area">
      <input type="text" id="todoInput" placeholder="输入新的待办事项..." />
      <button id="addBtn">添加</button>
    </div>
    <div class="todo-list" id="todoList">
      <div class="empty-state" id="emptyState">
        <div>✨ 暂无待办</div>
      </div>
    </div>
    <div class="stats-bar">
      <span class="stats-text" id="statsText">0 项待办</span>
      <button class="clear-btn" id="clearBtn">清除已完成</button>
    </div>
  </div>
  <script>
    var todos = [];
    var nextId = 1;

    function render() {
      var listEl = document.getElementById('todoList');
      var emptyEl = document.getElementById('emptyState');
      
      if (todos.length === 0) {
        listEl.innerHTML = '';
        listEl.appendChild(emptyEl);
        emptyEl.style.display = 'block';
      } else {
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        todos.forEach(function(todo) {
          var item = document.createElement('div');
          item.className = 'todo-item' + (todo.completed ? ' completed' : '');
          var checkBox = document.createElement('div');
          checkBox.className = 'todo-checkbox';
          checkBox.innerHTML = todo.completed ? '✓' : '';
          checkBox.onclick = function() { toggle(todo.id); };
          var text = document.createElement('span');
          text.className = 'todo-text';
          text.textContent = todo.text;
          var delBtn = document.createElement('div');
          delBtn.className = 'todo-delete';
          delBtn.textContent = '×';
          delBtn.onclick = function() { del(todo.id); };
          item.appendChild(checkBox);
          item.appendChild(text);
          item.appendChild(delBtn);
          listEl.appendChild(item);
        });
      }
      
      var stats = todos.filter(function(t) { return !t.completed; }).length;
      document.getElementById('statsText').textContent = todos.length + ' 项待办，' + stats + ' 项未完成';
    }

    function add() {
      var input = document.getElementById('todoInput');
      var text = input.value.trim();
      if (!text) return;
      todos.push({ id: nextId++, text: text, completed: false });
      input.value = '';
      render();
    }

    function toggle(id) {
      todos.forEach(function(t) { if (t.id === id) t.completed = !t.completed; });
      render();
    }

    function del(id) {
      todos = todos.filter(function(t) { return t.id !== id; });
      render();
    }

    function clearCompleted() {
      todos = todos.filter(function(t) { return !t.completed; });
      render();
    }

    document.getElementById('addBtn').onclick = add;
    document.getElementById('todoInput').onkeydown = function(e) {
      if (e.key === 'Enter') { add(); e.preventDefault(); }
    };
    document.getElementById('clearBtn').onclick = clearCompleted;
    
    todos = [
      { id: 1, text: '熟悉移动App基础架构', completed: true },
      { id: 2, text: '完成产物预览组件开发', completed: false },
      { id: 3, text: '测试Mock数据切换功能', completed: false },
      { id: 4, text: '发布第一个Beta版本', completed: false }
    ];
    nextId = 5;
    render();
  </script>
</body>
</html>`,
    size: 12000,
    createdBy: 'agent-design',
    createdByType: 'agent',
    createdAt: '2026-05-22 15:25'
  },
  {
    id: 'ver-markdown-doc-1',
    artifactId: 'art-markdown-doc',
    version: 1,
    content: `# 项目说明文档

## 概述

这是一个基于 NorthCore 的多智能体协作平台，支持多个AI Agent协同工作，高效完成复杂任务。

## 功能特性

- 🤖 **多Agent协作**: 支持Orchestrator调度多个专业Agent
- 📱 **移动端适配**: 完整的移动App支持
- 📦 **产物预览**: 支持HTML、代码、Markdown、Mermaid等多种产物类型
- 🎭 **Mock模式**: 后端不可用时也能正常测试

## 快速开始

\`\`\`bash
# 安装依赖
cd mobile && npm install

# 启动开发服务器
npm start
\`\`\`

## 技术栈

| 组件 | 技术选择 |
|------|----------|
| 框架 | Expo + React Native |
| 状态管理 | Zustand |
| 语言 | TypeScript |
| WebView | react-native-webview |

## 开发规范

> 所有UI必须和frontend保持1:1一致，未经许可不得自行重新设计。

1. 优先复用frontend的类型定义
2. 使用统一的service层管理API调用
3. 在设置中可以自由切换Mock/真实HTTP模式`,
    size: 3000,
    createdBy: 'agent-doc',
    createdByType: 'agent',
    createdAt: '2026-05-22 15:30'
  },
  {
    id: 'ver-mermaid-diagram-1',
    artifactId: 'art-mermaid-diagram',
    version: 1,
    content: `flowchart TD
    A[用户打开App] --> B{Mock模式开关}
    B -->|开启Mock| C[加载本地Mock数据]
    B -->|连接后端| D[发起真实HTTP请求]
    C --> E[渲染产物预览]
    D --> E
    E --> F[展示完整交互体验]
    
    style A fill:#3370ff,color:#fff,stroke:none
    style F fill:#34c759,color:#fff,stroke:none`,
    size: 800,
    createdBy: 'agent-orchestrator',
    createdByType: 'agent',
    createdAt: '2026-05-22 15:35'
  }
];

export const mockHealthData: HealthCheckData = {
  status: 'healthy',
  version: '1.0.0',
  timestamp: new Date().toISOString()
};
