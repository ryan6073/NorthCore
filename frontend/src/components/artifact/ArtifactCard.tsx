import React from 'react';
import { Artifact } from '@/types';
import { FileCode, FileText, Globe, Maximize2, Navigation } from 'lucide-react';

interface ArtifactCardProps {
  artifact: Artifact;
  onJumpToMessage: (artifactId: string) => void;
  onFullScreenPreview: (artifactId: string) => void;
}

const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  onJumpToMessage,
  onFullScreenPreview
}) => {
  const getTypeIcon = () => {
    if (artifact.type === 'code') return <FileCode className="w-5 h-5 text-emerald-600" />;
    if (artifact.type === 'markdown') return <FileText className="w-5 h-5 text-blue-600" />;
    if (artifact.type === 'html') return <Globe className="w-5 h-5 text-orange-600" />;
    return <FileText className="w-5 h-5 text-slate-500" />;
  };

  const handleJump = (e: React.MouseEvent) => {
    e.stopPropagation();
    onJumpToMessage(artifact.id);
  };

  const handleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFullScreenPreview(artifact.id);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="p-3 bg-white border border-slate-200/80 rounded-xl hover:border-slate-350 hover:shadow-md transition-all duration-200 flex flex-col gap-2.5">
      {/* Top Part: Icon and Title info */}
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm">
          {getTypeIcon()}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-slate-800 truncate" title={artifact.title}>
            {artifact.title}
          </h4>
          <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium">
            <span className="capitalize">{artifact.type}</span>
            {artifact.size && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>{formatSize(artifact.size)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Divider line */}
      <div className="border-t border-slate-100" />

      {/* Bottom Part: Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleJump}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-850 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
          title="定位跳转到此产物输出的消息"
        >
          <Navigation className="w-3 h-3 rotate-45 text-slate-400" />
          <span>定位消息</span>
        </button>
        <button
          onClick={handleFullScreen}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg bg-lark-primary-light hover:bg-lark-primary/10 border border-lark-primary/25 text-lark-primary transition-all active:scale-95 shadow-sm"
          title="全屏预览产物"
        >
          <Maximize2 className="w-3 h-3" />
          <span>全屏预览</span>
        </button>
      </div>
    </div>
  );
};

export default ArtifactCard;
