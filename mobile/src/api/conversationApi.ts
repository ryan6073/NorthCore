import { request } from './httpClient';
import { Conversation, PaginatedData, PinItem, MemoryItem, ContextUsage } from '@/types';

export const conversationApi = {
  async getConversations(): Promise<Conversation[]> {
    const res = await request<Conversation[]>('/conversations', {
      method: 'GET',
    });
    return res.data;
  },

  async createConversation(payload: { title: string; mode: string; agentIds: string[]; workspaceId?: string }): Promise<Conversation> {
    const res = await request<Conversation>('/conversations', {
      method: 'POST',
      data: payload,
    });
    return res.data;
  },

  async updateConversation(conversationId: string, payload: { title: string }): Promise<Conversation> {
    const res = await request<Conversation>(`/conversations/${conversationId}`, {
      method: 'PUT',
      data: payload,
    });
    return res.data;
  },

  async pinConversation(conversationId: string, isPinned: boolean): Promise<Conversation> {
    const res = await request<Conversation>(`/conversations/${conversationId}/pin`, {
      method: 'PUT',
      data: { isPinned },
    });
    return res.data;
  },

  async archiveConversation(conversationId: string, isArchived: boolean): Promise<Conversation> {
    const res = await request<Conversation>(`/conversations/${conversationId}/archive`, {
      method: 'PUT',
      data: { isArchived },
    });
    return res.data;
  },

  async deleteConversation(conversationId: string): Promise<boolean> {
    const res = await request<boolean>(`/conversations/${conversationId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async addAgentToConversation(conversationId: string, agentId: string): Promise<Conversation> {
    const res = await request<Conversation>(`/conversations/${conversationId}/agents`, {
      method: 'POST',
      data: { agentId },
    });
    return res.data;
  },

  async removeAgentFromConversation(conversationId: string, agentId: string): Promise<Conversation> {
    const res = await request<Conversation>(`/conversations/${conversationId}/agents/${agentId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async compressContext(conversationId: string): Promise<any> {
    const res = await request<any>(`/conversations/${conversationId}/context/compress`, {
      method: 'POST',
      data: {},
    });
    return res.data;
  },

  async pinMessage(conversationId: string, messageId: string): Promise<any> {
    const res = await request<any>(`/conversations/${conversationId}/messages/${messageId}/pin`, {
      method: 'POST',
    });
    return res.data;
  },

  async unpinMessage(conversationId: string, messageId: string): Promise<any> {
    const res = await request<any>(`/conversations/${conversationId}/messages/${messageId}/pin`, {
      method: 'DELETE',
    });
    return res.data;
  },

  /** 获取已 Pin 的消息列表 */
  async getPins(conversationId: string): Promise<PinItem[]> {
    const res = await request<PinItem[]>(`/conversations/${conversationId}/pins`, {
      method: 'GET',
    });
    return res.data;
  },

  /** 获取长期记忆 */
  async getMemories(conversationId: string): Promise<MemoryItem[]> {
    const res = await request<MemoryItem[]>(`/conversations/${conversationId}/memories`, {
      method: 'GET',
    });
    return res.data;
  },

  async deleteMemory(conversationId: string, memoryId: string): Promise<any> {
    const res = await request<any>(`/conversations/${conversationId}/memories/${memoryId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  /** 获取上下文使用情况 */
  async getContextUsage(conversationId: string): Promise<ContextUsage> {
    const res = await request<ContextUsage>(`/conversations/${conversationId}/context/usage`, {
      method: 'GET',
    });
    return res.data;
  },
};
