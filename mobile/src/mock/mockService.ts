import {
  mockAgents,
  mockConversations,
  mockMessages,
  mockArtifacts,
  mockArtifactVersions,
  mockHealthData
} from './index';
import {
  Agent,
  Conversation,
  Message,
  Artifact,
  ArtifactDetail,
  ArtifactVersion,
  HealthCheckData,
  SendMessageRequest,
  BaseApiResponse
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
  artifactVersions: [...mockArtifactVersions]
};

// 重置Mock数据
export const resetMockData = () => {
  state = {
    agents: [...mockAgents],
    conversations: [...mockConversations],
    messages: [...mockMessages],
    artifacts: [...mockArtifacts],
    artifactVersions: [...mockArtifactVersions]
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
  }
};

export const mockMessageService = {
  async getMessages(conversationId: string): Promise<BaseApiResponse<Message[]>> {
    await delay(300);
    const messages = state.messages.filter(m => m.conversationId === conversationId);
    return wrapResponse(messages);
  },

  async sendMessage(conversationId: string, payload: SendMessageRequest): Promise<BaseApiResponse<{ userMessage: Message; agentMessages: Message[]; artifacts: Artifact[] }>> {
    await delay(500);
    
    // 创建用户消息
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

    // 查找对应的对话
    const conv = state.conversations.find(c => c.id === conversationId);
    
    // 创建AI回复
    const agentReplyText = `收到您的消息："${payload.content}"\n\n这是一个Mock的智能回复，演示系统在后端不可用时的交互体验。`;
    
    const agentMessage: Message = {
      id: generateId('msg'),
      conversationId,
      senderId: conv?.agentIds?.[0] || 'agent-orchestrator',
      senderName: conv?.agentIds?.length ? state.agents.find(a => a.id === conv.agentIds[0])?.name || 'AI' : 'Orchestrator',
      role: 'agent',
      type: 'text',
      content: agentReplyText,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
    state.messages.push(agentMessage);

    // 更新对话最后消息
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

  async getArtifactDetail(artifactId: string): Promise<BaseApiResponse<ArtifactDetail>> {
    await delay(300);
    const artifact = state.artifacts.find(a => a.id === artifactId);
    const version = state.artifactVersions.find(v => v.artifactId === artifactId);
    
    if (!artifact || !version) {
      return { code: 40001, message: '资源不存在', data: null as any };
    }

    const detail: ArtifactDetail = {
      ...artifact,
      currentVersion: version,
      content: version.content,
      size: version.size
    };
    return wrapResponse(detail);
  },

  async getArtifactVersions(artifactId: string): Promise<BaseApiResponse<ArtifactVersion[]>> {
    await delay(200);
    const versions = state.artifactVersions.filter(v => v.artifactId === artifactId);
    return wrapResponse(versions);
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
