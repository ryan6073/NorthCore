import React, { useState, useEffect } from 'react';
import { CreateConversationPayload, Agent } from '@/types';
import { X, UserPlus, Users, Check, FolderOpen, Plus, Loader2 } from 'lucide-react';
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

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const preselectedAgentId = useAgentHubStore(state => state.preselectedAgentId);
  const setPreselectedAgentId = useAgentHubStore(state => state.setPreselectedAgentId);

  const displayAgents = agents;

  useEffect(() => {
    if (open) {
      loadWorkspaces();
      if (preselectedAgentId) {
        setSelectedAgentIds([preselectedAgentId]);
      }
    } else {
      setMode('single');
      setSelectedAgentIds([]);
      setSelectedWorkspaceId('');
      setShowCreateWorkspace(false);
      setNewWorkspaceName('');
      setCreatingWorkspace(false);
      setPreselectedAgentId(null);
    }
  }, [open, loadWorkspaces, preselectedAgentId, setPreselectedAgentId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgentIds.length === 0) return;

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
      workspaceId: selectedWorkspaceId || undefined
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

          {/* Workspace Selection Section */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold text-lark-text-secondary dark:text-slate-400">
                绑定工作区 (必填)
              </label>
              {!showCreateWorkspace && (
                <button
                  type="button"
                  onClick={() => setShowCreateWorkspace(true)}
                  className="text-[10px] text-lark-primary dark:text-violet-400 font-bold hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  新建工作区
                </button>
              )}
            </div>

            {showCreateWorkspace ? (
              <div className="flex gap-2 p-2 bg-slate-50 dark:bg-slate-950/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl items-center animate-fade-in">
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="工作区名称..."
                  className="flex-1 text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-lark-primary"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={creatingWorkspace}
                  onClick={async () => {
                    const name = newWorkspaceName.trim();
                    if (!name) return;
                    setCreatingWorkspace(true);
                    try {
                      const newWs = await createWorkspace(name);
                      if (newWs) {
                        setSelectedWorkspaceId(newWs.id);
                        setShowCreateWorkspace(false);
                        setNewWorkspaceName('');
                      }
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setCreatingWorkspace(false);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-lark-primary text-white text-[10px] font-bold rounded-lg hover:bg-lark-primary-hover active:scale-95 transition-all flex items-center gap-1 flex-shrink-0"
                >
                  {creatingWorkspace ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  确认
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateWorkspace(false);
                    setNewWorkspaceName('');
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-650 dark:text-slate-300 text-[10px] font-bold rounded-lg active:scale-95 transition-all flex-shrink-0"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <select
                  value={selectedWorkspaceId}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-lark-primary transition-all font-medium cursor-pointer"
                >
                  <option value="">📁 请选择绑定的工作区 (必填)</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      📁 {w.name}
                    </option>
                  ))}
                </select>
                {workspaces.length === 0 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    ⚠️ 暂无可用工作区，请先点击“新建工作区”创建一个。
                  </p>
                )}
              </div>
            )}
          </div>

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
              disabled={selectedAgentIds.length === 0 || !selectedWorkspaceId}
              className={`flex-grow py-2 rounded-lg text-xs text-white font-semibold shadow-sm active:scale-95 transition-all ${selectedAgentIds.length === 0 || !selectedWorkspaceId
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
