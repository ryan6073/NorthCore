import { create } from 'zustand';
import { Conversation, Message, Agent, Artifact, ArtifactVersion, CreateConversationPayload, ArtifactReference, MessageAttachment, AgentMentionItem, PinItem, MemoryItem, MemoryCategory, SendMessageRequest, ContextUsage, AgentChat, AgentChatMessage } from '@/types';
import { getAgentList, updateAgentDetail, createAgent as createAgentApi, deleteAgent as deleteAgentApi, getAgentContact } from '@/services/http/agentService';
import { getConversationList, createConversation as createConversationApi, updateConversation, compressContext, pinMessage, unpinMessage, getPins, getMemories, deleteMemory, updateMemory, deleteConversation, getContextUsage as getContextUsageApi, pinConversation, archiveConversation, getConversationAgentConfig, updateConversationAgentConfig, addAgentToConversation, removeAgentFromConversation } from '@/services/http/conversationService';
import { getMessageList, sendMessageNonStreaming } from '@/services/http/messageService';
import { getArtifactMetaList, getArtifactDetail, getArtifactVersions, updateArtifactContent } from '@/services/http/artifactService';
import wsClient from '@/services/ws/wsClient';
import { mockConversations, mockMessages, mockAgents as initialAgents, mockArtifacts, mockArtifactVersions } from '@/mock';
import { createId } from '@/utils/id';
import { getCurrentFullTime } from '@/utils/time';
import { generateMockReply } from '@/utils/mockReply';
import { USE_MOCK } from '@/services';
import { healthCheck } from '@/services/http/healthService';
import { registerApi, loginApi, loginAsGuestApi, getMeApi, logoutApi, updateProfileApi } from '@/services/http/authService';

interface AgentHubStore {
  conversations: Conversation[];
  agents: Agent[];
  messages: Message[];
  artifacts: Artifact[];
  artifactVersions: Record<string, ArtifactVersion[]>;
  pins: PinItem[];
  memories: MemoryItem[];
  activeConversationId: string | null;
  selectedArtifactId: string | null;
  selectedArtifactVersion: number | null;
  isNewConversationOpen: boolean;
  isProcessing: boolean;
  isFullScreenOpen: boolean;
  selectedAgentId: string | null;
  configuringAgentId: string | null;
  leftSidebarViewMode: 'conversations' | 'agents' | 'agent-detail';
  useMockMode: boolean;
  wsStatus: 'connecting' | 'connected' | 'disconnected';

  // Phase 3 states
  replyContext: { id: string; senderName: string; content: string } | null;
  quoteArtifactRef: ArtifactReference | null;

  // ============ v4 新增：Agent 一对一专属对话系统 ============
  showAgentProfile: boolean;
  viewingAgentId: string | null;
  showAgentChatView: boolean;
  agentChats: AgentChat[];
  currentAgentChatId: string | null;
  agentChatMessages: Record<string, AgentChatMessage[]>;

  setShowAgentChatView: (show: boolean) => void;

  openAgentProfile: (agentId: string) => void;
  closeAgentProfile: () => void;
  getOrCreateAgentChat: (agentId: string) => Promise<Conversation>;
  sendAgentChatMessage: (agentChatId: string, content: string) => Promise<void>;

