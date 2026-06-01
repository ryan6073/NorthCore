import { useEffect, useCallback } from 'react';
import LeftSidebar from './components/layout/LeftSidebar';
import ChatPanel from './components/chat/ChatPanel';
import RightPanel from './components/layout/RightPanel';
import AppLayout from './components/layout/AppLayout';
import { TitleBar } from './components/layout/TitleBar';
import NewConversationModal from './components/modal/NewConversationModal';
import ArtifactFullScreenModal from './components/modal/ArtifactFullScreenModal';
import AgentProfileCard from './components/agent/AgentProfileCard';
import AgentDetailPanel from './components/agent/AgentDetailPanel';
import { useAgentHubStore } from './store/useAgentHubStore';
import { CreateConversationPayload, Agent } from './types';
import { LoginView } from './components/auth/LoginView';
import { SettingsModal } from './components/modal/SettingsModal';

const getNewAgentTemplate = (): Agent => ({
  id: 'new',
  name: '新建智能体',
  avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cute%20robot%20avatar%20cartoon%20avatar&image_size=square',
  description: '这是一个自定义配置的开发/功能型 AI 智能体。',
  tags: ['新建'],
  status: 'offline',
  category: 'coding',
  provider: 'custom',
  enabled: true,
  lastUsedAt: '',
  systemPrompt: '你是一个专业的协作助手，协助用户处理各种任务。',
  modelConfig: {
    provider: 'custom',
    modelName: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096
  },
  tools: [
    { id: 'file_read', name: '读文件', description: '读取文件内容', enabled: false },
    { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: false }
  ],
  permissions: {
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canGenerateArtifacts: false,
    canDeploy: false
  }
});

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
  const configuringAgentId = useAgentHubStore(state => state.configuringAgentId);
  const leftSidebarViewMode = useAgentHubStore(state => state.leftSidebarViewMode);
  const useMockMode = useAgentHubStore(state => state.useMockMode);
  const currentUser = useAgentHubStore(state => state.currentUser);

  const showAgentProfile = useAgentHubStore(state => state.showAgentProfile);
  const viewingAgentId = useAgentHubStore(state => state.viewingAgentId);
  const closeAgentProfile = useAgentHubStore(state => state.closeAgentProfile);
  const getOrCreateAgentChat = useAgentHubStore(state => state.getOrCreateAgentChat);
  const setActiveConversationId = useAgentHubStore(state => state.setActiveConversationId);

  const initStore = useAgentHubStore(state => state.initStore);
  const setSelectedArtifactId = useAgentHubStore(state => state.setSelectedArtifactId);
  const setIsNewConversationOpen = useAgentHubStore(state => state.setIsNewConversationOpen);
  const setIsFullScreenOpen = useAgentHubStore(state => state.setIsFullScreenOpen);
  const setSelectedAgentId = useAgentHubStore(state => state.setSelectedAgentId);
  const setConfiguringAgentId = useAgentHubStore(state => state.setConfiguringAgentId);
  const setLeftSidebarViewMode = useAgentHubStore(state => state.setLeftSidebarViewMode);
  const createConversation = useAgentHubStore(state => state.createConversation);
  const sendMessage = useAgentHubStore(state => state.sendMessage);
  const saveAgent = useAgentHubStore(state => state.saveAgent);
  const createAgent = useAgentHubStore(state => state.createAgent);
  const deleteAgent = useAgentHubStore(state => state.deleteAgent);
  const deleteConversation = useAgentHubStore(state => state.deleteConversation);

  const conversationAgentConfigs = useAgentHubStore(state => state.conversationAgentConfigs) || {};
  const saveConversationAgentConfig = useAgentHubStore(state => state.saveConversationAgentConfig);

  const activeConversation = conversations.find(
    item => item.id === activeConversationId
  );

  const activeAgents = agents.filter(agent =>
    activeConversation?.agentIds.includes(agent.id)
  ).map(agent => {
    if (activeConversationId && conversationAgentConfigs[activeConversationId]?.[agent.id]) {
      return {
        ...agent,
        ...conversationAgentConfigs[activeConversationId][agent.id]
      };
    }
    return agent;
  });

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
    setConfiguringAgentId(null);
  }, [setActiveConversationId, setLeftSidebarViewMode, setConfiguringAgentId]);

  const handleSendMessage = useCallback(async (content: string, attachments?: any[], targetAgentId?: string) => {
    await sendMessage(content, attachments, targetAgentId);
  }, [sendMessage]);

  const handleCreateConversation = useCallback(async (payload: CreateConversationPayload) => {
    await createConversation(payload);
    setIsNewConversationOpen(false);
  }, [createConversation, setIsNewConversationOpen]);


  const handleSaveAgent = useCallback(async (updatedAgent: Agent) => {
    if (updatedAgent.id === 'new') {
      const { id, lastUsedAt, ...agentData } = updatedAgent;
      const newId = await createAgent(agentData);
      setSelectedAgentId(newId);
      if (activeConversationId && activeConversation?.mode === 'group') {
        await useAgentHubStore.getState().addAgentToConversation(activeConversationId, newId);
      }
    } else {
      await saveAgent(updatedAgent);
    }
  }, [saveAgent, createAgent, setSelectedAgentId, activeConversationId, activeConversation]);

  const handleDeleteAgent = useCallback(async (agentId: string) => {
    await deleteAgent(agentId);
    setSelectedAgentId(null);
    setLeftSidebarViewMode('agents');
  }, [deleteAgent, setSelectedAgentId, setLeftSidebarViewMode]);

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

  const handleOpenAgentChat = useCallback(async (agentId: string) => {
    await getOrCreateAgentChat(agentId);
    closeAgentProfile();
  }, [getOrCreateAgentChat, closeAgentProfile]);

  const isDesktop = useAgentHubStore(state => state.isDesktop);
  const setIsSettingsOpen = useAgentHubStore(state => state.setIsSettingsOpen);

  useEffect(() => {
    if (leftSidebarViewMode === 'settings') {
      setIsSettingsOpen(true);
      useAgentHubStore.setState({ leftSidebarViewMode: 'conversations' });
    }
  }, [leftSidebarViewMode, setIsSettingsOpen]);

  if (!currentUser || !currentUser.isLoggedIn) {
    return <LoginView />;
  }

  const isSessionLevel = activeConversation && activeConversation.mode !== 'agent';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white dark:bg-[#06070d]">
      {isDesktop && <TitleBar />}
      <div className="flex-1 min-h-0 flex relative">
        <AppLayout
          leftSidebar={
            <LeftSidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onOpenNewConversation={() => setIsNewConversationOpen(true)}
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSaveAgent={handleSaveAgent}
              onDeleteAgent={handleDeleteAgent}
              onDeleteConversation={deleteConversation}
              onBackFromAgentDetail={handleBackFromAgentDetail}
              viewMode={leftSidebarViewMode}
              setViewMode={setLeftSidebarViewMode}
            />
          }
          chatPanel={
            configuringAgentId ? (() => {
              const globalAgent = agents.find(a => a.id === configuringAgentId);
              let configAgent = configuringAgentId === 'new'
                ? getNewAgentTemplate()
                : globalAgent;
              if (!configAgent) return null;
              if (activeConversationId && isSessionLevel && conversationAgentConfigs[activeConversationId]?.[configAgent.id]) {
                configAgent = {
                  ...configAgent,
                  ...conversationAgentConfigs[activeConversationId][configAgent.id]
                };
              }
              return (
                <AgentDetailPanel
                  agent={configAgent}
                  globalAgent={globalAgent}
                  isNew={configuringAgentId === 'new'}
                  isSessionLevel={isSessionLevel}
                  onSave={async (updated) => {
                    if (isSessionLevel && activeConversationId && updated.id !== 'new') {
                      saveConversationAgentConfig(activeConversationId, updated.id, updated);
                    } else {
                      await handleSaveAgent(updated);
                    }
                    setConfiguringAgentId(null);
                  }}
                  onSyncToGlobal={async (updated: Agent) => {
                    await handleSaveAgent(updated);
                  }}
                  onDelete={async (id) => {
                    await handleDeleteAgent(id);
                    setConfiguringAgentId(null);
                  }}
                  onBack={() => setConfiguringAgentId(null)}
                />
              );
            })() : (
              <ChatPanel
                conversation={activeConversation}
                agents={activeAgents}
                messages={messages}
                artifacts={artifacts}
                onSendMessage={handleSendMessage}
              />
            )
          }
          rightPanel={
            <RightPanel
              conversation={activeConversation}
              agents={activeAgents}
              artifacts={artifacts}
              onSelectArtifact={setSelectedArtifactId}
              onOpenFullScreenPreview={handleOpenFullScreenPreview}
            />
          }
        />
      </div>
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
      <SettingsModal />
      {showAgentProfile && viewingAgentId && (() => {
        const agent = agents.find(a => a.id === viewingAgentId);
        if (!agent) return null;
        return (
          <AgentProfileCard
            agent={agent}
            onClose={closeAgentProfile}
            onGoChat={() => handleOpenAgentChat(viewingAgentId)}
          />
        );
      })()}
    </div>
  );
}

export default App;


