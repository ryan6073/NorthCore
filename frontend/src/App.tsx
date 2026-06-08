import { useEffect, useCallback, useState } from 'react';
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
import { MessageSquare, X } from 'lucide-react';
import FloatingChatWindow from './components/chat/FloatingChatWindow';
import * as platform from './utils/platform';

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
  const configuringAgentIsSessionLevel = useAgentHubStore(state => state.configuringAgentIsSessionLevel);
  const leftSidebarViewMode = useAgentHubStore(state => state.leftSidebarViewMode);
  const useMockMode = useAgentHubStore(state => state.useMockMode);
  const currentUser = useAgentHubStore(state => state.currentUser);

  const floatingConversations = useAgentHubStore(state => state.floatingConversations);
  const addFloatingConversation = useAgentHubStore(state => state.addFloatingConversation);
  const updateFloatingConversation = useAgentHubStore(state => state.updateFloatingConversation);

  const [isDraggingOver, setIsDraggingOver] = useState(false);

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
      const { status, ...configs } = conversationAgentConfigs[activeConversationId][agent.id];
      return {
        ...agent,
        ...configs
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

  // 注册系统通知点击回调：点击通知时跳转到对应会话
  useEffect(() => {
    platform.notification.onClicked((data: { conversationId?: string }) => {
      if (data.conversationId) {
        const store = useAgentHubStore.getState();
        store.setActiveConversationId(data.conversationId);
        store.setLeftSidebarViewMode('conversations');
        store.setConfiguringAgentId(null);
      }
    });
  }, []);

  const handleSelectConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setLeftSidebarViewMode('conversations');
    setConfiguringAgentId(null);
  }, [setActiveConversationId, setLeftSidebarViewMode, setConfiguringAgentId]);

  const handleSendMessage = useCallback(async (content: string, attachments?: any[], targetAgentId?: string, useSandbox?: boolean, webSearchMode?: 'auto' | 'force' | 'off') => {
    await sendMessage(content, attachments, targetAgentId, useSandbox, webSearchMode);
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
    const agent = agents.find(a => a.id === agentId);
    if (agent && (agent.requiresWorkspace === true || agent.supportsContactConversation === false)) {
      useAgentHubStore.setState({ preselectedAgentId: agentId, isNewConversationOpen: true });
    } else {
      try {
        await getOrCreateAgentChat(agentId);
      } catch (e) {
        console.error("Failed to start contact chat", e);
      }
    }
    closeAgentProfile();
  }, [agents, getOrCreateAgentChat, closeAgentProfile]);

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

  const isSessionLevel = configuringAgentIsSessionLevel;

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden bg-white dark:bg-[#06070d] relative"
      onDragOver={(e) => {
        if ((window as any).__dragging_conversation_id) {
          e.preventDefault();
          if (e.clientX > 320) {
            setIsDraggingOver(true);
          } else {
            setIsDraggingOver(false);
          }
        }
      }}
      onDragLeave={() => {
        setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        setIsDraggingOver(false);
        const convId = e.dataTransfer.getData('text/plain') || (window as any).__dragging_conversation_id;
        if (convId && e.clientX > 320) {
          e.preventDefault();
          addFloatingConversation(convId, e.clientX - 180, e.clientY - 30);
        }
      }}
    >
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
                  key={`${configuringAgentId}-${isSessionLevel ? 'session' : 'global'}-${activeConversationId || 'none'}`}
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

      {/* Visual Dropzone Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[4px] z-[999] flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="p-8 bg-white/90 dark:bg-slate-900/90 border-2 border-dashed border-lark-primary dark:border-violet-500 rounded-3xl shadow-2xl flex flex-col items-center justify-center gap-3 animate-scale-in text-lark-primary dark:text-violet-400">
            <MessageSquare className="w-12 h-12 animate-bounce-subtle" />
            <h3 className="text-base font-bold">✨ 释放鼠标生成悬浮聊天窗 ✨</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">松开鼠标即可在当前位置创建独立的浮动对话框</p>
          </div>
        </div>
      )}

      {/* Floating Active Windows */}
      {floatingConversations.filter(fc => !fc.isMinimized).map(fc => (
        <FloatingChatWindow key={fc.id} floatingId={fc.id} />
      ))}

      {/* Floating Minimized Badges */}
      {(() => {
        const minimized = floatingConversations.filter(fc => fc.isMinimized);
        if (minimized.length === 0) return null;

        // Custom helpers for gradient initials avatars
        const getInitials = (title: string) => {
          return title ? title.trim().charAt(0).toUpperCase() : '?';
        };

        const getGradientClass = (id: string) => {
          const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const gradients = [
            'from-indigo-500 to-purple-600',
            'from-emerald-400 to-teal-600',
            'from-pink-500 to-rose-600',
            'from-amber-500 to-orange-600',
            'from-cyan-400 to-blue-600',
          ];
          return gradients[hash % gradients.length];
        };

        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-3.5 px-6 py-3 backdrop-blur-md bg-white/75 dark:bg-slate-900/75 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl shadow-2xl z-[9999] select-none animate-slide-up transition-all duration-300">
            {minimized.map(fc => {
              const conv = conversations.find(c => c.id === fc.id);
              if (!conv) return null;
              const convAgent = agents.find(a => conv.agentIds.includes(a.id));
              const avatar = conv.mode === 'agent' && convAgent ? convAgent.avatar : '';
              
              return (
                <div key={fc.id} className="flex flex-col items-center group relative">
                  <div
                    onClick={() => updateFloatingConversation(fc.id, { isMinimized: false })}
                    className="relative w-11 h-11 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 shadow-md flex items-center justify-center cursor-pointer hover:scale-115 active:scale-95 transition-all duration-300 ring-2 ring-indigo-500/10 dark:ring-violet-400/5"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        useAgentHubStore.getState().removeFloatingConversation(fc.id);
                      }}
                      className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4.5 h-4.5 rounded-full bg-red-500 hover:bg-red-600 text-white items-center justify-center shadow-md border border-white dark:border-slate-900 text-[10px] transition-colors"
                      style={{ width: '18px', height: '18px' }}
                      title="关闭会话"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>

                    {conv.mode === 'agent' && avatar ? (
                      <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className={`w-full h-full rounded-full bg-gradient-to-br ${getGradientClass(fc.id)} text-white flex items-center justify-center font-bold text-[13px] shadow-inner`}>
                        {getInitials(conv.title)}
                      </div>
                    )}
                    
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 animate-pulse" />
                  </div>

                  {/* Active dot indicator under avatar badge */}
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-violet-400 mt-1.5 shadow-sm transition-all duration-300 group-hover:scale-125 group-hover:bg-violet-500" />

                  {/* Glassmorphic Popover Tooltip */}
                  <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-950/95 dark:bg-slate-900/95 text-white text-[10px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none border border-slate-800 text-center z-50">
                    <span className="font-bold">{conv.title}</span>
                    <span className="block text-[8px] text-slate-400 mt-0.5">点击还原窗口</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

export default App;


