import {
  mockAgents,
  mockConversations,
  mockMessages,
  mockArtifacts,
  mockArtifactVersions,
  mockHealthData,
  mockWorkspaces
} from './index';
import {
  Agent,
  Conversation,
  Message,
  Artifact,
  ArtifactVersion,
  HealthCheckData,
  WorkspaceItem,
  BaseApiResponse,
  PaginatedData
} from '@/types';
import { generateId } from '@/utils/id';

// 模拟网络延迟
const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

// 内存状态管理
let state = {
  agents: [...mockAgents],
  conversations: [...mockConversations],
  messages: [...mockMessages],
  artifacts: [...mockArtifacts],
  artifactVersions: [...mockArtifactVersions],
  workspaces: [...mockWorkspaces],
  deletedWorkspaces: [] as WorkspaceItem[]
};

// 重置Mock数据
export const resetMockData = () => {
  state = {
    agents: [...mockAgents],
    conversations: [...mockConversations],
    messages: [...mockMessages],
    artifacts: [...mockArtifacts],
    artifactVersions: [...mockArtifactVersions],
    workspaces: [...mockWorkspaces],
    deletedWorkspaces: []
  };
};

// 统一包装响应
const wrapResponse = <T>(data: T): BaseApiResponse<T> => ({
  code: 0,
  message: 'success',
  data
});

export const mockHealthService = {
  async getHealth(): Promise<BaseApiResponse<HealthCheckData>> {
    await delay(200);
    return wrapResponse({
      ...mockHealthData,
      timestamp: new Date().toISOString()
    });
  }
};

export const mockAgentService = {
  async getAgents(): Promise<BaseApiResponse<Agent[]>> {
    await delay(300);
    return wrapResponse(state.agents);
  },

  async getAgent(agentId: string): Promise<BaseApiResponse<Agent>> {
    await delay(200);
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    return wrapResponse(agent);
  },

  async updateAgent(agentId: string, agentData: Partial<Agent>): Promise<BaseApiResponse<Agent>> {
    await delay(300);
    const index = state.agents.findIndex(a => a.id === agentId);
    if (index === -1) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    state.agents[index] = { ...state.agents[index], ...agentData };
    return wrapResponse(state.agents[index]);
  }
};

export const mockConversationService = {
  async getConversations(): Promise<BaseApiResponse<Conversation[]>> {
    await delay(300);
    return wrapResponse(state.conversations);
  },

  async getConversation(conversationId: string): Promise<BaseApiResponse<Conversation>> {
    await delay(200);
    const conv = state.conversations.find(c => c.id === conversationId);
    if (!conv) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    return wrapResponse(conv);
  },

  async createConversation(payload: { title: string; mode: string; agentIds: string[]; workspaceId?: string }): Promise<BaseApiResponse<Conversation>> {
    await delay(300);
    const newConv: Conversation = {
      id: generateId('conv'),
      title: payload.title,
      mode: payload.mode as any,
      agentIds: payload.agentIds,
      lastMessage: '新对话已创建',
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      workspaceId: payload.workspaceId
    };
    state.conversations.unshift(newConv);
    return wrapResponse(newConv);
  },

  async updateConversation(conversationId: string, payload: any): Promise<BaseApiResponse<Conversation>> {
    await delay(200);
    const index = state.conversations.findIndex(c => c.id === conversationId);
    if (index === -1) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    state.conversations[index] = { ...state.conversations[index], ...payload };
    return wrapResponse(state.conversations[index]);
  }
};

