import React from 'react';
import { Message } from '@/types';
import { FileText, RefreshCw } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import ArtifactPreview from '../artifact/ArtifactPreview';

interface ArtifactMessageProps {
  message: Message;
}

const ArtifactMessage: React.FC<ArtifactMessageProps> = ({ message }) => {
  const allArtifacts = useAgentHubStore(state => state.artifacts);
  const setSelectedArtifactId = useAgentHubStore(state => state.setSelectedArtifactId);
  const setIsFullScreenOpen = useAgentHubStore(state => state.setIsFullScreenOpen);

  const artifact = allArtifacts.find(a => a.id === message.artifactId);

  if (artifact) {
    return (
      <div className="w-full h-[420px] border border-lark-border rounded-xl overflow-hidden shadow-sm my-2 bg-white flex flex-col animate-fade-in">
        <ArtifactPreview
          artifact={artifact}
          onOpenFullScreen={(artId) => {
            setSelectedArtifactId(artId);
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
    if (fileExt.toLowerCase() === 'md') return 'bg-blue-50 text-blue-600 border-blue-100';
    if (fileExt.toLowerCase() === 'html') return 'bg-orange-50 text-orange-600 border-orange-100';
    return 'bg-green-50 text-green-600 border-green-100';
  };

  return (
    <div className="bg-white border border-lark-border rounded-xl p-3 my-2 w-full max-w-sm shadow-sm flex items-center justify-between animate-fade-in">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0 shadow-sm ${getFileIconColor()}`}>
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-lark-text-primary truncate">{filename}</h4>
          <p className="text-[10px] text-lark-text-tertiary mt-0.5 flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 animate-spin text-slate-400" /> 正在链接产物数据...
          </p>
        </div>
      </div>
    </div>
  );
};

export default ArtifactMessage;
