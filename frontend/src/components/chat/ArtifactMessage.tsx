import React from 'react';
import { FileText, ChevronRight } from 'lucide-react';

interface ArtifactMessageProps {
  content: string;
}

const ArtifactMessage: React.FC<ArtifactMessageProps> = ({ content }) => {
  const filename = content.replace(/^生成产物\s*/, '');
  const fileExt = filename.split('.').pop() || 'file';

  const getFileIconColor = () => {
    if (fileExt.toLowerCase() === 'md') return 'bg-blue-50 text-blue-600 border-blue-100';
    if (fileExt.toLowerCase() === 'html') return 'bg-orange-50 text-orange-600 border-orange-100';
    return 'bg-green-50 text-green-600 border-green-100';
  };

  return (
    <div className="bg-white hover:bg-slate-50 border border-lark-border rounded-xl p-3 my-2 w-full max-w-sm shadow-sm transition-all flex items-center justify-between group cursor-pointer">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0 shadow-sm ${getFileIconColor()}`}>
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-lark-text-primary truncate">{filename}</h4>
          <p className="text-[10px] text-lark-text-tertiary mt-0.5">产物已生成 · 右侧面板查看详情</p>
        </div>
      </div>
      <div className="flex items-center text-xs font-medium text-lark-primary pl-2 flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
        <span>查看</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export default ArtifactMessage;
