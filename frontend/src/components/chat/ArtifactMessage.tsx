import React from 'react';
import { Message, Artifact } from '@/types';
import { FileText, RefreshCw } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import ArtifactPreview from '../artifact/ArtifactPreview';

interface ArtifactMessageProps {
  message: Message;
}

const ArtifactMessage: React.FC<ArtifactMessageProps> = ({ message }) => {
  const allArtifacts = useAgentHubStore(state => state.artifacts);
  const setSelectedArtifactId = useAgentHubStore(state => state.setSelectedArtifactId);
  const setSelectedArtifactVersion = useAgentHubStore(state => state.setSelectedArtifactVersion);
  const setIsFullScreenOpen = useAgentHubStore(state => state.setIsFullScreenOpen);

  const conversationMessages = useAgentHubStore(state => 
    state.conversationMessages[message.conversationId] || state.messages
  );

  const conversationArtifacts = useAgentHubStore(state => 
    state.conversationArtifacts[message.conversationId] || []
  );

  // Filter messages of type 'artifact' and match the same artifactId
  const artifactMessages = conversationMessages.filter(
    m => m.type === 'artifact' && m.artifactId === message.artifactId
  );

  const sourceRunId = message.metadata?.sourceRunId || message.metadata?.runId;

  // Find the matching artifact
  let artifact: Artifact | undefined = undefined;
  if (sourceRunId) {
    // Search in conversation-level artifacts
    artifact = conversationArtifacts.find(a => 
      (a.id === message.artifactId || a.artifactId === message.artifactId) && 
      (a.runId === sourceRunId || (a as any).versionMetadata?.sourceRunId === sourceRunId)
    ) || conversationArtifacts.find(a => 
      a.id === message.artifactId || a.artifactId === message.artifactId
    ) || allArtifacts.find(a => 
      a.id === message.artifactId || a.artifactId === message.artifactId
    );
  } else {
    artifact = allArtifacts.find(a => a.id === message.artifactId || a.artifactId === message.artifactId);
  }

  // Determine the version number
  let resolvedVersion: number | undefined = undefined;

  // 1. Try to get version from message metadata
  if (message.metadata?.version !== undefined && message.metadata?.version !== null) {
    resolvedVersion = Number(message.metadata.version);
  } else if (message.metadata?.artifactVersion !== undefined && message.metadata?.artifactVersion !== null) {
    resolvedVersion = Number(message.metadata.artifactVersion);
  }

  // 2. Try to get version from conversationArtifacts matching runId / versionMetadata
  if (resolvedVersion === undefined && sourceRunId) {
    const matchedArt = conversationArtifacts.find(a =>
      (a.id === message.artifactId || a.artifactId === message.artifactId) &&
      (a.runId === sourceRunId || (a as any).versionMetadata?.sourceRunId === sourceRunId)
    );
    if (matchedArt) {
      resolvedVersion = (matchedArt as any).versionMetadata?.sourceFileVersion || matchedArt.latestVersion;
    }
  }

  // 3. Try to search in versions history list in store
  if (resolvedVersion === undefined && sourceRunId && message.artifactId) {
    const versions = useAgentHubStore.getState().artifactVersions[message.artifactId] || [];
    const matchedVer = versions.find((v: any) =>
      v.metadata?.sourceRunId === sourceRunId ||
      v.sourceRunId === sourceRunId ||
      v.metadata?.runId === sourceRunId
    );
    if (matchedVer) {
      resolvedVersion = matchedVer.version;
    }
  }

  // 4. Fallback: use matched artifact's latestVersion if sourceRunId matched
  if (resolvedVersion === undefined && sourceRunId && artifact && (artifact.runId === sourceRunId || (artifact as any).versionMetadata?.sourceRunId === sourceRunId)) {
    resolvedVersion = (artifact as any).versionMetadata?.sourceFileVersion || artifact.latestVersion;
  }

  // 5. Fallback: use artifact's latestVersion (most reliable for old messages without metadata)
  if (resolvedVersion === undefined && artifact) {
    resolvedVersion = artifact.latestVersion;
  }

  // 6. Fallback: use sequential index if no other version matches
  if (resolvedVersion === undefined) {
    const msgIndex = artifactMessages.findIndex(m => m.id === message.id);
    resolvedVersion = msgIndex !== -1 ? msgIndex + 1 : undefined;
  }

  if (artifact) {
    return (
      <div className="w-full h-[420px] border border-lark-border dark:border-slate-800 rounded-xl overflow-hidden shadow-sm my-2 bg-white dark:bg-slate-900 flex flex-col animate-fade-in transition-colors">
        <ArtifactPreview
          artifact={artifact}
          initialVersion={resolvedVersion}
          onOpenFullScreen={(artId, verNum) => {
            setSelectedArtifactId(artId);
            setSelectedArtifactVersion(verNum || resolvedVersion || null);
            setIsFullScreenOpen(true);
          }}
        />
      </div>
    );
  }

  // Fallback placeholder card if artifact content is not yet linked or loaded
  const filename = message.content.replace(/^生成产物\s*/, '');
  const fileExt = filename.split('.').pop() || 'file';

  const getFileIconColor = () => {
    if (fileExt.toLowerCase() === 'md') return 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30';
    if (fileExt.toLowerCase() === 'html') return 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-900/30';
    return 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/30';
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 rounded-xl p-3 my-2 w-full max-w-sm shadow-sm flex items-center justify-between animate-fade-in transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0 shadow-sm ${getFileIconColor()}`}>
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-lark-text-primary dark:text-slate-200 truncate">{filename}</h4>
          <p className="text-[10px] text-lark-text-tertiary dark:text-slate-500 mt-0.5 flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 animate-spin text-slate-400 dark:text-slate-500" /> 正在链接产物数据...
          </p>
        </div>
      </div>
    </div>
  );
};

export default ArtifactMessage;