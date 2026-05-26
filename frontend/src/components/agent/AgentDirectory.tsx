import React, { useState } from 'react';
import { Agent } from '@/types';
import { Search, User, Plus } from 'lucide-react';
import AgentContactCard from './AgentContactCard';

interface AgentDirectoryProps {
  agents: Agent[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
  onAddAgent?: () => void;
}

const AgentDirectory: React.FC<AgentDirectoryProps> = ({
  agents,
  selectedAgentId = null,
  onSelectAgent,
  onAddAgent
}) => {
  const [keyword, setKeyword] = useState('');

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(keyword.toLowerCase()) ||
    agent.description.toLowerCase().includes(keyword.toLowerCase())
  );

  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">联系人</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddAgent}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 transition-all active:scale-95 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm"
              title="添加新 Agent"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索Agent联系人..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-950 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 border border-transparent dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 transition-all"
          />
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-2 space-y-1">
        {filteredAgents.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-550 text-center py-6">没有找到相关Agent</p>
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
