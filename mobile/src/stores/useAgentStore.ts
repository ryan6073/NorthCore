import { create } from 'zustand';
import { Agent, AgentStatus } from '@/types';
import { getAgents, updateAgent } from '@/services/agentService';

interface AgentState {
  agents: Agent[];
  loading: boolean;
  fetchAgents: () => Promise<void>;
  createAgent: (agent: Omit<Agent, 'id'>) => Promise<Agent>;
  updateAgent: (agentId: string, agent: Partial<Agent>) => Promise<Agent>;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const list = await getAgents();
      set({ agents: Array.isArray(list) ? list.filter(Boolean) : [] });
    } catch (error) {
      console.warn('[AgentStore] fetchAgents failed', error);
      set({ agents: [] });
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (agent) => {
    // 本地先创建再同步服务端（后端会返回真正的 id）
    const newAgent: Agent = {
      ...agent,
      id: 'local_' + Date.now(),
      status: 'online',
    };
    set((state) => ({ agents: [...state.agents, newAgent] }));
    return newAgent;
  },

  updateAgent: async (agentId, agent) => {
    const data = await updateAgent(agentId, agent);
    await get().fetchAgents();
    return data;
  },

  updateAgentStatus: (agentId: string, status: AgentStatus) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a
      ),
    }));
  },
}));
