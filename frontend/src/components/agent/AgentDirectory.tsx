import React, { useState } from 'react';
import { Agent } from '@/types';
import { Search, User } from 'lucide-react';
import AgentContactCard from './AgentContactCard';

interface AgentDirectoryProps {
  agents: Agent[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
}

const AgentDirectory: React.FC<AgentDirectoryProps> = ({
  agents,
  selectedAgentId = null,
  onSelectAgent
}) => {
  const [keyword, setKeyword] = useState('');

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(keyword.toLowerCase()) ||
    agent.description.toLowerCase().includes(keyword.toLowerCase())
  );

  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">联系人</h2>
          <User className="w-4 h-4 text-slate-500" />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索Agent联系人..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredAgents.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">没有找到相关Agent</p>
        ) : (
          filteredAgents.map((agent) => (
            <AgentContactCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.id}
              onClick={() => onSelectAgent?.(agent.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AgentDirectory;
