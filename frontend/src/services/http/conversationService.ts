import http from '@/services/index';
import type {
  Conversation,
  CreateConversationPayload,
  UpdateConversationPayload,
  BaseApiResponse,
  PaginatedData,
  ConversationMode,
} from '@/types';

interface GetConversationListParams {
  page?: number;
  pageSize?: number;
  mode?: ConversationMode;
  keyword?: string;
}

export async function getConversationList(
  params?: GetConversationListParams
): Promise<BaseApiResponse<PaginatedData<Conversation>>> {
  return await http.get('/conversations', { params });
}

export async function createConversation(
  payload: CreateConversationPayload
): Promise<BaseApiResponse<Conversation>> {
  return await http.post('/conversations', payload);
}

export async function getConversationDetail(
  conversationId: string
): Promise<BaseApiResponse<Conversation>> {
  return await http.get(`/conversations/${conversationId}`);
}

export async function updateConversation(
  conversationId: string,
  payload: UpdateConversationPayload
): Promise<BaseApiResponse<Conversation>> {
  return await http.put(`/conversations/${conversationId}`, payload);
}

export async function deleteConversation(
  conversationId: string
): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/conversations/${conversationId}`);
}

const conversationService = {
  getConversationList,
  createConversation,
  getConversationDetail,
  updateConversation,
  deleteConversation,
};

export default conversationService;
