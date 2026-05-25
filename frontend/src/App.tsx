import { useEffect, useCallback } from 'react';
import LeftSidebar from './components/layout/LeftSidebar';
import ChatPanel from './components/chat/ChatPanel';
import RightPanel from './components/layout/RightPanel';
import AppLayout from './components/layout/AppLayout';
import NewConversationModal from './components/modal/NewConversationModal';
import ArtifactFullScreenModal from './components/modal/ArtifactFullScreenModal';
import { useAgentHubStore } from './store/useAgentHubStore';
import { CreateConversationPayload, Agent } from './types';

function App() {
  const conversations = useAgentHubStore(state => state.conversations);
  const agents = useAgentHubStore(state => state.agents);
  const messages = useAgentHubStore(state => state.messages);
  const artifacts = useAgentHubStore(state => state.artifacts);
  const activeConversationId = useAgentHubStore(state => state.activeConversationId);
  const selectedArtifactId = useAgentHubStore(state => state.selectedArtifactId);
  const isNewConversationOpen = useAgentHubStore(state => state.isNewConversationOpen);
  const isFullScreenOpen = useAgentHubStore(state => state.isFullScreenOpen);
  const selectedAgentId = useAgentHubStore(state => state.selectedAgentId);
  const leftSidebarViewMode = useAgentHubStore(state => state.leftSidebarViewMode);
  const useMockMode = useAgentHubStore(state => state.useMockMode);

  const initStore = useAgentHubStore(state => state.initStore);
  const setActiveConversationId = useAgentHubStore(state => state.setActiveConversationId);
  const setSelectedArtifactId = useAgentHubStore(state => state.setSelectedArtifactId);
  const setIsNewConversationOpen = useAgentHubStore(state => state.setIsNewConversationOpen);
  const setIsFullScreenOpen = useAgentHubStore(state => state.setIsFullScreenOpen);
  const setSelectedAgentId = useAgentHubStore(state => state.setSelectedAgentId);
  const setLeftSidebarViewMode = useAgentHubStore(state => state.setLeftSidebarViewMode);
  const createConversation = useAgentHubStore(state => state.createConversation);
  const sendMessage = useAgentHubStore(state => state.sendMessage);
  const saveAgent = useAgentHubStore(state => state.saveAgent);

  const activeConversation = conversations.find(
    item => item.id === activeConversationId
  );

  const activeAgents = agents.filter(agent =>
    activeConversation?.agentIds.includes(agent.id)
  );

  const selectedArtifact = artifacts.find(
    item => item.id === selectedArtifactId
  ) || null;

  useEffect(() => {
    initStore();
    return () => {
      useAgentHubStore.getState().disconnectWS();
    };
  }, [initStore]);

  const handleSelectConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setLeftSidebarViewMode('conversations');
  }, [setActiveConversationId, setLeftSidebarViewMode]);

  const handleSendMessage = useCallback(async (content: string, attachments?: any[]) => {
    await sendMessage(content, attachments);
  }, [sendMessage]);

  const handleCreateConversation = useCallback(async (payload: CreateConversationPayload) => {
    await createConversation(payload);
    setIsNewConversationOpen(false);
  }, [createConversation, setIsNewConversationOpen]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, [setSelectedAgentId]);

  const handleSaveAgent = useCallback(async (updatedAgent: Agent) => {
    await saveAgent(updatedAgent);
  }, [saveAgent]);

  const handleBackFromAgentDetail = useCallback(() => {
    setSelectedAgentId(null);
  }, [setSelectedAgentId]);

  const handleOpenFullScreenPreview = useCallback(async () => {
    if (selectedArtifact) {
      if (!useMockMode) {
        await useAgentHubStore.getState().loadArtifactContent(selectedArtifact.id);
      }
      setIsFullScreenOpen(true);
    }
  }, [selectedArtifact, useMockMode, setIsFullScreenOpen]);

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
            messages={messages}
            artifacts={artifacts}
            onSendMessage={handleSendMessage}
          />
        }
        rightPanel={
          <RightPanel
            agents={activeAgents}
            artifacts={artifacts}
            onSelectArtifact={setSelectedArtifactId}
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