  // Actions
  initStore: () => Promise<void>;
  setUseMockMode: (mode: boolean) => void;
  setActiveConversationId: (id: string | null) => Promise<void>;
  setSelectedArtifactId: (id: string | null) => void;
  setSelectedArtifactVersion: (version: number | null) => void;
  setIsNewConversationOpen: (open: boolean) => void;
  setIsFullScreenOpen: (open: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;
  setConfiguringAgentId: (id: string | null) => void;
  setLeftSidebarViewMode: (mode: 'conversations' | 'agents' | 'agent-detail') => void;
  
  // Phase 3 Actions
  setReplyContext: (reply: { id: string; senderName: string; content: string } | null) => void;
  setQuoteArtifactRef: (ref: ArtifactReference | null) => void;

  // User and Settings state
  currentUser: { id?: string; name: string; email: string; avatar: string; isLoggedIn: boolean } | null;
  settings: {
    theme: 'light' | 'dark';
    apiKey: string;
    activeProvider: string;
    modelName: string;
    temperature: number;
    maxTokens: number;
  };
  isSettingsOpen: boolean;
  conversationAgentConfigs: Record<string, Record<string, Agent>>;
  saveConversationAgentConfig: (conversationId: string, agentId: string, updatedAgent: Agent) => Promise<void>;

  login: (email: string, password?: string) => Promise<{ success: boolean; message: string }>;
  register: (name: string, email: string, password: string, avatar: string) => Promise<{ success: boolean; message: string }>;
  loginAsGuest: (name: string, email: string, avatar: string) => Promise<void>;
  logout: () => void;
  loadBusinessData: () => Promise<void>;
  updateProfile: (name: string, email: string, avatar: string) => Promise<void>;
  updateSettings: (settings: Partial<AgentHubStore['settings']>) => void;
  setIsSettingsOpen: (open: boolean) => void;
  
  loadConversationData: (convId: string) => Promise<void>;
  createConversation: (payload: CreateConversationPayload) => Promise<void>;
  getMentionAgents: (keyword?: string) => Promise<AgentMentionItem[]>;
  compressContext: () => Promise<void>;
  togglePinMessage: (messageId: string) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  updateMemory: (memoryId: string, content: string, category?: MemoryCategory) => Promise<void>;
  saveEditedArtifact: (artifactId: string, newContent: string) => Promise<void>;
  
  sendMessage: (content: string, attachments?: MessageAttachment[], targetAgentId?: string) => Promise<void>;
  saveAgent: (agent: Agent) => Promise<void>;
  createAgent: (agent: Omit<Agent, 'id' | 'lastUsedAt'>) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  togglePinConversation: (id: string) => Promise<void>;
  toggleArchiveConversation: (id: string) => Promise<void>;
  loadArtifactContent: (artifactId: string) => Promise<void>;
  getContextUsage: () => Promise<void>;
  setContextUsage: (usage: ContextUsage) => void;
  
  connectWS: () => Promise<void>;
  disconnectWS: () => void;
  addAgentToConversation: (conversationId: string, agentId: string) => Promise<void>;
  removeAgentFromConversation: (conversationId: string, agentId: string) => Promise<void>;
}

const mergeLocalFlags = (list: Conversation[]): Conversation[] => {
  try {
    const pinned = JSON.parse(localStorage.getItem('ag_pinned_conversations') || '[]');
    const archived = JSON.parse(localStorage.getItem('ag_archived_conversations') || '[]');
    return list.map(c => ({
      ...c,
      isPinned: pinned.includes(c.id),
      isArchived: archived.includes(c.id)
    }));
  } catch (e) {
    console.error('Error loading pinned/archived lists from localStorage', e);
    return list;
  }
};

export const useAgentHubStore = create<AgentHubStore>()((set, get) => ({
  conversations: [],
  agents: [],
  messages: [],
  artifacts: [],
  artifactVersions: {},
  pins: [],
  memories: [],
  activeConversationId: null,
  selectedArtifactId: null,
  selectedArtifactVersion: null,
  isNewConversationOpen: false,
  isProcessing: false,
  isFullScreenOpen: false,
  selectedAgentId: null,
  configuringAgentId: null,
  leftSidebarViewMode: 'conversations',
  useMockMode: USE_MOCK,
  wsStatus: 'disconnected',

  // Phase 3 states
  replyContext: null,
  quoteArtifactRef: null,

  // v4 新增初始状态
  showAgentProfile: false,
  viewingAgentId: null,
  showAgentChatView: false,
  agentChats: [],
  currentAgentChatId: null,
  agentChatMessages: {},

  // User and Settings initial state
  currentUser: null,
  settings: {
    theme: 'light',
    apiKey: '',
    activeProvider: 'custom',
    modelName: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
  },
  isSettingsOpen: false,
  conversationAgentConfigs: {},

  loadBusinessData: async () => {
    try {
      const agentRes = await getAgentList();
      if (agentRes.code === 0) {
        set({ agents: agentRes.data.list as Agent[] });
      }
      const convRes = await getConversationList();
      if (convRes.code === 0) {
        const list = convRes.data.list;
        set({ conversations: mergeLocalFlags(list) });
        if (list.length > 0) {
          set({ activeConversationId: list[0].id });
          await get().loadConversationData(list[0].id);
        } else {
          set({ activeConversationId: null, messages: [], pins: [], memories: [] });
        }
      }
      await get().connectWS();
    } catch (e) {
      console.error('Failed to load business data', e);
    }
  },

  initStore: async () => {
    // Initialize registered users database if not present
    try {
      if (!localStorage.getItem('ag_registered_users')) {
        const defaultUsers = [
          {
            name: '比特骑士',
            email: 'admin@northcore.ai',
            password: 'admin123',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80'
          }
        ];
        localStorage.setItem('ag_registered_users', JSON.stringify(defaultUsers));
      }
    } catch (e) {
      console.warn('Failed to initialize registered users', e);
    }

    // Load from LocalStorage
    try {
      const storedConfigs = localStorage.getItem('ag_conversation_agent_configs');
      if (storedConfigs) {
        set({ conversationAgentConfigs: JSON.parse(storedConfigs) });
      }
    } catch (e) {
      console.warn('Failed to load conversation agent configs', e);
    }

    try {
      const storedSettings = localStorage.getItem('ag_settings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        set({ settings: { ...get().settings, ...parsedSettings } });
        
        // Apply theme
        if (parsedSettings.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }

    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const healthRes = await healthCheck();
        if (healthRes.code === 0) {
          console.log('[Store] 后端服务健康检查通过，启用真实 API 模式');
          
          // Verify authentication session
          const token = localStorage.getItem('auth_token');
          if (token) {
            try {
              const meRes = await getMeApi();
              const userData = meRes.code === 0 && meRes.data ? ((meRes.data as any).user || meRes.data) : null;
              if (userData && (userData.name || userData.email)) {
                const user = { ...userData, isLoggedIn: true };
                set({ currentUser: user as any });
                localStorage.setItem('ag_user', JSON.stringify(user));
              } else {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('ag_user');
                set({ currentUser: null });
              }
            } catch (e) {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('ag_user');
              set({ currentUser: null });
            }
          } else {
            const storedUser = localStorage.getItem('ag_user');
            if (storedUser) {
              set({ currentUser: JSON.parse(storedUser) });
            } else {
              set({ currentUser: null });
            }
          }

          // Load data (due to grace period backend fallback)
          await get().loadBusinessData();
        }
      } catch (e) {
        console.warn('[Store] 真实 API 连接失败，自动切换到 Mock 演示模式', e);
        set({ useMockMode: true });
        set({
          conversations: mergeLocalFlags(mockConversations),
          agents: initialAgents,
          messages: mockMessages,
          artifacts: mockArtifacts,
          artifactVersions: mockArtifactVersions.reduce((acc, v) => {
            if (!acc[v.artifactId]) acc[v.artifactId] = [];
            acc[v.artifactId].push(v);
            return acc;
          }, {} as Record<string, ArtifactVersion[]>),
          activeConversationId: mockConversations[0]?.id || null,
        });
        if (mockConversations[0]?.id) {
          await get().loadConversationData(mockConversations[0].id);
        }
      }
    } else {
      console.log('[Store] 配置为 Mock 模式，使用本地模拟数据');
      
      // Mock mode user restore
      const storedUser = localStorage.getItem('ag_user');
      if (storedUser) {
        set({ currentUser: JSON.parse(storedUser) });
      }

      set({
        conversations: mergeLocalFlags(mockConversations),
        agents: initialAgents,
        messages: mockMessages,
        artifacts: mockArtifacts,
        artifactVersions: mockArtifactVersions.reduce((acc, v) => {
          if (!acc[v.artifactId]) acc[v.artifactId] = [];
          acc[v.artifactId].push(v);
          return acc;
        }, {} as Record<string, ArtifactVersion[]>),
        activeConversationId: mockConversations[0]?.id || null,
      });
      if (mockConversations[0]?.id) {
        await get().loadConversationData(mockConversations[0].id);
      }
    }
  },

  setUseMockMode: (mode) => set({ useMockMode: mode }),

  setActiveConversationId: async (id) => {
    set({ 
      activeConversationId: id,
      selectedArtifactId: null,
      selectedArtifactVersion: null,
      isProcessing: false,
      replyContext: null,
      quoteArtifactRef: null,
    });
    if (id) {
      await get().loadConversationData(id);
    } else {
      set({ messages: [], artifacts: [], artifactVersions: {} });
    }
  },

  setSelectedArtifactId: (id) => {
    set({ selectedArtifactId: id, selectedArtifactVersion: null });
    if (id) {
      get().loadArtifactContent(id);
    }
  },

  setSelectedArtifactVersion: (version) => set({ selectedArtifactVersion: version }),
  setIsNewConversationOpen: (open) => set({ isNewConversationOpen: open }),
  setIsFullScreenOpen: (open) => set({ isFullScreenOpen: open }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setConfiguringAgentId: (id) => set({ configuringAgentId: id }),
  setLeftSidebarViewMode: (mode) => set({ leftSidebarViewMode: mode }),

  loadConversationData: async (convId) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const activeMsgs = mockMessages.filter(m => m.conversationId === convId);
      const activeArts = mockArtifacts.filter(a => a.conversationId === convId);
      const activePins = activeMsgs.filter(m => m.isPinned).map(m => ({
        id: `pin-${m.id}`,
        conversationId: convId,
        messageId: m.id,
        createdAt: m.createdAt,
        message: m
      }));
      const mockMemories = [
        {
          id: `mem-${convId}-1`,
          conversationId: convId,
          category: 'constraint' as const,
          content: '用户偏好使用 TypeScript + TailwindCSS 进行前端组件化设计',
          confidence: 0.95,
          sourceMessageId: activeMsgs[0]?.id || 'msg-1',
          active: true,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: `mem-${convId}-2`,
          conversationId: convId,
          category: 'project' as const,
          content: '当前项目为 AgentHub 多智能体协作平台，支持双向分栏与实时产物预览',
          confidence: 0.9,
          sourceMessageId: activeMsgs[0]?.id || 'msg-1',
          active: true,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: `mem-${convId}-3`,
          conversationId: convId,
          category: 'preference' as const,
          content: '聊天信息交互需保持响应迅速，动画过渡流畅，并支持代码级划词引用',
          confidence: 0.88,
          sourceMessageId: activeMsgs[0]?.id || 'msg-1',
          active: true,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        }
      ];
      set({
        messages: activeMsgs,
        artifacts: activeArts,
        pins: activePins,
        memories: mockMemories,
      });
      if (activeArts.length > 0) {
        set({ selectedArtifactId: activeArts[0].id });
      }
      return;
    }

    try {
      const [msgRes, pinsRes, memoriesRes, artifactRes] = await Promise.all([
        getMessageList(convId),
        getPins(convId),
        getMemories(convId),
        getArtifactMetaList(convId)
      ]);

      // Load conversation-level agent configurations in parallel
      const activeConv = get().conversations.find(c => c.id === convId);
      if (activeConv && activeConv.mode !== 'agent') {
        const agentIds = activeConv.agentIds || [];
        const configPromises = agentIds.map(async (agentId) => {
          try {
            const res = await getConversationAgentConfig(convId, agentId);
            if (res.code === 0 && res.data) {
              return { agentId, config: res.data };
            }
          } catch (e) {
            // fail-safe ignore
          }
          return null;
        });
        const configs = await Promise.all(configPromises);
        const newConfigs: Record<string, Agent> = {};
        configs.forEach(c => {
          if (c) {
            newConfigs[c.agentId] = c.config;
          }
        });
        if (Object.keys(newConfigs).length > 0) {
          set(state => ({
            conversationAgentConfigs: {
              ...state.conversationAgentConfigs,
              [convId]: {
                ...(state.conversationAgentConfigs[convId] || {}),
                ...newConfigs
              }
            }
          }));
        }
      }

      let pinsData: PinItem[] = [];
      if (pinsRes.code === 0 && pinsRes.data) {
        pinsData = pinsRes.data;
      }

      let memoriesData: MemoryItem[] = [];
      if (memoriesRes.code === 0 && memoriesRes.data) {
        memoriesData = memoriesRes.data;
      }

      let messagesData: Message[] = [];
      if (msgRes.code === 0 && msgRes.data && msgRes.data.list) {
        messagesData = msgRes.data.list.map((m: Message) => ({
          ...m,
          isPinned: pinsData.some(p => p.messageId === m.id)
        }));
      }

      set({
        messages: messagesData,
        pins: pinsData,
        memories: memoriesData
      });

      if (artifactRes.code === 0 && artifactRes.data) {
        const arts: Artifact[] = artifactRes.data;
        set({ artifacts: arts });
        if (arts.length > 0) {
          set({ selectedArtifactId: arts[0].id });
          await get().loadArtifactContent(arts[0].id);
        }
      }
      await get().getContextUsage();
    } catch (e) {
      console.error('[Store] 加载会话数据失败', e);
    }
  },

  createConversation: async (payload) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await createConversationApi(payload);
        if (res.code === 0) {
          set(state => ({ conversations: mergeLocalFlags([...state.conversations, res.data]) }));
          await get().setActiveConversationId(res.data.id);
        }
      } catch (e) {
        console.error('[Store] 创建会话 API 失败', e);
      }
    } else {
      const newConv: Conversation = {
        id: createId('conv'),
        title: payload.title,
        mode: payload.mode,
        agentIds: payload.agentIds,
        lastMessage: '',
        updatedAt: getCurrentFullTime(),
      };
      set(state => ({
        conversations: mergeLocalFlags([...state.conversations, newConv]),
      }));
      await get().setActiveConversationId(newConv.id);
    }
  },

  getMentionAgents: async (keyword) => {
    const { activeConversationId, conversations, agents } = get();
    if (!activeConversationId) return [];

    const activeConv = conversations.find(c => c.id === activeConversationId);
    const conversationAgentIds = activeConv ? activeConv.agentIds : [];

    const candidateAgents = agents.filter(a =>
      (conversationAgentIds.length > 0 ? conversationAgentIds.includes(a.id) : true) &&
      !a.category.includes('orchestrator') &&
      a.enabled
    );

    const items: AgentMentionItem[] = candidateAgents
      .filter(a => !keyword || a.name.toLowerCase().includes(keyword.toLowerCase()))
      .map(a => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        description: a.description,
        tags: a.tags,
        status: a.status === 'online' ? 'online' : 'offline',
      }));
    return items;
  },

  compressContext: async () => {
    const { activeConversationId, useMockMode, messages } = get();
    if (!activeConversationId) return;

    const tempId = `temp-compress-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      senderId: 'system',
      senderName: '系统',
      role: 'system',
      type: 'status',
      content: '压缩上下文中...',
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      messages: [...state.messages, tempMsg],
    }));

    let result;
    let errorMessage = '';
    let apiMessage = '';

    if (!useMockMode) {
      try {
        const res = await compressContext(activeConversationId);
        if (res.code === 0) {
          result = res.data;
          apiMessage = res.message;
          if (result && result.contextUsage) {
            get().setContextUsage(result.contextUsage);
          }
        } else {
          errorMessage = res.message || '压缩接口返回失败';
        }
      } catch (e: any) {
        console.warn('[Store] compressContext API 调用失败', e);
        errorMessage = e.response?.data?.message || e.message || '压缩请求失败';
      }
    } else {
      const originalMessageCount = messages.length;
      result = {
        summary: {
          id: 'summary-mock',
          conversationId: activeConversationId,
          summary: `系统已智能压缩 ${originalMessageCount} 条历史消息，Token 占用大幅降低。`,
          coveredUntilMessageId: messages[messages.length - 1]?.id || '',
          coveredMessageCount: Math.max(1, Math.floor(originalMessageCount / 4)),
          version: 1,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime(),
        },
        compressed: true,
        contextUsage: {
          contextUsagePercent: 5,
          contextUsageChars: 10000,
          contextLimitChars: 200000,
        },
      };
      apiMessage = '上下文已压缩';
    }

    if (result && result.contextUsage) {
      get().setContextUsage(result.contextUsage);
    }

    if (errorMessage) {
      const failMsg: Message = {
        id: createId('msg'),
        conversationId: activeConversationId,
        senderId: 'system',
        senderName: '系统',
        role: 'system',
        type: 'status',
        content: `❌ 压缩失败\n\n原因：${errorMessage}`,
        createdAt: getCurrentFullTime(),
      };
      set(state => ({
        messages: state.messages.map(m => m.id === tempId ? failMsg : m),
      }));
    } else if (result) {
      const systemMsg: Message = {
        id: (result.summary && result.summary.id) || createId('msg'),
        conversationId: activeConversationId,
        senderId: 'system',
        senderName: '系统',
        role: 'system',
        type: 'status',
        content: apiMessage,
        createdAt: getCurrentFullTime(),
      };
      set(state => ({
        messages: state.messages.map(m => m.id === tempId ? systemMsg : m),
      }));

      if (!useMockMode) {
        try {
          await sendMessageNonStreaming(activeConversationId, {
            content: systemMsg.content,
            role: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'status',
          } as any);
        } catch (e) {
          console.warn('Failed to save compress system message to backend', e);
        }
      }
    } else {
      set(state => ({
        messages: state.messages.filter(m => m.id !== tempId),
      }));
    }

    console.log('[Store] 上下文压缩处理完成');
  },

  sendMessage: async (content, attachments, targetAgentId) => {
    const { activeConversationId, useMockMode, conversations, agents, replyContext, quoteArtifactRef } = get();
    if (!activeConversationId) return;

    const activeConv = conversations.find(c => c.id === activeConversationId);
    if (!activeConv) return;

    const newUserMessage: Message = {
      id: createId('msg'),
      conversationId: activeConversationId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content,
      createdAt: getCurrentFullTime(),
      quotedMessage: replyContext || undefined,
      artifactRef: quoteArtifactRef || undefined,
      attachments,
    };

    set(state => ({
      messages: [...state.messages, newUserMessage],
      conversations: state.conversations.map(c =>
        c.id === activeConversationId
          ? { ...c, lastMessage: content || (attachments && attachments.length > 0 ? '[文件/图片附件]' : ''), updatedAt: getCurrentFullTime() }
          : c
      ),
      isProcessing: true,
      replyContext: null,
      quoteArtifactRef: null,
    }));

    if (useMockMode) {
      const replyResult = generateMockReply({
        conversation: activeConv,
        agents,
        userContent: content,
      });

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      let messagesToStream = replyResult.messages;
      let artifactsToStream = replyResult.artifacts;

      const finalTargetAgentId = targetAgentId || agents.find(a => content.includes(`@${a.name}`))?.id;
      if (finalTargetAgentId && activeConv.mode === 'group') {
        const targetAgent = agents.find(a => a.id === finalTargetAgentId);
        if (targetAgent) {
          messagesToStream = replyResult.messages.filter(msg =>
            msg.senderId === targetAgent.id
          );
          if (targetAgent.id.includes('code') || targetAgent.id.includes('claude')) {
            artifactsToStream = replyResult.artifacts.filter(a => a.type === 'code');
          } else if (targetAgent.id.includes('doc')) {
            artifactsToStream = replyResult.artifacts.filter(a => a.type === 'markdown');
          } else {
            artifactsToStream = [];
          }
        }
      }

      const versionsToStream = replyResult.artifactVersions;
      (async () => {
        for (const msg of messagesToStream) {
          if (msg.type === 'text' || msg.type === 'code') {
            set(state => ({
              agents: state.agents.map(a => a.id === msg.senderId ? { ...a, status: 'thinking' as const } : a),
              messages: [...state.messages, {
                id: `thinking-${msg.senderId}`,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                role: msg.role,
                type: 'status',
                content: '正在思考...',
                createdAt: getCurrentFullTime(),
              }]
            }));

            await delay(800);

            const streamMessageId = msg.id;
            set(state => ({
              messages: state.messages.filter(m => m.id !== `thinking-${msg.senderId}`).concat({
                ...msg,
                content: '',
              })
            }));

            const textToStream = msg.content;
            let currentText = '';
            const stepSize = msg.type === 'code' ? 12 : 3;

            for (let i = 0; i < textToStream.length; i += stepSize) {
              currentText = textToStream.slice(0, i + stepSize);
              set(state => ({
                messages: state.messages.map(m => m.id === streamMessageId ? { ...m, content: currentText } : m)
              }));
              await delay(30);
            }

            set(state => ({
              messages: state.messages.map(m => m.id === streamMessageId ? { ...m, content: textToStream } : m)
            }));

            set(state => ({
              agents: state.agents.map(a => a.id === msg.senderId ? { ...a, status: 'online' as const } : a),
            }));

            await delay(400);
          } else {
            set(state => ({
              messages: [...state.messages, msg],
            }));
            await delay(600);
          }
        }

        if (artifactsToStream.length > 0) {
          set(state => {
            const updatedVersions = { ...state.artifactVersions };
            versionsToStream.forEach(v => {
              if (!updatedVersions[v.artifactId]) updatedVersions[v.artifactId] = [];
              if (!updatedVersions[v.artifactId].some(x => x.id === v.id)) {
                updatedVersions[v.artifactId].push(v);
              }
            });
            return {
              artifacts: [...state.artifacts, ...artifactsToStream],
              artifactVersions: updatedVersions,
              selectedArtifactId: artifactsToStream[0].id,
            };
          });
        }

        set({ isProcessing: false });
      })();
    } else {
      try {
        const payload: SendMessageRequest = {
          content,
          targetAgentId,
          quotedMessageId: replyContext?.id || undefined,
          artifactRef: quoteArtifactRef || undefined,
          attachments,
        };
        const res = await sendMessageNonStreaming(activeConversationId, payload);
        if (res.code === 0) {
          const { userMessage, agentMessages, artifacts, contextUsage } = res.data;
          set(state => {
            // Replace the optimistic message with the actual user message, preserving local reply/citation fields
            const updatedMessages = state.messages.map(m => {
              if (m.id === newUserMessage.id) {
                return {
                  ...userMessage,
                  quotedMessage: userMessage.quotedMessage || m.quotedMessage,
                  artifactRef: userMessage.artifactRef || m.artifactRef,
                };
              }
              return m;
            });

            // Filter out thinking indicators and append new agent messages
            let finalMessages = [...updatedMessages];
            agentMessages.forEach(msg => {
              finalMessages = finalMessages.filter(m => m.id !== `thinking-${msg.senderId}`);
              if (!finalMessages.some(m => m.id === msg.id)) {
                finalMessages.push(msg);
              }
            });

            // Merge new artifacts
            const currentArtifacts = [...state.artifacts];
            artifacts.forEach(art => {
              if (!currentArtifacts.some(a => a.id === art.id)) {
                currentArtifacts.push(art);
              }
            });

            // Update active conversation usage if returned
            const updatedConversations = state.conversations.map(c =>
              c.id === activeConversationId && contextUsage
                ? { ...c, contextUsage }
                : c
            );

            return {
              messages: finalMessages,
              artifacts: currentArtifacts,
              conversations: updatedConversations,
              isProcessing: false,
            };
          });
        } else {
          set(state => ({
            messages: state.messages.filter(m => m.id !== newUserMessage.id),
            isProcessing: false,
          }));
        }
      } catch (e) {
        console.error('[Store] 发送消息 HTTP 失败', e);
        set(state => ({
          messages: state.messages.filter(m => m.id !== newUserMessage.id),
          isProcessing: false,
        }));
      }
    }
  },

  saveConversationAgentConfig: async (conversationId, agentId, updatedAgent) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateConversationAgentConfig(conversationId, agentId, updatedAgent);
        if (res.code === 0) {
          updatedAgent = res.data;
        }
      } catch (e) {
        console.error('[Store] 接口更新会话 Agent 配置失败', e);
      }
    }
    const nextConfigs = {
      ...get().conversationAgentConfigs,
      [conversationId]: {
        ...(get().conversationAgentConfigs[conversationId] || {}),
        [agentId]: updatedAgent
      }
    };
    set({ conversationAgentConfigs: nextConfigs });
    try {
      localStorage.setItem('ag_conversation_agent_configs', JSON.stringify(nextConfigs));
    } catch (e) {
      console.error('Failed to save conversation agent configs to localStorage', e);
    }
  },

  saveAgent: async (updatedAgent) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateAgentDetail(updatedAgent.id, updatedAgent);
        if (res.code === 0) {
          set(state => ({
            agents: state.agents.map(a => a.id === updatedAgent.id ? res.data : a),
          }));
        }
      } catch (e) {
        console.error('[Store] 更新 Agent 失败', e);
      }
    } else {
      set(state => ({
        agents: state.agents.map(a => a.id === updatedAgent.id ? updatedAgent : a),
      }));
    }
  },

  createAgent: async (agentData) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await createAgentApi(agentData);
        if (res.code === 0) {
          set(state => ({
            agents: [...state.agents, res.data]
          }));
          return res.data.id;
        }
      } catch (e) {
        console.error('[Store] 创建 Agent 失败，降级至 Mock 模式处理', e);
      }
    }

    // Mock Mode fallback
    const newId = createId('agent');
    const newAgent: Agent = {
      ...agentData,
      id: newId,
      lastUsedAt: getCurrentFullTime()
    } as Agent;

    set(state => ({
      agents: [...state.agents, newAgent]
    }));
    return newId;
  },

  deleteAgent: async (agentId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await deleteAgentApi(agentId);
        if (res.code === 0) {
          set(state => ({
            agents: state.agents.filter(a => a.id !== agentId)
          }));
        }
      } catch (e) {
        console.error('[Store] 删除 Agent 失败，降级至 Mock 模式处理', e);
      }
    } else {
      set(state => ({
        agents: state.agents.filter(a => a.id !== agentId)
      }));
    }
  },

  deleteConversation: async (id) => {
    const { useMockMode, activeConversationId, conversations } = get();
    if (!useMockMode) {
      try {
        const res = await deleteConversation(id);
        if (res.code === 0) {
          const updatedConversations = conversations.filter(c => c.id !== id);
          set({ conversations: updatedConversations });
          if (activeConversationId === id) {
            const nextActiveId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
            await get().setActiveConversationId(nextActiveId);
          }
        }
      } catch (e) {
        console.error('[Store] 删除会话失败', e);
      }
    } else {
      const updatedConversations = conversations.filter(c => c.id !== id);
      set({ conversations: updatedConversations });
      if (activeConversationId === id) {
        const nextActiveId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        await get().setActiveConversationId(nextActiveId);
      }
    }
  },

  renameConversation: async (id, newTitle) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateConversation(id, { title: newTitle });
        if (res.code === 0) {
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === id ? { ...c, title: newTitle } : c
            )
          }));
        }
      } catch (e) {
        console.error('[Store] 重命名会话 API 失败', e);
      }
    } else {
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, title: newTitle } : c
        )
      }));
    }
  },

  addAgentToConversation: async (conversationId, agentId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await addAgentToConversation(conversationId, agentId);
        if (res.code === 0 && res.data) {
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === conversationId ? { ...c, agentIds: res.data.agentIds } : c
            )
          }));
          return;
        }
      } catch (e) {
        console.error('[Store] 添加 Agent 到会话失败', e);
      }
    }
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id === conversationId) {
          const currentAgentIds = c.agentIds || [];
          if (!currentAgentIds.includes(agentId)) {
            return { ...c, agentIds: [...currentAgentIds, agentId] };
          }
        }
        return c;
      })
    }));
  },

  removeAgentFromConversation: async (conversationId, agentId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await removeAgentFromConversation(conversationId, agentId);
        if (res.code === 0 && res.data) {
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === conversationId ? { ...c, agentIds: res.data.agentIds } : c
            )
          }));
          return;
        }
      } catch (e) {
        console.error('[Store] 从会话移除 Agent 失败', e);
      }
    }
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id === conversationId) {
          return { ...c, agentIds: (c.agentIds || []).filter(id => id !== agentId) };
        }
        return c;
      })
    }));
  },

  togglePinConversation: async (id) => {
    const { useMockMode, conversations } = get();
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const targetPinnedState = !conv.isPinned;

    if (!useMockMode) {
      try {
        const res = await pinConversation(id, targetPinnedState);
        if (res.code !== 0) {
          console.error('[Store] 置顶/取消置顶 API 失败', res.message);
        }
      } catch (e) {
        console.error('[Store] 置顶/取消置顶 API 失败', e);
      }
    }

    try {
      const pinned = JSON.parse(localStorage.getItem('ag_pinned_conversations') || '[]');
      let nextPinned: string[];
      if (pinned.includes(id)) {
        nextPinned = pinned.filter((x: string) => x !== id);
      } else {
        nextPinned = [...pinned, id];
      }
      localStorage.setItem('ag_pinned_conversations', JSON.stringify(nextPinned));
      set(state => ({
        conversations: state.conversations.map(c => 
          c.id === id ? { ...c, isPinned: nextPinned.includes(id) } : c
        )
      }));
    } catch (e) {
      console.error('Failed to toggle pin conversation', e);
    }
  },

  toggleArchiveConversation: async (id) => {
    const { useMockMode, conversations } = get();
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const targetArchivedState = !conv.isArchived;

    if (!useMockMode) {
      try {
        const res = await archiveConversation(id, targetArchivedState);
        if (res.code !== 0) {
          console.error('[Store] 归档/激活 API 失败', res.message);
        }
      } catch (e) {
        console.error('[Store] 归档/激活 API 失败', e);
      }
    }

    try {
      const archived = JSON.parse(localStorage.getItem('ag_archived_conversations') || '[]');
      let nextArchived: string[];
      if (archived.includes(id)) {
        nextArchived = archived.filter((x: string) => x !== id);
      } else {
        nextArchived = [...archived, id];
      }
      localStorage.setItem('ag_archived_conversations', JSON.stringify(nextArchived));
      set(state => ({
        conversations: state.conversations.map(c => 
          c.id === id ? { ...c, isArchived: nextArchived.includes(id) } : c
        )
      }));
    } catch (e) {
      console.error('Failed to toggle archive conversation', e);
    }
  },

  loadArtifactContent: async (artifactId) => {
    const { useMockMode, artifactVersions } = get();
    if (artifactVersions[artifactId]?.length > 0) return;

    if (useMockMode) {
      const versions = mockArtifactVersions.filter(v => v.artifactId === artifactId);
      if (versions.length > 0) {
        set(state => ({
          artifactVersions: {
            ...state.artifactVersions,
            [artifactId]: versions
          }
        }));
      }
      return;
    }

    try {
      const detailRes = await getArtifactDetail(artifactId);
      const versionsRes = await getArtifactVersions(artifactId);
      if (detailRes.code === 0 && versionsRes.code === 0) {
        set(state => ({
          artifacts: state.artifacts.map(a =>
            a.id === artifactId ? detailRes.data : a
          ),
          artifactVersions: {
            ...state.artifactVersions,
            [artifactId]: versionsRes.data
          }
        }));
      }
    } catch (e) {
      console.error('[Store] 获取 Artifact 详情失败', e);
    }
  },

  connectWS: async () => {
    const { wsStatus } = get();
    if (wsStatus === 'connected') return;

    set({ wsStatus: 'connecting' });

    get().disconnectWS();

    try {
      await wsClient.connect();
      set({ wsStatus: 'connected' });

      const unsubThinking = wsClient.on('agent.thinking.started', (event: any) => {
        const { agentId, agentName, conversationId } = event.data;
        set(state => {
          if (state.activeConversationId !== conversationId) return {};

          const updatedAgents = state.agents.map(a =>
            a.id === agentId ? { ...a, status: 'thinking' as const } : a
          );

          const thinkingMsg: Message = {
            id: `thinking-${agentId}`,
            conversationId,
            senderId: agentId,
            senderName: agentName,
            role: 'agent',
            type: 'status',
            content: '正在思考...',
            createdAt: getCurrentFullTime(),
          };

          return {
            agents: updatedAgents,
            messages: [...state.messages, thinkingMsg],
          };
        });
      });

      const unsubChunk = wsClient.on('conversation.message.chunk', (event: any) => {
        const { messageId, conversationId, senderId, senderName, role, messageType, chunk, language } = event.data;
        set(state => {
          if (state.activeConversationId !== conversationId) return {};

          const existingIndex = state.messages.findIndex(m => m.id === messageId);
          if (existingIndex > -1) {
            const updatedMessages = [...state.messages];
            updatedMessages[existingIndex] = {
              ...updatedMessages[existingIndex],
              content: updatedMessages[existingIndex].content + chunk,
            };
            return { messages: updatedMessages };
          } else {
            const filteredMessages = state.messages.filter(m => m.id !== `thinking-${senderId}`);
            const newMsg: Message = {
              id: messageId,
              conversationId,
              senderId,
              senderName,
              role,
              type: messageType,
              content: chunk,
              language,
              createdAt: getCurrentFullTime(),
            };
            return { messages: [...filteredMessages, newMsg] };
          }
        });
      });

      const unsubCompleted = wsClient.on('conversation.message.completed', (event: any) => {
        const { fullMessage } = event.data;
        set(state => {
          if (state.activeConversationId !== fullMessage.conversationId) return {};

          const updatedMessages = state.messages.map(m =>
            m.id === fullMessage.id ? fullMessage : m
          );
          if (!state.messages.some(m => m.id === fullMessage.id)) {
            updatedMessages.push(fullMessage);
          }

          const updatedAgents = state.agents.map(a =>
            a.id === fullMessage.senderId ? { ...a, status: 'online' as const } : a
          );

          return {
            messages: updatedMessages,
            agents: updatedAgents,
            conversations: state.conversations.map(c =>
              c.id === fullMessage.conversationId
                ? { ...c, lastMessage: fullMessage.content, updatedAt: getCurrentFullTime() }
                : c
            ),
          };
        });
      });

      const unsubArtifact = wsClient.on('artifact.created', (event: any) => {
        const { artifact } = event.data;
        set(state => {
          if (state.activeConversationId !== artifact.conversationId) return {};

          return {
            artifacts: [...state.artifacts, artifact],
            selectedArtifactId: artifact.id,
          };
        });
        get().loadArtifactContent(artifact.id);
      });

      const unsubAllCompleted = wsClient.on('conversation.all_tasks.completed', (event: any) => {
        const { conversationId, summary, contextUsage } = event.data;
        set(state => {
          if (state.activeConversationId !== conversationId) return {};

          const systemMsg: Message = {
            id: `system-completed-${Date.now()}`,
            conversationId,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: summary,
            createdAt: getCurrentFullTime(),
          };

          const updatedAgents = state.agents.map(a =>
            a.status === 'thinking' ? { ...a, status: 'online' as const } : a
          );

          let newState: Partial<AgentHubStore> = {
            messages: [...state.messages, systemMsg],
            agents: updatedAgents,
            isProcessing: false,
          };

          if (contextUsage) {
            newState.conversations = state.conversations.map(c =>
              c.id === conversationId
                ? { ...c, contextUsage }
                : c
            );
          }

          return newState;
        });
      });

      const unsubStatusChanged = wsClient.on('agent.status.changed', (event: any) => {
        const { agentId, newStatus } = event.data;
        set(state => {
          const updatedAgents = state.agents.map(a =>
            a.id === agentId ? { ...a, status: newStatus } : a
          );
          return { agents: updatedAgents };
        });
      });

      (wsClient as any)._unsubs = [
        unsubThinking,
        unsubChunk,
        unsubCompleted,
        unsubArtifact,
        unsubAllCompleted,
        unsubStatusChanged,
      ];
    } catch (e) {
      console.error('[Store] WS 连接失败', e);
      set({ wsStatus: 'disconnected' });
    }
  },

  disconnectWS: () => {
    if ((wsClient as any)._unsubs) {
      (wsClient as any)._unsubs.forEach((unsub: any) => unsub());
      delete (wsClient as any)._unsubs;
    }
    wsClient.disconnect();
    set({ wsStatus: 'disconnected' });
  },

  setReplyContext: (replyContext) => set({ replyContext }),
  setQuoteArtifactRef: (quoteArtifactRef) => set({ quoteArtifactRef }),

  login: async (email, password) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await loginApi({ email, password });
        if (res.code === 0 && res.data) {
          const user = { ...res.data.user, isLoggedIn: true };
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('ag_user', JSON.stringify(user));
          set({ currentUser: user as any });
          
          await get().loadBusinessData();
          return { success: true, message: '登录成功' };
        } else {
          return { success: false, message: res.message || '登录失败' };
        }
      } catch (e: any) {
        console.error(e);
        return { success: false, message: e.response?.data?.message || '登录接口调用失败' };
      }
    }

    try {
      const usersStr = localStorage.getItem('ag_registered_users') || '[]';
      const users = JSON.parse(usersStr);
      const found = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());

      if (!found) {
        return { success: false, message: '该邮箱尚未注册' };
      }

      if (found.password !== password) {
        return { success: false, message: '密码不正确' };
      }

      const user = { name: found.name, email: found.email, avatar: found.avatar, isLoggedIn: true };
      set({ currentUser: user });
      localStorage.setItem('ag_user', JSON.stringify(user));
      return { success: true, message: '登录成功' };
    } catch (e) {
      console.error(e);
      return { success: false, message: '登录出现异常' };
    }
  },

  register: async (name, email, password, avatar) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await registerApi({ name, email, password, avatar });
        if (res.code === 0 && res.data) {
          const user = { ...res.data.user, isLoggedIn: true };
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('ag_user', JSON.stringify(user));
          set({ currentUser: user as any });
          
          await get().loadBusinessData();
          return { success: true, message: '注册成功' };
        } else {
          return { success: false, message: res.message || '注册失败' };
        }
      } catch (e: any) {
        console.error(e);
        return { success: false, message: e.response?.data?.message || '注册接口调用失败' };
      }
    }

    try {
      const usersStr = localStorage.getItem('ag_registered_users') || '[]';
      const users = JSON.parse(usersStr);
      const exists = users.some((u: any) => u.email.toLowerCase() === email.toLowerCase());

      if (exists) {
        return { success: false, message: '该邮箱已被注册' };
      }

      const newUser = { name, email, password, avatar };
      users.push(newUser);
      localStorage.setItem('ag_registered_users', JSON.stringify(users));

      // Auto login after registration
      const user = { name, email, avatar, isLoggedIn: true };
      set({ currentUser: user });
      localStorage.setItem('ag_user', JSON.stringify(user));

      return { success: true, message: '注册成功' };
    } catch (e) {
      console.error(e);
      return { success: false, message: '注册出现异常' };
    }
  },

  loginAsGuest: async (name, email, avatar) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await loginAsGuestApi();
        if (res.code === 0 && res.data) {
          const user = { ...res.data.user, isLoggedIn: true };
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('ag_user', JSON.stringify(user));
          set({ currentUser: user as any });
          
          await get().loadBusinessData();
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const user = { name, email, avatar, isLoggedIn: true };
    set({ currentUser: user });
    localStorage.setItem('ag_user', JSON.stringify(user));
  },

  logout: async () => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        await logoutApi();
      } catch (e) {
        console.error('Logout API failed', e);
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('ag_user');
    get().disconnectWS();
    set({ currentUser: null, activeConversationId: null, messages: [], pins: [], memories: [] });
  },

  updateProfile: async (name, email, avatar) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateProfileApi({ name, email, avatar });
        if (res.code !== 0) {
          console.error('[Store] 修改个人资料 API 失败', res.message);
        }
      } catch (e) {
        console.error('[Store] 修改个人资料 API 失败', e);
      }
    }
    const user = { name, email, avatar, isLoggedIn: true };
    set({ currentUser: user });
    localStorage.setItem('ag_user', JSON.stringify(user));
  },

  updateSettings: (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    localStorage.setItem('ag_settings', JSON.stringify(updated));

    if (newSettings.theme) {
      if (newSettings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  },

  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  togglePinMessage: async (messageId) => {
    const { messages, useMockMode, activeConversationId, pins } = get();
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg) return;

    const newPinned = !targetMsg.isPinned;

    if (useMockMode) {
      let updatedPins = [...pins];
      if (newPinned) {
        updatedPins.push({
          id: `pin-${messageId}-${Date.now()}`,
          conversationId: activeConversationId || '',
          messageId: messageId,
          createdAt: getCurrentFullTime(),
          message: { ...targetMsg, isPinned: true }
        });
      } else {
        updatedPins = updatedPins.filter(p => p.messageId !== messageId);
      }

      set(state => ({
        messages: state.messages.map(m => m.id === messageId ? { ...m, isPinned: newPinned } : m),
        pins: updatedPins
      }));
      return;
    }

    if (!activeConversationId) return;
    
    try {
      if (newPinned) {
        const res = await pinMessage(activeConversationId, messageId);
        if (res.code === 0) {
          set(state => ({
            messages: state.messages.map(m => m.id === messageId ? { ...m, isPinned: true } : m),
            pins: [...state.pins, res.data]
          }));
        }
      } else {
        const res = await unpinMessage(activeConversationId, messageId);
        if (res.code === 0) {
          set(state => ({
            messages: state.messages.map(m => m.id === messageId ? { ...m, isPinned: false } : m),
            pins: state.pins.filter(p => p.messageId !== messageId)
          }));
        }
      }
    } catch (e) {
      console.error('[Store] Pin 消息失败', e);
    }
  },

  deleteMemory: async (memoryId) => {
    const { useMockMode, activeConversationId } = get();
    if (useMockMode) {
      set(state => ({
        memories: state.memories.filter(m => m.id !== memoryId)
      }));
      return;
    }

    if (!activeConversationId) return;
    try {
      const res = await deleteMemory(activeConversationId, memoryId);
      if (res.code === 0) {
        set(state => ({
          memories: state.memories.filter(m => m.id !== memoryId)
        }));
      }
    } catch (e) {
      console.error('[Store] 删除记忆失败', e);
    }
  },

  updateMemory: async (memoryId, content, category) => {
    const { useMockMode, activeConversationId } = get();
    if (useMockMode) {
      set(state => ({
        memories: state.memories.map(m => m.id === memoryId ? { ...m, content, category: category || m.category, updatedAt: getCurrentFullTime() } : m)
      }));
      return;
    }

    if (!activeConversationId) return;
    try {
      const res = await updateMemory(activeConversationId, memoryId, { content, category });
      if (res.code === 0 && res.data) {
        set(state => ({
          memories: state.memories.map(m => m.id === memoryId ? res.data : m)
        }));
      }
    } catch (e) {
      console.error('[Store] 修改记忆失败', e);
    }
  },
  saveEditedArtifact: async (artifactId, newContent) => {
    const { artifacts, useMockMode } = get();
    const originalArt = artifacts.find(a => a.id === artifactId);
    if (!originalArt) return;

    const nextVer = originalArt.latestVersion + 1;
    const newVersionId = `ver-${artifactId}-${nextVer}-${Date.now()}`;

    let updatedArt: Artifact;
    let newVersion: ArtifactVersion;

    if (!useMockMode) {
      try {
        const res = await updateArtifactContent(artifactId, { 
          content: newContent,
          changeSummary: `用户手动修改`
        });
        if (res.code === 0) {
          updatedArt = res.data;
          newVersion = res.data.currentVersion;
        } else {
          throw new Error(res.message || '更新接口返回错误');
        }
      } catch (e) {
        console.error('[Store] saveEditedArtifact API 调用失败，退回到 Mock 逻辑', e);
        newVersion = {
          id: newVersionId,
          artifactId,
          version: nextVer,
          content: newContent,
          size: newContent.length,
          createdBy: 'user',
          createdByType: 'user',
          parentVersionId: originalArt.currentVersionId,
          createdAt: getCurrentFullTime(),
        };
        updatedArt = {
          ...originalArt,
          currentVersionId: newVersionId,
          latestVersion: nextVer,
          updatedAt: getCurrentFullTime(),
        };
      }
    } else {
      newVersion = {
        id: newVersionId,
        artifactId,
        version: nextVer,
        content: newContent,
        size: newContent.length,
        createdBy: 'user',
        createdByType: 'user',
        parentVersionId: originalArt.currentVersionId,
        createdAt: getCurrentFullTime(),
      };
      updatedArt = {
        ...originalArt,
        currentVersionId: newVersionId,
        latestVersion: nextVer,
        updatedAt: getCurrentFullTime(),
      };
    }

    const editLogMsg: Message = {
      id: createId('msg'),
      conversationId: originalArt.conversationId,
      senderId: 'system',
      senderName: '系统',
      role: 'system',
      type: 'status',
      content: `用户手动编辑了产物 ${originalArt.title}，已生成新版本 v${nextVer}`,
      createdAt: getCurrentFullTime(),
    };

    set(state => {
      const updatedVersionsList = [...(state.artifactVersions[artifactId] || [])];
      if (!updatedVersionsList.some(v => v.id === newVersion.id)) {
        updatedVersionsList.push(newVersion);
      }
      return {
        artifacts: state.artifacts.map(a => a.id === artifactId ? updatedArt : a),
        artifactVersions: {
          ...state.artifactVersions,
          [artifactId]: updatedVersionsList,
        },
        selectedArtifactId: artifactId,
        selectedArtifactVersion: nextVer,
        messages: [...state.messages, editLogMsg],
      };
    });

    if (!useMockMode) {
      try {
        await sendMessageNonStreaming(originalArt.conversationId, {
          content: editLogMsg.content,
          role: 'system',
          senderId: 'system',
          senderName: '系统',
          type: 'status',
        } as any);
      } catch (e) {
        console.warn('Failed to save edit log system message to backend', e);
      }
    }
  },

  getContextUsage: async () => {
    const { activeConversationId, useMockMode } = get();
    if (!activeConversationId) return;

    if (!useMockMode) {
      try {
        const res = await getContextUsageApi(activeConversationId);
        if (res.code === 0) {
          get().setContextUsage(res.data);
          return;
        }
      } catch (e) {
        console.warn('[Store] getContextUsage API 调用失败', e);
      }
    }
  },

  setContextUsage: (usage) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === state.activeConversationId
          ? { ...c, contextUsage: usage }
          : c
      ),
    }));
  },

  // ============ v4 新增：Agent 一对一专属对话系统 Actions ============
  openAgentProfile: (agentId) => {
    set({ 
      showAgentProfile: true, 
      viewingAgentId: agentId 
    });
  },

  closeAgentProfile: () => {
    set({ 
      showAgentProfile: false, 
      viewingAgentId: null 
    });
  },

  getOrCreateAgentChat: async (agentId: string) => {
    const { conversations, agents, useMockMode, currentUser } = get();

    if (!useMockMode && currentUser) {
      try {
        const userId = currentUser.id || 'user-admin';
        const res = await getAgentContact(userId, agentId);
        if (res.code === 0 && res.data) {
          const apiConv = res.data.conversation;
          const mappedConv: Conversation = {
            ...apiConv,
            mode: 'agent',
          };

          set(state => {
            const hasConv = state.conversations.some(c => c.id === mappedConv.id);
            const nextConvs = hasConv
              ? state.conversations.map(c => c.id === mappedConv.id ? mappedConv : c)
              : [...state.conversations, mappedConv];
            return {
              conversations: mergeLocalFlags(nextConvs)
            };
          });

          await get().setActiveConversationId(mappedConv.id);
          return mappedConv;
        }
      } catch (e) {
        console.error('Failed to get or create backend agent contact session', e);
      }
    }

    const existing = conversations.find(c => c.mode === 'agent' && c.agentIds && c.agentIds.length === 1 && c.agentIds[0] === agentId);
    if (existing) {
      await get().setActiveConversationId(existing.id);
      return existing;
    }

    const targetAgent = agents.find(a => a.id === agentId);
    const title = targetAgent ? targetAgent.name : '一对一对话';
    const newConv: Conversation = {
      id: `conv-agent-${agentId}`,
      title: title,
      mode: 'agent',
      agentIds: [agentId],
      lastMessage: '',
      updatedAt: getCurrentFullTime(),
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      conversations: mergeLocalFlags([...state.conversations, newConv]),
    }));

    await get().setActiveConversationId(newConv.id);
    return newConv;
  },

  sendAgentChatMessage: async (agentChatId, content) => {
    const { agents } = get();
    const targetAgentChat = get().agentChats.find(c => c.id === agentChatId);
    if (!targetAgentChat) return;

    const targetAgent = agents.find(a => a.id === targetAgentChat.agentId);
    if (!targetAgent) return;

    const userMsg: AgentChatMessage = {
      id: createId('chat-msg'),
      agentChatId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content,
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      agentChatMessages: {
        ...state.agentChatMessages,
        [agentChatId]: [...(state.agentChatMessages[agentChatId] || []), userMsg],
      },
      agentChats: state.agentChats.map(c =>
        c.id === agentChatId
          ? { ...c, lastMessage: content, updatedAt: getCurrentFullTime() }
          : c
      ),
    }));

    // Mock 模式演示回复
    await new Promise(r => setTimeout(r, 1000));

    const replyContent = `收到了你的消息："${content}"\n\n我是 ${targetAgent.name}，这是我们一对一专属对话。`;
    const agentMsg: AgentChatMessage = {
      id: createId('chat-msg'),
      agentChatId,
      senderId: targetAgent.id,
      senderName: targetAgent.name,
      role: 'agent',
      type: 'text',
      content: replyContent,
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      agentChatMessages: {
        ...state.agentChatMessages,
        [agentChatId]: [...(state.agentChatMessages[agentChatId] || []), agentMsg],
      },
      agentChats: state.agentChats.map(c =>
        c.id === agentChatId
          ? { ...c, lastMessage: replyContent, updatedAt: getCurrentFullTime() }
          : c
      ),
    }));
  },

  setShowAgentChatView: (show) => set({ showAgentChatView: show }),
}));