export const mockMessageService = {
  async getMessages(conversationId: string): Promise<BaseApiResponse<Message[]>> {
    await delay(300);
    const messages = state.messages.filter(m => m.conversationId === conversationId);
    return wrapResponse(messages);
  },

  async sendMessage(conversationId: string, payload: any): Promise<BaseApiResponse<{ userMessage: Message | null; agentMessages: Message[]; artifacts: Artifact[] }>> {
    await delay(500);
    
    const userMessage: Message = {
      id: generateId('msg'),
      conversationId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content: payload.content,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
    state.messages.push(userMessage);

    const agentReplyText = `收到您的消息："${payload.content}"\n\n这是一个Mock的智能回复，演示系统在后端不可用时的交互体验。`;
    
    const agentMessage: Message = {
      id: generateId('msg'),
      conversationId,
      senderId: 'agent-orchestrator',
      senderName: 'Orchestrator',
      role: 'orchestrator',
      type: 'text',
      content: agentReplyText,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
    state.messages.push(agentMessage);

    const conv = state.conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.lastMessage = agentReplyText.slice(0, 50);
      conv.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    }

    return wrapResponse({
      userMessage,
      agentMessages: [agentMessage],
      artifacts: []
    });
  }
};

export const mockArtifactService = {
  async getArtifacts(conversationId: string): Promise<BaseApiResponse<Artifact[]>> {
    await delay(300);
    const artifacts = state.artifacts.filter(a => a.conversationId === conversationId);
    return wrapResponse(artifacts);
  },

  async getArtifactDetail(artifactId: string): Promise<BaseApiResponse<Artifact & { currentVersion: ArtifactVersion; content: string }>> {
    await delay(300);
    const artifact = state.artifacts.find(a => a.id === artifactId);
    const version = state.artifactVersions.find(v => v.artifactId === artifactId);
    if (!artifact || !version) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    const detail = {
      ...artifact,
      currentVersion: version,
      content: version.content
    };
    return wrapResponse(detail);
  },

  async getArtifactVersions(artifactId: string): Promise<BaseApiResponse<ArtifactVersion[]>> {
    await delay(200);
    const versions = state.artifactVersions.filter(v => v.artifactId === artifactId);
    return wrapResponse(versions);
  }
};

export const mockWorkspaceService = {
  async getWorkspaces(params?: any): Promise<BaseApiResponse<PaginatedData<WorkspaceItem>>> {
    await delay(300);
    const status = params?.status || 'active';
    let list: WorkspaceItem[];
    
    if (status === 'all') {
      list = [...state.workspaces, ...state.deletedWorkspaces];
    } else if (status === 'deleted') {
      list = state.deletedWorkspaces;
    } else {
      list = state.workspaces;
    }
    
    return wrapResponse({
      list,
      total: list.length,
      page: params?.page || 1,
      pageSize: params?.pageSize || 20,
      hasMore: false
    });
  },

  async createWorkspace(name: string): Promise<BaseApiResponse<WorkspaceItem>> {
    await delay(300);
    const newWorkspace: WorkspaceItem = {
      id: generateId('ws'),
      name,
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      deletedAt: null,
      conversationCount: 0,
      lastUsedAt: null
    };
    state.workspaces.unshift(newWorkspace);
    return wrapResponse(newWorkspace);
  },

  async renameWorkspace(workspaceId: string, name: string): Promise<BaseApiResponse<WorkspaceItem>> {
    await delay(200);
    const index = state.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    state.workspaces[index] = { 
      ...state.workspaces[index], 
      name,
      updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    return wrapResponse(state.workspaces[index]);
  },

  async deleteWorkspace(workspaceId: string): Promise<BaseApiResponse<boolean>> {
    await delay(300);
    const index = state.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    const [movedWs] = state.workspaces.splice(index, 1);
    movedWs.status = 'deleted';
    movedWs.deletedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    state.deletedWorkspaces.unshift(movedWs);
    return wrapResponse(true);
  },

  async restoreWorkspace(workspaceId: string): Promise<BaseApiResponse<WorkspaceItem>> {
    await delay(300);
    const index = state.deletedWorkspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }
    const [restoredWs] = state.deletedWorkspaces.splice(index, 1);
    restoredWs.status = 'active';
    restoredWs.deletedAt = null;
    restoredWs.updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    state.workspaces.unshift(restoredWs);
    return wrapResponse(restoredWs);
  },

  async purgeWorkspace(workspaceId: string): Promise<BaseApiResponse<boolean>> {
    await delay(300);
    const activeIndex = state.workspaces.findIndex(w => w.id === workspaceId);
    if (activeIndex !== -1) {
      state.workspaces.splice(activeIndex, 1);
    } else {
      const deletedIndex = state.deletedWorkspaces.findIndex(w => w.id === workspaceId);
      if (deletedIndex === -1) {
        return { code: 40001, message: '资源不存在', data: null as any };
      }
      state.deletedWorkspaces.splice(deletedIndex, 1);
    }
    return wrapResponse(true);
  }
};

export const mockAuthService = {
  async login(username: string, password: string): Promise<BaseApiResponse<{ token: string; userId: string; username: string }>> {
    await delay(300);
    if (username === 'demo' && password === 'demo') {
      return wrapResponse({
        token: 'mock-jwt-token-xxxxxx',
        userId: 'user-mock-001',
        username: 'demo'
      });
    }
    return { code: 40100, message: '用户名或密码错误', data: null as any };
  }
};
