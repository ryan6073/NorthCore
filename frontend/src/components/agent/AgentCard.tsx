import React from 'react';
import { Agent } from '@/types';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { Settings2 } from 'lucide-react';

interface AgentCardProps {
  agent: Agent;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  const openAgentProfile = useAgentHubStore(state => state.openAgentProfile);
  const setConfiguringAgentId = useAgentHubStore(state => state.setConfiguringAgentId);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-all duration-150 cursor-pointer active:scale-[0.99] border border-transparent hover:border-lark-border/50 dark:hover:border-slate-800/40 group relative">
      <img
        src={agent.avatar}
        alt={agent.name}
        onClick={(e) => {
          e.stopPropagation();
          openAgentProfile(agent.id);
        }}
        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow-sm border border-lark-border/30 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-900 hover:scale-105 transition-transform"
      />
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-lark-text-primary dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate">{agent.name}</h4>
        <p className="text-[11px] text-lark-text-secondary dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors truncate mt-0.5">{agent.description}</p>
        <div className="flex gap-1 mt-1 flex-wrap items-center">
          <span className={`text-[8px] px-1 py-0.2 rounded font-mono font-extrabold uppercase tracking-wider ${
            agent.runtime && agent.runtime !== 'native'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/25'
          }`}>
            {agent.runtime || 'native'}
          </span>
          {agent.modelConfigId && (() => {
            const cfg = useAgentHubStore.getState().modelConfigs.find(c => c.id === agent.modelConfigId);
            if (cfg) {
              return (
                <span className="text-[8px] px-1 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded font-semibold border border-slate-200/50 dark:border-slate-850/50 max-w-[80px] truncate" title={cfg.name}>
                  {cfg.name}
                </span>
              );
            }
            return null;
          })()}
          {(agent.tags || []).slice(0, 1).map((tag, idx) => (
            <span key={idx} className="text-[8px] px-1 py-0.2 bg-lark-primary-light dark:bg-violet-950/50 text-lark-primary dark:text-violet-300 rounded font-medium border border-lark-primary/10 dark:border-violet-800/30">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfiguringAgentId(agent.id);
        }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-slate-300/50 dark:hover:bg-slate-700/50 text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 transition-all active:scale-90 flex items-center justify-center flex-shrink-0"
        title="配置会话智能体"
      >
        <Settings2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default AgentCard;
