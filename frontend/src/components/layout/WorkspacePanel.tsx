import React from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { platform } from '@/utils/platform';
import { FolderOpen, X, RefreshCw, AlertTriangle, CheckCircle, Clock, Trash2 } from 'lucide-react';

export const WorkspacePanel: React.FC = () => {
  const currentWorkspace = useAgentHubStore(state => state.currentWorkspace);
  const workspaceStatus = useAgentHubStore(state => state.workspaceStatus);
  const recentWorkspaces = useAgentHubStore(state => state.recentWorkspaces);
  const selectWorkspace = useAgentHubStore(state => state.selectWorkspace);
  const clearWorkspace = useAgentHubStore(state => state.clearWorkspace);
  const scanWorkspace = useAgentHubStore(state => state.scanWorkspace);
  const removeRecentWorkspace = useAgentHubStore(state => state.removeRecentWorkspace);

  const getStatusBadge = () => {
    switch (workspaceStatus) {
      case 'active':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-200 dark:border-emerald-900/30 px-2 py-0.5 rounded-full">
            <CheckCircle className="w-3 h-3" />
            已连接
          </span>
        );
      case 'loading':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-450 border border-blue-200 dark:border-blue-900/30 px-2 py-0.5 rounded-full animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            加载中
          </span>
        );
      case 'unavailable':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-450 border border-amber-200 dark:border-amber-900/30 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            不可用
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-450 border border-red-200 dark:border-red-900/30 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            读取失败
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-450 border border-slate-200 dark:border-slate-800/80 px-2 py-0.5 rounded-full">
            未关联
          </span>
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-lark-sidebar-bg dark:bg-[#090a12] text-lark-text-primary dark:text-slate-250 select-none">
      <div className="p-4 border-b border-lark-border dark:border-[#161828] flex-shrink-0">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-wide font-sans mb-1">
          本地工作区
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          关联本地项目，让智能体能够读取并修改文件。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Current workspace card */}
        <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-lark-border dark:border-slate-800 p-4 shadow-sm relative overflow-hidden transition-all duration-300">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-350 uppercase tracking-wider mb-1">当前目录</h3>
              <div className="flex items-center gap-2">
                {getStatusBadge()}
              </div>
            </div>
            {currentWorkspace && (
              <button
                onClick={clearWorkspace}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 active:scale-95 transition-all"
                title="清除工作区"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {currentWorkspace ? (
            <div className="space-y-3">
              <div className="p-2.5 rounded-lg bg-[#f8f9fa] dark:bg-slate-900 border border-lark-border/60 dark:border-slate-800/80">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-150 truncate mb-1">
                  {currentWorkspace.name}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-450 break-all font-mono">
                  {currentWorkspace.path}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={selectWorkspace}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-250 dark:border-slate-750 text-slate-700 dark:text-slate-200 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  切换文件夹
                </button>
                <button
                  onClick={scanWorkspace}
                  className="px-3 py-1.5 rounded-lg text-xs bg-lark-primary-light hover:bg-lark-primary-light/80 dark:bg-violet-950/20 dark:hover:bg-violet-950/40 text-lark-primary dark:text-violet-400 border border-lark-primary/20 dark:border-violet-500/20 active:scale-98 transition-all flex items-center justify-center"
                  title="刷新文件"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="py-4 flex flex-col items-center justify-center text-center">
              <FolderOpen className="w-10 h-10 text-slate-350 dark:text-slate-650 stroke-[1.5] mb-2 animate-bounce" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">暂未关联本地项目</p>
              <button
                onClick={selectWorkspace}
                className="px-4 py-2 bg-lark-primary hover:bg-lark-primary-hover dark:bg-violet-650 dark:hover:bg-violet-600 text-white font-medium text-xs rounded-xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-1.5"
              >
                <FolderOpen className="w-4 h-4" />
                打开本地项目
              </button>
            </div>
          )}
        </div>

        {/* Recent workspaces */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-500 px-1">
            最近工作区
          </h3>
          {recentWorkspaces.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-500 italic py-2 px-1">暂无历史记录</p>
          ) : (
            <div className="space-y-1.5">
              {recentWorkspaces.map(w => (
                <div
                  key={w.path}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/50 hover:bg-white dark:bg-slate-900/20 dark:hover:bg-slate-900/40 border border-lark-border/40 hover:border-lark-border/80 dark:border-slate-800/40 dark:hover:border-slate-850 cursor-pointer group transition-all"
                  onClick={() => {
                    useAgentHubStore.getState().updateSettings({}); // Force trigger state update
                    platform.workspace.setCurrent(w.path).then((res: any) => {
                      if (res.success) {
                        useAgentHubStore.setState({
                          currentWorkspace: res.workspace,
                          workspaceStatus: 'active'
                        });
                        scanWorkspace();
                      }
                    });
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {w.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-450 font-mono truncate">
                        {w.path}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentWorkspace(w.path);
                    }}
                    className="p-1 rounded-lg hover:bg-red-50 hover:text-red-650 dark:hover:bg-red-950/20 dark:hover:text-red-450 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity active:scale-95"
                    title="移除记录"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
