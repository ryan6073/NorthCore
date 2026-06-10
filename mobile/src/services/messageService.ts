import { Message, SendMessageRequest } from '@/types';
import { messageApi } from '@/api/messageApi';

export const getMessages = async (conversationId: string): Promise<Message[]> => {
  const result = await messageApi.getMessages(conversationId);
  return result.list;
};

export const sendMessage = async (conversationId: string, payload: SendMessageRequest) => {
  return await messageApi.sendMessage(conversationId, payload);
};
