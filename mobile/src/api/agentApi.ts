import { request } from './httpClient';
import { Agent } from '@/types';

export const agentApi = {
  async getAgents(): Promise<Agent[]> {
    const res = await request<Agent[]>('/agents', {
      method: 'GET',
    });
    return res.data;
  },

  async getAgent(agentId: string): Promise<Agent> {
    const res = await request<Agent>(`/agents/${agentId}`, {
      method: 'GET',
    });
    return res.data;
  },

  async createAgent(agent: Omit<Agent, 'id'>): Promise<Agent> {
    const res = await request<Agent>('/agents', {
      method: 'POST',
      data: agent,
    });
    return res.data;
  },

  async updateAgent(agentId: string, agent: Partial<Agent>): Promise<Agent> {
    const res = await request<Agent>(`/agents/${agentId}`, {
      method: 'PUT',
      data: agent,
    });
    return res.data;
  },
};
