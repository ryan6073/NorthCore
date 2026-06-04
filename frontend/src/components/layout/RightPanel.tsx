import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Artifact, Agent, Conversation } from '@/types';
import AgentList from '../agent/AgentList';
import { AgentMiniConfigPanel } from '../agent/AgentMiniConfigPanel';
import ArtifactList from '../artifact/ArtifactList';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { SandboxPanel } from '../sandbox/SandboxPanel';

interface RightPanelProps {
  conversation: Conversation | undefined;
  agents: Agent[];
  artifacts: Artifact[];
  onSelectArtifact: (artifactId: string) => void;
  onOpenFullScreenPreview: () => void;
  customConversationId?: string;
}

const RightPanel: React.FC<RightPanelProps> = ({
  conversation,
  agents,
  artifacts,
  onSelectArtifact,
  onOpenFullScreenPreview,
  customConversationId
}) => {
  const [topHeight, setTopHeight] = useState(280);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = topHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = e.clientY - startY.current;
    const newHeight = startHeight.current + deltaY;
    if (newHeight >= 150 && newHeight <= 500) {
      setTopHeight(newHeight);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const globalRightPanelTab = useAgentHubStore(state => state.rightPanelTab);
  const setGlobalRightPanelTab = useAgentHubStore(state => state.setRightPanelTab);
  const [localRightPanelTab, setLocalRightPanelTab] = useState<'artifacts' | 'sandbox'>('artifacts');

  const rightPanelTab = customConversationId ? localRightPanelTab : globalRightPanelTab;
  const setRightPanelTab = customConversationId ? setLocalRightPanelTab : setGlobalRightPanelTab;

  // Jump to the message where this artifact was created
  const handleJumpToMessage = useCallback((artifactId: string) => {
    const messages = customConversationId
      ? (useAgentHubStore.getState().conversationMessages[customConversationId] || [])
      : useAgentHubStore.getState().messages;
    const msg = messages.find(m => m.artifactId === artifactId);
    if (msg) {
      const element = document.getElementById(`msg-${msg.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('animate-highlight-flash');
        setTimeout(() => {
          element.classList.remove('animate-highlight-flash');
        }, 1500);
      }
    }
  }, [customConversationId]);

  // Set selected artifact and open fullscreen modal
  const handleFullScreenPreview = useCallback((artifactId: string) => {
    onSelectArtifact(artifactId);
    setTimeout(() => {
      onOpenFullScreenPreview();
    }, 50);
  }, [onSelectArtifact, onOpenFullScreenPreview]);

  return (
    <div className="bg-lark-sidebar-bg dark:bg-slate-950 h-full flex flex-col border-l border-lark-border dark:border-slate-800 w-full min-w-0 transition-colors font-sans">
      <div style={{ height: topHeight, minHeight: 150 }} className="border-b border-lark-border/60 dark:border-slate-800/60 overflow-hidden bg-white dark:bg-slate-900 transition-colors">
        {conversation?.mode === 'agent' && agents.length > 0 ? (
          <AgentMiniConfigPanel agent={agents[0]} />
        ) : (
          <AgentList agents={agents} />
        )}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="h-[2px] bg-lark-border dark:bg-slate-800 hover:bg-lark-primary active:bg-lark-primary cursor-ns-resize transition-colors flex-shrink-0 z-10 relative
          before:content-[''] before:absolute before:-top-1 before:bottom-1 before:left-0 before:right-0 before:h-3 before:bg-transparent"
      />

      <div className="flex-grow flex flex-col overflow-hidden min-w-0 bg-white dark:bg-slate-900 transition-colors">
        <div className="flex border-b border-lark-border/60 dark:border-slate-800/60 bg-lark-bg dark:bg-slate-950/40 flex-shrink-0">
          <button
            onClick={() => setRightPanelTab('artifacts')}
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all ${
              rightPanelTab === 'artifacts'
                ? 'border-lark-primary dark:border-indigo-500 text-lark-primary dark:text-indigo-400 bg-slate-900/10 dark:bg-slate-900/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            生成的 Artifacts
          </button>
          <button
            onClick={() => setRightPanelTab('sandbox')}
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all ${
              rightPanelTab === 'sandbox'
                ? 'border-lark-primary dark:border-indigo-500 text-lark-primary dark:text-indigo-400 bg-slate-900/10 dark:bg-slate-900/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            沙箱运行
          </button>
        </div>

        <div className="flex-grow overflow-hidden min-w-0 flex flex-col">
          {rightPanelTab === 'sandbox' ? (
            <SandboxPanel customConversationId={customConversationId} />
          ) : (
            <ArtifactList
              conversation={conversation}
              artifacts={artifacts}
              onJumpToMessage={handleJumpToMessage}
              onFullScreenPreview={handleFullScreenPreview}
              customConversationId={customConversationId}
              onSelectTab={setRightPanelTab}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default RightPanel;
