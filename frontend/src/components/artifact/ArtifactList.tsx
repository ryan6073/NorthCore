import React from 'react';
import { Artifact } from '@/types';
import ArtifactCard from './ArtifactCard';

interface ArtifactListProps {
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  onSelectArtifact: (artifactId: string) => void;
}

const ArtifactList: React.FC<ArtifactListProps> = ({ artifacts, selectedArtifactId, onSelectArtifact }) => {
  return (
    <div className="flex-shrink-0 overflow-hidden">
      <div className="p-3 pb-1">
        <h3 className="text-xs font-semibold text-slate-500 px-1.5 py-1">生成产物</h3>
      </div>
      <div className="overflow-y-auto p-3 pt-0 space-y-1.5 max-h-32">
        {artifacts.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Agent生成代码、文档或网页后会显示在这里。
          </p>
        ) : (
          artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              isSelected={selectedArtifactId === artifact.id}
              onSelect={() => onSelectArtifact(artifact.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ArtifactList;
