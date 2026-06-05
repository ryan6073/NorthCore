import { create } from 'zustand';
import { Conversation } from '@/types';
import { conversationApi } from '@/api/conversationApi';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

const localFlagsStore = {
  async getArray(key: string): Promise<string[]> {
    try {
      let val: string | null = null;
      if (isWeb) {
        val = localStorage.getItem(key);
      } else {
        val = await SecureStore.getItemAsync(key);
      }
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  },
  async setArray(key: string, arr: string[]) {
    try {
      const val = JSON.stringify(arr);
      if (isWeb) {
        localStorage.setItem(key, val);
      } else {
        await SecureStore.setItemAsync(key, val);
      }
    } catch (e) {
      console.error(e);
    }
  }
};

interface ConversationState {
  conversations: Conversation[];
  loading: boolean;
  fetchConversations: () => Promise<void>;
  pinConversation: (id: string, isPinned: boolean) => Promise<void>;
  archiveConversation: (id: string, isArchived: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    title: '代码助手对话',
    mode: 'agent',
    agentIds: ['1'],
    lastMessage: '好的，我已经完成了代码重构',
    updatedAt: '2024-01-15 10:30:00',
    isPinned: true,
  },
  {
    id: '2',
    title: '文档助手',
    mode: 'agent',
    agentIds: ['2'],
    lastMessage: '文档已生成完毕',
    updatedAt: '2024-01-15 09:15:00',
  },
  {
    id: '3',
    title: '工作群聊',
    mode: 'group',
    agentIds: ['1', '2'],
    lastMessage: '大家有什么问题可以随时问我',
    updatedAt: '2024-01-14 18:00:00',
  },
];

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  loading: false,

  fetchConversations: async () => {
    set({ loading: true });
    try {
      const data = await conversationApi.getConversations();
      // Handle if backend returns PaginatedData wrapping the conversations list
      const list = Array.isArray(data) ? data : ((data as any)?.list || []);
      const pinned = await localFlagsStore.getArray('ag_pinned_conversations');
      const archived = await localFlagsStore.getArray('ag_archived_conversations');
      const merged = list.map((c: any) => ({
        ...c,
        isPinned: pinned.includes(c.id),
        isArchived: archived.includes(c.id),
      }));
      set({ conversations: merged });
    } catch (error) {
      const pinned = await localFlagsStore.getArray('ag_pinned_conversations');
      const archived = await localFlagsStore.getArray('ag_archived_conversations');
      const merged = mockConversations.map((c) => ({
        ...c,
        isPinned: pinned.includes(c.id) || !!c.isPinned,
        isArchived: archived.includes(c.id) || !!c.isArchived,
      }));
      set({ conversations: merged });
    } finally {
      set({ loading: false });
    }
  },

  pinConversation: async (id, isPinned) => {
    try {
      await conversationApi.pinConversation(id, isPinned);
    } catch (e) {
      // ignore or proceed with local optimistic update
    }
    const pinned = await localFlagsStore.getArray('ag_pinned_conversations');
    let nextPinned: string[];
    if (isPinned) {
      nextPinned = pinned.includes(id) ? pinned : [...pinned, id];
    } else {
      nextPinned = pinned.filter((x) => x !== id);
    }
    await localFlagsStore.setArray('ag_pinned_conversations', nextPinned);

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, isPinned } : c
      ),
    }));
  },

  archiveConversation: async (id, isArchived) => {
    try {
      await conversationApi.archiveConversation(id, isArchived);
    } catch (e) {
      // ignore
    }
    const archived = await localFlagsStore.getArray('ag_archived_conversations');
    let nextArchived: string[];
    if (isArchived) {
      nextArchived = archived.includes(id) ? archived : [...archived, id];
    } else {
      nextArchived = archived.filter((x) => x !== id);
    }
    await localFlagsStore.setArray('ag_archived_conversations', nextArchived);

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, isArchived } : c
      ),
    }));
  },

  deleteConversation: async (id) => {
    try {
      await conversationApi.deleteConversation(id);
    } catch (e) {
      // ignore
    }
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    }));
  },
}));

