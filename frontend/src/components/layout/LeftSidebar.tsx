import React, { useState } from 'react';
import { Conversation, Agent } from '@/types';
import { Plus, Search, MessageSquare, Users } from 'lucide-react';
import AgentDirectory from '../agent/AgentDirectory';
import AgentDetailPanel from '../agent/AgentDetailPanel';

interface LeftSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onOpenNewConversation: () => void;
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSaveAgent: (updated: Agent) => void;
  onBackFromAgentDetail: () => void;
  viewMode: 'conversations' | 'agents' | 'agent-detail';
  setViewMode: (mode: 'conversations' | 'agents' | 'agent-detail') => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onOpenNewConversation,
  agents,
  selectedAgentId,
  onSelectAgent,
  onSaveAgent,
  onBackFromAgentDetail,
  viewMode,
  setViewMode
}) => {
  const [keyword, setKeyword] = useState('');

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(keyword.toLowerCase())
  );

  const getAgentAvatar = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.avatar || '';
  };

  const renderConversationAvatar = (conv: Conversation) => {
    if (conv.mode === 'single') {
      return (
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 border border-lark-border/50 shadow-sm">
          <img 
            src={getAgentAvatar(conv.agentIds[0])} 
            alt={conv.title} 
            className="w-full h-full object-cover"
          />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-lark-border/50 flex-shrink-0 flex items-center justify-center overflow-hidden relative shadow-sm">
        {conv.agentIds.length <= 2 ? (
          <div className="w-full h-full flex">
            {conv.agentIds.slice(0, 2).map((agentId, idx) => (
              <div key={idx} className="flex-1 h-full overflow-hidden">
                <img 
                  src={getAgentAvatar(agentId)} 
                  alt=""
                  className="w-full h-full object-cover" 
                />
              </div>
            ))}
          </div>
        ) : conv.agentIds.length === 3 ? (
          <div className="w-full h-full grid grid-cols-2 gap-0.5 p-0.5">
            <div className="col-span-1 overflow-hidden rounded-sm">
              <img src={getAgentAvatar(conv.agentIds[0])} alt="" className="w-full h-full object-cover animate-pulse" />
            </div>
            <div className="col-span-1 overflow-hidden rounded-sm">
              <img src={getAgentAvatar(conv.agentIds[1])} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="col-span-2 overflow-hidden rounded-sm">
              <img src={getAgentAvatar(conv.agentIds[2])} alt="" className="w-full h-full object-cover" />
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-indigo-500 text-white">
            <span className="text-xs font-bold font-sans">+{conv.agentIds.length}</span>
          </div>
        )}
      </div>
    );
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="w-full h-full bg-lark-sidebar-bg flex flex-col border-r border-lark-border overflow-hidden">
      {viewMode !== 'agent-detail' && (
        <div className="p-4 pb-2 bg-transparent flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold font-sans text-lark-text-primary tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              AgentHub
            </h1>
            <button
              onClick={onOpenNewConversation}
              className="w-8 h-8 rounded-lg bg-white border border-lark-border text-lark-text-secondary hover:text-lark-primary hover:bg-lark-bg-hover hover:border-lark-primary/30 flex items-center justify-center transition-all shadow-sm active:scale-95"
              title="新建会话"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex bg-[#eef0f2] rounded-lg p-0.5 mb-3 border border-lark-border/30">
            <button
              onClick={() => setViewMode('conversations')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'conversations'
                  ? 'bg-white text-lark-primary shadow-sm font-semibold'
                  : 'text-lark-text-secondary hover:text-lark-text-primary'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              会话
            </button>
            <button
              onClick={() => setViewMode('agents')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'agents'
                  ? 'bg-white text-lark-primary shadow-sm font-semibold'
                  : 'text-lark-text-secondary hover:text-lark-text-primary'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              联系人
            </button>
          </div>

          {viewMode === 'conversations' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lark-text-tertiary" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索会话..."
                className="w-full pl-9 pr-4 py-1.5 bg-[#eff0f1] rounded-lg text-xs text-lark-text-primary placeholder:text-lark-text-tertiary border border-transparent outline-none focus:bg-white focus:border-lark-primary focus:ring-1 focus:ring-lark-primary/20 transition-all"
              />
            </div>
          )}
        </div>
      )}

      {viewMode === 'conversations' && (
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 min-h-0">
          {filteredConversations.length === 0 ? (
            <p className="text-xs text-lark-text-tertiary text-center py-8">没有找到相关会话</p>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`p-2.5 rounded-lg cursor-pointer transition-all duration-150 relative ${
                    isActive
                      ? 'bg-lark-primary-light text-lark-primary'
                      : 'hover:bg-lark-bg-hover'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-lark-primary" />
                  )}
                  <div className="flex items-center gap-3">
                    {renderConversationAvatar(conv)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className={`text-sm font-medium truncate ${
                            isActive ? 'text-lark-primary font-semibold' : 'text-lark-text-primary'
                          }`}>{conv.title}</h3>
                        </div>
                        <span className="text-[10px] text-lark-text-tertiary flex-shrink-0 font-normal">
                          {conv.updatedAt.split(' ').pop()}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${
                        isActive ? 'text-lark-primary/80' : 'text-lark-text-secondary'
                      }`}>{conv.lastMessage || '暂无消息'}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === 'agents' && (
        <AgentDirectory
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={(agentId) => {
            onSelectAgent(agentId);
            setViewMode('agent-detail');
          }}
        />
      )}

      {viewMode === 'agent-detail' && selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onSave={onSaveAgent}
          onBack={() => {
            onBackFromAgentDetail();
            setViewMode('agents');
          }}
        />
      )}
    </div>
  );
};

export default LeftSidebar;
