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

export type ArtifactType = 'code' | 'html' | 'markdown' | 'diff' | 'deploy' | 'image' | 'mermaid';

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

export type AgentRuntime = 'native' | 'opencode' | 'codex' | 'claude_code';

export interface ModelProvider {
  id: string;
  name: string;
  protocol: string;
  requiresBaseUrl: boolean;
  defaultBaseUrl?: string;
  aliases?: string[];
}

export interface ModelCredential {
  id: string;
  ownerUserId: string;
  name: string;
  provider: string;
  credentialType: string;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfig {
  id: string;
  ownerUserId: string;
  name: string;
  provider: string;
  protocol: string;
  modelName: string;
  baseUrl?: string | null;
  credentialRef?: string | null;
  extraConfig: Record<string, any>;
  createdAt: string;
  updatedAt: string;
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
  ownerUserId?: string | null;
  owner_user_id?: string | null;
  runtime?: AgentRuntime;
  modelConfigId?: string | null;
  runtimeConfig?: Record<string, any>;
}

export type AgentListItem = Agent;
export type AgentDetail = Agent;

export interface Workspace {
  id: string;
  ownerUserId: string;
  name: string;
  workspacePath: string;
  status: 'active' | string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceTreeNode {
  name: string;
  type: 'directory' | 'file';
  path?: string;
  children?: WorkspaceTreeNode[];
  file?: SandboxFile;
}

export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  lastMessage: string;
  updatedAt: string;
  createdAt?: string;
  contextUsage?: ContextUsage;
  isPinned?: boolean;
  isArchived?: boolean;
  visible?: boolean;
  workspaceId?: string | null;
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

export interface Artifact {
  id: string;
  conversationId: string;
  runId?: string;
  title: string;
  type: ArtifactType;
  description?: string;
  tags?: string[];
  currentVersionId: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
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
  createdByType:
  | 'user'
  | 'agent'
  | 'orchestrator';
  parentVersionId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ArtifactDetail extends Artifact {
  currentVersion: ArtifactVersion;
  content: string;
  size?: number;
}

export interface CreateConversationPayload {
  title: string;
  mode: ConversationMode;
  agentIds: string[];
  workspaceId?: string;
}

export interface UpdateConversationPayload {
  title?: string;
  agentIds?: string[];
  workspaceId?: string | null;
}

export type MemoryCategory = 'preference' | 'project' | 'profile' | 'constraint';

export interface ContextUsage {
  contextUsagePercent: number;
  contextUsageChars: number;
  contextLimitChars: number;
}

export interface AgentMentionItem {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tags: string[];
  status: 'online' | 'offline';
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  summary: string;
  coveredUntilMessageId: string;
  coveredMessageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompressContextResult {
  summary: ConversationSummary;
  compressed: boolean;
  contextUsage?: ContextUsage;
}

export interface MemoryItem {
  id: string;
  conversationId: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  sourceMessageId: string;
  active: boolean;
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

export interface GetMentionAgentsRequest {
  keyword?: string;
  query?: string;
}

export interface SendMessageRequest {
  content: string;
  targetAgentId?: string;
  quotedMessageId?: string;
  artifactRef?: ArtifactReference;
  attachments?: MessageAttachment[];
  useSandbox?: boolean;
  executionMode?: 'chat' | 'sandbox';
  runMode?: 'chat' | 'sandbox';
  webSearchMode?: 'auto' | 'force' | 'off';
}

export interface SendMessageResponse {
  userMessage: Message | null;
  agentMessages: Message[];
  artifacts: Artifact[];
  contextUsage?: ContextUsage;
  executionMode?: 'chat' | 'sandbox';
  intent?: string;
  reason?: string;
  run?: AgentRunDetail;
  workspaceId?: string;
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
    artifact: Artifact;
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
    contextUsage?: {
      contextUsagePercent: number;
      contextUsageChars: number;
      contextLimitChars: number;
    };
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



export interface AgentChat {
  id: string;
  agentId: string;
  lastMessage: string;
  updatedAt: string;
  createdAt: string;
}

export interface AgentChatMessage {
  id: string;
  agentChatId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'agent';
  type: 'text';
  content: string;
  createdAt: string;
  isPinned?: boolean;
  attachments?: MessageAttachment[];
  quotedMessage?: {
    id: string;
    senderName: string;
    content: string;
  };
}

export interface RunDag {
  nodes: {
    id: string;
    label: string;
    agentId: string;
    status: AgentRunStepStatus;
    dependencies: string[];
  }[];
  strategy?: 'native_dag' | 'platform_single_step' | 'group_orchestrator_dag' | string;
  summary?: string;
}

export interface Sandbox {
  id: string;
  dockerContainerId?: string;
  status: 'active' | 'terminated';
  createdAt: string;
  updatedAt: string;
  workspaceId?: string | null;
  workspacePath?: string;
}

export interface AgentRunStep {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  status: AgentRunStepStatus;
  description: string;
  log?: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  runtime?: string;
  runtimeMetadata?: Record<string, any>;
}

export interface SandboxFile {
  id: string;
  sandboxId: string;
  runId: string;
  path: string;
  contentHash: string;
  currentVersion: number;
  artifactId?: string | null;
  createdAt: string;
  updatedAt: string;
  mimeType?: string | null;
  size?: number | null;
  sha256?: string | null;
  isText?: boolean;
  contentPreview?: string | null;
}

export interface SandboxFileVersion {
  id: string;
  fileId: string;
  version: number;
  content: string;
  createdAt: string;
}

export interface SandboxFileDetail extends SandboxFile {
  content: string;
  version?: SandboxFileVersion;
}

export interface SandboxConflict {
  id: string;
  runId: string;
  sandboxId: string;
  fileId?: string | null;
  filePath: string;
  baseVersion: number;
  currentVersion: number;
  incomingContent: string;
  incomingHash: string;
  createdByStepId?: string | null;
  status: 'open' | 'resolved';
  resolution?: 'current' | 'incoming' | 'manual' | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AgentRunDetail {
  id: string;
  sandboxId: string;
  conversationId: string;
  ownerUserId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'conflict' | 'cancelled';
  prompt: string;
  dag: RunDag;
  summary: string;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  sandbox?: Sandbox;
  steps: AgentRunStep[];
  files: SandboxFile[];
  conflicts: SandboxConflict[];
  workspaceId?: string | null;
  workspace?: Workspace | null;
  planningMessages?: Message[];
  retryOfRunId?: string | null;
  retryRootRunId?: string | null;
  retryAttempt?: number;
  maxRetryAttempts?: number;
}

export type AgentRunStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'conflict'
  | 'blocked';

export type SandboxToolName =
  | 'inspect_environment'
  | 'read_dependency_manifest'
  | 'setup_environment'
  | 'list_files'
  | 'scan_workspace'
  | 'read_workspace_file'
  | 'import_workspace_file'
  | 'read_file'
  | 'write_file'
  | 'run_command'
  | 'validate_command'
  | 'finish';

export interface SandboxToolCall {
  id: string;
  name: SandboxToolName;
  tool: SandboxToolName;
  arguments: Record<string, any>;
  args: Record<string, any>;
  status: 'running' | 'success' | 'failed';
  result: Record<string, any>;
  error?: string | null;
  createdAt: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutPreview: string;
  stderrPreview: string;
  timedOut: boolean;
  cwd: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface SandboxStepOutput {
  toolCalls: SandboxToolCall[];
  commandResults: CommandResult[];
  changedFiles: string[];
  validations?: Array<{
    id: string;
    command: string;
    success: boolean;
    result: CommandResult;
    createdAt: string;
  }>;
  workspaceScan?: {
    tracked: Array<{ path: string; size: number }>;
    untracked: Array<{ path: string; size: number }>;
    skipped: Array<{ path: string; reason: string }>;
  };
  environmentState?: {
    workspace: string;
    pythonVenv?: string | null;
    venvActivated?: boolean;
    packageManager?: string;
    network?: string;
    allowNetwork?: boolean;
    lastSetupStatus?: 'running' | 'success' | 'failed';
  };
  finish?: {
    success: boolean;
    summary: string;
    nextActions?: string[];
    validationCommandId?: string;
    validationSkippedReason?: string;
    validationRequired?: boolean;
  };
}

export interface EnvironmentProfile {
  packageManager: string;
  pythonVersion: string;
  allowNetwork: boolean;
}

export interface CreateSandboxRunRequest {
  prompt: string;
  environmentProfile?: EnvironmentProfile;
  workspaceId?: string;
}

export interface SandboxHtmlPreview {
  html: string;
  sourceFilePath: string;
  resolvedAssets: Array<{
    ref: string;
    path: string;
    kind: 'stylesheet' | 'script';
  }>;
  missingAssets: Array<{
    ref: string;
    path: string;
    kind: 'stylesheet' | 'script';
  }>;
  warnings: string[];
}

export interface RunEventData {
  conversationId: string;
  runId: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'conflict' | 'cancelled';
  run?: AgentRunDetail;
  steps?: AgentRunStep[];
  files?: SandboxFile[];
  conflicts?: SandboxConflict[];
  stepId?: string;
  log?: string;
}

export interface RunCreatedEvent {
  type: 'run.created';
  eventId: string;
  data: RunEventData;
}

export interface RunStepStartedEvent {
  type: 'run.step.started';
  eventId: string;
  data: RunEventData;
}

export interface RunStepToolStartedEvent {
  type: 'run.step.tool.started';
  eventId: string;
  data: RunEventData & { toolName: string };
}

export interface RunStepToolCompletedEvent {
  type: 'run.step.tool.completed';
  eventId: string;
  data: RunEventData & { toolName: string };
}

export interface RunStepToolFailedEvent {
  type: 'run.step.tool.failed';
  eventId: string;
  data: RunEventData & { toolName: string; error?: string };
}

export interface RunStepLogEvent {
  type: 'run.step.log';
  eventId: string;
  data: RunEventData;
}

export interface RunStepCompletedEvent {
  type: 'run.step.completed';
  eventId: string;
  data: RunEventData;
}

export interface RunStepFailedEvent {
  type: 'run.step.failed';
  eventId: string;
  data: RunEventData;
}

export interface RunStepConflictEvent {
  type: 'run.step.conflict';
  eventId: string;
  data: RunEventData;
}

export interface RunCompletedEvent {
  type: 'run.completed';
  eventId: string;
  data: RunEventData;
}

export interface RunFailedEvent {
  type: 'run.failed';
  eventId: string;
  data: RunEventData;
}

export interface ExecutionModeDecidedEvent {
  type: 'execution.mode.decided';
  eventId: string;
  data: {
    conversationId: string;
    executionMode: 'chat' | 'sandbox';
    intent?: string;
    confidence?: number;
    reason?: string;
  };
}

// ============ Orchestrator Planning Events ============

export type OrchestratorPlanningPhase =
  | 'started'
  | 'context_ready'
  | 'agents_selected'
  | 'model_started'
  | 'model_completed'
  | 'normalized'
  | 'completed'
  | 'failed';

export interface OrchestratorPlanningPayload {
  runId: string;
  conversationId: string;
  message: Message;
  phase: OrchestratorPlanningPhase;
  availableAgents?: Array<{
    agentId: string;
    name: string;
    runtime: string;
    description: string;
  }>;
  strategy?: string;
  stepCount?: number;
  dagPreview?: RunDag;
  workspaceId?: string;
  hasWorkspaceAgentsContext?: boolean;
  workspaceAction?: string;
  error?: string;
}

export interface OrchestratorPlanningStartedEvent {
  type: 'orchestrator.planning.started';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningContextReadyEvent {
  type: 'orchestrator.planning.context_ready';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningAgentsSelectedEvent {
  type: 'orchestrator.planning.agents_selected';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningModelStartedEvent {
  type: 'orchestrator.planning.model_started';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningModelCompletedEvent {
  type: 'orchestrator.planning.model_completed';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningNormalizedEvent {
  type: 'orchestrator.planning.normalized';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningCompletedEvent {
  type: 'orchestrator.planning.completed';
  eventId: string;
  data: OrchestratorPlanningPayload;
}

export interface OrchestratorPlanningFailedEvent {
  type: 'orchestrator.planning.failed';
  eventId: string;
  data: OrchestratorPlanningPayload;
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
  | AgentStatusChangedEvent
  | RunCreatedEvent
  | RunStepStartedEvent
  | RunStepToolStartedEvent
  | RunStepToolCompletedEvent
  | RunStepToolFailedEvent
  | RunStepLogEvent
  | RunStepCompletedEvent
  | RunStepFailedEvent
  | RunStepConflictEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunRetryScheduledEvent
  | RunRetryCreatedEvent
  | ExecutionModeDecidedEvent
  | OrchestratorPlanningStartedEvent
  | OrchestratorPlanningContextReadyEvent
  | OrchestratorPlanningAgentsSelectedEvent
  | OrchestratorPlanningModelStartedEvent
  | OrchestratorPlanningModelCompletedEvent
  | OrchestratorPlanningNormalizedEvent
  | OrchestratorPlanningCompletedEvent
  | OrchestratorPlanningFailedEvent;

export interface RetryRunResponse {
  run: AgentRunDetail;
  retryOfRunId: string;
  retryRootRunId?: string;
  retryAttempt?: number;
  maxRetryAttempts?: number;
}

export interface RunRetryScheduledEvent {
  type: 'run.retry.scheduled';
  eventId: string;
  data: {
    runId: string;
    conversationId: string;
    workspaceId: string;
    retryRootRunId: string;
    retryOfRunId: string;
    retryAttempt: number;
    maxRetryAttempts: number;
    message: string;
  };
}

export interface RunRetryCreatedEvent {
  type: 'run.retry.created';
  eventId: string;
  data: {
    runId: string;
    retryOfRunId: string;
    retryRootRunId: string;
    retryAttempt: number;
    maxRetryAttempts: number;
    run: AgentRunDetail;
  };
}

export interface WebSearchResult {
  title: string;
  body: string;
  href: string;
}

export interface WebSearchMetadata {
  shouldSearch: boolean;
  decisionReason: string;
  mode: 'auto' | 'force' | 'off';
  used: boolean;
  provider: 'ddgs' | string;
  query: string;
  cacheHit: boolean;
  results: WebSearchResult[];
  error: string | null;
}
