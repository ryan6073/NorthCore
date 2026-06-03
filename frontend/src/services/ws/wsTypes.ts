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
  | 'run.retry.scheduled'
  | 'run.retry.created';

export interface MessageStreamState {
  isStreaming: boolean;
  currentEventId: string | null;
  messages: Map<string, { content: string; chunks: number }>;
}
