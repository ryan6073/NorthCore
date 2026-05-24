import React from 'react';
import { Artifact } from '@/types';
import { FileCode, FileText, Globe } from 'lucide-react';

interface ArtifactCardProps {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: () => void;
}

const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, isSelected, onSelect }) => {
  const getTypeIcon = () => {
    if (artifact.type === 'code') return <FileCode className="w-5 h-5 text-green-600" />;
    if (artifact.type === 'markdown') return <FileText className="w-5 h-5 text-blue-600" />;
    if (artifact.type === 'html') return <Globe className="w-5 h-5 text-orange-600" />;
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  return (
    <div
      onClick={onSelect}
      className={`p-2.5 rounded-xl cursor-pointer transition-all duration-150 border active:scale-[0.99] flex items-center justify-between ${
        isSelected
          ? 'bg-lark-primary-light border-lark-primary/40 text-lark-primary shadow-sm'
          : 'bg-white border-lark-border hover:bg-lark-bg-hover'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex-shrink-0">
          {getTypeIcon()}
        </div>
        <span className={`text-xs font-medium truncate ${isSelected ? 'text-lark-primary font-bold' : 'text-lark-text-primary'}`}>
          {artifact.title}
        </span>
      </div>
    </div>
  );
};

export default ArtifactCard;
