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
import {
  mockConversations,
  mockMessages,
  mockAgents as initialAgents,
  mockArtifacts
} from './mock';
import { generateMockReply } from './utils/mockReply';
import { createId } from './utils/id';
import { getCurrentFullTime } from './utils/time';

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

  const handleSendMessage = useCallback((content: string) => {
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
  }, [activeConversation, isProcessing, agents]);

  const handleCreateConversation = useCallback((payload: CreateConversationPayload) => {
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
  }, []);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleSaveAgent = useCallback((updatedAgent: Agent) => {
    setAgents(prev => prev.map(a => a.id === updatedAgent.id ? updatedAgent : a));
  }, []);

  const handleBackFromAgentDetail = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  const handleOpenFullScreenPreview = useCallback(() => {
    if (selectedArtifact) {
      setIsFullScreenOpen(true);
    }
  }, [selectedArtifact]);

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
