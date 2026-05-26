import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Artifact, Agent } from '@/types';
import AgentList from '../agent/AgentList';
import ArtifactList from '../artifact/ArtifactList';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface RightPanelProps {
  agents: Agent[];
  artifacts: Artifact[];
  onSelectArtifact: (artifactId: string) => void;
  onOpenFullScreenPreview: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  agents,
  artifacts,
  onSelectArtifact,
  onOpenFullScreenPreview
}) => {
  const [topHeight, setTopHeight] = useState(240);
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

  // Jump to the message where this artifact was created
  const handleJumpToMessage = useCallback((artifactId: string) => {
    const messages = useAgentHubStore.getState().messages;
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
  }, []);

  // Set selected artifact and open fullscreen modal
  const handleFullScreenPreview = useCallback((artifactId: string) => {
    onSelectArtifact(artifactId);
    setTimeout(() => {
      onOpenFullScreenPreview();
    }, 50);
  }, [onSelectArtifact, onOpenFullScreenPreview]);

  return (
    <div className="bg-lark-sidebar-bg dark:bg-slate-950 h-full flex flex-col border-l border-lark-border dark:border-slate-800 w-full min-w-0 transition-colors">
      <div style={{ height: topHeight, minHeight: 150 }} className="border-b border-lark-border/60 dark:border-slate-800/60 overflow-hidden bg-white dark:bg-slate-900 transition-colors">
        <AgentList agents={agents} />
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="h-[2px] bg-lark-border dark:bg-slate-800 hover:bg-lark-primary active:bg-lark-primary cursor-ns-resize transition-colors flex-shrink-0 z-10 relative
          before:content-[''] before:absolute before:-top-1 before:bottom-1 before:left-0 before:right-0 before:h-3 before:bg-transparent"
      />

      <div className="flex-grow flex flex-col overflow-hidden min-w-0 bg-white dark:bg-slate-900 transition-colors">
        <ArtifactList
          artifacts={artifacts}
          onJumpToMessage={handleJumpToMessage}
          onFullScreenPreview={handleFullScreenPreview}
        />
      </div>
    </div>
  );
};

export default RightPanel;
