import { Agent } from '@/types';
import { agentApi } from '@/api/agentApi';

export const getAgents = async (): Promise<Agent[]> => {
  const data = await agentApi.getAgents();
  return normalizeList<Agent>(data);
};

export const getAgent = async (agentId: string): Promise<Agent> => {
  return await agentApi.getAgent(agentId);
};

export const updateAgent = async (agentId: string, agent: Partial<Agent>): Promise<Agent> => {
  return await agentApi.updateAgent(agentId, agent);
};

function normalizeList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
