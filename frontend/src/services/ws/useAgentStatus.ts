import { useState, useEffect, useCallback } from 'react';
import wsClient from './wsClient';
import type { AgentStatus, AgentStatusChangedEvent } from '@/types';

export function useAgentStatus() {
  const [agentStatusMap, setAgentStatusMap] = useState<Map<string, AgentStatus>>(new Map());

  const updateAgentStatus = useCallback((agentId: string, newStatus: AgentStatus) => {
    setAgentStatusMap((prev) => {
      const next = new Map(prev);
      next.set(agentId, newStatus);
      return next;
    });
  }, []);

  const getAgentStatus = useCallback((agentId: string): AgentStatus | undefined => {
    return agentStatusMap.get(agentId);
  }, [agentStatusMap]);

  useEffect(() => {
    const unsub = wsClient.on<AgentStatusChangedEvent>('agent.status.changed', (event) => {
      const { data } = event;
      updateAgentStatus(data.agentId, data.newStatus);
    });
    return () => unsub();
  }, [updateAgentStatus]);

  return {
    agentStatusMap,
    getAgentStatus,
    updateAgentStatus,
  };
}
