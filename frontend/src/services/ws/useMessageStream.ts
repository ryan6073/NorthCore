import { useState, useEffect, useCallback, useRef } from 'react';
import wsClient from './wsClient';
import type {
  Message,
  ConversationMessageChunkEvent,
  ConversationMessageCompletedEvent,
  ArtifactCreatedEvent,
  ConversationAllTasksCompletedEvent,
} from '@/types';

interface UseMessageStreamOptions {
  onMessageChunk?: (chunk: ConversationMessageChunkEvent['data']) => void;
  onMessageCompleted?: (fullMessage: Message) => void;
  onArtifactCreated?: (artifact: ArtifactCreatedEvent['data']['artifact']) => void;
  onAllTasksCompleted?: (data: ConversationAllTasksCompletedEvent['data']) => void;
}

export function useMessageStream(options: UseMessageStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const messageBufferRef = useRef(new Map<string, { content: string }>());

  const startStream = useCallback((conversationId: string, content: string): string => {
    const eventId = `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    wsClient.send('conversation.message.create', { conversationId, content }, eventId);
    setCurrentEventId(eventId);
    setIsStreaming(true);
    return eventId;
  }, []);

  const reset = useCallback(() => {
    setIsStreaming(false);
    setCurrentEventId(null);
    messageBufferRef.current.clear();
  }, []);

  useEffect(() => {
    const unsubChunk = wsClient.on<ConversationMessageChunkEvent>('conversation.message.chunk', (event) => {
      const { data } = event;
      const existing = messageBufferRef.current.get(data.messageId);
      if (existing) {
        existing.content += data.chunk;
      } else {
        messageBufferRef.current.set(data.messageId, { content: data.chunk });
      }
      options.onMessageChunk?.(data);
    });

    const unsubCompleted = wsClient.on<ConversationMessageCompletedEvent>('conversation.message.completed', (event) => {
      const { data } = event;
      messageBufferRef.current.delete(data.messageId);
      options.onMessageCompleted?.(data.fullMessage);
    });

    const unsubArtifact = wsClient.on<ArtifactCreatedEvent>('artifact.created', (event) => {
      options.onArtifactCreated?.(event.data.artifact);
    });

    const unsubAllDone = wsClient.on<ConversationAllTasksCompletedEvent>('conversation.all_tasks.completed', (event) => {
      options.onAllTasksCompleted?.(event.data);
      setIsStreaming(false);
    });

    return () => {
      unsubChunk();
      unsubCompleted();
      unsubArtifact();
      unsubAllDone();
    };
  }, [options]);

  return {
    isStreaming,
    currentEventId,
    startStream,
    reset,
  };
}
