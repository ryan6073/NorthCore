import React from 'react';
import { Agent } from '@/types';
import { Circle, CircleDot, CircleDotDashed } from 'lucide-react';

interface AgentContactCardProps {
  agent: Agent;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick?: () => void;
  showSelect?: boolean;
  disabled?: boolean;
}

const AgentContactCard: React.FC<AgentContactCardProps> = ({
  agent,
  isSelected = false,
  onSelect,
  onClick,
  showSelect = false,
  disabled = false
}) => {
  const renderStatusIcon = () => {
    if (agent.status === 'online') {
      return <CircleDot className="w-3 h-3 text-green-500 fill-green-500" />;
    }
    if (agent.status === 'offline') {
      return <Circle className="w-3 h-3 text-slate-400" />;
    }
    return <CircleDotDashed className="w-3 h-3 text-yellow-500" />;
  };

  return (
    <div
      onClick={() => {
        if (disabled) return;
        if (showSelect && onSelect) {
          onSelect();
        } else if (onClick) {
          onClick();
        } else if (onSelect) {
          onSelect();
        }
      }}
      className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-150 border ${
        disabled 
          ? 'opacity-50 bg-slate-50 cursor-not-allowed border-transparent' 
          : isSelected
            ? 'bg-lark-primary-light border-lark-primary/30 text-lark-primary'
            : 'hover:bg-lark-bg-hover border-transparent'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-lark-border/40 shadow-sm bg-slate-50">
          <img
            src={agent.avatar}
            alt={agent.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm">
          {renderStatusIcon()}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h4 className={`text-xs font-semibold truncate ${isSelected ? 'text-lark-primary font-bold' : 'text-lark-text-primary'}`}>{agent.name}</h4>
          {!agent.enabled && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 text-slate-500 scale-90 origin-left">禁用</span>
          )}
        </div>
        <p className={`text-[11px] truncate ${isSelected ? 'text-lark-primary/80' : 'text-lark-text-secondary'}`}>{agent.description}</p>
      </div>

      {showSelect && (
        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${
          isSelected 
            ? 'bg-lark-primary border-lark-primary text-white shadow-sm' 
            : 'border-slate-300 bg-white hover:border-lark-primary'
        }`}>
          {isSelected && (
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentContactCard;
