import { create } from 'zustand';
import { Agent } from '@/types';
import { agentApi } from '@/api/agentApi';

interface AgentState {
  agents: Agent[];
  loading: boolean;
  fetchAgents: () => Promise<void>;
  createAgent: (agent: Omit<Agent, 'id'>) => Promise<Agent>;
  updateAgent: (agentId: string, agent: Partial<Agent>) => Promise<Agent>;
}

const mockAgents: Agent[] = [
  {
    id: '1',
    name: '代码助手',
    avatar: '',
    description: '专注于代码编写、重构和调试的智能助手',
    tags: ['代码', '开发', '调试'],
    status: 'online',
    category: 'coding',
    provider: 'mock',
    enabled: true,
    systemPrompt: '你是一个专业的代码助手',
    modelConfig: {
      provider: 'mock',
      modelName: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4000,
    },
    tools: [
      { id: '1', name: '文件读取', description: '读取项目文件', enabled: true },
      { id: '2', name: '命令执行', description: '运行终端命令', enabled: true },
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: true,
      canRunCommands: true,
      canGenerateArtifacts: true,
      canDeploy: false,
    },
  },
  {
    id: '2',
    name: '文档助手',
    avatar: '',
    description: '帮助生成技术文档、README和API文档',
    tags: ['文档', '写作', 'README'],
    status: 'online',
    category: 'document',
    provider: 'mock',
    enabled: true,
    systemPrompt: '你是一个专业的文档助手',
    modelConfig: {
      provider: 'mock',
      modelName: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4000,
    },
    tools: [
      { id: '1', name: '文档生成', description: '生成各类文档', enabled: true },
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: true,
      canRunCommands: false,
      canGenerateArtifacts: true,
      canDeploy: false,
    },
  },
  {
    id: '3',
    name: '代码审查官',
    avatar: '',
    description: '专业的代码审查助手，检查代码质量和潜在问题',
    tags: ['审查', '质量', '安全'],
    status: 'offline',
    category: 'review',
    provider: 'mock',
    enabled: true,
    systemPrompt: '你是一个专业的代码审查官',
    modelConfig: {
      provider: 'mock',
      modelName: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
    },
    tools: [
      { id: '1', name: '代码扫描', description: '扫描代码问题', enabled: true },
    ],
    permissions: {
      canReadFiles: true,
      canWriteFiles: false,
      canRunCommands: false,
      canGenerateArtifacts: false,
      canDeploy: false,
    },
  },
];

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: mockAgents,
  loading: false,

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const data = await agentApi.getAgents();
      // Handle if backend returns PaginatedData wrapping the agents list
      const list = Array.isArray(data) ? data : ((data as any)?.list || []);
      set({ agents: list });
    } catch (error) {
      set({ agents: mockAgents });
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (agent) => {
    try {
      const data = await agentApi.createAgent(agent);
      await get().fetchAgents();
      return data;
    } catch (error) {
      const newAgent: Agent = {
        ...agent,
        id: 'mock_agent_' + Date.now(),
        status: 'online',
      };
      set((state) => ({ agents: [...state.agents, newAgent] }));
      return newAgent;
    }
  },

  updateAgent: async (agentId, agent) => {
    try {
      const data = await agentApi.updateAgent(agentId, agent);
      await get().fetchAgents();
      return data;
    } catch (error) {
      let updatedAgent: Agent | null = null;
      set((state) => {
        const updatedList = state.agents.map((a) => {
          if (a.id === agentId) {
            updatedAgent = { ...a, ...agent };
            return updatedAgent;
          }
          return a;
        });
        return { agents: updatedList };
      });
      return updatedAgent || (agent as Agent);
    }
  },
}));
