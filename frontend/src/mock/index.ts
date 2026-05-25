import { Agent, Conversation, Message, Artifact } from '@/types';

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
    lastUsedAt: '2026-05-22 15:30',
    systemPrompt: '你是 Orchestrator，负责理解用户需求，智能拆解复杂任务，调度不同Agent协同工作，汇总所有输出结果。',
    modelConfig: {
      provider: 'mock',
      modelName: 'Orchestrator-v1',
      temperature: 0.7,
      maxTokens: 8192
    },
    tools: [
      { id: 'file_read', name: '读文件', description: '读取文件内容', enabled: true },
      { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: true },
      { id: 'code_review', name: '代码审查', description: '审查代码质量', enabled: true },
      { id: 'run_command', name: '运行命令', description: '执行Shell命令', enabled: true },
      { id: 'web_preview', name: '网页预览', description: '生成网页预览', enabled: true },
      { id: 'deploy', name: '部署', description: '部署产物', enabled: true }
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
    lastUsedAt: '2026-05-22 14:45',
    systemPrompt: '你是 Claude Code，专注于高质量代码生成、重构和工程理解。',
    modelConfig: {
      provider: 'claude-code',
      modelName: 'claude-3-5-sonnet-20241022',
      apiBaseUrl: 'https://api.anthropic.com/v1',
      apiKeyPlaceholder: 'sk-ant-...',
      temperature: 0.2,
      maxTokens: 200000
    },
    tools: [
      { id: 'file_read', name: '读文件', description: '读取文件内容', enabled: true },
      { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: true },
      { id: 'run_command', name: '运行命令', description: '执行Shell命令', enabled: false }
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
    lastUsedAt: '2026-05-21 10:20',
    systemPrompt: '你是 Codex，擅长快速修复代码Bug和处理云端代码任务。',
    modelConfig: {
      provider: 'codex',
      modelName: 'gpt-4o-codex',
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKeyPlaceholder: 'sk-...',
      temperature: 0.1,
      maxTokens: 128000
    },
    tools: [
      { id: 'file_read', name: '读文件', description: '读取文件内容', enabled: true },
      { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: true }
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
    id: 'agent-opencode',
    name: 'OpenCode',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=open%20source%20code%20agent%20avatar%20orange%20style&image_size=square',
    description: '本地代码Agent与文件修改',
    tags: ['本地代码Agent', '文件修改'],
    status: 'offline',
    category: 'coding',
    provider: 'opencode',
    enabled: true,
    lastUsedAt: '2026-05-20 09:15',
    systemPrompt: '你是 OpenCode，运行在本地，专注于本地项目文件修改与代码理解。',
    modelConfig: {
      provider: 'opencode',
      modelName: 'opencode-7b-local',
      temperature: 0.3,
      maxTokens: 32768
    },
    tools: [
      { id: 'file_read', name: '读文件', description: '读取文件内容', enabled: true },
      { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: true },
      { id: 'run_command', name: '运行命令', description: '执行Shell命令', enabled: true }
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: true,
      canRunCommands: true,
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
    lastUsedAt: '2026-05-22 15:00',
    systemPrompt: '你是 ReviewAgent，负责严格审查代码质量、安全性和最佳实践。',
    modelConfig: {
      provider: 'mock',
      modelName: 'ReviewAgent-v1',
      temperature: 0.0,
      maxTokens: 4096
    },
    tools: [
      { id: 'code_review', name: '代码审查', description: '审查代码质量', enabled: true }
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
    lastUsedAt: '2026-05-22 15:10',
    systemPrompt: '你是 DocAgent，擅长编写清晰专业的项目文档、README和使用说明。',
    modelConfig: {
      provider: 'mock',
      modelName: 'DocAgent-v1',
      temperature: 0.8,
      maxTokens: 8192
    },
    tools: [
      { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: true }
    ],
    permissions: {
      canReadFiles: false,
      canWriteFiles: true,
      canRunCommands: false,
      canGenerateArtifacts: true,
      canDeploy: false
    }
  },
  {
    id: 'agent-design',
    name: 'DesignAgent',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=designer%20agent%20avatar%20artistic%20colorful&image_size=square',
    description: 'UI交互设计专家',
    tags: ['UI设计', '交互设计'],
    status: 'mock',
    category: 'design',
    provider: 'mock',
    enabled: true,
    lastUsedAt: '2026-05-22 14:55',
    systemPrompt: '你是 DesignAgent，专注于现代美观的UI界面设计和优秀用户体验。',
    modelConfig: {
      provider: 'mock',
      modelName: 'DesignAgent-v1',
      temperature: 0.9,
      maxTokens: 4096
    },
    tools: [],
    permissions: {
      canReadFiles: false,
      canWriteFiles: false,
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
    content: '帮我生成一个AgentHub官网首页，需要设计、代码、审查和文档',
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
    content: '任务拆解：\n1. DesignAgent - 负责页面设计\n2. Codex - 负责代码生成\n3. ReviewAgent - 负责代码审查\n4. DocAgent - 负责文档生成',
    createdAt: '2026-05-22 15:12'
  },
  {
    id: 'msg-g4',
    conversationId: 'conv-group-website',
    senderId: 'agent-design',
    senderName: 'DesignAgent',
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
    id: 'msg-g8',
    conversationId: 'conv-group-website',
    senderId: 'agent-orchestrator',
    senderName: 'Orchestrator',
    role: 'orchestrator',
    type: 'status',
    content: '全部任务已完成！',
    createdAt: '2026-05-22 15:20'
  }
];

export const mockArtifacts: Artifact[] = [
  {
    id: 'art-login-page',
    conversationId: 'conv-single-login',
    title: 'LoginPage.tsx',
    type: 'code',
    description: '登录页面组件',
    size: 1024,
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
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            登录
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;`,
    createdAt: '2026-05-22 14:30'
  },
  {
    id: 'art-home-page',
    conversationId: 'conv-group-website',
    title: 'HomePage.tsx',
    type: 'code',
    description: '官网首页组件',
    size: 2048,
    content: `import React from 'react';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <nav className="px-8 py-4 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">AgentHub</h1>
          <div className="space-x-6 text-slate-600">
            <a href="#" className="hover:text-blue-600">功能</a>
            <a href="#" className="hover:text-blue-600">文档</a>
            <a href="#" className="hover:text-blue-600">关于</a>
          </div>
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
    createdAt: '2026-05-22 15:15'
  },
  {
    id: 'art-readme',
    conversationId: 'conv-group-website',
    title: 'index.html',
    type: 'html',
    description: '交互预览页面',
    size: 5120,
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
    .dashboard { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
    .panel { background: white; border-radius: 18px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0; overflow: hidden; }
    .panel-header { padding: 18px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 800; }
    .agent-list { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .agent { padding: 12px; border-radius: 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; }
    .agent:hover { background: #f8fafc; }
    .agent.active { background: #eff6ff; border-color: #93c5fd; }
    .avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #8b5cf6); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; flex-shrink: 0; }
    .agent-info strong { display: block; font-size: 14px; }
    .agent-info span { display: block; margin-top: 3px; font-size: 12px; color: #64748b; }
    .workspace { min-height: 480px; display: flex; flex-direction: column; }
    .messages { flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 14px; background: #f8fafc; }
    .message { max-width: 75%; padding: 12px 14px; border-radius: 14px; line-height: 1.6; font-size: 14px; animation: fadeIn 0.25s ease; }
    .message.user { align-self: flex-end; background: #2563eb; color: white; border-bottom-right-radius: 4px; }
    .message.agent { align-self: flex-start; background: white; color: #334155; border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; }
    .composer { padding: 16px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 12px; }
    .composer input { flex: 1; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 14px; outline: none; font-size: 14px; }
    .composer input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
    button { border: none; border-radius: 12px; padding: 0 18px; background: #2563eb; color: white; font-weight: 700; cursor: pointer; transition: 0.2s; }
    button:hover { background: #1d4ed8; transform: translateY(-1px); }
    .quick-actions { display: flex; gap: 10px; flex-wrap: wrap; padding: 0 20px 18px; background: white; }
    .quick-actions button { background: #f1f5f9; color: #334155; padding: 9px 12px; font-size: 13px; }
    .quick-actions button:hover { background: #e2e8f0; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 800px) { .dashboard { grid-template-columns: 1fr; } .hero h2 { font-size: 30px; } }
  </style>
</head>
<body>
  <nav>
    <h1>AgentHub</h1>
    <div class="status" id="status">当前 Agent：代码助手</div>
  </nav>
  <main>
    <section class="hero">
      <h2>多 Agent 协作平台</h2>
      <p>点击左侧 Agent 切换角色，在输入框发送消息，体验一个简单的可交互 HTML 预览。</p>
    </section>
    <section class="dashboard">
      <aside class="panel">
        <div class="panel-header">Agent 联系人</div>
        <div class="agent-list">
          <div class="agent active" data-name="代码助手" data-role="负责代码生成、修复和解释">
            <div class="avatar">C</div>
            <div class="agent-info">
              <strong>代码助手</strong>
              <span>代码生成 / Debug</span>
            </div>
          </div>
          <div class="agent" data-name="产品经理" data-role="负责需求拆解、功能规划和用户故事">
            <div class="avatar">P</div>
            <div class="agent-info">
              <strong>产品经理</strong>
              <span>需求分析 / 原型规划</span>
            </div>
          </div>
          <div class="agent" data-name="测试专家" data-role="负责编写测试用例、发现边界问题">
            <div class="avatar">T</div>
            <div class="agent-info">
              <strong>测试专家</strong>
              <span>测试用例 / 质量保障</span>
            </div>
          </div>
        </div>
      </aside>
      <section class="panel workspace">
        <div class="panel-header">与代码助手对话</div>
        <div class="messages" id="messages">
          <div class="message agent">你好，我是代码助手。你可以让我生成组件、检查错误或者解释代码。</div>
        </div>
        <div class="quick-actions">
          <button type="button" onclick="sendQuick('帮我生成一个 React 组件')">生成组件</button>
          <button type="button" onclick="sendQuick('检查这段代码有没有问题')">检查代码</button>
          <button type="button" onclick="sendQuick('把需求拆成开发任务')">拆分任务</button>
        </div>
        <div class="composer">
          <input id="input" placeholder="输入你的任务..." />
          <button type="button" onclick="sendMessage()">发送</button>
        </div>
      </section>
    </section>
  </main>
  <script>
    var currentAgent = { name: "代码助手", role: "负责代码生成、修复和解释" };
    var agents = document.querySelectorAll(".agent");
    var statusEl = document.getElementById("status");
    var chatTitleEl = document.getElementById("chatTitle");
    var messagesEl = document.getElementById("messages");
    var inputEl = document.getElementById("input");
    agents.forEach(function(agentEl) {
      agentEl.addEventListener("click", function() {
        agents.forEach(function(item) { item.classList.remove("active"); });
        agentEl.classList.add("active");
        currentAgent = { name: agentEl.getAttribute("data-name"), role: agentEl.getAttribute("data-role") };
        statusEl.textContent = "当前 Agent：" + currentAgent.name;
        addMessage("agent", "已切换到" + currentAgent.name + "。我的职责是：" + currentAgent.role + "。");
      });
    });
    function addMessage(type, text) {
      var div = document.createElement("div");
      div.className = "message " + type;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function sendQuick(text) { inputEl.value = text; sendMessage(); }
    function sendMessage() {
      var text = inputEl.value.trim(); if (!text) return;
      addMessage("user", text); inputEl.value = "";
      setTimeout(function() { var reply = makeReply(text); addMessage("agent", reply); }, 400);
    }
    function makeReply(text) {
      if (currentAgent.name === "代码助手") return "我会从代码结构、类型定义、组件状态和边界情况四个方面处理这个任务：" + text;
      if (currentAgent.name === "产品经理") return "我会把这个需求拆成：用户目标、核心流程、页面结构、交互规则和验收标准。当前需求是：" + text;
      if (currentAgent.name === "测试专家") return "我会重点检查正常流程、异常流程、边界输入和回归影响。测试目标是：" + text;
      return "收到任务：" + text;
    }
    inputEl.addEventListener("keydown", function(event) { if (event.key === "Enter") { event.preventDefault(); sendMessage(); } });
  </script>
</body>
</html>`,
    createdAt: '2026-05-22 15:20'
  }
];
