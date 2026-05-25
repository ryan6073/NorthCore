export type ConversationMode = 'single' | 'group';

export type MessageRole = 'user' | 'agent' | 'orchestrator' | 'system';

export type MessageType = 
  | 'text' 
  | 'code' 
  | 'artifact' 
  | 'task-plan' 
  | 'status'
  | 'image'      // 图片消息
  | 'document';  // 文档消息 (ppt, pdf 等)

export interface MessageAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'ppt' | 'other';
  url: string;
  size?: number;
  meta?: {
    width?: number;
    height?: number;
    pages?: number;
  };
}

export interface ArtifactReference {
  artifactId: string;
  artifactTitle: string;
  version: number;
  quotedText: string;
  startLine?: number;
  endLine?: number;
}

export type ArtifactType = 'code' | 'html' | 'markdown' | 'diff' | 'deploy';

export type AgentProvider =
  | 'mock'
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'local-qwen'
  | 'custom';

export type AgentStatus = 'online' | 'offline' | 'mock' | 'thinking' | 'disabled';

export type AgentCategory =
  | 'orchestrator'
  | 'coding'
  | 'review'
  | 'document'
  | 'design'
  | 'custom';

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'error';

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed';

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
  provider: AgentProvider;
  modelName: string;
  apiBaseUrl?: string;
  apiKeyPlaceholder?: string;
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
  category: AgentCategory;
  provider: AgentProvider;
  enabled: boolean;
  lastUsedAt?: string;
  systemPrompt: string;
  modelConfig: AgentModelConfig;
  tools: AgentTool[];
  permissions: AgentPermission;
}

export type AgentListItem = Agent;
export type AgentDetail = Agent;

export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
  createdAt?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  language?: string;
  artifactId?: string;
  createdAt: string;
  attachments?: MessageAttachment[];
  quotedMessage?: {
    id: string;
    senderName: string;
    content: string;
  };
  artifactRef?: ArtifactReference;
  isPinned?: boolean;
}

export interface ArtifactMeta {
  id: string;
  conversationId: string;
  title: string;
  type: ArtifactType;
  description?: string;
  size?: number;
  createdAt: string;
}

export interface Artifact extends ArtifactMeta {
  content: string;
}

export type ArtifactDetail = Artifact;

export interface CreateConversationPayload {
  title: string;
  mode: ConversationMode;
  agentIds: string[];
}

export interface UpdateConversationPayload {
  title?: string;
  agentIds?: string[];
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  userMessage: Message;
  agentMessages: Message[];
  artifacts: ArtifactMeta[];
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

export interface HealthCheckData {
  status: 'healthy';
  version: string;
  timestamp: string;
}

export interface WSError {
  code: number;
  message: string;
}

export interface ConnectedEvent {
  type: 'connected';
  sessionId: string;
  serverTime: string;
  version: string;
}

export interface PingEvent {
  type: 'ping';
}

export interface PongEvent {
  type: 'pong';
  timestamp: number;
}

export interface ConversationMessageCreateEvent {
  type: 'conversation.message.create';
  eventId: string;
  data: {
    conversationId: string;
    content: string;
  };
}

export interface ConversationMessageUserCreatedEvent {
  type: 'conversation.message.user_created';
  eventId: string;
  data: {
    message: Message;
  };
}

export interface AgentThinkingStartedEvent {
  type: 'agent.thinking.started';
  eventId: string;
  data: {
    conversationId: string;
    agentId: string;
    agentName: string;
  };
}

export interface ConversationMessageChunkEvent {
  type: 'conversation.message.chunk';
  eventId: string;
  data: {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    role: MessageRole;
    messageType: MessageType;
    language?: string;
    chunk: string;
    sequence: number;
    isFullContent: boolean;
  };
}

export interface ConversationMessageCompletedEvent {
  type: 'conversation.message.completed';
  eventId: string;
  data: {
    messageId: string;
    finishReason: FinishReason;
    fullMessage: Message;
  };
}

export interface ArtifactCreatedEvent {
  type: 'artifact.created';
  eventId: string;
  data: {
    artifact: ArtifactMeta;
  };
}

export interface ConversationAllTasksCompletedEvent {
  type: 'conversation.all_tasks.completed';
  eventId: string;
  data: {
    conversationId: string;
    summary: string;
    totalMessages: number;
    totalArtifacts: number;
  };
}

export interface AgentStatusChangedEvent {
  type: 'agent.status.changed';
  data: {
    agentId: string;
    newStatus: AgentStatus;
    timestamp: string;
  };
}

export type AllWSEvent =
  | ConnectedEvent
  | PingEvent
  | PongEvent
  | ConversationMessageCreateEvent
  | ConversationMessageUserCreatedEvent
  | AgentThinkingStartedEvent
  | ConversationMessageChunkEvent
  | ConversationMessageCompletedEvent
  | ArtifactCreatedEvent
  | ConversationAllTasksCompletedEvent
  | AgentStatusChangedEvent;
