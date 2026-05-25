import http from '@/services/index';
import type {
  Message,
  SendMessageRequest,
  SendMessageResponse,
  BaseApiResponse,
  PaginatedData,
  NotifyMentionAgentRequest,
  NotifyMentionAgentResponse,
} from '@/types';

interface GetMessageListParams {
  page?: number;
  pageSize?: number;
  beforeId?: string;
}

export async function getMessageList(
  conversationId: string,
  params?: GetMessageListParams
): Promise<BaseApiResponse<PaginatedData<Message>>> {
  return await http.get(`/conversations/${conversationId}/messages`, { params });
}

export async function notifyMentionAgent(
  conversationId: string,
  payload: NotifyMentionAgentRequest
): Promise<BaseApiResponse<NotifyMentionAgentResponse>> {
  return await http.post(`/conversations/${conversationId}/mention`, payload);
}

export async function sendMessageNonStreaming(
  conversationId: string,
  payload: SendMessageRequest
): Promise<BaseApiResponse<SendMessageResponse>> {
  return await http.post(`/conversations/${conversationId}/messages`, payload);
}

const messageService = {
  getMessageList,
  notifyMentionAgent,
  sendMessageNonStreaming,
};

export default messageService;
