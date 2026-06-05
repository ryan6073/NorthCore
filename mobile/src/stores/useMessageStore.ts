import { create } from 'zustand';
import { Message } from '@/types';
import { messageApi } from '@/api/messageApi';
import { conversationApi } from '@/api/conversationApi';

interface MessageState {
  messages: Message[];
  loading: boolean;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  togglePinMessage: (conversationId: string, messageId: string) => Promise<void>;
}

const mockMessages: Message[] = [
  {
    id: '1',
    conversationId: '1',
    senderId: 'user',
    senderName: '我',
    role: 'user',
    type: 'text',
    content: '请帮我写一个 React Native 的组件',
    createdAt: '2024-01-15 10:28:00',
    isPinned: true,
  },
  {
    id: '2',
    conversationId: '1',
    senderId: 'agent',
    senderName: '代码助手',
    role: 'agent',
    type: 'text',
    content: '好的，我来帮你创建一个高质量的 React Native 组件。请问你需要什么类型的组件呢？',
    createdAt: '2024-01-15 10:29:00',
  },
  {
    id: '3',
    conversationId: '1',
    senderId: 'agent',
    senderName: '代码助手',
    role: 'agent',
    type: 'text',
    content: '好的，我已经完成了代码重构。所有函数都已经优化完毕，性能提升了30%。',
    createdAt: '2024-01-15 10:30:00',
  },
];

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  loading: false,

  fetchMessages: async (conversationId: string) => {
    set({ loading: true });
    try {
      const data = await messageApi.getMessages(conversationId);
      // Handle if backend returns PaginatedData wrapping the messages list
      const list = Array.isArray(data) ? data : ((data as any)?.list || []);
      set({ messages: list });
    } catch (error) {
      set({ messages: mockMessages.filter((m) => m.conversationId === conversationId) });
    } finally {
      set({ loading: false });
    }
  },

  sendMessage: async (conversationId: string, content: string) => {
    const clientMsgId = 'client_' + Date.now();
    const userMessage: Message = {
      id: clientMsgId,
      conversationId,
      senderId: 'user',
      senderName: '我',
      role: 'user',
      type: 'text',
      content,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({ messages: [...state.messages, userMessage] }));

    try {
      const payload = await messageApi.sendMessage(conversationId, content);
      set((state) => {
        const filtered = state.messages.filter((m) => m.id !== clientMsgId);
        const serverUserMsg = payload.userMessage || { ...userMessage, id: payload.userMessage?.id || clientMsgId };
        return {
          messages: [...filtered, serverUserMsg, ...payload.agentMessages],
        };
      });
    } catch (error) {
      const agentMessage: Message = {
        id: 'mock_' + Date.now(),
        conversationId,
        senderId: 'agent',
        senderName: 'AI助手',
        role: 'agent',
        type: 'text',
        content: '收到你的消息了！这是一个模拟回复。',
        createdAt: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, agentMessage] }));
    }
  },

  togglePinMessage: async (conversationId: string, messageId: string) => {
    const targetMsg = get().messages.find((m) => m.id === messageId);
    if (!targetMsg) return;
    
    const nextPinState = !targetMsg.isPinned;

    // Optimistically update locally
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
    } catch (e) {
      // Rollback on failure
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, isPinned: !nextPinState } : m
        ),
      }));
    }
  },
}));
