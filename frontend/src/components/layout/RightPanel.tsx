import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Artifact, Agent } from '@/types';
import AgentList from '../agent/AgentList';
import ArtifactList from '../artifact/ArtifactList';
import ArtifactPreview from '../artifact/ArtifactPreview';

interface RightPanelProps {
  agents: Agent[];
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  onSelectArtifact: (artifactId: string) => void;
  selectedArtifact: Artifact | null;
  onOpenFullScreenPreview: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  agents,
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  selectedArtifact,
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

  return (
    <div className="bg-lark-sidebar-bg h-full flex flex-col border-l border-lark-border w-full min-w-0">
      <div style={{ height: topHeight, minHeight: 150 }} className="border-b border-lark-border/60 overflow-hidden bg-white">
        <AgentList agents={agents} />
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="h-[2px] bg-lark-border hover:bg-lark-primary active:bg-lark-primary cursor-ns-resize transition-colors flex-shrink-0 z-10 relative
          before:content-[''] before:absolute before:-top-1 before:bottom-1 before:left-0 before:right-0 before:h-3 before:bg-transparent"
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
        <ArtifactList
          artifacts={artifacts}
          selectedArtifactId={selectedArtifactId}
          onSelectArtifact={onSelectArtifact}
        />
        {selectedArtifact && (
          <div className="flex-1 border-t border-lark-border/60 overflow-hidden min-h-0 bg-white">
            <ArtifactPreview 
              artifact={selectedArtifact} 
              onOpenFullScreen={onOpenFullScreenPreview}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;
