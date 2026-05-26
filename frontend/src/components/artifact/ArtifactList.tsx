import React from 'react';
import { Artifact } from '@/types';
import ArtifactCard from './ArtifactCard';

interface ArtifactListProps {
  artifacts: Artifact[];
  onJumpToMessage: (artifactId: string) => void;
  onFullScreenPreview: (artifactId: string) => void;
}

const ArtifactList: React.FC<ArtifactListProps> = ({
  artifacts,
  onJumpToMessage,
  onFullScreenPreview
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      <div className="p-3 pb-1 border-b border-lark-border/40 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1.5 py-1">生成产物列表 ({artifacts.length})</h3>
      </div>
      <div className="flex-grow overflow-y-auto p-3 space-y-1.5 min-h-0 bg-slate-50/50 dark:bg-slate-950/20">
        {artifacts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center p-4">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Agent 生成的代码、文档或网页将在此处列出。
            </p>
          </div>
        ) : (
          artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              onJumpToMessage={onJumpToMessage}
              onFullScreenPreview={onFullScreenPreview}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ArtifactList;
