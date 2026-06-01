import React, { useState, useEffect } from 'react';
import { CreateConversationPayload, Agent } from '@/types';
import { X, UserPlus, Users, Check } from 'lucide-react';
import { useAgentHubStore } from '../../store/useAgentHubStore';

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  onCreateConversation: (payload: CreateConversationPayload) => void;
  agents: Agent[];
}

const NewConversationModal: React.FC<NewConversationModalProps> = ({ open, onClose, onCreateConversation, agents }) => {
  const { workspaces, loadWorkspaces, createWorkspace } = useAgentHubStore();
  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  
  // Workspace specific states
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState<boolean>(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState<string>('');
  const [isSubmittingWorkspace, setIsSubmittingWorkspace] = useState<boolean>(false);

  const displayAgents = agents;

  useEffect(() => {
    if (open) {
      loadWorkspaces();
    } else {
      setMode('single');
      setSelectedAgentIds([]);
      setSelectedWorkspaceId('');
      setIsCreatingWorkspace(false);
      setNewWorkspaceName('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgentIds.length === 0) return;

    let finalWorkspaceId = selectedWorkspaceId || undefined;
    if (isCreatingWorkspace && newWorkspaceName.trim()) {
      setIsSubmittingWorkspace(true);
      try {
        const ws = await createWorkspace(newWorkspaceName.trim());
        if (ws) {
          finalWorkspaceId = ws.id;
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSubmittingWorkspace(false);
      }
    }

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
      workspaceId: finalWorkspaceId
    });

    setSelectedAgentIds([]);
    setSelectedWorkspaceId('');
    setIsCreatingWorkspace(false);
    setNewWorkspaceName('');
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
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                mode === 'single'
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
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                mode === 'group'
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
            <div className="max-h-52 overflow-y-auto border border-lark-border dark:border-slate-800 rounded-xl p-1.5 space-y-1 bg-slate-50/30 dark:bg-slate-950/20">
              {displayAgents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                const activeBg = mode === 'single' ? 'bg-lark-primary-light dark:bg-violet-950/30 border-lark-primary/30 dark:border-violet-900/40 text-lark-primary dark:text-white' : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-white';
                const checkColor = mode === 'single' ? 'bg-lark-primary' : 'bg-indigo-600';

                return (
                  <div
                    key={agent.id}
                    onClick={() => toggleSelectAgent(agent.id)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border duration-150 ${
                      isSelected 
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
          <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-semibold text-lark-text-secondary dark:text-slate-400">
                关联 Sandbox 工作区 (文件沙箱)
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingWorkspace(!isCreatingWorkspace);
                  setNewWorkspaceName('');
                }}
                className="text-[10px] text-lark-primary dark:text-violet-400 hover:underline font-medium"
              >
                {isCreatingWorkspace ? '选择已有工作区' : '➕ 新建工作区'}
              </button>
            </div>

            {isCreatingWorkspace ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="请输入工作区名称，例如：商城前端工程"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 border border-lark-border dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-lark-primary dark:focus:ring-violet-600 bg-slate-50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-200"
                  autoFocus
                />
              </div>
            ) : (
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-lark-border dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-lark-primary dark:focus:ring-violet-600 bg-slate-50 dark:bg-slate-950/40 text-slate-850 dark:text-slate-250"
              >
                <option value="">不绑定 (由沙箱运行自动分配默认工作区)</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    📁 {ws.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              同一个工作区内的文件将被持久保存，并可被多个会话复用以进行连续的代码开发。
            </p>
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
              disabled={selectedAgentIds.length === 0 || isSubmittingWorkspace}
              className={`flex-grow py-2 rounded-lg text-xs text-white font-semibold shadow-sm active:scale-95 transition-all ${
                selectedAgentIds.length === 0 || isSubmittingWorkspace
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-transparent cursor-not-allowed shadow-none'
                  : mode === 'single'
                    ? 'bg-lark-primary hover:bg-lark-primary-hover'
                    : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isSubmittingWorkspace ? '正在创建工作区...' : `创建${mode === 'single' ? '单聊' : '群聊'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewConversationModal;
