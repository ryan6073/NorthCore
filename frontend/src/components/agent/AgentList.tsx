import React, { useState } from 'react';
import { Agent } from '@/types';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { Settings2, Plus, Trash2, Bot, Users, UserPlus, Sparkles } from 'lucide-react';
import ConfirmModal from '../modal/ConfirmModal';

interface AgentListProps {
  agents: Agent[];
}

const AgentList: React.FC<AgentListProps> = ({ agents }) => {
  const allAgents = useAgentHubStore(state => state.agents);
  const activeConversationId = useAgentHubStore(state => state.activeConversationId);
  const conversations = useAgentHubStore(state => state.conversations);
  const addAgentToConversation = useAgentHubStore(state => state.addAgentToConversation);
  const removeAgentFromConversation = useAgentHubStore(state => state.removeAgentFromConversation);
  const openAgentProfile = useAgentHubStore(state => state.openAgentProfile);
  const setConfiguringAgentId = useAgentHubStore(state => state.setConfiguringAgentId);

  const activeConv = conversations.find(c => c.id === activeConversationId);
  const isGroupChat = activeConv?.mode === 'group';

  // Tabs for Chat: 'members' or 'add'
  const [activeTab, setActiveTab] = useState<'members' | 'add'>('members');

  // Confirmation state
  const [showConfirm, setShowConfirm] = useState(false);
  const [agentToRemove, setAgentToRemove] = useState<string | null>(null);

  // Filter agents that are NOT in the active conversation, and only include callable agents
  const availableAgents = allAgents.filter(
    a => !agents.some(active => active.id === a.id)
      && a.enabled === true
      && a.status !== 'disabled'
  );

  const handleAdd = async (agentId: string) => {
    if (activeConversationId) {
      await addAgentToConversation(activeConversationId, agentId);
    }
  };

  const handleRemove = (agentId: string) => {
    if (agentId === 'agent-orchestrator' && agents.length <= 1) {
      alert('多聊中必须保留至少一个智能体');
      return;
    }
    setAgentToRemove(agentId);
    setShowConfirm(true);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-50/30 dark:bg-slate-950/20 font-sans">
      {/* Title / Tab Header */}
      {isGroupChat ? (
        <div className="p-3 pb-2 flex-shrink-0 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg w-full">
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                  activeTab === 'members'
                    ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>群聊成员 ({agents.length})</span>
              </button>
              
              <button
                onClick={() => setActiveTab('add')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                  activeTab === 'add'
                    ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>添加成员</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3.5 pb-2.5 flex-shrink-0 border-b border-slate-100 dark:border-slate-800/85 bg-white dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-slate-850 dark:text-slate-200">
            <Users className="w-3.5 h-3.5 text-lark-primary dark:text-indigo-400" />
            <span className="text-xs font-bold">协作成员</span>
          </div>
        </div>
      )}

      {/* List Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {!isGroupChat || activeTab === 'members' ? (
          agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bot className="w-8 h-8 text-slate-300 dark:text-slate-700 stroke-1.5 mb-2" />
              <p className="text-[11px] text-slate-450 dark:text-slate-500">暂无协作智能体</p>
            </div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-900 rounded-xl hover:shadow-md border border-slate-100 dark:border-slate-800/80 transition-all duration-205 group relative"
              >
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    openAgentProfile(agent.id);
                  }}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow-sm border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:scale-105 transition-transform cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-semibold text-slate-805 dark:text-slate-200 truncate">{agent.name}</h4>
                    {!agent.enabled && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 scale-90 origin-left flex-shrink-0">已禁用</span>
                    )}
                    {agent.status === 'thinking' && (
                      <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500"></span>
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 truncate mt-0.5">{agent.description}</p>
                </div>
                
                {/* Actions: Settings and Delete */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfiguringAgentId(agent.id, true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-violet-550 dark:hover:text-violet-400 transition-colors"
                    title="配置智能体"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                  {isGroupChat && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(agent.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-955/20 text-slate-400 hover:text-red-500 transition-colors"
                      title="从多聊移除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )
        ) : (
          availableAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-700 stroke-1.5 mb-2" />
              <p className="text-[11px] text-slate-450 dark:text-slate-500">所有可用智能体均已加入</p>
            </div>
          ) : (
            availableAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-900 rounded-xl hover:shadow-md border border-slate-100 dark:border-slate-800/80 transition-all duration-200 group"
              >
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    openAgentProfile(agent.id);
                  }}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow-sm border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:scale-105 transition-transform cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-semibold text-slate-805 dark:text-slate-200 truncate">{agent.name}</h4>
                    {!agent.enabled && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 scale-90 origin-left flex-shrink-0">已禁用</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 truncate mt-0.5">{agent.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(agent.id)}
                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 hover:bg-violet-100 dark:bg-violet-955/30 dark:hover:bg-violet-950/40 text-violet-600 dark:text-violet-400 shadow-sm transition-all active:scale-90"
                  title="添加到多聊"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ))
          )
        )}
      </div>

      <ConfirmModal
        open={showConfirm}
        title="确认移出智能体"
        content={`你确定要从当前多聊会话中移出 ${allAgents.find(a => a.id === agentToRemove)?.name || ''} 吗？这不会删除智能体本身。`}
        confirmText="确认移出"
        cancelText="取消"
        type="warning"
        onConfirm={async () => {
          if (activeConversationId && agentToRemove) {
            await removeAgentFromConversation(activeConversationId, agentToRemove);
          }
        }}
        onClose={() => {
          setShowConfirm(false);
          setAgentToRemove(null);
        }}
      />
    </div>
  );
};

export default AgentList;
