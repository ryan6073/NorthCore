import http from '@/services/index';
import type {
  AgentListItem,
  AgentDetail,
  BaseApiResponse,
  PaginatedData,
  AgentCategory,
  AgentProvider,
} from '@/types';

interface GetAgentListParams {
  page?: number;
  pageSize?: number;
  category?: AgentCategory;
  provider?: AgentProvider;
  keyword?: string;
  enabled?: boolean;
}

export async function getAgentList(
  params?: GetAgentListParams
): Promise<BaseApiResponse<PaginatedData<AgentListItem>>> {
  return await http.get('/agents', { params });
}

export async function getAgentDetail(agentId: string): Promise<BaseApiResponse<AgentDetail>> {
  return await http.get(`/agents/${agentId}`);
}

export async function updateAgentDetail(
  agentId: string,
  payload: Partial<AgentDetail>
): Promise<BaseApiResponse<AgentDetail>> {
  return await http.put(`/agents/${agentId}`, payload);
}

export async function createAgent(
  payload: Omit<AgentListItem, 'id' | 'lastUsedAt'>
): Promise<BaseApiResponse<AgentDetail>> {
  return await http.post('/agents', payload);
}

export async function deleteAgent(
  agentId: string
): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/agents/${agentId}`);
}

const agentService = {
  getAgentList,
  getAgentDetail,
  updateAgentDetail,
  createAgent,
  deleteAgent,
};

export default agentService;
