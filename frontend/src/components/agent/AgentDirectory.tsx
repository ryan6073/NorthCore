import React, { useState } from 'react';
import { Agent } from '@/types';
import { Search, Plus } from 'lucide-react';
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

  const filteredAgents = agents
    .filter(agent => agent.enabled)
    .filter(agent =>
      agent.name.toLowerCase().includes(keyword.toLowerCase()) ||
      agent.description.toLowerCase().includes(keyword.toLowerCase())
    );

  return (
    <div className="h-full w-full flex flex-col bg-transparent">
      <div className="p-4 pb-2 bg-transparent flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold font-sans text-lark-text-primary dark:text-slate-100 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            联系人
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddAgent}
              className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800 hover:border-lark-primary/30 dark:hover:border-violet-500/30 flex items-center justify-center transition-all shadow-sm active:scale-95"
              title="添加新 Agent"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lark-text-tertiary dark:text-slate-500" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索联系人..."
            className="w-full pl-9 pr-4 py-1.5 bg-[#eff0f1] dark:bg-slate-900 rounded-lg text-xs text-lark-text-primary dark:text-slate-100 placeholder:text-lark-text-tertiary dark:placeholder:text-slate-600 border border-transparent outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-lark-primary dark:focus:border-violet-650 focus:ring-1 focus:ring-lark-primary/20 dark:focus:ring-violet-650/20 transition-all"
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
