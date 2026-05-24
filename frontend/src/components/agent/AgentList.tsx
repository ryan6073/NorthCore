import React from 'react';
import { Agent } from '@/types';
import AgentCard from './AgentCard';

interface AgentListProps {
  agents: Agent[];
}

const AgentList: React.FC<AgentListProps> = ({ agents }) => {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="p-3 pb-1 flex-shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 px-1.5 py-1">协作成员</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-1 min-h-0">
        {agents.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">暂无Agent</p>
        ) : (
          agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))
        )}
      </div>
    </div>
  );
};

export default AgentList;
