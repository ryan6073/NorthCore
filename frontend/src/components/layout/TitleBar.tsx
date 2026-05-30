import React from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { platform } from '@/utils/platform';
import { Minus, Square, X, Wifi, WifiOff, Cpu, Folder } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const currentWorkspace = useAgentHubStore(state => state.currentWorkspace);
  const wsStatus = useAgentHubStore(state => state.wsStatus);
  const localAgentProcesses = useAgentHubStore(state => state.localAgentProcesses);

  const isLocalAgentRunning = localAgentProcesses.some(a => a.status === 'running');
  const runningAgentNames = localAgentProcesses.filter(a => a.status === 'running').map(a => a.name).join(', ');

  const handleMinimize = () => {
    platform.window.minimize();
  };

  const handleMaximize = () => {
    platform.window.maximize();
  };

  const handleClose = () => {
    platform.window.close();
  };

  return (
    <div 
      className="h-9 w-full bg-[#f3f4f6] dark:bg-[#07080f] border-b border-lark-border dark:border-[#161828] flex items-center justify-between px-3 select-none flex-shrink-0 transition-colors z-50 drag-region"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: App Title */}
      <div className="flex items-center gap-2 no-drag-region" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-wide font-sans">
          AgentHub
        </span>
        <span className="h-3 w-px bg-slate-300 dark:bg-slate-800" />
        
        {/* Workspace Indicator */}
        {currentWorkspace ? (
          <div className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
            <Folder className="w-3 h-3 text-lark-primary dark:text-indigo-400" />
            <span className="max-w-[150px] truncate" title={currentWorkspace.path}>
              {currentWorkspace.name}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-450 dark:text-slate-500 italic">
            No Workspace
          </span>
        )}
      </div>

      {/* Center: Window Title / Drag Area Indicator */}
      <div className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400 max-w-[300px] truncate text-center hidden md:block">
        {currentWorkspace ? currentWorkspace.path : '工作区未加载'}
      </div>

      {/* Right: Capabilities Status & Window Controls */}
      <div className="flex items-center gap-3 no-drag-region" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Status badges */}
        <div className="flex items-center gap-2">
          {/* WS Connection */}
          {wsStatus === 'connected' ? (
            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-450 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
              <Wifi className="w-2.5 h-2.5" />
              <span>ONLINE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[9px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-md animate-pulse">
              <WifiOff className="w-2.5 h-2.5" />
              <span>OFFLINE</span>
            </div>
          )}

          {/* Local Agents */}
          {isLocalAgentRunning ? (
            <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md" title={`Running: ${runningAgentNames}`}>
              <Cpu className="w-2.5 h-2.5 animate-spin-slow" />
              <span>AGENTS UP</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[9px] text-slate-400 dark:text-slate-550 bg-slate-500/5 px-1.5 py-0.5 rounded-md">
              <Cpu className="w-2.5 h-2.5" />
              <span>STANDBY</span>
            </div>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-0.5 border-l border-slate-300 dark:border-slate-800 pl-2">
          <button 
            onClick={handleMinimize}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-850 rounded text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-white"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={handleMaximize}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-850 rounded text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-white"
          >
            <Square className="w-3 h-3" />
          </button>
          <button 
            onClick={handleClose}
            className="p-1 hover:bg-red-500 hover:text-white rounded text-slate-500 dark:text-slate-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
