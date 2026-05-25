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
  | 'agent.status.changed';

export interface MessageStreamState {
  isStreaming: boolean;
  currentEventId: string | null;
  messages: Map<string, { content: string; chunks: number }>;
}
