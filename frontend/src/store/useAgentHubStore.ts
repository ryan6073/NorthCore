import { create } from 'zustand';
import { Conversation, Message, Agent, Artifact, ArtifactVersion, CreateConversationPayload, ArtifactReference, MessageAttachment, AgentMentionItem, PinItem, MemoryItem } from '@/types';
import { getAgentList, updateAgentDetail, createAgent as createAgentApi, deleteAgent as deleteAgentApi } from '@/services/http/agentService';
import { getConversationList, createConversation as createConversationApi, updateConversation, compressContext, pinMessage, unpinMessage, getPins, getMemories, deleteMemory, deleteConversation } from '@/services/http/conversationService';
import { getMessageList, getMentionAgents as getMentionAgentsApi } from '@/services/http/messageService';
import { getArtifactMetaList, getArtifactDetail, getArtifactVersions, updateArtifactContent } from '@/services/http/artifactService';
import wsClient from '@/services/ws/wsClient';
import { mockConversations, mockMessages, mockAgents as initialAgents, mockArtifacts, mockArtifactVersions } from '@/mock';
import { createId } from '@/utils/id';
import { getCurrentFullTime } from '@/utils/time';
import { generateMockReply } from '@/utils/mockReply';
import { USE_MOCK } from '@/services';
import { healthCheck } from '@/services/http/healthService';

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
  leftSidebarViewMode: 'conversations' | 'agents' | 'agent-detail';
  useMockMode: boolean;
  wsStatus: 'connecting' | 'connected' | 'disconnected';

  // Phase 3 states
  replyContext: { id: string; senderName: string; content: string } | null;
  quoteArtifactRef: ArtifactReference | null;

  // Actions
  initStore: () => Promise<void>;
  setUseMockMode: (mode: boolean) => void;
  setActiveConversationId: (id: string | null) => Promise<void>;
  setSelectedArtifactId: (id: string | null) => void;
  setSelectedArtifactVersion: (version: number | null) => void;
  setIsNewConversationOpen: (open: boolean) => void;
  setIsFullScreenOpen: (open: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;
  setLeftSidebarViewMode: (mode: 'conversations' | 'agents' | 'agent-detail') => void;
  
  // Phase 3 Actions
  setReplyContext: (reply: { id: string; senderName: string; content: string } | null) => void;
  setQuoteArtifactRef: (ref: ArtifactReference | null) => void;
  
  loadConversationData: (convId: string) => Promise<void>;
  createConversation: (payload: CreateConversationPayload) => Promise<void>;
  getMentionAgents: (keyword?: string) => Promise<AgentMentionItem[]>;
  compressContext: () => Promise<void>;
  togglePinMessage: (messageId: string) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  saveEditedArtifact: (artifactId: string, newContent: string) => Promise<void>;
  
  sendMessage: (content: string, attachments?: MessageAttachment[], targetAgentId?: string) => Promise<void>;
  saveAgent: (agent: Agent) => Promise<void>;
  createAgent: (agent: Omit<Agent, 'id' | 'lastUsedAt'>) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  loadArtifactContent: (artifactId: string) => Promise<void>;
  
  connectWS: () => Promise<void>;
  disconnectWS: () => void;
}

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
  leftSidebarViewMode: 'conversations',
  useMockMode: USE_MOCK,
  wsStatus: 'disconnected',

  // Phase 3 states
  replyContext: null,
  quoteArtifactRef: null,

  initStore: async () => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const healthRes = await healthCheck();
        if (healthRes.code === 0) {
          console.log('[Store] 后端服务健康检查通过，启用真实 API 模式');
          const agentRes = await getAgentList();
          if (agentRes.code === 0) {
            set({ agents: agentRes.data.list as Agent[] });
          }
          const convRes = await getConversationList();
          if (convRes.code === 0) {
            const list = convRes.data.list;
            set({ conversations: list });
            if (list.length > 0) {
              set({ activeConversationId: list[0].id });
              await get().loadConversationData(list[0].id);
            }
          }
          await get().connectWS();
        }
      } catch (e) {
        console.warn('[Store] 真实 API 连接失败，自动切换到 Mock 演示模式', e);
        set({ useMockMode: true });
        set({
          conversations: mockConversations,
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
      set({
        conversations: mockConversations,
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

      let pinsData: PinItem[] = [];
      if (pinsRes.code === 0) {
        pinsData = pinsRes.data;
      }

      let memoriesData: MemoryItem[] = [];
      if (memoriesRes.code === 0) {
        memoriesData = memoriesRes.data;
      }

      let messagesData: Message[] = [];
      if (msgRes.code === 0) {
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

      if (artifactRes.code === 0) {
        const arts: Artifact[] = artifactRes.data;
        set({ artifacts: arts });
        if (arts.length > 0) {
          set({ selectedArtifactId: arts[0].id });
          await get().loadArtifactContent(arts[0].id);
        }
      }
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
          set(state => ({ conversations: [...state.conversations, res.data] }));
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
        conversations: [...state.conversations, newConv],
      }));
      await get().setActiveConversationId(newConv.id);
    }
  },

  getMentionAgents: async (keyword) => {
    const { activeConversationId, useMockMode, agents } = get();
    if (!activeConversationId) return [];
    
    if (!useMockMode) {
      try {
        const res = await getMentionAgentsApi(activeConversationId, keyword ? { keyword } : undefined);
        if (res.code === 0) {
          return res.data;
        }
      } catch (e) {
        console.warn('[Store] getMentionAgents API 调用失败，返回 Mock 列表', e);
      }
    }
    
    const mockItems: AgentMentionItem[] = agents
      .filter(a => !a.category.includes('orchestrator') && a.enabled)
      .filter(a => !keyword || a.name.toLowerCase().includes(keyword.toLowerCase()))
      .map(a => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        description: a.description,
        tags: a.tags,
        status: a.status === 'online' ? 'online' : 'offline',
      }));
    return mockItems;
  },

  compressContext: async () => {
    const { activeConversationId, useMockMode, messages } = get();
    if (!activeConversationId) return;

    let result;

    if (!useMockMode) {
      try {
        const res = await compressContext(activeConversationId);
        if (res.code === 0) {
          result = res.data;
        } else {
          throw new Error('压缩接口返回失败');
        }
      } catch (e) {
        console.warn('[Store] compressContext API 调用失败，使用 Mock 压缩结果演示', e);
        const originalMessageCount = messages.length;
        result = {
          summary: {
            id: 'summary-mock',
            conversationId: activeConversationId,
            summary: `系统已自动压缩 ${originalMessageCount} 条历史消息，保留关键上下文信息，Token 占用已显著减少。`,
            coveredUntilMessageId: messages[messages.length - 1]?.id || '',
            coveredMessageCount: originalMessageCount,
            version: 1,
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime(),
          },
          compressed: true,
        };
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
      };
    }

    const systemMsg: Message = {
      id: createId('msg'),
      conversationId: activeConversationId,
      senderId: 'system',
      senderName: '系统',
      role: 'system',
      type: 'status',
      content: `✅ 上下文已压缩\n\n📊 原始覆盖消息数：${result.summary.coveredMessageCount}\n📝 摘要：${result.summary.summary}`,
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      messages: [...state.messages, systemMsg],
    }));

    console.log('[Store] 上下文压缩完成，已添加系统通知消息');
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
        wsClient.send('conversation.message.create', {
          conversationId: activeConversationId,
          content,
          quotedMessageId: replyContext?.id,
          artifactRef: quoteArtifactRef || undefined,
          attachments,
          targetAgentId,
        });
      } catch (e) {
        console.error('[Store] 发送 WS 消息失败', e);
        set({ isProcessing: false });
      }
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
        const { conversationId, summary } = event.data;
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

          return {
            messages: [...state.messages, systemMsg],
            agents: updatedAgents,
            isProcessing: false,
          };
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
  },
}));
