import { create } from 'zustand';
import { Conversation, Message, Agent, Artifact, CreateConversationPayload } from '@/types';
import { getAgentList, updateAgentDetail } from '@/services/http/agentService';
import { getConversationList, createConversation as createConversationApi, updateConversation } from '@/services/http/conversationService';
import { getMessageList } from '@/services/http/messageService';
import { getArtifactMetaList, getArtifactDetail } from '@/services/http/artifactService';
import wsClient from '@/services/ws/wsClient';
import { mockConversations, mockMessages, mockAgents as initialAgents, mockArtifacts } from '@/mock';
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
  
  loadConversationData: (convId: string) => Promise<void>;
  createConversation: (payload: CreateConversationPayload) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  saveAgent: (agent: Agent) => Promise<void>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  loadArtifactContent: (artifactId: string) => Promise<void>;
  
  connectWS: () => Promise<void>;
  disconnectWS: () => void;
}

export const useAgentHubStore = create<AgentHubStore>((set, get) => ({
  conversations: [],
  agents: [],
  messages: [],
  artifacts: [],
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
    });
    if (id) {
      await get().loadConversationData(id);
    } else {
      set({ messages: [], artifacts: [] });
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
      set({
        messages: activeMsgs,
        artifacts: activeArts,
      });
      if (activeArts.length > 0) {
        set({ selectedArtifactId: activeArts[0].id });
      }
      return;
    }

    try {
      const msgRes = await getMessageList(convId);
      if (msgRes.code === 0) {
        set({ messages: msgRes.data.list });
      }
      const artifactRes = await getArtifactMetaList(convId);
      if (artifactRes.code === 0) {
        const arts: Artifact[] = artifactRes.data.map(meta => ({
          ...meta,
          content: '',
        }));
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

  sendMessage: async (content) => {
    const { activeConversationId, useMockMode, conversations, agents } = get();
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
    };

    set(state => ({
      messages: [...state.messages, newUserMessage],
      conversations: state.conversations.map(c =>
        c.id === activeConversationId
          ? { ...c, lastMessage: content, updatedAt: getCurrentFullTime() }
          : c
      ),
      isProcessing: true,
    }));

    if (useMockMode) {
      const replyResult = generateMockReply({
        conversation: activeConv,
        agents,
        userContent: content,
      });

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Filter messages and artifacts based on mention
      let messagesToStream = replyResult.messages;
      let artifactsToStream = replyResult.artifacts;

      const mentionedAgent = agents.find(a => content.includes(`@${a.name}`));
      if (mentionedAgent && activeConv.mode === 'group') {
        messagesToStream = replyResult.messages.filter(msg =>
          msg.role === 'orchestrator' || msg.senderId === mentionedAgent.id
        );
        if (mentionedAgent.id.includes('code') || mentionedAgent.id.includes('codex') || mentionedAgent.id.includes('claude')) {
          artifactsToStream = replyResult.artifacts.filter(a => a.type === 'code');
        } else if (mentionedAgent.id.includes('doc')) {
          artifactsToStream = replyResult.artifacts.filter(a => a.type === 'markdown');
        } else {
          artifactsToStream = [];
        }
      }

      (async () => {
        for (const msg of messagesToStream) {
          if (msg.type === 'text' || msg.type === 'code') {
            // 1. Set agent status to thinking and append a temporary status message
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

            // 2. Remove temporary status message and append streaming shell
            const streamMessageId = msg.id;
            set(state => ({
              messages: state.messages.filter(m => m.id !== `thinking-${msg.senderId}`).concat({
                ...msg,
                content: '',
              })
            }));

            // 3. Stream character content
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

            // Ensure final full content is rendered
            set(state => ({
              messages: state.messages.map(m => m.id === streamMessageId ? { ...m, content: textToStream } : m)
            }));

            // 4. Restore agent status to online
            set(state => ({
              agents: state.agents.map(a => a.id === msg.senderId ? { ...a, status: 'online' as const } : a),
            }));

            await delay(400);
          } else {
            // Non-streamable messages (status, task-plan, artifact meta messages)
            set(state => ({
              messages: [...state.messages, msg],
            }));
            await delay(600);
          }
        }

        // Add mock artifacts and load contents
        if (artifactsToStream.length > 0) {
          set(state => ({
            artifacts: [...state.artifacts, ...artifactsToStream],
            selectedArtifactId: artifactsToStream[0].id,
          }));
          await get().loadArtifactContent(artifactsToStream[0].id);
        }

        set({ isProcessing: false });
      })();
    } else {
      try {
        wsClient.send('conversation.message.create', {
          conversationId: activeConversationId,
          content,
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
    const { useMockMode, artifacts } = get();
    const art = artifacts.find(a => a.id === artifactId);
    if (art && art.content) return;

    if (useMockMode) {
      const mockArt = mockArtifacts.find(a => a.id === artifactId);
      if (mockArt) {
        set(state => ({
          artifacts: state.artifacts.map(a =>
            a.id === artifactId ? { ...a, content: mockArt.content } : a
          ),
        }));
      }
      return;
    }

    try {
      const res = await getArtifactDetail(artifactId);
      if (res.code === 0) {
        set(state => ({
          artifacts: state.artifacts.map(a =>
            a.id === artifactId ? res.data : a
          ),
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

    try {
      await wsClient.connect();
      set({ wsStatus: 'connected' });

      get().disconnectWS();

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

          const newArtifact: Artifact = {
            ...artifact,
            content: '',
          };
          return {
            artifacts: [...state.artifacts, newArtifact],
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
}));
