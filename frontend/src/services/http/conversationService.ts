import http from '@/services/index';
import type {
  Conversation,
  CreateConversationPayload,
  UpdateConversationPayload,
  BaseApiResponse,
  PaginatedData,
  ConversationMode,
  CompressContextResult,
  MemoryItem,
  MemoryCategory,
  PinItem,
  ContextUsage,
  Agent,
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

export async function compressContext(
  conversationId: string
): Promise<BaseApiResponse<CompressContextResult>> {
  return await http.post(`/conversations/${conversationId}/context/compress`, {});
}

export async function getMemories(
  conversationId: string
): Promise<BaseApiResponse<MemoryItem[]>> {
  return await http.get(`/conversations/${conversationId}/memories`);
}

export async function deleteMemory(
  conversationId: string,
  memoryId: string
): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/conversations/${conversationId}/memories/${memoryId}`);
}

export async function updateMemory(
  conversationId: string,
  memoryId: string,
  payload: { content: string; category?: MemoryCategory; active?: boolean }
): Promise<BaseApiResponse<MemoryItem>> {
  return await http.put(`/conversations/${conversationId}/memories/${memoryId}`, payload);
}

export async function getPins(
  conversationId: string
): Promise<BaseApiResponse<PinItem[]>> {
  return await http.get(`/conversations/${conversationId}/pins`);
}

export async function pinMessage(
  conversationId: string,
  messageId: string
): Promise<BaseApiResponse<PinItem>> {
  return await http.post(`/conversations/${conversationId}/messages/${messageId}/pin`);
}

export async function unpinMessage(
  conversationId: string,
  messageId: string
): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/conversations/${conversationId}/messages/${messageId}/pin`);
}

export async function deleteConversation(
  conversationId: string
): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/conversations/${conversationId}`);
}

export async function getContextUsage(
  conversationId: string
): Promise<BaseApiResponse<ContextUsage>> {
  return await http.get(`/conversations/${conversationId}/context/usage`);
}

export async function pinConversation(
  conversationId: string,
  isPinned: boolean
): Promise<BaseApiResponse<Conversation>> {
  return await http.put(`/conversations/${conversationId}/pin`, { isPinned });
}

export async function archiveConversation(
  conversationId: string,
  isArchived: boolean
): Promise<BaseApiResponse<Conversation>> {
  return await http.put(`/conversations/${conversationId}/archive`, { isArchived });
}

export async function getConversationAgentConfig(
  conversationId: string,
  agentId: string
): Promise<BaseApiResponse<Agent>> {
  return await http.get(`/conversations/${conversationId}/agents/${agentId}/config`);
}

export async function updateConversationAgentConfig(
  conversationId: string,
  agentId: string,
  payload: Partial<Agent>
): Promise<BaseApiResponse<Agent>> {
  return await http.put(`/conversations/${conversationId}/agents/${agentId}/config`, payload);
}

const conversationService = {
  getConversationList,
  createConversation,
  getConversationDetail,
  updateConversation,
  compressContext,
  getMemories,
  deleteMemory,
  updateMemory,
  getPins,
  pinMessage,
  unpinMessage,
  deleteConversation,
  getContextUsage,
  pinConversation,
  archiveConversation,
  getConversationAgentConfig,
  updateConversationAgentConfig,
};

export default conversationService;
