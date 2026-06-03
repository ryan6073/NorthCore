import React, { useState, useEffect } from 'react';
import { Minus, Maximize2, Minimize2, X, RefreshCw, PanelRight } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { Message, Agent, Artifact } from '@/types';
import ChatPanel from './ChatPanel';
import RightPanel from '../layout/RightPanel';

interface FloatingChatWindowProps {
  floatingId: string;
}

const FloatingChatWindow: React.FC<FloatingChatWindowProps> = ({ floatingId }) => {
  const conversations = useAgentHubStore(state => state.conversations);
  const agents = useAgentHubStore(state => state.agents);
  const useMockMode = useAgentHubStore(state => state.useMockMode);
  
  const floatingConf = useAgentHubStore(state => 
    state.floatingConversations.find(fc => fc.id === floatingId)
  );
  
  const updateFloating = useAgentHubStore(state => state.updateFloatingConversation);
  const removeFloating = useAgentHubStore(state => state.removeFloatingConversation);
  const sendMessageToConversation = useAgentHubStore(state => state.sendMessageToConversation);
  
  const cachedMessages = useAgentHubStore(state => state.conversationMessages[floatingId] || []);
  const cachedArtifacts = useAgentHubStore(state => state.conversationArtifacts[floatingId] || []);
  
  const [loading, setLoading] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [previousWidth, setPreviousWidth] = useState(450);

  const conversation = conversations.find(c => c.id === floatingId);
  if (!floatingConf || !conversation) return null;

  const agentIds = conversation.agentIds || [];
  const activeAgent = agents.find(a => agentIds.includes(a.id));
  const activeAgents = agents.filter(a => agentIds.includes(a.id));

  // Load message and artifact history on mount if cache is empty
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      if (useMockMode) {
        const { mockMessages, mockArtifacts } = await import('@/mock');
        const msgs = mockMessages.filter(m => m.conversationId === floatingId);
        const arts = mockArtifacts.filter(a => a.conversationId === floatingId);
        useAgentHubStore.setState((state: any) => ({
          conversationMessages: {
            ...state.conversationMessages,
            [floatingId]: msgs
          },
          conversationArtifacts: {
            ...state.conversationArtifacts,
            [floatingId]: arts
          }
        }));
      } else {
        try {
          const { getMessageList } = await import('@/services/http/messageService');
          const { getArtifactMetaList } = await import('@/services/http/artifactService');
          
          const [res, artifactRes] = await Promise.all([
            getMessageList(floatingId),
            getArtifactMetaList(floatingId)
          ]);
          
          let messagesData: Message[] = [];
          if (res && (res as any).code === 0 && (res as any).data?.list) {
            messagesData = (res as any).data.list.map((m: any) => {
              const metadata = m.metadata;
              return {
                ...m,
                quotedMessage: m.quotedMessage || metadata?.quotedMessage || undefined,
                artifactRef: m.artifactRef || metadata?.artifactRef || undefined,
              };
            });
          } else if (Array.isArray(res)) {
            messagesData = res;
          }
          
          let artifactsData: Artifact[] = [];
          if (artifactRes && (artifactRes as any).code === 0 && Array.isArray((artifactRes as any).data)) {
            artifactsData = (artifactRes as any).data;
          } else if (Array.isArray(artifactRes)) {
            artifactsData = artifactRes;
          }
          
          useAgentHubStore.setState((state: any) => ({
            conversationMessages: {
              ...state.conversationMessages,
              [floatingId]: messagesData
            },
            conversationArtifacts: {
              ...state.conversationArtifacts,
              [floatingId]: artifactsData
            }
          }));
        } catch (e) {
          console.error('[Floating] Failed to load messages/artifacts', e);
        }
      }
      setLoading(false);
    };

    if (cachedMessages.length === 0 || cachedArtifacts.length === 0) {
      fetchHistory();
    }
  }, [floatingId, useMockMode, cachedMessages.length, cachedArtifacts.length]);

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag on clicking header itself, not buttons
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.preventDefault();
    const startX = e.clientX - floatingConf.x;
    const startY = e.clientY - floatingConf.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newX = Math.max(10, Math.min(window.innerWidth - floatingConf.width - 10, moveEvent.clientX - startX));
      const newY = Math.max(10, Math.min(window.innerHeight - floatingConf.height - 10, moveEvent.clientY - startY));
      updateFloating(floatingId, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = floatingConf.width;
    const startHeight = floatingConf.height;
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(300, Math.min(1000, startWidth + (moveEvent.clientX - startX)));
      const newHeight = Math.max(350, Math.min(800, startHeight + (moveEvent.clientY - startY)));
      updateFloating(floatingId, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSend = async (content: string, attachments?: any[], targetAgentId?: string, useSandbox?: boolean, webSearchMode?: 'auto' | 'force' | 'off') => {
    await sendMessageToConversation(floatingId, content, attachments, targetAgentId, useSandbox, webSearchMode);
  };

  const toggleRightPanel = () => {
    if (!showRightPanel) {
      setPreviousWidth(floatingConf.width);
      const newWidth = Math.max(680, floatingConf.width + 320);
      updateFloating(floatingId, { 
        width: newWidth,
        x: Math.max(10, Math.min(window.innerWidth - newWidth - 10, floatingConf.x))
      });
    } else {
      updateFloating(floatingId, { width: previousWidth });
    }
    setShowRightPanel(!showRightPanel);
  };

  const isAgentChat = conversation.mode === 'agent';

  // Toggle maximize
  const toggleMaximize = () => {
    updateFloating(floatingId, { isMaximized: !floatingConf.isMaximized });
  };

  const windowStyle: React.CSSProperties = floatingConf.isMaximized 
    ? {
        position: 'fixed',
        top: '40px', // under TitleBar
        left: '0px',
        right: '0px',
        bottom: '0px',
        width: '100vw',
        height: 'calc(100vh - 40px)',
        zIndex: 50,
      }
    : {
        position: 'fixed',
        left: `${floatingConf.x}px`,
        top: `${floatingConf.y}px`,
        width: `${floatingConf.width}px`,
        height: `${floatingConf.height}px`,
        zIndex: 50,
      };

  return (
    <div
      style={windowStyle}
      className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 cursor-move select-none flex-shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full ${isAgentChat ? 'bg-emerald-500 animate-pulse' : 'bg-lark-primary'}`} />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
            {isAgentChat && activeAgent ? activeAgent.name : conversation.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Toggle Right Panel */}
          <button
            onClick={toggleRightPanel}
            className={`p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors ${
              showRightPanel ? 'text-lark-primary dark:text-violet-400 bg-slate-100 dark:bg-slate-850' : ''
            }`}
            title={showRightPanel ? "收起辅助控制面板" : "展开辅助控制面板"}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
          
          {/* Minimize */}
          <button
            onClick={() => updateFloating(floatingId, { isMinimized: true })}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          {/* Maximize */}
          <button
            onClick={toggleMaximize}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
            title={floatingConf.isMaximized ? "还原" : "最大化"}
          >
            {floatingConf.isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          {/* Close */}
          <button
            onClick={() => removeFloating(floatingId)}
            className="p-1 hover:bg-red-50 hover:text-red-550 dark:hover:bg-red-950/20 rounded-lg text-slate-400 transition-colors"
            title="关闭窗口"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split Panel View */}
      <div className="flex-1 min-h-0 bg-transparent relative overflow-hidden flex select-text">
        {/* Left Hand: Reused Chat Panel */}
        <div className="flex-grow h-full overflow-hidden relative">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-lark-primary" /> 载入全功能会话面板...
            </div>
          ) : (
            <ChatPanel
              conversation={conversation}
              agents={activeAgents}
              messages={cachedMessages}
              artifacts={cachedArtifacts}
              onSendMessage={handleSend}
            />
          )}
        </div>

        {/* Right Hand: Reused Right Panel */}
        {showRightPanel && (
          <div className="w-[320px] h-full flex-shrink-0 overflow-hidden border-l border-slate-200 dark:border-slate-800 animate-slide-left">
            <RightPanel
              conversation={conversation}
              agents={activeAgents}
              artifacts={cachedArtifacts}
              customConversationId={floatingId}
              onSelectArtifact={(artId) => {
                useAgentHubStore.setState((state: any) => ({
                  conversationSelectedArtifactId: {
                    ...state.conversationSelectedArtifactId,
                    [floatingId]: artId
                  }
                }));
              }}
              onOpenFullScreenPreview={() => useAgentHubStore.getState().setIsFullScreenOpen(true)}
            />
          </div>
        )}
      </div>

      {/* Resize Handle (only in non-maximized mode) */}
      {!floatingConf.isMaximized && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 select-none z-[100] group"
        >
          <svg className="w-2.5 h-2.5 text-slate-400/80 group-hover:text-lark-primary transition-colors" viewBox="0 0 10 10">
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="6" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default FloatingChatWindow;
