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
  isArchived?: boolean;
  workspaceId?: string;
  contextUsage?: ContextUsage;
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
  metadata?: Record<string, any>;
}

export type ArtifactType = 'code' | 'html' | 'markdown' | 'diff' | 'image' | 'mermaid' | 'document' | 'ppt';

export interface Artifact {
  id: string;
  artifactId?: string;
  conversationId: string;
  originConversationId?: string;
  workspaceId?: string | null;
  runId?: string;
  title: string;
  type: ArtifactType;
  description?: string;
  tags?: string[];
  currentVersionId: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
  filePath?: string;
  sourceFilePath?: string;
  mimeType?: string;
  size?: number;
  sha256?: string;
  isText?: boolean;
  contentPreview?: string;
  downloadUrl?: string;
  previewable?: boolean;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  language?: string;
  size?: number;
  changeSummary?: string;
  createdBy: string;
  createdByType: 'user' | 'agent' | 'orchestrator';
  parentVersionId?: string;
  metadata?: Record<string, any>;
  sourceConversationId?: string;
  sourceWorkspaceId?: string;
  createdAt: string;
}

export interface ArtifactDetail extends Artifact {
  currentVersion: ArtifactVersion;
  content: string;
  size?: number;
}

export interface ArtifactReference {
  artifactId: string;
  artifactTitle?: string;
  version?: number;
  quotedText?: string;
  startLine?: number;
  endLine?: number;
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
  quotedMessageId?: string;
  artifactRef?: ArtifactReference;
  attachments?: { id: string; attachmentId?: string }[];
  useSandbox?: boolean;
  runMode?: 'chat' | 'sandbox' | 'deployment';
  webSearchMode?: 'auto' | 'force' | 'off';
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

// ========== WebSocket 相关类型 ==========

export type WSEventType =
  | 'connected'
  | 'ping'
  | 'pong'
  | 'conversation.message.create'
  | 'conversation.message.user_created'
  | 'conversation.message.chunk'
  | 'conversation.message.completed'
  | 'artifact.created'
  | 'conversation.all_tasks.completed'
  | 'conversation.subscribe'
  | 'conversation.unsubscribe'
  | 'agent.thinking.started'
  | 'agent.status.changed'
  | 'orchestrator.planning.started'
  | 'orchestrator.planning.context_ready'
  | 'orchestrator.planning.agents_selected'
  | 'orchestrator.planning.model_started'
  | 'orchestrator.planning.model_completed'
  | 'orchestrator.planning.normalized'
  | 'orchestrator.planning.completed'
  | 'orchestrator.planning.failed'
  | 'error';

export interface WSMessage {
  type: WSEventType | string;
  eventId: string;
  data: any;
}

export interface ConnectedEvent {
  type: 'connected';
  eventId: string;
  data: {
    clientId: string;
  };
}

export interface UserCreatedEvent {
  type: 'conversation.message.user_created';
  eventId: string;
  data: {
    message: Message;
    conversationId: string;
  };
}

export interface ChunkEvent {
  type: 'conversation.message.chunk';
  eventId: string;
  data: {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    role: string;
    messageType?: string;
    chunk: string;
    language?: string;
    source?: string;
    readOnly?: boolean;
    taskPlanStep?: any;
  };
}

export interface CompletedEvent {
  type: 'conversation.message.completed';
  eventId: string;
  data: {
    fullMessage: Message;
  };
}

export interface AllTasksCompletedEvent {
  type: 'conversation.all_tasks.completed';
  eventId: string;
  data: {
    conversationId: string;
    summary: string;
    contextUsage?: ContextUsage;
    artifacts?: any[];
    runId?: string;
  };
}

export interface ThinkingStartedEvent {
  type: 'agent.thinking.started';
  eventId: string;
  data: {
    agentId: string;
    agentName: string;
    conversationId: string;
    source?: string;
    taskPlanStep?: any;
  };
}

export interface AgentStatusChangedEvent {
  type: 'agent.status.changed';
  eventId: string;
  data: {
    agentId: string;
    newStatus: AgentStatus;
  };
}

export interface ArtifactCreatedEvent {
  type: 'artifact.created';
  eventId: string;
  data: {
    artifact: any;
    conversationId?: string;
    runId?: string;
  };
}

export interface ContextUsage {
  contextUsagePercent: number;
  contextUsageChars: number;
  contextLimitChars: number;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  conversationCount: number;
  lastUsedAt: string | null;
}

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: WorkspaceTreeNode[];
  truncated?: boolean;
  reason?: string;
  maxDepth?: number;
  maxEntries?: number;
}

export interface FileContentData {
  path: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  isText: boolean;
  encoding: string;
  content: string;
  truncated: boolean;
}

export interface GetWorkspacesParams {
  status?: 'active' | 'deleted' | 'all';
  page?: number;
  pageSize?: number;
}

export interface Workspace {
  id: string;
  ownerUserId: string;
  name: string;
  workspacePath: string;
  status: 'active' | string;
  createdAt: string;
  updatedAt: string;
}

export interface PinItem {
  id: string;
  conversationId: string;
  messageId: string;
  createdAt: string;
  message: Message;
}

export interface MemoryItem {
  id: string;
  conversationId: string;
  category: string;
  content: string;
  confidence?: number;
  sourceMessageId?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AllWSEvent =
  | ConnectedEvent
  | UserCreatedEvent
  | ChunkEvent
  | CompletedEvent
  | AllTasksCompletedEvent
  | ThinkingStartedEvent
  | AgentStatusChangedEvent
  | ArtifactCreatedEvent
  | WSMessage;
