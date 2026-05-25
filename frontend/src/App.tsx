import { useState, useEffect, useCallback } from 'react';
import LeftSidebar from './components/layout/LeftSidebar';
import ChatPanel from './components/chat/ChatPanel';
import RightPanel from './components/layout/RightPanel';
import AppLayout from './components/layout/AppLayout';
import NewConversationModal from './components/modal/NewConversationModal';
import ArtifactFullScreenModal from './components/modal/ArtifactFullScreenModal';
import {
  Conversation,
  Message,
  Artifact,
  CreateConversationPayload,
  Agent
} from './types';
import { USE_MOCK } from './services';
import {
  mockConversations,
  mockMessages,
  mockAgents as initialAgents,
  mockArtifacts
} from './mock';
import { generateMockReply } from './utils/mockReply';
import { createId } from './utils/id';
import { getCurrentFullTime } from './utils/time';
import { healthCheck } from './services/http/healthService';
import { getAgentList, updateAgentDetail } from './services/http/agentService';
import { getConversationList, createConversation } from './services/http/conversationService';
import { getMessageList, sendMessageNonStreaming } from './services/http/messageService';
import { getArtifactMetaList, getArtifactDetail } from './services/http/artifactService';
import wsClient from './services/ws/wsClient';

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [artifacts, setArtifacts] = useState<Artifact[]>(mockArtifacts);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    mockConversations[0]?.id || null
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [leftSidebarViewMode, setLeftSidebarViewMode] = useState<'conversations' | 'agents' | 'agent-detail'>('conversations');
  const [useMockMode, setUseMockMode] = useState(USE_MOCK);

  const activeConversation = conversations.find(
    item => item.id === activeConversationId
  );

  const activeMessages = messages.filter(
    item => item.conversationId === activeConversationId
  );

  const activeAgents = agents.filter(agent =>
    activeConversation?.agentIds.includes(agent.id)
  );

  const activeArtifacts = artifacts.filter(
    item => item.conversationId === activeConversationId
  );

  const selectedArtifact = artifacts.find(
    item => item.id === selectedArtifactId
  ) || null;

  useEffect(() => {
    const initApp = async () => {
      if (!useMockMode) {
        try {
          const healthRes = await healthCheck();
          if (healthRes.code === 0) {
            console.log('[App] 后端服务健康检查通过，启用真实 API 模式');
            const agentRes = await getAgentList();
            if (agentRes.code === 0) {
              setAgents(agentRes.data.list as Agent[]);
            }
            const convRes = await getConversationList();
            if (convRes.code === 0) {
              setConversations(convRes.data.list);
            }
            await wsClient.connect();
            console.log('[App] WebSocket 已连接');
          }
        } catch (e) {
          console.warn('[App] 真实 API 连接失败，自动切换到 Mock 演示模式', e);
          setUseMockMode(true);
        }
      } else {
        console.log('[App] 配置为 Mock 模式，使用本地模拟数据演示');
      }
    };
    initApp();
    return () => {
      wsClient.disconnect();
    };
  }, [useMockMode]);

  useEffect(() => {
    if (activeConversationId && !useMockMode) {
      const loadData = async () => {
        try {
          const msgRes = await getMessageList(activeConversationId);
          if (msgRes.code === 0) {
            setMessages(msgRes.data.list);
          }
          const artifactRes = await getArtifactMetaList(activeConversationId);
          if (artifactRes.code === 0) {
            setArtifacts(artifactRes.data as Artifact[]);
          }
        } catch (e) {
          console.warn('[App] 加载会话详情失败', e);
        }
      };
      loadData();
    }
  }, [activeConversationId, useMockMode]);

  useEffect(() => {
    if (activeArtifacts.length > 0 && !selectedArtifactId) {
      setSelectedArtifactId(activeArtifacts[0].id);
    }
  }, [activeConversationId, activeArtifacts, selectedArtifactId]);

  const handleSelectConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setSelectedArtifactId(null);
    setIsProcessing(false);
    setLeftSidebarViewMode('conversations');
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeConversation || isProcessing) return;

    const newUserMessage: Message = {
      id: createId('msg'),
      conversationId: activeConversation.id,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content,
      createdAt: getCurrentFullTime()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setConversations(prev => prev.map(c =>
      c.id === activeConversation.id
        ? { ...c, lastMessage: content, updatedAt: getCurrentFullTime() }
        : c
    ));
    setIsProcessing(true);

    if (!useMockMode) {
      try {
        const res = await sendMessageNonStreaming(activeConversation.id, { content });
        if (res.code === 0) {
          const allNewMsgs = [res.data.userMessage, ...res.data.agentMessages];
          setMessages(prev => [...prev, ...allNewMsgs.filter(m => m.id !== newUserMessage.id)]);
          if (res.data.artifacts) {
            setArtifacts(prev => [...prev, ...res.data.artifacts as Artifact[]]);
          }
        }
      } catch (e) {
        console.error('[App] 发送消息 API 调用失败', e);
      } finally {
        setIsProcessing(false);
      }
    } else {
      const replyResult = generateMockReply({
        conversation: activeConversation,
        agents: agents,
        userContent: content
      });

      if (activeConversation.mode === 'single') {
        setTimeout(() => {
          setMessages(prev => [...prev, ...replyResult.messages]);
          setArtifacts(prev => [...prev, ...replyResult.artifacts]);
          setIsProcessing(false);
        }, 1200);
      } else {
        replyResult.messages.forEach((msg, idx) => {
          setTimeout(() => {
            setMessages(prev => [...prev, msg]);
            if (idx === replyResult.messages.length - 1) {
              setArtifacts(prev => [...prev, ...replyResult.artifacts]);
              setIsProcessing(false);
            }
          }, (idx + 1) * 900);
        });
      }
    }
  }, [activeConversation, isProcessing, agents, useMockMode]);

  const handleCreateConversation = useCallback(async (payload: CreateConversationPayload) => {
    if (!useMockMode) {
      try {
        const res = await createConversation(payload);
        if (res.code === 0) {
          setConversations(prev => [...prev, res.data]);
          setActiveConversationId(res.data.id);
          setSelectedArtifactId(null);
          setLeftSidebarViewMode('conversations');
        }
      } catch (e) {
        console.error('[App] 创建会话 API 调用失败', e);
      }
    } else {
      const newConv: Conversation = {
        id: createId('conv'),
        title: payload.title,
        mode: payload.mode,
        agentIds: payload.agentIds,
        lastMessage: '',
        updatedAt: getCurrentFullTime()
      };
      setConversations(prev => [...prev, newConv]);
      setActiveConversationId(newConv.id);
      setSelectedArtifactId(null);
      setLeftSidebarViewMode('conversations');
    }
    setIsNewConversationOpen(false);
  }, [useMockMode]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleSaveAgent = useCallback(async (updatedAgent: Agent) => {
    if (!useMockMode) {
      try {
        const res = await updateAgentDetail(updatedAgent.id, updatedAgent);
        if (res.code === 0) {
          setAgents(prev => prev.map(a => a.id === updatedAgent.id ? res.data : a));
        }
      } catch (e) {
        console.error('[App] 更新 Agent API 调用失败', e);
      }
    } else {
      setAgents(prev => prev.map(a => a.id === updatedAgent.id ? updatedAgent : a));
    }
  }, [useMockMode]);

  const handleBackFromAgentDetail = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  const handleOpenFullScreenPreview = useCallback(async () => {
    if (selectedArtifact && !useMockMode) {
      try {
        const res = await getArtifactDetail(selectedArtifact.id);
        if (res.code === 0) {
          setArtifacts(prev => prev.map(a => a.id === selectedArtifact.id ? res.data : a));
        }
      } catch (e) {
        console.warn('[App] 获取 Artifact 详情失败', e);
      }
    }
    if (selectedArtifact) {
      setIsFullScreenOpen(true);
    }
  }, [selectedArtifact, useMockMode]);

  return (
    <>
      <AppLayout
        leftSidebar={
          <LeftSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onOpenNewConversation={() => setIsNewConversationOpen(true)}
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            onSaveAgent={handleSaveAgent}
            onBackFromAgentDetail={handleBackFromAgentDetail}
            viewMode={leftSidebarViewMode}
            setViewMode={setLeftSidebarViewMode}
          />
        }
        chatPanel={
          <ChatPanel
            conversation={activeConversation}
            agents={activeAgents}
            messages={activeMessages}
            artifacts={activeArtifacts}
            onSendMessage={handleSendMessage}
          />
        }
        rightPanel={
          <RightPanel
            agents={activeAgents}
            artifacts={activeArtifacts}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={setSelectedArtifactId}
            selectedArtifact={selectedArtifact}
            onOpenFullScreenPreview={handleOpenFullScreenPreview}
          />
        }
      />
      <NewConversationModal
        open={isNewConversationOpen}
        onClose={() => setIsNewConversationOpen(false)}
        onCreateConversation={handleCreateConversation}
        agents={agents}
      />
      <ArtifactFullScreenModal
        open={isFullScreenOpen}
        artifact={selectedArtifact}
        onClose={() => setIsFullScreenOpen(false)}
      />
    </>
  );
}

export default App;
