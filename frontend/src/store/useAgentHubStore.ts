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
import sandboxService from '@/services/http/sandboxService';
import { platform, FileNode, WorkspaceInfo, AgentProcessInfo } from '@/utils/platform';

// Helper functions to cache message-specific artifact references locally
const saveArtifactRefToLocal = (messageId: string, ref: ArtifactReference): void => {
  try {
    const cached = JSON.parse(localStorage.getItem('ag_message_artifact_refs') || '{}');
    cached[messageId] = ref;
    localStorage.setItem('ag_message_artifact_refs', JSON.stringify(cached));
  } catch (e) {
    console.error('Failed to save artifactRef to localStorage', e);
  }
};

const getArtifactRefFromLocal = (messageId: string): ArtifactReference | undefined => {
  try {
    const cached = JSON.parse(localStorage.getItem('ag_message_artifact_refs') || '{}');
    return cached[messageId];
  } catch (e) {
    console.error('Failed to get artifactRef from localStorage', e);
    return undefined;
  }
};

// Map backend metadata fields back to message root properties
const mapMessageMetadata = (m: Message): Message => {
  const metadata = (m as any).metadata;
  let artifactRef = m.artifactRef || metadata?.artifactRef;
  if (!artifactRef && m.id) {
    artifactRef = getArtifactRefFromLocal(m.id);
  }
  return {
    ...m,
    quotedMessage: m.quotedMessage || metadata?.quotedMessage || undefined,
    artifactRef: artifactRef || undefined,
  };
};


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
  leftSidebarViewMode: 'conversations' | 'agents' | 'agent-detail' | 'files' | 'workspace' | 'notifications' | 'settings';
  useMockMode: boolean;
  wsStatus: 'connecting' | 'connected' | 'disconnected';

  // Desktop specific states
  currentWorkspace: WorkspaceInfo | null;
  workspaceStatus: 'none' | 'loading' | 'active' | 'unavailable' | 'error';
  recentWorkspaces: WorkspaceInfo[];
  workspaceFiles: FileNode[];
  workspaceSearchKeyword: string;
  workspaceContextFiles: string[];
  selectedWorkspaceFilePath: string | null;
  selectedWorkspaceFileContent: string | null;
  localAgentProcesses: AgentProcessInfo[];
  localAgentLogs: Record<string, string[]>;
  localAgentLoading: Record<string, boolean>;
  desktopNotifications: { id: string; title: string; body: string; timestamp: string; type: string; isRead: boolean }[];
  isDesktop: boolean;

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
  setUseMockMode: (mode: boolean) => Promise<void>;
  setActiveConversationId: (id: string | null) => Promise<void>;
  setSelectedArtifactId: (id: string | null) => void;
  setSelectedArtifactVersion: (version: number | null) => void;
  setIsNewConversationOpen: (open: boolean) => void;
  setIsFullScreenOpen: (open: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;
  setConfiguringAgentId: (id: string | null) => void;
  setLeftSidebarViewMode: (mode: 'conversations' | 'agents' | 'agent-detail' | 'files' | 'workspace' | 'notifications' | 'settings') => void;
  
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
    // Desktop Settings
    allowRead: boolean;
    allowWrite: boolean;
    confirmBeforeWrite: boolean;
    defaultSaveDir: string;
    autoOverwrite: boolean;
    enableNotifications: boolean;
    notifyOnTaskCompleted: boolean;
    notifyOnArtifactCreated: boolean;
    notifyOnAgentError: boolean;
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
  updateSettings: (settings: Partial<AgentHubStore['settings']>) => Promise<void>;
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

  // Sandbox V1 States & Actions
  activeRun: any; // AgentRunDetail | null
  runFiles: any[]; // SandboxFile[]
  runConflicts: any[]; // SandboxConflict[]
  selectedSandboxFilePath: string | null;
  runFileContents: Record<string, string>;
  rightPanelTab: 'artifacts' | 'sandbox';
  
  setRightPanelTab: (tab: 'artifacts' | 'sandbox') => void;
  setSelectedSandboxFilePath: (path: string | null) => void;
  createSandboxRun: (prompt: string) => Promise<void>;
  loadSandboxRunDetail: (runId: string) => Promise<void>;
  loadSandboxFiles: (runId: string) => Promise<void>;
  loadSandboxFileContent: (runId: string, path: string) => Promise<string>;
  loadSandboxConflicts: (runId: string) => Promise<void>;
  resolveSandboxConflict: (runId: string, conflictId: string, resolution: 'current' | 'incoming' | 'manual', content?: string) => Promise<void>;
  cancelSandboxRun: (runId: string) => Promise<void>;
  
  // Desktop Actions
  setWorkspaceSearchKeyword: (keyword: string) => void;
  selectWorkspace: () => Promise<void>;
  scanWorkspace: () => Promise<void>;
  clearWorkspace: () => Promise<void>;
  removeRecentWorkspace: (workspacePath: string) => Promise<void>;
  setSelectedWorkspaceFilePath: (path: string | null) => void;
  loadWorkspaceFileContent: (path: string) => Promise<string>;
  addFileToContext: (path: string) => void;
  removeFileFromContext: (path: string) => void;
  clearFileContext: () => void;
  loadLocalAgents: () => Promise<void>;
  startLocalAgent: (id: string) => Promise<void>;
  stopLocalAgent: (id: string) => Promise<void>;
  restartLocalAgent: (id: string) => Promise<void>;
  loadLocalAgentLogs: (id: string) => Promise<void>;
  applyArtifactToLocal: (artifactId: string, versionId: string, targetPath: string, autoOverwrite?: boolean) => Promise<{ success: boolean; error?: string; conflict?: boolean }>;
  addDesktopNotification: (title: string, body: string, type: string) => void;
  markNotificationAsRead: (id: string) => void;
  clearNotifications: () => void;
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

  // Desktop specific states
  currentWorkspace: null,
  workspaceStatus: 'none',
  recentWorkspaces: [],
  workspaceFiles: [],
  workspaceSearchKeyword: '',
  workspaceContextFiles: [],
  selectedWorkspaceFilePath: null,
  selectedWorkspaceFileContent: null,
  localAgentProcesses: [],
  localAgentLogs: {},
  localAgentLoading: {},
  desktopNotifications: [],
  isDesktop: platform.isDesktop(),

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
    // Desktop initial settings
    allowRead: true,
    allowWrite: true,
    confirmBeforeWrite: true,
    defaultSaveDir: '',
    autoOverwrite: false,
    enableNotifications: true,
    notifyOnTaskCompleted: true,
    notifyOnArtifactCreated: true,
    notifyOnAgentError: true,
  },
  isSettingsOpen: false,
  conversationAgentConfigs: {},

  // Sandbox V1 States
  activeRun: null,
  runFiles: [],
  runConflicts: [],
  selectedSandboxFilePath: null,
  runFileContents: {},
  rightPanelTab: 'artifacts',

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

    // Load mock mode preference from localStorage
    try {
      const storedMockMode = localStorage.getItem('ag_use_mock_mode');
      if (storedMockMode !== null) {
        set({ useMockMode: storedMockMode === 'true' });
      }
    } catch (e) {
      console.warn('Failed to load mock mode from localStorage', e);
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

    // Load workspace settings and state
    try {
      const settingsRes = await platform.settings.get();
      if (settingsRes.success && settingsRes.settings) {
        set(state => ({
          settings: { ...state.settings, ...settingsRes.settings }
        }));
      }

      const workspaceRes = await platform.workspace.getCurrent();
      if (workspaceRes.success && workspaceRes.workspace) {
        set({
          currentWorkspace: workspaceRes.workspace,
          workspaceStatus: (workspaceRes as any).status || 'active'
        });
        await get().scanWorkspace();
      }

      const recentRes = await platform.workspace.getRecent();
      if (recentRes.success && recentRes.workspaces) {
        set({ recentWorkspaces: recentRes.workspaces });
      }

      await get().loadLocalAgents();
    } catch (e) {
      console.warn('Failed to load platform capabilities/workspace in initStore:', e);
    }
  },

  setUseMockMode: async (mode) => {
    set({ useMockMode: mode });
    localStorage.setItem('ag_use_mock_mode', String(mode));
    
    if (mode) {
      console.log('[Store] 切换到 Mock 演示模式');
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
    } else {
      console.log('[Store] 切换到真实 API 模式');
      try {
        set({
          conversations: [],
          agents: [],
          messages: [],
          artifacts: [],
          artifactVersions: {},
          pins: [],
          memories: [],
          activeConversationId: null,
        });
        await get().loadBusinessData();
      } catch (e) {
        console.warn('[Store] 真实 API 模式加载失败，自动回退到 Mock 模式', e);
        set({ useMockMode: true });
        localStorage.setItem('ag_use_mock_mode', 'true');
      }
    }
  },

  setActiveConversationId: async (id) => {
    set({ 
      activeConversationId: id,
      selectedArtifactId: null,
      selectedArtifactVersion: null,
      isProcessing: false,
      replyContext: null,
      quoteArtifactRef: null,
      messages: [],
      artifacts: [],
      pins: [],
      memories: [],
      artifactVersions: {},
    });
    if (id) {
      await get().loadConversationData(id);
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
        pinsData = pinsRes.data.map((p: PinItem) => ({
          ...p,
          message: p.message ? mapMessageMetadata(p.message) : p.message
        }));
      }

      let memoriesData: MemoryItem[] = [];
      if (memoriesRes.code === 0 && memoriesRes.data) {
        memoriesData = memoriesRes.data;
      }

      let messagesData: Message[] = [];
      if (msgRes.code === 0 && msgRes.data && msgRes.data.list) {
        messagesData = msgRes.data.list.map((m: Message) => {
          const mapped = mapMessageMetadata(m);
          return {
            ...mapped,
            isPinned: pinsData.some(p => p.messageId === m.id)
          };
        });
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

      if (!useMockMode) {
        try {
          await sendMessageNonStreaming(activeConversationId, {
            content: failMsg.content,
            role: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'status',
          } as any);
        } catch (e) {
          console.warn('Failed to save compress fail system message to backend', e);
        }
      }
    } else if (result) {
      let finalContent = apiMessage;
      if (result.summary && result.summary.summary) {
        finalContent = `${apiMessage}\n\n📝 摘要：${result.summary.summary}`;
      }

      const systemMsg: Message = {
        id: (result.summary && result.summary.id) || createId('msg'),
        conversationId: activeConversationId,
        senderId: 'system',
        senderName: '系统',
        role: 'system',
        type: 'status',
        content: finalContent,
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
    const { activeConversationId, useMockMode, conversations, agents, replyContext, quoteArtifactRef, workspaceContextFiles } = get();
    if (!activeConversationId) return;

    const activeConv = conversations.find(c => c.id === activeConversationId);
    if (!activeConv) return;

    // Append workspace files context if any
    let finalContent = content;
    if (workspaceContextFiles && workspaceContextFiles.length > 0) {
      let contextBlock = '\n\n---\n### [Workspace File Context]\n';
      for (const filePath of workspaceContextFiles) {
        const fileContent = await get().loadWorkspaceFileContent(filePath);
        if (fileContent) {
          contextBlock += `\nFile: \`${filePath}\`\n\`\`\`\n${fileContent}\n\`\`\`\n`;
        }
      }
      finalContent += contextBlock;
    }

    const newUserMessage: Message = {
      id: createId('msg'),
      conversationId: activeConversationId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content, // Keep original content for UI
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

    get().clearFileContext();

    if (useMockMode) {
      const replyResult = generateMockReply({
        conversation: activeConv,
        agents,
        userContent: finalContent,
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
          content: finalContent,
          targetAgentId,
          quotedMessageId: replyContext?.id || undefined,
          artifactRef: quoteArtifactRef || undefined,
          attachments,
        };
        const res = await sendMessageNonStreaming(activeConversationId, payload);
        if (res.code === 0) {
          const { userMessage, agentMessages, artifacts, contextUsage } = res.data;
          
          // Cache the artifactRef with the server-side message ID if present
          const mappedUserMessage = mapMessageMetadata(userMessage);
          const finalArtifactRef = mappedUserMessage.artifactRef || newUserMessage.artifactRef;
          if (finalArtifactRef && userMessage.id) {
            saveArtifactRefToLocal(userMessage.id, finalArtifactRef);
          }

          set(state => {
            // Replace the optimistic message with the actual user message, preserving local reply/citation fields
            const updatedMessages = state.messages.map(m => {
              if (m.id === newUserMessage.id) {
                return {
                  ...mappedUserMessage,
                  quotedMessage: mappedUserMessage.quotedMessage || m.quotedMessage,
                  artifactRef: finalArtifactRef,
                };
              }
              return m;
            });

            // Filter out thinking indicators and append new agent messages
            let finalMessages = [...updatedMessages];
            agentMessages.forEach(msg => {
              finalMessages = finalMessages.filter(m => m.id !== `thinking-${msg.senderId}`);
              if (!finalMessages.some(m => m.id === msg.id)) {
                finalMessages.push(mapMessageMetadata(msg));
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

          const mappedMessage = mapMessageMetadata(fullMessage);
          const updatedMessages = state.messages.map(m =>
            m.id === fullMessage.id ? mappedMessage : m
          );
          if (!state.messages.some(m => m.id === fullMessage.id)) {
            updatedMessages.push(mappedMessage);
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

      const unsubRunCreated = wsClient.on('run.created', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
      });

      const unsubRunStepStarted = wsClient.on('run.step.started', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
      });

      const unsubRunStepLog = wsClient.on('run.step.log', (event: any) => {
        const { runId, stepId, log } = event.data;
        set(state => {
          if (!state.activeRun || state.activeRun.id !== runId) return {};
          const updatedSteps = state.activeRun.steps.map((step: any) => {
            if (step.id === stepId) {
              return { ...step, log: (step.log || '') + log };
            }
            return step;
          });
          return {
            activeRun: {
              ...state.activeRun,
              steps: updatedSteps
            }
          };
        });
      });

      const unsubRunStepCompleted = wsClient.on('run.step.completed', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
      });

      const unsubRunStepFailed = wsClient.on('run.step.failed', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
      });

      const unsubRunStepConflict = wsClient.on('run.step.conflict', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
        get().loadSandboxConflicts(runId);
      });

      const unsubRunCompleted = wsClient.on('run.completed', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
        get().loadSandboxFiles(runId);
      });

      const unsubRunFailed = wsClient.on('run.failed', (event: any) => {
        const { runId } = event.data;
        get().loadSandboxRunDetail(runId);
      });

      (wsClient as any)._unsubs = [
        unsubThinking,
        unsubChunk,
        unsubCompleted,
        unsubArtifact,
        unsubAllCompleted,
        unsubStatusChanged,
        unsubRunCreated,
        unsubRunStepStarted,
        unsubRunStepLog,
        unsubRunStepCompleted,
        unsubRunStepFailed,
        unsubRunStepConflict,
        unsubRunCompleted,
        unsubRunFailed,
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

  updateSettings: async (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    localStorage.setItem('ag_settings', JSON.stringify(updated));

    try {
      await platform.settings.set(updated);
    } catch (e) {
      console.warn('Failed to save settings via platform:', e);
    }

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
            pins: [...state.pins, {
              ...res.data,
              message: res.data.message ? mapMessageMetadata(res.data.message) : res.data.message
            }]
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

  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setSelectedSandboxFilePath: (path) => set({ selectedSandboxFilePath: path }),

  createSandboxRun: async (prompt) => {
    const { activeConversationId, useMockMode } = get();
    if (!activeConversationId) return;

    if (!useMockMode) {
      try {
        const res = await sandboxService.createSandboxRun(activeConversationId, prompt);
        if (res.code === 0 && res.data) {
          set({
            activeRun: res.data,
            rightPanelTab: 'sandbox',
            runFiles: res.data.files || [],
            runConflicts: res.data.conflicts || [],
            selectedSandboxFilePath: null,
            runFileContents: {}
          });
        }
      } catch (e) {
        console.error('[Store] 创建沙箱失败', e);
      }
    } else {
      // Mock execution simulation
      const runId = createId('run');
      const hasConflict = prompt.includes('conflict') || prompt.includes('冲突');
      
      const nodes: any[] = [
        { id: 'step-1', label: '初始化容器', agentId: 'system', status: 'completed' as const, dependencies: [] as string[] },
        { id: 'step-2', label: '代码架构分析', agentId: 'agent-orchestrator', status: 'running' as const, dependencies: ['step-1'] },
        { id: 'step-3', label: '生成代码源文件', agentId: 'agent-claude-code', status: 'pending' as const, dependencies: ['step-2'] },
        { id: 'step-4', label: '编译与静态测试', agentId: 'agent-codex', status: 'pending' as const, dependencies: ['step-3'] }
      ];

      const steps: any[] = [
        {
          id: 'step-1',
          runId,
          agentId: 'system',
          agentName: '系统',
          status: 'completed',
          description: '环境初始化完成。已加载 Docker python:3.11-slim，禁用网络接口 (--network none)。',
          log: '[System] docker run --network none -d -v ...\n[System] Docker sandbox initialized successfully.\n[System] Created workspace directory /workspace.\n',
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: 'step-2',
          runId,
          agentId: 'agent-orchestrator',
          agentName: 'Orchestrator',
          status: 'running',
          description: '正在分析任务需求，生成执行 DAG 步骤规划...',
          log: '[Agent: Orchestrator] Starting task design...\n[Agent: Orchestrator] Workspace analysis complete. 4 files targeted.\n',
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: 'step-3',
          runId,
          agentId: 'agent-claude-code',
          agentName: 'Claude Code',
          status: 'pending',
          description: '根据规划自动生成源文件内容及配置。',
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: 'step-4',
          runId,
          agentId: 'agent-codex',
          agentName: 'Codex',
          status: 'pending',
          description: '执行编译检查与静态单元测试分析。',
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        }
      ];

      const runDetail: any = {
        id: runId,
        sandboxId: createId('sb'),
        conversationId: activeConversationId,
        ownerUserId: 'user-admin',
        status: 'running',
        prompt,
        dag: { nodes },
        summary: '正在生成 README.md 说明文件...',
        createdAt: getCurrentFullTime(),
        updatedAt: getCurrentFullTime(),
        steps,
        files: [],
        conflicts: []
      };

      set({
        activeRun: runDetail,
        rightPanelTab: 'sandbox',
        runFiles: [],
        runConflicts: [],
        selectedSandboxFilePath: null,
        runFileContents: {}
      });

      // Simulation runner
      let currentSteps = [...steps];
      let currentNodes = [...nodes];
      
      // Step 2 completes, Step 3 starts
      setTimeout(() => {
        if (get().activeRun?.id !== runId) return;
        currentSteps = currentSteps.map(s => {
          if (s.id === 'step-2') {
            return {
              ...s,
              status: 'completed' as const,
              log: s.log + '[Agent: Orchestrator] Step 2 complete. Passing task to Claude Code.\n'
            };
          }
          if (s.id === 'step-3') {
            return {
              ...s,
              status: hasConflict ? ('conflict' as const) : ('running' as const),
              description: hasConflict ? '检测到目标文件冲突' : '正在写入 README.md ...',
              log: '[Agent: Claude Code] Starting step 3. Writing README.md...\n'
            };
          }
          return s;
        });

        currentNodes = currentNodes.map(n => {
          if (n.id === 'step-2') return { ...n, status: 'completed' as const };
          if (n.id === 'step-3') return { ...n, status: hasConflict ? ('conflict' as const) : ('running' as const) };
          return n;
        });

        const mockConflicts = hasConflict ? [
          {
            id: 'conf-readme',
            runId,
            sandboxId: runDetail.sandboxId,
            filePath: 'README.md',
            baseVersion: 1,
            currentVersion: 2,
            incomingContent: '# Sandbox Conflict Test\n\nIncoming Conflict Content from Sandboxed Agent.',
            incomingHash: 'hash-incoming',
            status: 'open' as const,
            createdAt: getCurrentFullTime()
          }
        ] : [];

        set(state => ({
          activeRun: state.activeRun ? {
            ...state.activeRun,
            status: hasConflict ? 'conflict' as const : 'running' as const,
            steps: currentSteps,
            dag: { nodes: currentNodes },
            conflicts: mockConflicts
          } : null,
          runConflicts: mockConflicts
        }));
      }, 2000);

      if (!hasConflict) {
        // Step 3 completes, Step 4 starts
        setTimeout(() => {
          if (get().activeRun?.id !== runId) return;
          currentSteps = currentSteps.map(s => {
            if (s.id === 'step-3') {
              return {
                ...s,
                status: 'completed' as const,
                log: s.log + '[Agent: Claude Code] README.md created. Version 1.\n'
              };
            }
            if (s.id === 'step-4') {
              return {
                ...s,
                status: 'running' as const,
                log: '[Agent: Codex] Starting compilation and test script execution...\n'
              };
            }
            return s;
          });

          currentNodes = currentNodes.map(n => {
            if (n.id === 'step-3') return { ...n, status: 'completed' as const };
            if (n.id === 'step-4') return { ...n, status: 'running' as const };
            return n;
          });

          const mockFiles = [
            {
              id: 'file-readme',
              sandboxId: runDetail.sandboxId,
              runId,
              path: 'README.md',
              contentHash: 'hash-1',
              currentVersion: 1,
              createdAt: getCurrentFullTime(),
              updatedAt: getCurrentFullTime()
            }
          ];

          set(state => ({
            activeRun: state.activeRun ? {
              ...state.activeRun,
              steps: currentSteps,
              dag: { nodes: currentNodes },
              files: mockFiles
            } : null,
            runFiles: mockFiles,
            runFileContents: {
              ...state.runFileContents,
              'README.md': '# Sandbox Run V1\n\nThis README was successfully generated inside Docker sandboxed environment with no-network parameters.\n'
            }
          }));
        }, 4000);

        // Step 4 completes, Run completed
        setTimeout(() => {
          if (get().activeRun?.id !== runId) return;
          currentSteps = currentSteps.map(s => {
            if (s.id === 'step-4') {
              return {
                ...s,
                status: 'completed' as const,
                log: s.log + '[Agent: Codex] compilation success. 1 test case run: SUCCESS.\n[System] Task runs successfully.\n'
              };
            }
            return s;
          });

          currentNodes = currentNodes.map(n => {
            if (n.id === 'step-4') return { ...n, status: 'completed' as const };
            return n;
          });

          set(state => ({
            activeRun: state.activeRun ? {
              ...state.activeRun,
              status: 'completed' as const,
              steps: currentSteps,
              dag: { nodes: currentNodes },
              finishedAt: getCurrentFullTime()
            } : null
          }));
        }, 6000);
      }
    }
  },

  loadSandboxRunDetail: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxRunDetail(runId);
        if (res.code === 0 && res.data) {
          set({
            activeRun: res.data,
            runFiles: res.data.files || [],
            runConflicts: res.data.conflicts || []
          });
        }
      } catch (e) {
        console.error('[Store] 获取沙箱运行详情失败', e);
      }
    }
  },

  loadSandboxFiles: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxFiles(runId);
        if (res.code === 0 && res.data) {
          set({ runFiles: res.data });
        }
      } catch (e) {
        console.error('[Store] 获取沙箱文件列表失败', e);
      }
    }
  },

  loadSandboxFileContent: async (runId, path) => {
    const { useMockMode, runFileContents } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxFileContent(runId, path);
        if (res.code === 0 && res.data) {
          set(state => ({
            runFileContents: {
              ...state.runFileContents,
              [path]: res.data.content
            }
          }));
          return res.data.content;
        }
      } catch (e) {
        console.error('[Store] 读取沙箱文件内容失败', e);
      }
    } else {
      if (runFileContents[path]) return runFileContents[path];
    }
    return '';
  },

  loadSandboxConflicts: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxConflicts(runId);
        if (res.code === 0 && res.data) {
          set({ runConflicts: res.data });
        }
      } catch (e) {
        console.error('[Store] 获取沙箱冲突列表失败', e);
      }
    }
  },

  resolveSandboxConflict: async (runId, conflictId, resolution, content) => {
    const { useMockMode, activeRun, runConflicts } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.resolveSandboxConflict(runId, conflictId, resolution, content);
        if (res.code === 0 && res.data) {
          await get().loadSandboxRunDetail(runId);
          await get().loadSandboxFiles(runId);
          await get().loadSandboxConflicts(runId);
        }
      } catch (e) {
        console.error('[Store] 解决冲突失败', e);
      }
    } else {
      // Mock resolve simulation
      const conflict = runConflicts.find(c => c.id === conflictId);
      if (!conflict || !activeRun) return;

      const resolvedContent = resolution === 'current'
        ? '# Original Content\nThis was preserved.'
        : resolution === 'incoming'
          ? conflict.incomingContent
          : (content || '');

      // Mark conflict as resolved
      const nextConflicts = runConflicts.map(c =>
        c.id === conflictId
          ? { ...c, status: 'resolved' as const, resolution }
          : c
      );

      set(state => ({
        runConflicts: nextConflicts,
        runFileContents: {
          ...state.runFileContents,
          [conflict.filePath]: resolvedContent
        }
      }));

      // Simulate step-3 complete, step-4 start after conflict resolution
      setTimeout(() => {
        if (get().activeRun?.id !== runId) return;
        
        const currentSteps = activeRun.steps.map((s: any) => {
          if (s.id === 'step-3') {
            return {
              ...s,
              status: 'completed' as const,
              description: '写入源文件已完成',
              log: s.log + `[System] Conflict resolved via resolution=${resolution}.\n[Agent: Claude Code] File README.md resolved and written.\n`
            };
          }
          if (s.id === 'step-4') {
            return {
              ...s,
              status: 'running' as const,
              log: '[Agent: Codex] Starting compilation and test script execution...\n'
            };
          }
          return s;
        });

        const currentNodes = activeRun.dag.nodes.map((n: any) => {
          if (n.id === 'step-3') return { ...n, status: 'completed' as const };
          if (n.id === 'step-4') return { ...n, status: 'running' as const };
          return n;
        });

        const mockFiles = [
          {
            id: 'file-readme',
            sandboxId: activeRun.sandboxId,
            runId,
            path: conflict.filePath,
            contentHash: 'hash-resolved',
            currentVersion: 2,
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime()
          }
        ];

        set(state => ({
          activeRun: state.activeRun ? {
            ...state.activeRun,
            status: 'running' as const,
            steps: currentSteps,
            dag: { nodes: currentNodes },
            files: mockFiles,
            conflicts: []
          } : null,
          runFiles: mockFiles,
          runConflicts: []
        }));

        // Finally step 4 completes
        setTimeout(() => {
          if (get().activeRun?.id !== runId) return;
          const finalSteps = currentSteps.map((s: any) => {
            if (s.id === 'step-4') {
              return {
                ...s,
                status: 'completed' as const,
                log: s.log + '[Agent: Codex] Compilation success. Test scripts: OK.\n[System] Sandbox V1 complete.\n'
              };
            }
            return s;
          });

          const finalNodes = currentNodes.map((n: any) => {
            if (n.id === 'step-4') return { ...n, status: 'completed' as const };
            return n;
          });

          set(state => ({
            activeRun: state.activeRun ? {
              ...state.activeRun,
              status: 'completed' as const,
              steps: finalSteps,
              dag: { nodes: finalNodes },
              finishedAt: getCurrentFullTime()
            } : null
          }));
        }, 2000);

      }, 1000);
    }
  },

  cancelSandboxRun: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.cancelSandboxRun(runId);
        if (res.code === 0 && res.data) {
          set({ activeRun: res.data });
        }
      } catch (e) {
        console.error('[Store] 取消沙箱失败', e);
      }
    } else {
      set(state => {
        if (!state.activeRun || state.activeRun.id !== runId) return {};
        return {
          activeRun: {
            ...state.activeRun,
            status: 'cancelled' as const,
            finishedAt: getCurrentFullTime()
          }
        };
      });
    }
  },

  setWorkspaceSearchKeyword: (keyword) => set({ workspaceSearchKeyword: keyword }),

  selectWorkspace: async () => {
    set({ workspaceStatus: 'loading' });
    try {
      const res = await platform.dialog.selectDirectory();
      if (res.success && res.path) {
        const setRes = await platform.workspace.setCurrent(res.path);
        if (setRes.success && setRes.workspace) {
          set({
            currentWorkspace: setRes.workspace,
            workspaceStatus: 'active'
          });
          await get().scanWorkspace();
          // Load recent list
          const recentRes = await platform.workspace.getRecent();
          if (recentRes.success) {
            set({ recentWorkspaces: recentRes.workspaces });
          }
        } else {
          set({ workspaceStatus: 'error' });
        }
      } else {
        set({ workspaceStatus: get().currentWorkspace ? 'active' : 'none' });
      }
    } catch (e) {
      console.error('Select workspace error:', e);
      set({ workspaceStatus: 'error' });
    }
  },

  scanWorkspace: async () => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;
    try {
      const res = await platform.workspace.scanFiles(currentWorkspace.path);
      if (res.success && res.files) {
        set({ workspaceFiles: res.files });
      }
    } catch (e) {
      console.error('Scan workspace files error:', e);
    }
  },

  clearWorkspace: async () => {
    try {
      await platform.workspace.clearCurrent();
      set({
        currentWorkspace: null,
        workspaceStatus: 'none',
        workspaceFiles: [],
        selectedWorkspaceFilePath: null,
        selectedWorkspaceFileContent: null,
        workspaceContextFiles: []
      });
    } catch (e) {
      console.error('Clear workspace error:', e);
    }
  },

  removeRecentWorkspace: async (workspacePath) => {
    try {
      await platform.workspace.removeRecent(workspacePath);
      const recentRes = await platform.workspace.getRecent();
      if (recentRes.success) {
        set({ recentWorkspaces: recentRes.workspaces });
      }
    } catch (e) {
      console.error('Remove recent workspace error:', e);
    }
  },

  setSelectedWorkspaceFilePath: (path) => {
    set({ selectedWorkspaceFilePath: path });
    if (path) {
      get().loadWorkspaceFileContent(path);
    } else {
      set({ selectedWorkspaceFileContent: null });
    }
  },

  loadWorkspaceFileContent: async (path) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return '';
    try {
      const fullPath = (path.startsWith('/') || path.includes(':')) ? path : `${currentWorkspace.path}/${path}`;
      const res = await platform.file.readText(fullPath);
      if (res.success && res.content !== undefined) {
        set({ selectedWorkspaceFileContent: res.content });
        return res.content;
      }
      return '';
    } catch (e) {
      console.error('Load workspace file content error:', e);
      return '';
    }
  },

  addFileToContext: (path) => {
    set(state => {
      if (state.workspaceContextFiles.includes(path)) return {};
      return { workspaceContextFiles: [...state.workspaceContextFiles, path] };
    });
  },

  removeFileFromContext: (path) => {
    set(state => ({
      workspaceContextFiles: state.workspaceContextFiles.filter(p => p !== path)
    }));
  },

  clearFileContext: () => {
    set({ workspaceContextFiles: [] });
  },

  loadLocalAgents: async () => {
    try {
      const res = await platform.agentProcess.list();
      if (res.success && res.agents) {
        set({ localAgentProcesses: res.agents });
        // Initialize loading state
        const loading: Record<string, boolean> = {};
        res.agents.forEach((a: any) => {
          loading[a.id] = false;
        });
        set({ localAgentLoading: loading });
      }
    } catch (e) {
      console.error('Load local agents error:', e);
    }
  },

  startLocalAgent: async (id) => {
    set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: true } }));
    try {
      const res = await platform.agentProcess.start(id);
      if (res.success) {
        await get().loadLocalAgents();
        const agent = get().localAgentProcesses.find(a => a.id === id);
        if (agent) {
          await platform.notification.show({
            title: '本地 Agent 正在启动',
            body: `${agent.name} 正在后台启动中...`
          });
        }
      }
    } catch (e) {
      console.error('Start agent error:', e);
    } finally {
      setTimeout(async () => {
        set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: false } }));
        await get().loadLocalAgents();
      }, 2000);
    }
  },

  stopLocalAgent: async (id) => {
    set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: true } }));
    try {
      const res = await platform.agentProcess.stop(id);
      if (res.success) {
        await get().loadLocalAgents();
      }
    } catch (e) {
      console.error('Stop agent error:', e);
    } finally {
      setTimeout(async () => {
        set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: false } }));
        await get().loadLocalAgents();
      }, 1000);
    }
  },

  restartLocalAgent: async (id) => {
    set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: true } }));
    try {
      const res = await platform.agentProcess.restart(id);
      if (res.success) {
        await get().loadLocalAgents();
      }
    } catch (e) {
      console.error('Restart agent error:', e);
    } finally {
      setTimeout(async () => {
        set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: false } }));
        await get().loadLocalAgents();
      }, 3000);
    }
  },

  loadLocalAgentLogs: async (id) => {
    try {
      const res = await platform.agentProcess.logs(id);
      if (res.success && res.logs) {
        set(state => ({
          localAgentLogs: { ...state.localAgentLogs, [id]: res.logs || [] }
        }));
      }
    } catch (e) {
      console.error('Load agent logs error:', e);
    }
  },

  applyArtifactToLocal: async (artifactId, versionId, targetPath, autoOverwrite = false) => {
    const artifact = get().artifacts.find(a => a.id === artifactId);
    if (!artifact) return { success: false, error: 'Artifact not found' };

    const versions = get().artifactVersions[artifactId] || [];
    const version = versions.find(v => v.id === versionId || String(v.version) === String(versionId));
    if (!version) return { success: false, error: 'Artifact version not found' };

    const { currentWorkspace } = get();
    let absolutePath = targetPath;
    if (currentWorkspace && !targetPath.startsWith('/') && !targetPath.includes(':')) {
      absolutePath = `${currentWorkspace.path}/${targetPath}`;
    }

    try {
      if (!autoOverwrite) {
        const fileExists = await platform.file.readText(absolutePath);
        if (fileExists.success) {
          return { success: false, conflict: true };
        }
      }

      const writeRes = await platform.file.writeText(absolutePath, version.content);
      if (writeRes.success) {
        await platform.notification.artifactApplied(targetPath);
        
        if (get().activeConversationId) {
          const sysMsg: Message = {
            id: createId('msg'),
            conversationId: get().activeConversationId!,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: `📁已成功应用 Artifact "${artifact.title}" (v${version.version}) 到本地路径: \`${targetPath}\``,
            createdAt: getCurrentFullTime()
          };
          set(state => ({
            messages: [...state.messages, sysMsg]
          }));
        }

        get().addDesktopNotification(
          '文件写入成功',
          `Artifact ${artifact.title} 已写入 ${targetPath}`,
          'success'
        );

        return { success: true };
      } else {
        return { success: false, error: writeRes.error || '写入文件失败' };
      }
    } catch (e: any) {
      return { success: false, error: e.message || '操作失败' };
    }
  },

  addDesktopNotification: (title, body, type) => {
    const newNotification = {
      id: createId('notif'),
      title,
      body,
      timestamp: getCurrentFullTime(),
      type,
      isRead: false
    };
    set(state => ({
      desktopNotifications: [newNotification, ...state.desktopNotifications]
    }));
  },

  markNotificationAsRead: (id) => {
    set(state => ({
      desktopNotifications: state.desktopNotifications.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      )
    }));
  },

  clearNotifications: () => {
    set({ desktopNotifications: [] });
  },

}));
