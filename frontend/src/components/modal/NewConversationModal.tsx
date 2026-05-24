import React, { useState, useEffect } from 'react';
import { CreateConversationPayload, Agent } from '@/types';
import { X, UserPlus, Users, Check } from 'lucide-react';

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  onCreateConversation: (payload: CreateConversationPayload) => void;
  agents: Agent[];
}

const NewConversationModal: React.FC<NewConversationModalProps> = ({ open, onClose, onCreateConversation, agents }) => {
  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const enabledAgents = agents.filter(a => a.enabled);

  useEffect(() => {
    if (!open) {
      setMode('single');
      setSelectedAgentIds([]);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgentIds.length === 0) return;

    let finalAgentIds = selectedAgentIds;
    if (mode === 'group') {
      const orchestratorId = 'agent-orchestrator';
      if (!finalAgentIds.includes(orchestratorId) && enabledAgents.some(a => a.id === orchestratorId)) {
        finalAgentIds = [orchestratorId, ...finalAgentIds];
      }
    }

    const title = mode === 'single' 
      ? (agents.find(a => a.id === selectedAgentIds[0])?.name || '新会话')
      : `${finalAgentIds.filter(id => id !== 'agent-orchestrator').length + 1}人会话`;

    onCreateConversation({
      title,
      mode,
      agentIds: finalAgentIds
    });

    setSelectedAgentIds([]);
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
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-5 shadow-2xl border border-lark-border/50 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-sm font-semibold text-lark-text-primary">新建会话</h2>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-lark-bg-hover text-lark-text-secondary hover:text-lark-text-primary transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex bg-[#eef0f2] rounded-lg p-0.5 border border-lark-border/30">
            <button
              type="button"
              onClick={() => switchMode('single')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                mode === 'single'
                  ? 'bg-white text-lark-primary shadow-sm font-semibold'
                  : 'text-lark-text-secondary hover:text-lark-text-primary'
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
                  ? 'bg-white text-lark-primary shadow-sm font-semibold'
                  : 'text-lark-text-secondary hover:text-lark-text-primary'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              群聊 (多Agent)
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-lark-text-secondary mb-2">
              {mode === 'single' ? '选择一个 Agent 成员' : '多选 Agent 成员 (群聊将自动包含 Orchestrator 调度员)'}
            </label>
            <div className="max-h-64 overflow-y-auto border border-lark-border rounded-xl p-1.5 space-y-1 bg-slate-50/30">
              {enabledAgents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                const activeBg = mode === 'single' ? 'bg-lark-primary-light border-lark-primary/30 text-lark-primary' : 'bg-indigo-50 border-indigo-200 text-indigo-700';
                const checkColor = mode === 'single' ? 'bg-lark-primary' : 'bg-indigo-600';

                return (
                  <div
                    key={agent.id}
                    onClick={() => toggleSelectAgent(agent.id)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border duration-150 ${
                      isSelected 
                        ? `${activeBg}`
                        : 'hover:bg-lark-bg-hover border-transparent'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border border-lark-border/30 shadow-sm bg-slate-100">
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-xs font-semibold truncate ${isSelected ? 'font-bold' : 'text-lark-text-primary'}`}>{agent.name}</h4>
                      <p className={`text-[10px] truncate ${isSelected ? 'opacity-85' : 'text-lark-text-secondary'}`}>{agent.description}</p>
                    </div>
                    {isSelected && (
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm ${checkColor}`}>
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                );
              })}
              {enabledAgents.length === 0 && (
                <p className="text-xs text-lark-text-tertiary text-center py-6">没有可用的 Agent</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-grow py-2 border border-lark-border rounded-lg text-xs text-lark-text-primary font-medium hover:bg-lark-bg-hover active:scale-95 transition-all bg-white"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={selectedAgentIds.length === 0}
              className={`flex-grow py-2 rounded-lg text-xs text-white font-semibold shadow-sm active:scale-95 transition-all ${
                selectedAgentIds.length === 0
                  ? 'bg-slate-100 text-slate-400 border border-transparent cursor-not-allowed shadow-none'
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
