export type ConversationMode = 'single' | 'group' | 'agent';

export type MessageRole = 'user' | 'agent' | 'orchestrator' | 'system';

export type MessageType =
  | 'text'
  | 'code'
  | 'artifact'
  | 'task-plan'
  | 'status'
  | 'image'
  | 'document';

export interface MessageAttachment {
  id: string;
  conversationId?: string;
  messageId?: string | null;
  type: string;
  name: string;
  mimeType?: string;
  size?: number;
  url: string;
  createdAt?: string;
}

export type AgentStatus = 'online' | 'offline' | 'mock' | 'thinking' | 'disabled';

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface AgentPermission {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  canGenerateArtifacts: boolean;
  canDeploy: boolean;
}

export interface AgentModelConfig {
  provider: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: AgentStatus;
  category: string;
  provider: string;
  enabled: boolean;
  systemPrompt: string;
  modelConfig: AgentModelConfig;
  tools: AgentTool[];
  permissions: AgentPermission;
}

export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
  createdAt?: string;
  isPinned?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  createdAt: string;
  attachments?: MessageAttachment[];
}

export interface BaseApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SendMessageRequest {
  content: string;
  targetAgentId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  username: string;
}
