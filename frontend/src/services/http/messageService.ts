import http from '@/services/index';
import type {
  Message,
  SendMessageRequest,
  SendMessageResponse,
  BaseApiResponse,
  PaginatedData,
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

export async function sendMessageNonStreaming(
  conversationId: string,
  payload: SendMessageRequest
): Promise<BaseApiResponse<SendMessageResponse>> {
  return await http.post(`/conversations/${conversationId}/messages`, payload);
}

const messageService = {
  getMessageList,
  sendMessageNonStreaming,
};

export default messageService;
