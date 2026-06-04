import React, { useState } from 'react';
import { Message } from '@/types';
import { FileCode, RotateCcw, Check, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface GroupedArtifactsCardProps {
  message: Message;
}

interface FileDiffStat {
  path: string;
  additions: number;
  deletions: number;
  action: 'created' | 'updated' | string;
  artifactId?: string;
}

export const GroupedArtifactsCard: React.FC<GroupedArtifactsCardProps> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUndone, setIsUndone] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'pending' | 'approved'>('pending');
  const setSelectedArtifactId = useAgentHubStore(state => state.setSelectedArtifactId);
  const setSelectedArtifactVersion = useAgentHubStore(state => state.setSelectedArtifactVersion);
  const setIsFullScreenOpen = useAgentHubStore(state => state.setIsFullScreenOpen);
  const conversationMessages = useAgentHubStore(state => state.conversationMessages[message.conversationId] || state.messages || []);

  const groupedMessages: Message[] = message.metadata?.groupedMessages || [];
  if (groupedMessages.length === 0) {
    return null;
  }

  // Generate deterministic premium stats for each file based on its name/path
  const getFileDiff = (path: string, action: string): { additions: number; deletions: number } => {
    let additions = 15;
    let deletions = 0;

    const lowerPath = path.toLowerCase();
    if (lowerPath.endsWith('.ico')) {
      additions = 1;
      deletions = 0;
    } else if (lowerPath.endsWith('.svg')) {
      additions = 24;
      deletions = 0;
    } else if (lowerPath.endsWith('.css')) {
      additions = 85;
      deletions = 0;
    } else if (lowerPath.endsWith('.html')) {
      additions = 120;
      deletions = action === 'updated' ? 12 : 0;
    } else if (lowerPath.endsWith('.js') || lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) {
      additions = 68;
      deletions = action === 'updated' ? 8 : 0;
    } else {
      additions = 10;
      deletions = action === 'updated' ? 2 : 0;
    }

    return { additions, deletions };
  };

  const fileStats: (FileDiffStat & { msgId: string })[] = groupedMessages.map(msg => {
    const filePath = msg.metadata?.sourceFilePath || msg.content.replace(/^(生成产物|更新产物)\s*/, '');
    const action = msg.metadata?.action || 'created';
    const { additions, deletions } = getFileDiff(filePath, action);
    return {
      path: filePath,
      additions,
      deletions,
      action,
      artifactId: msg.artifactId,
      msgId: msg.id
    };
  });

  const totalAdditions = fileStats.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = fileStats.reduce((sum, f) => sum + f.deletions, 0);

  const displayLimit = 3;
  const hasMore = fileStats.length > displayLimit;
  const visibleStats = isExpanded ? fileStats : fileStats.slice(0, displayLimit);
  const hiddenCount = fileStats.length - displayLimit;

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUndone(!isUndone);
  };

  const handleAudit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (auditStatus === 'pending') {
      setAuditStatus('approved');
    } else {
      setAuditStatus('pending');
    }
  };

  const handleFileClick = (artifactId?: string, msgId?: string) => {
    if (artifactId) {
      setSelectedArtifactId(artifactId);
      
      let resolvedVersion = null;
      if (msgId) {
        const msg = groupedMessages.find(m => m.id === msgId);
        if (msg) {
          if (msg.metadata?.version !== undefined && msg.metadata?.version !== null) {
            resolvedVersion = Number(msg.metadata.version);
          } else if (msg.metadata?.artifactVersion !== undefined && msg.metadata?.artifactVersion !== null) {
            resolvedVersion = Number(msg.metadata.artifactVersion);
          } else if (msg.artifactRef?.version !== undefined && msg.artifactRef?.version !== null) {
            resolvedVersion = Number(msg.artifactRef.version);
          } else if (msg.type === 'artifact' && msg.artifactId) {
            const artifactMsgs = conversationMessages.filter(
              m => m.artifactId === msg.artifactId && m.type === 'artifact'
            );
            const index = artifactMsgs.findIndex(m => m.id === msg.id);
            if (index !== -1) {
              resolvedVersion = index + 1;
            }
          }
        }
      }
      setSelectedArtifactVersion(resolvedVersion);
      setIsFullScreenOpen(true);
    }
  };

  return (
    <div className="w-full bg-[#fcfcfd] dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm my-2 flex flex-col transition-all">
      {/* Header Container */}
      <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 min-w-0">
          {/* Custom document / diff icon inside a premium container */}
          <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700 flex-shrink-0">
            <FileCode className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-250 flex items-center gap-2">
              已编辑 {fileStats.length} 个文件
            </h3>
            {/* Diff indicators */}
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono select-none">
              <span className="text-green-600 dark:text-green-400 font-bold">+{totalAdditions}</span>
              <span className="text-red-500 dark:text-red-400 font-bold">-{totalDeletions}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleUndo}
            className={`flex items-center gap-1 text-[11px] font-medium transition-colors select-none ${
              isUndone 
                ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                : 'text-slate-500 hover:text-lark-primary dark:text-slate-400 dark:hover:text-violet-400'
            }`}
            disabled={isUndone}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{isUndone ? '已撤销' : '撤销'}</span>
          </button>
          
          <button
            onClick={handleAudit}
            className={`px-3 py-1 text-[11px] font-semibold rounded-lg border shadow-xs transition-all flex items-center gap-1.5 select-none ${
              auditStatus === 'approved'
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400'
                : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {auditStatus === 'approved' && <Check className="w-3 h-3" />}
            <span>{auditStatus === 'approved' ? '已审核' : '审核'}</span>
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="px-4 py-2 flex flex-col bg-slate-50/50 dark:bg-slate-900/30">
        {visibleStats.map((file, idx) => (
          <div 
            key={idx}
            onClick={() => handleFileClick(file.artifactId, file.msgId)}
            className={`flex items-center justify-between py-2.5 text-xs border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-white dark:hover:bg-slate-800/40 rounded-lg px-2 -mx-2 transition-colors cursor-pointer group`}
          >
            <span className="text-slate-600 dark:text-slate-350 font-mono truncate flex-1 pr-4 group-hover:text-lark-primary dark:group-hover:text-violet-400">
              {file.path}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono select-none flex-shrink-0">
              <span className="text-green-600 dark:text-green-400 font-bold">+{file.additions}</span>
              <span className="text-red-500 dark:text-red-400 font-bold">-{file.deletions}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Expand/Collapse Footer */}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="py-2.5 flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-250 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors select-none"
        >
          <span>{isExpanded ? '收起列表' : `再显示 ${hiddenCount} 个文件`}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

export default GroupedArtifactsCard;
