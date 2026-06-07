import { create } from 'zustand';
import { Message, AgentStatus, PinItem, MemoryItem, ContextUsage, Artifact, ArtifactVersion, SendMessageRequest, MessageAttachment } from '@/types';
import { messageApi } from '@/api/messageApi';
import { artifactApi } from '@/api/artifactApi';
import { conversationApi } from '@/api/conversationApi';
import { attachmentApi } from '@/api/attachmentApi';
import { wsClient } from '@/services/ws';
import type {
  ChunkEvent,
  CompletedEvent,
  ThinkingStartedEvent,
  UserCreatedEvent,
  AllTasksCompletedEvent,
  AgentStatusChangedEvent,
  ArtifactCreatedEvent,
} from '@/types';

interface MessageState {
  messages: Message[];
  /** 当前会话的产物列表 */
  artifacts: Artifact[];
  /** 以 artifactId 为 key 的版本映射 */
  artifactVersions: Record<string, ArtifactVersion[]>;
  /** 已 pin 消息列表 */
  pins: PinItem[];
  /** 长期记忆列表 */
  memories: MemoryItem[];
  /** 上下文使用情况 */
  contextUsage: ContextUsage | null;
  loading: boolean;
  /** 是否正在加载更多历史消息 */
  loadingMore: boolean;
  /** 当前会话是否还有更早的历史消息 */
  hasMore: boolean;
  /** 当前会话的游标（最后一条消息的 id），用于加载下一页 */
  cursor: string | null;
  isStreaming: boolean;
  isWebSocketConnected: boolean;
  /** Map<agentId, status> */
  agentStatusMap: Record<string, AgentStatus>;

  // === Data fetching ===
  fetchMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: (conversationId: string) => Promise<void>;
  /** 统一加载会话的所有关联数据：消息 + pin + 记忆 + 上下文使用 + 产物 */
  loadConversationData: (conversationId: string) => Promise<void>;

  // === Artifacts ===
  loadArtifacts: (conversationId: string) => Promise<void>;
  loadArtifactContent: (artifactId: string) => Promise<ArtifactVersion[]>;

  // === Send ===
  sendMessage: (
    conversationId: string,
    content: string,
    attachments?: MessageAttachment[],
    targetAgentId?: string,
    webSearchMode?: 'auto' | 'force' | 'off',
    quotedMessageId?: string
  ) => Promise<void>;

  // === Pin & Memory ===
  togglePinMessage: (conversationId: string, messageId: string) => Promise<void>;
  deleteMemory: (conversationId: string, memoryId: string) => Promise<void>;

  // === WebSocket lifecycle ===
  connectWS: (token: string) => Promise<void>;
  disconnectWS: () => void;
  subscribeConversation: (conversationId: string) => void;
  unsubscribeConversation: (conversationId: string) => void;

  // === Agent status ===
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
}

/** Get current timestamp in ISO-like format */
const now = () => new Date().toISOString();

/** Store WS unsubscribers so they can be cleaned up on disconnect */
let wsUnsubscribers: (() => void)[] = [];

