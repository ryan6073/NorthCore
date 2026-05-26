import React from 'react';
import { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-all duration-150 cursor-pointer active:scale-[0.99] border border-transparent hover:border-lark-border/50 dark:hover:border-slate-800/40 group">
      <img
        src={agent.avatar}
        alt={agent.name}
        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow-sm border border-lark-border/30 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-900"
      />
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-lark-text-primary dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate">{agent.name}</h4>
        <p className="text-[11px] text-lark-text-secondary dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors truncate mt-0.5">{agent.description}</p>
        <div className="flex gap-1 mt-1 flex-wrap">
          {agent.tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-lark-primary-light dark:bg-violet-950/50 text-lark-primary dark:text-violet-300 rounded font-medium border border-lark-primary/10 dark:border-violet-800/30">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};


export default AgentCard;
