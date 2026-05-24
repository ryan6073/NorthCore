export type ConversationMode = 'single' | 'group';

export type MessageRole = 'user' | 'agent' | 'orchestrator' | 'system';

export type MessageType = 'text' | 'code' | 'artifact' | 'task-plan' | 'status';

export type ArtifactType = 'code' | 'html' | 'markdown' | 'diff' | 'deploy';

export type AgentProvider = 
  | 'mock' 
  | 'claude-code' 
  | 'codex' 
  | 'opencode' 
  | 'local-qwen' 
  | 'custom';

export type AgentStatus = 'online' | 'offline' | 'mock';

export type AgentCategory = 
  | 'orchestrator' 
  | 'coding' 
  | 'review' 
  | 'document' 
  | 'design' 
  | 'custom';

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
  enabled: boolean;
  lastUsedAt?: string;
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
}

export interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: ArtifactType;
  content: string;
  createdAt: string;
}

export interface CreateConversationPayload {
  title: string;
  mode: ConversationMode;
  agentIds: string[];
}
