import { Message, SendMessageRequest } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { mockMessageService } from '@/mock/mockService';
import { messageApi } from '@/api/messageApi';

export const getMessages = async (conversationId: string): Promise<Message[]> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockMessageService.getMessages(conversationId);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  const result = await messageApi.getMessages(conversationId);
  return result.list;
};

export const sendMessage = async (conversationId: string, payload: SendMessageRequest) => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockMessageService.sendMessage(conversationId, payload);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  return await messageApi.sendMessage(conversationId, payload);
};
