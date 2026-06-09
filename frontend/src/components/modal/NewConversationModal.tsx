import React, { useState, useEffect, useRef } from 'react';
import { CreateConversationPayload, Agent, UserInfo } from '@/types';
import { X, UserPlus, Users, Check, Plus, Loader2, Search, Cloud, ChevronDown, AlertCircle } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  onCreateConversation: (payload: CreateConversationPayload) => void;
  agents: Agent[];
}

const NewConversationModal: React.FC<NewConversationModalProps> = ({ open, onClose, onCreateConversation, agents }) => {
  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const workspaces = useAgentHubStore(state => state.workspaces);
  const loadWorkspaces = useAgentHubStore(state => state.loadWorkspaces);
  const createWorkspace = useAgentHubStore(state => state.createWorkspace);
  const currentUser = useAgentHubStore(state => state.currentUser) as (UserInfo | null);

  const isGuest = currentUser?.role === 'guest';

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [wsSearch, setWsSearch] = useState('');
  const [wsError, setWsError] = useState<string | null>(null);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  const preselectedAgentId = useAgentHubStore(state => state.preselectedAgentId);
  const setPreselectedAgentId = useAgentHubStore(state => state.setPreselectedAgentId);

  const displayAgents = agents.filter(a => a.enabled === true && a.status !== 'disabled' && a.id !== 'agent-orchestrator');

  useEffect(() => {
    if (open) {
      if (!isGuest) {
        loadWorkspaces();
      }
      if (preselectedAgentId) {
        setSelectedAgentIds([preselectedAgentId]);
      }
    } else {
      setMode('single');
      setSelectedAgentIds([]);
      setSelectedWorkspaceId('');
      setShowCreateWorkspace(false);
      setShowWsDropdown(false);
      setNewWorkspaceName('');
      setWsSearch('');
      setWsError(null);
      setCreatingWorkspace(false);
      setPreselectedAgentId(null);
    }
  }, [open, isGuest, loadWorkspaces, preselectedAgentId, setPreselectedAgentId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showWsDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setShowWsDropdown(false);
        setWsSearch('');
        setWsError(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showWsDropdown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgentIds.length === 0) return;
    if (!isGuest && !selectedWorkspaceId) return;

    let finalAgentIds = selectedAgentIds;
    if (mode === 'group') {
      const orchestratorId = 'agent-orchestrator';
      if (!finalAgentIds.includes(orchestratorId) && displayAgents.some(a => a.id === orchestratorId)) {
        finalAgentIds = [orchestratorId, ...finalAgentIds];
      }
    }

    const title = mode === 'single'
      ? (agents.find(a => a.id === selectedAgentIds[0])?.name || '新会话')
      : `${finalAgentIds.filter(id => id !== 'agent-orchestrator').length + 1}人会话`;

    onCreateConversation({
      title,
      mode,
      agentIds: finalAgentIds,
      ...(isGuest ? {} : { workspaceId: selectedWorkspaceId || undefined })
    });

    setSelectedAgentIds([]);
    setSelectedWorkspaceId('');
    onClose();
  };

  const toggleSelectAgent = (agentId: string) => {
    if (mode === 'single') {
      setSelectedAgentIds([agentId]);
    } else {
      setSelectedAgentIds(prev =>
        prev.includes(agentId)
          ? prev.filter(id => id !== agentId)
          : [...prev, agentId]
      );
    }
  };

  const switchMode = (newMode: 'single' | 'group') => {
    setMode(newMode);
    setSelectedAgentIds([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md mx-4 p-5 shadow-2xl border border-lark-border/50 dark:border-slate-800 animate-scale-in transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-sm font-semibold text-lark-text-primary dark:text-slate-100">新建会话</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200 transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex bg-[#eef0f2] dark:bg-slate-950 rounded-lg p-0.5 border border-lark-border/30 dark:border-slate-800">
            <button
              type="button"
              onClick={() => switchMode('single')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${mode === 'single'
                  ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                  : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
                }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              单聊 (1v1)
            </button>
            <button
              type="button"
              onClick={() => switchMode('group')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${mode === 'group'
                  ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                  : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
                }`}
            >
              <Users className="w-3.5 h-3.5" />
              群聊 (多Agent)
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-lark-text-secondary dark:text-slate-400 mb-2">
              {mode === 'single' ? '选择一个 Agent 成员' : '多选 Agent 成员 (群聊将自动包含 Orchestrator 调度员)'}
            </label>
            <div className="max-h-64 overflow-y-auto border border-lark-border dark:border-slate-800 rounded-xl p-1.5 space-y-1 bg-slate-50/30 dark:bg-slate-950/20">
              {displayAgents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                const activeBg = mode === 'single' ? 'bg-lark-primary-light dark:bg-violet-950/30 border-lark-primary/30 dark:border-violet-900/40 text-lark-primary dark:text-white' : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-white';
                const checkColor = mode === 'single' ? 'bg-lark-primary' : 'bg-indigo-600';

                return (
                  <div
                    key={agent.id}
                    onClick={() => toggleSelectAgent(agent.id)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border duration-150 ${isSelected
                        ? `${activeBg}`
                        : 'hover:bg-lark-bg-hover dark:hover:bg-slate-800 border-transparent'
                      }`}
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border border-lark-border/30 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-900">
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className={`text-xs font-semibold truncate ${isSelected ? 'font-bold' : 'text-lark-text-primary dark:text-slate-200'}`}>{agent.name}</h4>
                        {!agent.enabled && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 scale-90 origin-left flex-shrink-0">已禁用</span>
                        )}
                      </div>
                      <p className={`text-[10px] truncate ${isSelected ? 'opacity-85' : 'text-lark-text-secondary dark:text-slate-400'}`}>{agent.description}</p>
                    </div>
                    {isSelected && (
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm ${checkColor}`}>
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                );
              })}
              {displayAgents.length === 0 && (
                <p className="text-xs text-lark-text-tertiary dark:text-slate-500 text-center py-6">没有可用的 Agent</p>
              )}
            </div>
          </div>

          {/* Workspace Selection Section - 只对非Guest用户显示 */}
          {!isGuest && (
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-lark-text-secondary dark:text-slate-400 mb-1">
                绑定工作区 (必填)
              </label>
              <div className="relative" ref={wsDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowWsDropdown(!showWsDropdown);
                    setShowCreateWorkspace(false);
                    setNewWorkspaceName('');
                    setWsSearch('');
                    setWsError(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer select-none
                    ${showWsDropdown
                      ? 'bg-violet-500/10 border-violet-500/50 text-violet-600 dark:text-violet-400'
                      : selectedWorkspaceId
                        ? 'bg-violet-50/80 dark:bg-violet-950/20 border-violet-300/60 dark:border-violet-800/60 text-violet-700 dark:text-violet-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Cloud className={`w-3.5 h-3.5 flex-shrink-0 ${selectedWorkspaceId ? 'text-violet-500' : 'text-slate-400'}`} />
                    <span className="truncate">
                      {selectedWorkspaceId
                        ? workspaces.find(w => w.id === selectedWorkspaceId)?.name
                        : '请选择绑定的工作区'}
                    </span>
                  </div>
                  <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${showWsDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showWsDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-xl backdrop-blur-md p-2 z-[99] animate-fade-in">
                    {/* Search box */}
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={wsSearch}
                        onChange={(e) => setWsSearch(e.target.value)}
                        placeholder="搜索工作区..."
                        className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-violet-500/80 dark:focus:border-violet-500/50 text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    {/* Workspace list */}
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {(() => {
                        const filtered = workspaces.filter(w =>
                          w.name.toLowerCase().includes(wsSearch.toLowerCase())
                        );
                        if (filtered.length === 0 && wsSearch) {
                          return <div className="text-[11px] text-slate-400 italic text-center py-4">无匹配工作区</div>;
                        }
                        return filtered.map(w => {
                          const isSelected = selectedWorkspaceId === w.id;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => {
                                setSelectedWorkspaceId(w.id);
                                setShowWsDropdown(false);
                                setWsSearch('');
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-all group
                                ${isSelected
                                  ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 font-bold border border-violet-500/20'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-350 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
                                }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1 pr-1.5">
                                <Cloud className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-violet-500' : 'text-slate-400 group-hover:text-violet-500/80 transition-colors'}`} />
                                <span className="truncate">{w.name}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />}
                            </button>
                          );
                        });
                      })()}
                    </div>

                    {/* Separator */}
                    <div className="h-px bg-slate-100 dark:bg-slate-850/80 my-1.5" />

                    {/* Create area */}
                    <div>
                      {showCreateWorkspace ? (
                        <div className="flex flex-col gap-1.5 p-1 animate-scale-in">
                          <input
                            type="text"
                            value={newWorkspaceName}
                            onChange={(e) => {
                              setNewWorkspaceName(e.target.value);
                              setWsError(null);
                            }}
                            placeholder="工作区名称..."
                            autoFocus
                            className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-violet-500 text-slate-800 dark:text-slate-100"
                          />
                          {wsError && (
                            <div className="flex items-center gap-1 text-[10px] text-red-500 dark:text-red-400">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              <span>{wsError}</span>
                            </div>
                          )}
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setShowCreateWorkspace(false);
                                setNewWorkspaceName('');
                                setWsError(null);
                              }}
                              className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={!newWorkspaceName.trim() || creatingWorkspace}
                              onClick={async () => {
                                const name = newWorkspaceName.trim();
                                if (!name) return;
                                // 前端同名检查
                                if (workspaces.some(w => w.name === name)) {
                                  setWsError(`工作区 "${name}" 已存在，请换个名称`);
                                  return;
                                }
                                setCreatingWorkspace(true);
                                setWsError(null);
                                try {
                                  const newWs = await createWorkspace(name);
                                  if (newWs) {
                                    setSelectedWorkspaceId(newWs.id);
                                    setShowCreateWorkspace(false);
                                    setNewWorkspaceName('');
                                    setShowWsDropdown(false);
                                  }
                                } catch (e: any) {
                                  const msg = e?.response?.data?.data?.error === 'workspace_name_conflict'
                                    ? `工作区 "${name}" 已存在，请换个名称`
                                    : '创建工作区失败，请重试';
                                  setWsError(msg);
                                } finally {
                                  setCreatingWorkspace(false);
                                }
                              }}
                              className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-[10px] text-white rounded font-bold transition-all flex items-center gap-1"
                            >
                              {creatingWorkspace && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                              确定
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateWorkspace(true);
                            setNewWorkspaceName('');
                            setWsError(null);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-[11px] text-slate-550 dark:text-slate-450 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg transition-all font-semibold border border-dashed border-slate-200 dark:border-slate-800/80 hover:border-violet-500/30"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新建工作区</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-grow py-2 border border-lark-border dark:border-slate-800 rounded-lg text-xs text-lark-text-primary dark:text-slate-300 font-medium hover:bg-lark-bg-hover dark:hover:bg-slate-800 active:scale-95 transition-all bg-white dark:bg-slate-900"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={selectedAgentIds.length === 0 || (!isGuest && !selectedWorkspaceId)}
              className={`flex-grow py-2 rounded-lg text-xs text-white font-semibold shadow-sm active:scale-95 transition-all ${selectedAgentIds.length === 0 || (!isGuest && !selectedWorkspaceId)
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-550 border border-transparent cursor-not-allowed shadow-none'
                  : mode === 'single'
                    ? 'bg-lark-primary hover:bg-lark-primary-hover'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
            >
              创建{mode === 'single' ? '单聊' : '群聊'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewConversationModal;
