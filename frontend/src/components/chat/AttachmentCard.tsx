import React, { useState } from 'react';
import { MessageAttachment } from '@/types';
import { Download, Eye, FileText, Presentation, File, ZoomIn, X } from 'lucide-react';

interface AttachmentCardProps {
  attachment: MessageAttachment;
}

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment }) => {
  const [showLightBox, setShowLightBox] = useState(false);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (attachment.type === 'image') {
    return (
      <div className="relative group max-w-sm rounded-xl overflow-hidden border border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-all duration-200 my-1 animate-fade-in">
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-48 object-cover w-full cursor-zoom-in"
          onClick={() => setShowLightBox(true)}
        />
        <div 
          onClick={() => setShowLightBox(true)}
          className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-zoom-in gap-2"
        >
          <div className="p-2 rounded-full bg-white/90 text-slate-800 shadow hover:scale-105 active:scale-95 transition-all">
            <ZoomIn className="w-4 h-4" />
          </div>
          <a
            href={attachment.url}
            download={attachment.name}
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-full bg-white/90 text-slate-800 shadow hover:scale-105 active:scale-95 transition-all"
            title="下载"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>

        {/* Lightbox Modal */}
        {showLightBox && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowLightBox(false)}>
            <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" onClick={() => setShowLightBox(false)}>
              <X className="w-6 h-6" />
            </button>
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    );
  }

  // Document attachments (PDF, PPT, etc.)
  const isPdf = attachment.type === 'pdf';
  const isPpt = attachment.type === 'ppt';

  const getDocIcon = () => {
    if (isPdf) return <FileText className="w-6 h-6 text-red-600" />;
    if (isPpt) return <Presentation className="w-6 h-6 text-orange-600" />;
    return <File className="w-6 h-6 text-slate-500" />;
  };

  const getIconBg = () => {
    if (isPdf) return 'bg-red-50 border-red-100';
    if (isPpt) return 'bg-orange-50 border-orange-100';
    return 'bg-slate-50 border-slate-100';
  };

  return (
    <div className="p-3 bg-white border border-slate-200/80 rounded-xl hover:border-slate-350 hover:shadow-md transition-all duration-200 my-1 max-w-sm flex flex-col gap-2.5 shadow-sm animate-fade-in">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm ${getIconBg()}`}>
          {getDocIcon()}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-slate-800 truncate" title={attachment.name}>
            {attachment.name}
          </h4>
          <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium">
            <span className="uppercase">{attachment.type}</span>
            {attachment.size && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>{formatSize(attachment.size)}</span>
              </>
            )}
            {attachment.meta?.pages && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>{attachment.meta.pages} 页</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      <div className="flex items-center justify-end gap-2">
        {isPdf && (
          <button
            onClick={() => window.open(attachment.url, '_blank')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 transition-all active:scale-95 shadow-sm"
            title="在线预览"
          >
            <Eye className="w-3 h-3 text-slate-400" />
            <span>在线预览</span>
          </button>
        )}
        <a
          href={attachment.url}
          download={attachment.name}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg bg-lark-primary-light hover:bg-lark-primary/10 border border-lark-primary/20 text-lark-primary transition-all active:scale-95 shadow-sm"
          title="下载附件"
        >
          <Download className="w-3 h-3" />
          <span>下载</span>
        </a>
      </div>
    </div>
  );
};

export default AttachmentCard;
