import React from 'react';
import { Artifact } from '@/types';
import { FileCode, FileText, Globe, Maximize2, Navigation } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

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
  const versions = useAgentHubStore(state => state.artifactVersions[artifact.id] || []);
  const currentVersion = versions.find(v => v.id === artifact.currentVersionId) || versions[versions.length - 1];
  const size = currentVersion?.size;
  const isRevoked = artifact.status === 'revoked';

  const getTypeIcon = () => {
    if (isRevoked) return <FileText className="w-5 h-5 text-slate-400 dark:text-slate-550" />;
    if (artifact.type === 'code') return <FileCode className="w-5 h-5 text-emerald-600 dark:text-emerald-450" />;
    if (artifact.type === 'markdown') return <FileText className="w-5 h-5 text-blue-600 dark:text-blue-450" />;
    if (artifact.type === 'html') return <Globe className="w-5 h-5 text-orange-600 dark:text-orange-450" />;
    return <FileText className="w-5 h-5 text-slate-500 dark:text-slate-400" />;
  };

  const handleJump = (e: React.MouseEvent) => {
    if (isRevoked) return;
    e.stopPropagation();
    onJumpToMessage(artifact.id);
  };

  const handleFullScreen = (e: React.MouseEvent) => {
    if (isRevoked) return;
    e.stopPropagation();
    onFullScreenPreview(artifact.id);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className={`p-3 rounded-xl flex flex-col gap-2.5 transition-all duration-200 ${
      isRevoked
        ? 'bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40 opacity-60'
        : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 hover:shadow-md'
    }`}>
      {/* Top Part: Icon and Title info */}
      <div className="flex items-start gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${
          isRevoked
            ? 'bg-slate-100 dark:bg-slate-950/50 border border-slate-200/40 dark:border-slate-800/40'
            : 'bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80'
        }`}>
          {getTypeIcon()}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className={`text-xs font-semibold truncate ${
            isRevoked ? 'text-slate-400 dark:text-slate-550 line-through' : 'text-slate-800 dark:text-slate-200'
          }`} title={artifact.title}>
            {artifact.title}
          </h4>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5 font-medium">
            {isRevoked ? (
              <span className="text-red-500 dark:text-red-450">已撤销</span>
            ) : (
              <>
                <span className="capitalize">{artifact.type}</span>
                {size && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                    <span>{formatSize(size)}</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Divider line */}
      <div className="border-t border-slate-100 dark:border-slate-800" />

      {/* Bottom Part: Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleJump}
          disabled={isRevoked}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg border transition-all ${
            isRevoked
              ? 'bg-slate-100/50 dark:bg-slate-950/30 border border-slate-200/40 dark:border-slate-800/40 text-slate-400 dark:text-slate-550 cursor-not-allowed'
              : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-850 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 shadow-sm'
          }`}
          title={isRevoked ? '产物已撤销，无法操作' : '定位跳转到此产物输出的消息'}
        >
          <Navigation className="w-3 h-3 rotate-45 text-slate-400" />
          <span>定位消息</span>
        </button>
        <button
          onClick={handleFullScreen}
          disabled={isRevoked}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg border transition-all ${
            isRevoked
              ? 'bg-slate-100/50 dark:bg-slate-950/30 border border-slate-200/40 dark:border-slate-800/40 text-slate-400 dark:text-slate-550 cursor-not-allowed'
              : 'bg-lark-primary-light dark:bg-violet-950/30 hover:bg-lark-primary/10 dark:hover:bg-violet-950/50 border border-lark-primary/25 dark:border-violet-800/40 text-lark-primary dark:text-violet-400 active:scale-95 shadow-sm'
          }`}
          title={isRevoked ? '产物已撤销，无法预览' : '全屏预览产物'}
        >
          <Maximize2 className="w-3 h-3" />
          <span>全屏预览</span>
        </button>
      </div>
    </div>
  );
};

export default ArtifactCard;
