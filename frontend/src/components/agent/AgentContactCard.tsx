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
      className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-150 border group ${
        disabled 
          ? 'opacity-50 bg-slate-50 dark:bg-slate-900/40 cursor-not-allowed border-transparent' 
          : isSelected
            ? 'bg-lark-primary-light dark:bg-violet-950/40 border-lark-primary/30 dark:border-violet-800/40 text-lark-primary dark:text-white'
            : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border-transparent'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-lark-border/40 dark:border-slate-800 shadow-sm bg-slate-50 dark:bg-slate-900">
          <img
            src={agent.avatar}
            alt={agent.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 p-0.5 rounded-full shadow-sm">
          {renderStatusIcon()}
        </div>
      </div>

      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h4 className={`text-xs font-semibold truncate transition-colors ${isSelected ? 'text-lark-primary dark:text-white font-bold' : 'text-lark-text-primary dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{agent.name}</h4>
          {!agent.enabled && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 scale-90 origin-left">禁用</span>
          )}
        </div>
        <p className={`text-[11px] truncate transition-colors ${isSelected ? 'text-lark-primary/80 dark:text-violet-200/90' : 'text-lark-text-secondary dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`}>{agent.description}</p>
      </div>

      {showSelect && (
        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${
          isSelected 
            ? 'bg-lark-primary dark:bg-violet-600 border-lark-primary dark:border-violet-600 text-white shadow-sm' 
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:border-lark-primary dark:hover:border-violet-500'
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
