import { request } from './httpClient';
import { Message, SendMessageRequest, PaginatedData } from '@/types';

export interface SendMessageResponse {
  userMessage: Message | null;
  agentMessages: Message[];
  artifacts: any[];
}

export interface GetMessagesParams {
  limit?: number;
  beforeId?: string;
}

/** 游标分页的消息列表响应 */
export interface MessageListResponse {
  list: Message[];
  hasMore: boolean;
  nextCursor?: string;
}

export const messageApi = {
  /**
   * 获取消息列表（游标分页）
   * - 首次调用不传 beforeId，返回最新一页
   * - 滚动到底部时将当前最后一条消息的 id 作为 beforeId 传入
   * - 后端返回按 createdAt DESC 排序
   */
  async getMessages(
    conversationId: string,
    params?: GetMessagesParams
  ): Promise<MessageListResponse> {
    const queryParams: Record<string, string | number> = {};
    queryParams.limit = params?.limit ?? 20;
    if (params?.beforeId) {
      queryParams.beforeId = params.beforeId;
    }

    const res = await request<MessageListResponse | PaginatedData<Message>>(
      `/conversations/${conversationId}/messages`,
      {
        method: 'GET',
        params: queryParams,
      }
    );

    // 兼容两种响应格式：
    // 1. 新版游标格式: { list, hasMore, nextCursor }
    // 2. 旧版 PaginatedData: { list, total, page, pageSize, hasMore }
    const data = res.data;
    if ('hasMore' in data && 'list' in data) {
      return {
        list: data.list,
        hasMore: data.hasMore,
        nextCursor: (data as any).nextCursor,
      };
    }

    // 兜底
    return {
      list: Array.isArray(data) ? data : [],
      hasMore: false,
    };
  },

  async sendMessage(conversationId: string, payload: SendMessageRequest): Promise<SendMessageResponse> {
    const res = await request<SendMessageResponse>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
};
