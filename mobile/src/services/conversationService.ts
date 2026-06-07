import { Conversation } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { mockConversationService } from '@/mock/mockService';
import { conversationApi } from '@/api/conversationApi';

export const getConversations = async (): Promise<Conversation[]> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockConversationService.getConversations();
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  const data = await conversationApi.getConversations();
  return normalizeList<Conversation>(data);
};

export const createConversation = async (payload: { title: string; mode: string; agentIds: string[]; workspaceId?: string }): Promise<Conversation> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockConversationService.createConversation(payload);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  return await conversationApi.createConversation(payload);
};

function normalizeList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