function registerWSEventHandlers() {
  // Clean up previous
  wsUnsubscribers.forEach((fn) => fn());
  wsUnsubscribers = [];

  // 1. User message confirmed by server
  wsUnsubscribers.push(
    wsClient.on<UserCreatedEvent>('conversation.message.user_created', (event) => {
      const { message } = event.data;
      useMessageStore.setState((state) => {
        // Replace the first optimistic user message (id starts with 'client_')
        const optimisticIndex = state.messages.findIndex(
          (m) => m.id.startsWith('client_') && m.role === 'user'
        );
        if (optimisticIndex > -1) {
          const updated = [...state.messages];
          updated[optimisticIndex] = {
            ...message,
            quotedMessage:
              state.messages[optimisticIndex].quotedMessage || message.quotedMessage,
          };
          return { messages: updated, isStreaming: true };
        }
        if (!state.messages.some((m) => m.id === message.id)) {
          return { messages: [...state.messages, message], isStreaming: true };
        }
        return { isStreaming: true };
      });
    })
  );

  // 2. Agent thinking started — show placeholder
  wsUnsubscribers.push(
    wsClient.on<ThinkingStartedEvent>('agent.thinking.started', (event) => {
      const { agentId, agentName, conversationId: convId } = event.data;
      useMessageStore.setState((state) => {
        const thinkingMsg: Message = {
          id: `thinking-${agentId}`,
          conversationId: convId || state.messages[0]?.conversationId || '',
          senderId: agentId,
          senderName: agentName,
          role: 'agent',
          type: 'status',
          content: '正在思考...',
          createdAt: now(),
          metadata: { readOnly: true },
        };
        if (state.messages.some((m) => m.id === thinkingMsg.id)) {
          return {};
        }
        return { messages: [...state.messages, thinkingMsg] };
      });
    })
  );

  // 3. Streaming chunk — append or create
  wsUnsubscribers.push(
    wsClient.on<ChunkEvent>('conversation.message.chunk', (event) => {
      const { messageId, senderId, senderName, role, chunk, messageType, language } = event.data;
      useMessageStore.setState((state) => {
        const existingIndex = state.messages.findIndex((m) => m.id === messageId);
        if (existingIndex > -1) {
          const updated = [...state.messages];
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: updated[existingIndex].content + chunk,
          };
          return { messages: updated };
        }
        // First chunk — remove thinking placeholder
        const filtered = state.messages.filter((m) => m.id !== `thinking-${senderId}`);
        const newMsg: Message = {
          id: messageId,
          conversationId: state.messages[0]?.conversationId || '',
          senderId,
          senderName,
          role: role as any,
          type: (messageType as any) || 'text',
          content: chunk,
          language,
          createdAt: now(),
        };
        return { messages: [...filtered, newMsg] };
      });
    })
  );

  // 4. Message completed
  wsUnsubscribers.push(
    wsClient.on<CompletedEvent>('conversation.message.completed', (event) => {
      const { fullMessage } = event.data;
      useMessageStore.setState((state) => {
        let updated = state.messages.map((m) =>
          m.id === fullMessage.id ? { ...m, ...fullMessage } : m
        );
        if (!state.messages.some((m) => m.id === fullMessage.id)) {
          updated = [...updated, fullMessage];
        }
        updated = updated.filter((m) => m.id !== `thinking-${fullMessage.senderId}`);
        return { messages: updated };
      });
    })
  );

  // 5. Agent status changed
  wsUnsubscribers.push(
    wsClient.on<AgentStatusChangedEvent>('agent.status.changed', (event) => {
      const { agentId, newStatus } = event.data;
      useMessageStore.setState((state) => ({
        agentStatusMap: { ...state.agentStatusMap, [agentId]: newStatus },
      }));
    })
  );

  // 6. All tasks completed
  wsUnsubscribers.push(
    wsClient.on<AllTasksCompletedEvent>('conversation.all_tasks.completed', (event) => {
      const { conversationId, summary, artifacts: completedArtifacts, runId } = event.data;
      useMessageStore.setState((state) => {
        // Reset all thinking agents to online
        const nextStatusMap: Record<string, AgentStatus> = { ...state.agentStatusMap };
        for (const key of Object.keys(nextStatusMap)) {
          if (nextStatusMap[key] === 'thinking') {
            nextStatusMap[key] = 'online';
          }
        }

        // 处理完成事件携带的产物
        let updatedArtifacts = state.artifacts;
        if (completedArtifacts && completedArtifacts.length > 0) {
          const currentIds = new Set(state.artifacts.map((a) => a.id));
          const newOnes = completedArtifacts
            .map((raw: any) => {
              if (!raw || !raw.id) return null;
              // 将后端返回的原始数据规整为 Artifact
              const artItem: Artifact = {
                id: raw.id,
                artifactId: raw.artifactId || raw.id,
                conversationId: conversationId || '',
                runId: runId || raw.runId,
                title: raw.title || '未命名产物',
                type: raw.type || 'code',
                currentVersionId: raw.currentVersionId || '',
                latestVersion: raw.latestVersion || 1,
                createdAt: raw.createdAt || new Date().toISOString(),
                updatedAt: raw.updatedAt || new Date().toISOString(),
                description: raw.description,
                tags: raw.tags,
                metadata: raw.metadata,
                filePath: raw.filePath,
                mimeType: raw.mimeType,
                size: raw.size,
                contentPreview: raw.contentPreview,
                previewable: raw.previewable,
              };
              return currentIds.has(artItem.id) ? null : artItem;
            })
            .filter(Boolean) as Artifact[];
          updatedArtifacts = [...state.artifacts, ...newOnes];
        }

        const systemMsg: Message = {
          id: `system-completed-${Date.now()}`,
          conversationId,
          senderId: 'system',
          senderName: '系统',
          role: 'system',
          type: 'status',
          content: summary || '所有任务已完成',
          createdAt: now(),
        };
        return {
          messages: [...state.messages, systemMsg],
          isStreaming: false,
          agentStatusMap: nextStatusMap,
          artifacts: updatedArtifacts,
        };
      });
    })
  );

  // 7. Artifact created — add to store
  wsUnsubscribers.push(
    wsClient.on<ArtifactCreatedEvent>('artifact.created', (event) => {
      const { artifact, conversationId: convId, runId } = event.data;
      console.log('[MessageStore] Artifact created via WS:', artifact?.title);

      if (!artifact || !artifact.id) return;

      // 标准化 artifact 对象
      const artItem: Artifact = {
        id: artifact.id,
        artifactId: artifact.artifactId || artifact.id,
        conversationId: convId || '',
        runId: runId || artifact.runId,
        title: artifact.title || '未命名产物',
        type: artifact.type || 'code',
        currentVersionId: artifact.currentVersionId || '',
        latestVersion: artifact.latestVersion || 1,
        createdAt: artifact.createdAt || new Date().toISOString(),
        updatedAt: artifact.updatedAt || new Date().toISOString(),
        description: artifact.description,
        tags: artifact.tags,
        metadata: artifact.metadata,
        filePath: artifact.filePath,
        mimeType: artifact.mimeType,
        size: artifact.size,
        contentPreview: artifact.contentPreview,
        previewable: artifact.previewable,
      };

      useMessageStore.setState((state) => {
        // 去重
        if (state.artifacts.some((a) => a.id === artItem.id)) {
          return {};
        }
        return { artifacts: [...state.artifacts, artItem] };
      });
    })
  );

  // 8. Error events
  wsUnsubscribers.push(
    wsClient.on<any>('error', (event) => {
      const { code, message } = event.data || {};
      if (code === 40002) {
        useMessageStore.setState((state) => {
          const reversed = [...state.messages].reverse();
          const lastUserIdx = reversed.findIndex(
            (m) => m.senderId === 'user' || m.role === 'user'
          );
          if (lastUserIdx > -1) {
            const actualIdx = state.messages.length - 1 - lastUserIdx;
            const updated = [...state.messages];
            updated.splice(actualIdx, 1);
            return { messages: updated, isStreaming: false };
          }
          return { isStreaming: false };
        });
      }
    })
  );
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  artifacts: [],
  artifactVersions: {},
  pins: [],
  memories: [],
  contextUsage: null,
  loading: false,
  loadingMore: false,
  hasMore: true,
  cursor: null,
  isStreaming: false,
  isWebSocketConnected: false,
  agentStatusMap: {},

  // ---------------------------------------------------------------------------
  // Data fetching — cursor-based pagination
  // ---------------------------------------------------------------------------

  /** 首次加载 / 刷新：获取最新一页消息 */
  fetchMessages: async (conversationId: string) => {
    set({ loading: true, hasMore: true, cursor: null });
    try {
      const data = await messageApi.getMessages(conversationId, { limit: 20 });
      const list = data.list || [];
      const nextCursor = data.nextCursor || (list.length > 0 ? list[list.length - 1].id : null);

      set({
        messages: list.slice().reverse(), // ASC order for FlatList
        hasMore: data.hasMore,
        cursor: nextCursor,
      });
    } catch (error) {
      console.warn('[MessageStore] fetchMessages failed', error);
      set({ hasMore: false });
    } finally {
      set({ loading: false });
    }
  },

  /** 进入会话时统一加载所有关联数据
   * 并发: 消息 / pin / 记忆 / 上下文使用 / 产物
   */
  loadConversationData: async (conversationId: string) => {
    set({ loading: true });

    const [msgResult, pinsResult, memoriesResult, contextResult, artifactsResult] = await Promise.all([
      messageApi.getMessages(conversationId, { limit: 20 }).catch(() => null),
      conversationApi.getPins(conversationId).catch(() => [] as PinItem[]),
      conversationApi.getMemories(conversationId).catch(() => [] as MemoryItem[]),
      conversationApi.getContextUsage(conversationId).catch(() => null),
      artifactApi.getArtifactMetaList(conversationId).catch(() => [] as Artifact[]),
    ]);

    let messagesData: Message[] = [];
    let hasMore = true;
    let cursor: string | null = null;

    if (msgResult) {
      messagesData = msgResult.list || [];
      hasMore = msgResult.hasMore;
      cursor = msgResult.nextCursor || (messagesData.length > 0 ? messagesData[messagesData.length - 1].id : null);
    }

    const pinMessageIds = new Set(pinsResult.map((p) => p.messageId));
    const messagesWithPin = messagesData.map((m) => ({
      ...m,
      isPinned: pinMessageIds.has(m.id) || m.isPinned,
    }));

    set({
      messages: messagesWithPin.slice().reverse(),
      artifacts: artifactsResult || [],
      pins: pinsResult,
      memories: memoriesResult,
      contextUsage: contextResult,
      hasMore,
      cursor,
      loading: false,
    });
  },

  /** 滚动到底部时加载更早的历史消息 */
  loadMoreMessages: async (conversationId: string) => {
    const state = get();
    if (state.loadingMore || !state.hasMore || !state.cursor) return;

    set({ loadingMore: true });
    try {
      const data = await messageApi.getMessages(conversationId, {
        limit: 20,
        beforeId: state.cursor,
      });

      const newMessages = data.list || [];
      if (newMessages.length === 0) {
        set({ hasMore: false, loadingMore: false });
        return;
      }

      const nextCursor = data.nextCursor || newMessages[newMessages.length - 1].id;

      set((prev) => ({
        // 旧消息追加到头部（更旧的在最前），因为数据是 DESC 顺序（最新在前）
        messages: [
          ...newMessages.slice().reverse(),
          ...prev.messages,
        ],
        hasMore: data.hasMore,
        cursor: nextCursor,
        loadingMore: false,
      }));
    } catch (error) {
      console.warn('[MessageStore] loadMoreMessages failed', error);
      set({ loadingMore: false });
    }
  },

  // ---------------------------------------------------------------------------
  // Artifact — 产物加载
  // ---------------------------------------------------------------------------

  /** 获取当前会话的产物元数据列表 */
  loadArtifacts: async (conversationId: string) => {
    try {
      const list = await artifactApi.getArtifactMetaList(conversationId);
      set({ artifacts: list });
    } catch (error) {
      console.warn('[MessageStore] loadArtifacts failed', error);
    }
  },

  /** 获取产物的所有版本并缓存到 artifactVersions map */
  loadArtifactContent: async (artifactId: string) => {
    try {
      const versions = await artifactApi.getArtifactVersions(artifactId);
      set((state) => ({
        artifactVersions: { ...state.artifactVersions, [artifactId]: versions },
      }));
      return versions;
    } catch (error) {
      console.warn('[MessageStore] loadArtifactContent failed', error);
      return [];
    }
  },

  // ---------------------------------------------------------------------------
  // Send message — HTTP POST + WS streaming
  // ---------------------------------------------------------------------------
  sendMessage: async (
    conversationId: string,
    content: string,
    attachments?: MessageAttachment[],
    targetAgentId?: string,
    webSearchMode?: 'auto' | 'force' | 'off',
    quotedMessageId?: string
  ) => {
    const clientMsgId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const messagesList = get().messages;
    const quotedMsg = quotedMessageId ? messagesList.find((m) => m.id === quotedMessageId) : null;

    const userMessage: Message = {
      id: clientMsgId,
      conversationId,
      senderId: 'user',
      senderName: '我',
      role: 'user',
      type: 'text',
      content,
      createdAt: now(),
      attachments,
      quotedMessage: quotedMsg
        ? {
            id: quotedMsg.id,
            senderName: quotedMsg.senderName,
            content: quotedMsg.content,
          }
        : undefined,
    };

    // Optimistically add user message
    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
    }));

    try {
      let finalAttachments = attachments || [];
      const filesToUpload = finalAttachments.filter((a) => a.file || (a as any).uri);

      if (filesToUpload.length > 0) {
        const uploadResponse = await attachmentApi.uploadAttachmentBatch(
          conversationId,
          filesToUpload.map((f) => ({
            uri: f.file?.uri || (f as any).uri || '',
            name: f.name,
            type: f.file?.type || f.mimeType || 'application/octet-stream',
          }))
        );

        if (uploadResponse.code === 0 && uploadResponse.data && uploadResponse.data.results) {
          const uploadedList: MessageAttachment[] = [];
          uploadResponse.data.results.forEach((res) => {
            if (res.ok && res.attachment) {
              uploadedList.push(res.attachment);
            }
          });
          finalAttachments = uploadedList;
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === clientMsgId ? { ...m, attachments: uploadedList } : m
            ),
          }));
        } else {
          throw new Error(uploadResponse.message || '文件上传失败');
        }
      }

      const requestPayload: SendMessageRequest = {
        content,
        targetAgentId,
        quotedMessageId,
        attachments: finalAttachments.map((a) => ({
          id: a.id,
          attachmentId: a.id,
        })),
        webSearchMode,
      };

      const payload = await messageApi.sendMessage(conversationId, requestPayload);
      const { userMessage: serverUserMsg, agentMessages, artifacts: responseArtifacts } = payload;

      // 处理返回的产物元数据
      if (responseArtifacts && responseArtifacts.length > 0) {
        set((state) => {
          const currentIds = new Set(state.artifacts.map((a) => a.id));
          const newArtifacts = responseArtifacts.filter((a: any) => !currentIds.has(a.id));
          return { artifacts: [...state.artifacts, ...newArtifacts] };
        });
      }

      set((state) => {
        const filtered = state.messages.filter((m) => m.id !== clientMsgId);
        const finalUserMsg = serverUserMsg || { ...userMessage, attachments: finalAttachments };

        let merged = [...filtered, finalUserMsg];
        for (const agentMsg of agentMessages) {
          merged = merged.filter((m) => m.id !== `thinking-${agentMsg.senderId}`);
          if (!merged.some((m) => m.id === agentMsg.id)) {
            merged.push(agentMsg);
          }
        }

        return {
          messages: merged,
          isStreaming: false,
        };
      });
    } catch (error: any) {
      console.error('[MessageStore] sendMessage failed', error);
      const agentMessage: Message = {
        id: 'mock_' + Date.now(),
        conversationId,
        senderId: 'agent',
        senderName: 'AI助手',
        role: 'agent',
        type: 'text',
        content: `发送消息失败: ${error?.message || error || '未知错误'}`,
        createdAt: now(),
      };

      set((state) => ({
        messages: state.messages
          .map((m) =>
            m.id === clientMsgId
              ? {
                  ...m,
                  attachments: m.attachments?.map((a) => ({ ...a, uploadError: '上传失败' })),
                }
              : m
          )
          .concat(agentMessage),
        isStreaming: false,
      }));
    }
  },

  // ---------------------------------------------------------------------------
  // Pin messages
  // ---------------------------------------------------------------------------
  togglePinMessage: async (conversationId: string, messageId: string) => {
    const targetMsg = get().messages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    const nextPinState = !targetMsg.isPinned;

    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, isPinned: nextPinState } : m
      ),
    }));

    try {
      if (nextPinState) {
        await conversationApi.pinMessage(conversationId, messageId);
      } else {
        await conversationApi.unpinMessage(conversationId, messageId);
      }
    } catch {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, isPinned: !nextPinState } : m
        ),
      }));
    }
  },

  // ---------------------------------------------------------------------------
  // Delete memory
  // ---------------------------------------------------------------------------
  deleteMemory: async (conversationId: string, memoryId: string) => {
    try {
      await conversationApi.deleteMemory(conversationId, memoryId);
    } catch {
      // ignore — optimistic remove below
    }
    set((state) => ({
      memories: state.memories.filter((m) => m.id !== memoryId),
    }));
  },

  // ---------------------------------------------------------------------------
  // WebSocket lifecycle
  // ---------------------------------------------------------------------------
  connectWS: async (token: string) => {
    if (get().isWebSocketConnected) return;

    try {
      await wsClient.connectWithToken(token);
      set({ isWebSocketConnected: true });
      registerWSEventHandlers();
    } catch (error) {
      console.warn('[MessageStore] WS connect failed, using HTTP-only mode', error);
      set({ isWebSocketConnected: false });
    }
  },

  disconnectWS: () => {
    wsUnsubscribers.forEach((fn) => fn());
    wsUnsubscribers = [];
    wsClient.disconnect();
    set({ isWebSocketConnected: false });
  },

  subscribeConversation: (conversationId: string) => {
    if (wsClient.isConnected()) {
      wsClient.send('conversation.subscribe', { conversationId });
    }
  },

  unsubscribeConversation: (conversationId: string) => {
    if (wsClient.isConnected()) {
      wsClient.send('conversation.unsubscribe', { conversationId });
    }
  },

  // ---------------------------------------------------------------------------
  // Agent status
  // ---------------------------------------------------------------------------
  updateAgentStatus: (agentId: string, status: AgentStatus) => {
    set((state) => ({
      agentStatusMap: { ...state.agentStatusMap, [agentId]: status },
    }));
  },
}));
