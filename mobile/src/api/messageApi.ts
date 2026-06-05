import { request } from './httpClient';
import { Message, SendMessageRequest } from '@/types';

export interface SendMessageResponse {
  userMessage: Message | null;
  agentMessages: Message[];
  artifacts: any[];
}

export const messageApi = {
  async getMessages(conversationId: string): Promise<Message[]> {
    const res = await request<Message[]>(`/conversations/${conversationId}/messages`, {
      method: 'GET',
    });
    return res.data;
  },

  async sendMessage(conversationId: string, content: string): Promise<SendMessageResponse> {
    const res = await request<SendMessageResponse>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      data: { content } as SendMessageRequest,
    });
    return res.data;
  },
};
