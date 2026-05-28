import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Conversation, Agent } from '@/types';
import { Plus, Search, MessageSquare, Users, Trash2, MoreVertical, Settings, LogOut, Pin, Archive, ChevronDown, ChevronRight } from 'lucide-react';
import AgentDirectory from '../agent/AgentDirectory';
import AgentDetailPanel from '../agent/AgentDetailPanel';
import ConfirmModal from '../modal/ConfirmModal';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface LeftSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onOpenNewConversation: () => void;
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSaveAgent: (updated: Agent) => void;
  onDeleteAgent: (agentId: string) => void;
  onDeleteConversation: (id: string) => void;
  onBackFromAgentDetail: () => void;
  viewMode: 'conversations' | 'agents' | 'agent-detail';
  setViewMode: (mode: 'conversations' | 'agents' | 'agent-detail') => void;
}

const getNewAgentTemplate = (): Agent => ({
  id: 'new',
  name: '新建智能体',
  avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cute%20robot%20avatar%20cartoon%20avatar&image_size=square',
  description: '这是一个自定义配置的开发/功能型 AI 智能体。',
  tags: ['新建'],
  status: 'offline',
  category: 'coding',
  provider: 'custom',
  enabled: true,
  lastUsedAt: '',
  systemPrompt: '你是一个专业的协作助手，协助用户处理各种任务。',
  modelConfig: {
    provider: 'custom',
    modelName: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096
  },
  tools: [
    { id: 'file_read', name: '读文件', description: '读取文件内容', enabled: false },
    { id: 'file_write', name: '写文件', description: '写入或修改文件', enabled: false }
  ],
  permissions: {
    canReadFiles: false,
    canWriteFiles: false,
    canRunCommands: false,
    canGenerateArtifacts: false,
    canDeploy: false
  }
});

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onOpenNewConversation,
  agents,
  selectedAgentId,
  onSelectAgent,
  onSaveAgent,
  onDeleteAgent,
  onDeleteConversation,
  onBackFromAgentDetail,
  viewMode,
  setViewMode
}) => {
  const [keyword, setKeyword] = useState('');
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);
  const [deleteConvTitle, setDeleteConvTitle] = useState<string>('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSessionsExpanded, setIsSessionsExpanded] = useState(true);
  const [isAgentChatsExpanded, setIsAgentChatsExpanded] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const handleScrollClose = () => {
      if (activeMenuId) {
        setActiveMenuId(null);
        setMenuAnchorRect(null);
      }
    };
    window.addEventListener('scroll', handleScrollClose, true);
    return () => {
      window.removeEventListener('scroll', handleScrollClose, true);
    };
  }, [activeMenuId]);

  const currentUser = useAgentHubStore(state => state.currentUser);
  const logout = useAgentHubStore(state => state.logout);
  const setIsSettingsOpen = useAgentHubStore(state => state.setIsSettingsOpen);
  const togglePinConversation = useAgentHubStore(state => state.togglePinConversation);
  const toggleArchiveConversation = useAgentHubStore(state => state.toggleArchiveConversation);

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(keyword.toLowerCase())
  );

  const getAgentAvatar = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.avatar || '';
  };

  const renderConversationAvatar = (conv: Conversation) => {
    const agentIds = conv.agentIds || [];
    if (conv.mode === 'single' || conv.mode === 'agent') {
      return (
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-900 border border-lark-border/50 dark:border-slate-800/60 shadow-sm">
          <img 
            src={getAgentAvatar(agentIds[0] || '')} 
            alt={conv.title} 
            className="w-full h-full object-cover"
          />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-lark-border/50 dark:border-slate-800/60 flex-shrink-0 flex items-center justify-center overflow-hidden relative shadow-sm">
        {agentIds.length <= 2 ? (
          <div className="w-full h-full flex">
            {agentIds.slice(0, 2).map((agentId, idx) => (
              <div key={idx} className="flex-1 h-full overflow-hidden">
                <img 
                  src={getAgentAvatar(agentId)} 
                  alt=""
                  className="w-full h-full object-cover" 
                />
              </div>
            ))}
          </div>
        ) : agentIds.length === 3 ? (
          <div className="w-full h-full grid grid-cols-2 gap-0.5 p-0.5">
            <div className="col-span-1 overflow-hidden rounded-sm">
              <img src={getAgentAvatar(agentIds[0])} alt="" className="w-full h-full object-cover animate-pulse" />
            </div>
            <div className="col-span-1 overflow-hidden rounded-sm">
              <img src={getAgentAvatar(agentIds[1])} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="col-span-2 overflow-hidden rounded-sm">
              <img src={getAgentAvatar(agentIds[2])} alt="" className="w-full h-full object-cover" />
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-indigo-500 text-white">
            <span className="text-xs font-bold font-sans">+{agentIds.length}</span>
          </div>
        )}
      </div>
    );
  };

  const sortConversations = (list: Conversation[]) => {
    return [...list].sort((a, b) => {
      // Pinned status takes priority
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // Then sort by latest time descending
      const timeA = a.updatedAt || a.createdAt || '';
      const timeB = b.updatedAt || b.createdAt || '';
      return timeB.localeCompare(timeA);
    });
  };

  const activeConversations = filteredConversations.filter(conv => showArchived ? true : !conv.isArchived);

  const sessionConversations = sortConversations(
    activeConversations.filter(conv => conv.mode !== 'agent')
  );

  const agentConversations = sortConversations(
    activeConversations.filter(conv => conv.mode === 'agent')
  );

  const renderConversationItem = (conv: Conversation) => {
    const isActive = activeConversationId === conv.id;
    return (
      <div
        key={conv.id}
        onClick={() => onSelectConversation(conv.id)}
        className={`p-2.5 rounded-lg cursor-pointer transition-all duration-150 relative group ${
          isActive
            ? 'bg-lark-primary-light dark:bg-gradient-to-r dark:from-violet-950/40 dark:to-indigo-950/20 text-lark-primary dark:text-white'
            : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
        } ${conv.isArchived ? 'opacity-70 hover:opacity-90' : ''}`}
      >
        {isActive && (
          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-lark-primary dark:bg-gradient-to-b dark:from-violet-500 dark:to-indigo-550" />
        )}
        <div className="flex items-center gap-3">
          {renderConversationAvatar(conv)}
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {conv.isPinned && (
                  <Pin className="w-3 h-3 text-lark-primary dark:text-violet-400 rotate-45 transform flex-shrink-0" />
                )}
                <h3 className={`text-sm font-medium truncate transition-colors ${
                  isActive ? 'text-lark-primary dark:text-white font-semibold' : 'text-lark-text-primary dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white'
                }`}>{conv.title}</h3>
                {conv.isArchived && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30 rounded scale-90 transform origin-left select-none flex-shrink-0">已归档</span>
                )}
              </div>
              <span className="text-[10px] text-lark-text-tertiary dark:text-slate-500 flex-shrink-0 font-normal group-hover:opacity-0 transition-opacity">
                {conv.updatedAt.split(' ').pop()}
              </span>
            </div>
            <p className={`text-xs truncate transition-colors ${
              isActive ? 'text-lark-primary/80 dark:text-violet-200/90' : 'text-lark-text-secondary dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
            }`}>{conv.lastMessage || '暂无消息'}</p>
          </div>
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (activeMenuId === conv.id) {
                setActiveMenuId(null);
                setMenuAnchorRect(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuAnchorRect(rect);
                setActiveMenuId(conv.id);
              }
            }}
            className={`opacity-0 group-hover:opacity-100 ${activeMenuId === conv.id ? 'opacity-100' : ''} transition-opacity bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 p-1.5 rounded-lg shadow-sm border border-lark-border/50 dark:border-slate-800/80 active:scale-95 flex items-center justify-center`}
            title="更多操作"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {activeMenuId === conv.id && menuAnchorRect && createPortal(
            <>
              <div 
                className="fixed inset-0 z-[9999]" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveMenuId(null); 
                  setMenuAnchorRect(null);
                }} 
              />
              <div 
                style={{
                  position: 'fixed',
                  top: `${menuAnchorRect.bottom + 4}px`,
                  left: `${menuAnchorRect.right - 128}px`,
                  width: '128px',
                  zIndex: 10000,
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 flex flex-col gap-0.5 text-xs text-left animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinConversation(conv.id);
                    setActiveMenuId(null);
                    setMenuAnchorRect(null);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <Pin className="w-3 h-3 text-slate-400 rotate-45 transform" />
                  <span>{conv.isPinned ? '取消置顶' : '置顶会话'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleArchiveConversation(conv.id);
                    setActiveMenuId(null);
                    setMenuAnchorRect(null);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <Archive className="w-3 h-3 text-slate-400" />
                  <span>{conv.isArchived ? '激活会话' : '归档会话'}</span>
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-0.5" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConvId(conv.id);
                    setDeleteConvTitle(conv.title);
                    setActiveMenuId(null);
                    setMenuAnchorRect(null);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-red-650 dark:text-red-450 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                  <span>删除会话</span>
                </button>
              </div>
            </>,
            document.body
          )}
        </div>
      </div>
    );
  };

  const selectedAgent = selectedAgentId === 'new'
    ? getNewAgentTemplate()
    : agents.find(a => a.id === selectedAgentId);

  return (
    <div className="w-full h-full bg-lark-sidebar-bg dark:bg-[#090a12] flex flex-col border-r border-lark-border dark:border-[#161828] overflow-hidden transition-colors">
      {viewMode !== 'agent-detail' && (
        <div className="p-4 pb-2 bg-transparent flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold font-sans text-lark-text-primary dark:text-slate-100 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              AgentHub
            </h1>
            <button
              onClick={onOpenNewConversation}
              className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800 hover:border-lark-primary/30 dark:hover:border-violet-500/30 flex items-center justify-center transition-all shadow-sm active:scale-95"
              title="新建会话"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex bg-[#eef0f2] dark:bg-slate-950 rounded-lg p-0.5 mb-3 border border-lark-border/30 dark:border-slate-800/60">
            <button
              onClick={() => setViewMode('conversations')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'conversations'
                  ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                  : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              会话
            </button>
            <button
              onClick={() => setViewMode('agents')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'agents'
                  ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                  : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              联系人
            </button>
          </div>

          {viewMode === 'conversations' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lark-text-tertiary dark:text-slate-500" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索会话..."
                className="w-full pl-9 pr-4 py-1.5 bg-[#eff0f1] dark:bg-slate-900 rounded-lg text-xs text-lark-text-primary dark:text-slate-100 placeholder:text-lark-text-tertiary dark:placeholder:text-slate-600 border border-transparent outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-lark-primary dark:focus:border-violet-650 focus:ring-1 focus:ring-lark-primary/20 dark:focus:ring-violet-650/20 transition-all"
              />
            </div>
          )}
        </div>
      )}

      {viewMode === 'conversations' && (
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4 min-h-0">
          {/* 1. 会话 (Standard Sessions) */}
          <div className="space-y-1">
            <button
              onClick={() => setIsSessionsExpanded(!isSessionsExpanded)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-lark-text-secondary dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 rounded-md transition-colors group select-none"
            >
              <div className="flex items-center gap-1.5">
                {isSessionsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>会话</span>
                <span className="text-[10px] text-lark-text-tertiary dark:text-slate-500 font-normal ml-0.5">
                  ({sessionConversations.length})
                </span>
              </div>
            </button>

            {isSessionsExpanded && (
              <div className="space-y-0.5">
                {sessionConversations.length === 0 ? (
                  <p className="text-xs text-lark-text-tertiary dark:text-slate-500 text-center py-4">无活动会话</p>
                ) : (
                  sessionConversations.map(conv => renderConversationItem(conv))
                )}
              </div>
            )}
          </div>

          {/* 2. Agent chat (Agent long-term conversations) */}
          <div className="space-y-1">
            <button
              onClick={() => setIsAgentChatsExpanded(!isAgentChatsExpanded)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-lark-text-secondary dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 rounded-md transition-colors group select-none"
            >
              <div className="flex items-center gap-1.5">
                {isAgentChatsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>Agent chat</span>
                <span className="text-[10px] text-lark-text-tertiary dark:text-slate-500 font-normal ml-0.5">
                  ({agentConversations.length})
                </span>
              </div>
            </button>

            {isAgentChatsExpanded && (
              <div className="space-y-0.5">
                {agentConversations.length === 0 ? (
                  <p className="text-xs text-lark-text-tertiary dark:text-slate-500 text-center py-4">无专属对话</p>
                ) : (
                  agentConversations.map(conv => renderConversationItem(conv))
                )}
              </div>
            )}
          </div>

          {/* 3. Archived toggle */}
          <div className="pt-3 px-2 flex justify-between items-center text-[11px] text-lark-text-tertiary dark:text-slate-500 border-t border-lark-border/20 dark:border-slate-850/40">
            <span>归档设置</span>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-2 py-0.5 rounded text-[10px] transition-all flex items-center gap-1 select-none ${
                showArchived
                  ? 'bg-lark-primary/10 text-lark-primary dark:bg-violet-950/30 dark:text-violet-400 border border-lark-primary/20 dark:border-violet-500/20'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 border border-transparent'
              }`}
            >
              <Archive className="w-3 h-3" />
              {showArchived ? '隐藏已归档' : '显示已归档'}
            </button>
          </div>
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
          onAddAgent={() => {
            onSelectAgent('new');
            setViewMode('agent-detail');
          }}
        />
      )}

      {viewMode === 'agent-detail' && selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          isNew={selectedAgentId === 'new'}
          onSave={onSaveAgent}
          onDelete={onDeleteAgent}
          onBack={() => {
            onBackFromAgentDetail();
            setViewMode('agents');
          }}
        />
      )}

      {/* Sidebar bottom user info card */}
      {currentUser && (
        <div className="p-3 border-t border-lark-border/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/40 backdrop-blur-sm flex-shrink-0 relative">
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm flex-shrink-0 bg-slate-100 dark:bg-slate-900">
                <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{currentUser.name}</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
              </div>
            </div>
            <MoreVertical className="w-4 h-4 text-slate-400 group-hover:text-slate-650 dark:group-hover:text-slate-300 transition-colors" />
          </div>

          {/* Floating Dropdown popover */}
          {isUserMenuOpen && (
            <>
              {/* Click outside backdrop overlay */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsUserMenuOpen(false)}
              />

              <div className="absolute bottom-16 left-3 right-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 z-40 animate-scale-in flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>个人与系统设置</span>
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-1" />
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                  <span>退出登录</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmModal
        open={deleteConvId !== null}
        title="确认删除会话吗？"
        content={`删除会话 "${deleteConvTitle}" 将会清空所有聊天记录与历史消息。该操作不可撤销，请谨慎操作。`}
        confirmText="删除"
        cancelText="取消"
        type="danger"
        onConfirm={() => {
          if (deleteConvId) {
            onDeleteConversation(deleteConvId);
          }
        }}
        onClose={() => setDeleteConvId(null)}
      />
    </div>
  );
};

export default LeftSidebar;
