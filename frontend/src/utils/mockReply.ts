import { Conversation, Agent, Message, Artifact } from '@/types';
import { createId } from './id';
import { getCurrentFullTime } from './time';

interface MockReplyResult {
  messages: Message[];
  artifacts: Artifact[];
}

export function generateMockReply(params: {
  conversation: Conversation;
  agents: Agent[];
  userContent: string;
}): MockReplyResult {
  if (params.conversation.mode === 'single') {
    return generateSingleAgentReply(params);
  }
  return generateGroupAgentReply(params);
}

function generateSingleAgentReply(params: {
  conversation: Conversation;
  agents: Agent[];
  userContent: string;
}): MockReplyResult {
  const targetAgent = params.agents.find(a => params.conversation.agentIds.includes(a.id));
  if (!targetAgent) return { messages: [], artifacts: [] };

  const messages: Message[] = [
    {
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: targetAgent.id,
      senderName: targetAgent.name,
      role: 'agent',
      type: 'text',
      content: `收到您的请求了，我是${targetAgent.name}，正在处理您的需求...`,
      createdAt: getCurrentFullTime()
    }
  ];

  if (targetAgent.id === 'agent-code') {
    const codeMsgId = createId('msg');
    messages.push({
      id: codeMsgId,
      conversationId: params.conversation.id,
      senderId: targetAgent.id,
      senderName: targetAgent.name,
      role: 'agent',
      type: 'code',
      language: 'tsx',
      content: `import React from 'react';\n\n// 自动生成的组件\nconst GeneratedPage: React.FC = () => {\n  return <div>Hello World</div>;\n};\n\nexport default GeneratedPage;`,
      createdAt: getCurrentFullTime()
    });

    const newArtifactId = createId('art');
    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: targetAgent.id,
      senderName: targetAgent.name,
      role: 'agent',
      type: 'artifact',
      artifactId: newArtifactId,
      content: '生成产物 GeneratedPage.tsx',
      createdAt: getCurrentFullTime()
    });

    const newArtifact: Artifact = {
      id: newArtifactId,
      conversationId: params.conversation.id,
      title: 'GeneratedPage.tsx',
      type: 'code',
      content: '// 自动生成的React组件',
      createdAt: getCurrentFullTime()
    };

    return { messages, artifacts: [newArtifact] };
  }

  return { messages, artifacts: [] };
}

function generateGroupAgentReply(params: {
  conversation: Conversation;
  agents: Agent[];
  userContent: string;
}): MockReplyResult {
  const orchestrator = params.agents.find(a => a.id === 'agent-orchestrator');
  const designAgent = params.agents.find(a => a.id === 'agent-design');
  const codeAgent = params.agents.find(a => a.id === 'agent-code');
  const reviewAgent = params.agents.find(a => a.id === 'agent-review');
  const docAgent = params.agents.find(a => a.id === 'agent-doc');

  const messages: Message[] = [];

  if (orchestrator) {
    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: orchestrator.id,
      senderName: orchestrator.name,
      role: 'orchestrator',
      type: 'status',
      content: '我已理解您的需求，正在分析中...',
      createdAt: getCurrentFullTime()
    });

    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: orchestrator.id,
      senderName: orchestrator.name,
      role: 'orchestrator',
      type: 'task-plan',
      content: '任务拆解：\n1. DesignAgent - 负责页面设计\n2. CodeAgent - 负责代码生成\n3. ReviewAgent - 负责代码审查\n4. DocAgent - 负责文档生成',
      createdAt: getCurrentFullTime()
    });
  }

  if (designAgent) {
    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: designAgent.id,
      senderName: designAgent.name,
      role: 'agent',
      type: 'text',
      content: '设计方案已确定，页面布局结构清晰，配色建议采用蓝紫色渐变。',
      createdAt: getCurrentFullTime()
    });
  }

  if (codeAgent) {
    const codeMsgId = createId('msg');
    messages.push({
      id: codeMsgId,
      conversationId: params.conversation.id,
      senderId: codeAgent.id,
      senderName: codeAgent.name,
      role: 'agent',
      type: 'code',
      language: 'tsx',
      content: `import React from 'react';\n\nconst AutoPage: React.FC = () => {\n  return (\n    <div className="min-h-screen bg-white">\n      <h1 className="text-2xl font-bold">Auto Generated Page</h1>\n    </div>\n  );\n};\n\nexport default AutoPage;`,
      createdAt: getCurrentFullTime()
    });
  }

  if (reviewAgent) {
    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: reviewAgent.id,
      senderName: reviewAgent.name,
      role: 'agent',
      type: 'text',
      content: '代码审查已通过！结构规范，没有发现严重问题。',
      createdAt: getCurrentFullTime()
    });
  }

  if (docAgent) {
    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: docAgent.id,
      senderName: docAgent.name,
      role: 'agent',
      type: 'text',
      content: 'README文档已生成，包含项目介绍和使用说明。',
      createdAt: getCurrentFullTime()
    });
  }

  if (orchestrator) {
    messages.push({
      id: createId('msg'),
      conversationId: params.conversation.id,
      senderId: orchestrator.id,
      senderName: orchestrator.name,
      role: 'orchestrator',
      type: 'status',
      content: '全部任务已完成！',
      createdAt: getCurrentFullTime()
    });
  }

  const artifacts: Artifact[] = [
    {
      id: createId('art'),
      conversationId: params.conversation.id,
      title: 'AutoPage.tsx',
      type: 'code',
      content: '// 自动生成的代码',
      createdAt: getCurrentFullTime()
    },
    {
      id: createId('art'),
      conversationId: params.conversation.id,
      title: 'README.md',
      type: 'markdown',
      content: '# 自动生成文档',
      createdAt: getCurrentFullTime()
    }
  ];

  return { messages, artifacts };
}
