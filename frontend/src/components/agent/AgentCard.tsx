import React from 'react';
import { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-lark-bg-hover transition-all duration-150 cursor-pointer active:scale-[0.99] border border-transparent hover:border-lark-border/50">
      <img
        src={agent.avatar}
        alt={agent.name}
        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow-sm border border-lark-border/30 bg-slate-100"
      />
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-lark-text-primary truncate">{agent.name}</h4>
        <p className="text-[11px] text-lark-text-secondary truncate mt-0.5">{agent.description}</p>
        <div className="flex gap-1 mt-1 flex-wrap">
          {agent.tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-lark-primary-light text-lark-primary rounded font-medium border border-lark-primary/10">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgentCard;
