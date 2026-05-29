import React, { useState } from 'react';
import { MessageAttachment } from '@/types';
import { Download, Eye, FileText, Presentation, File, Image, X, FileSpreadsheet, Archive, Music, Video } from 'lucide-react';

interface AttachmentCardProps {
  attachment: MessageAttachment;
  isUser?: boolean;
}

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment, isUser = false }) => {
  const [showLightBox, setShowLightBox] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileCategory = () => {
    const type = (attachment.type || '').toLowerCase();
    const name = (attachment.name || '').toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'image'].includes(type) || name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/)) {
      return 'image';
    }
    if (['pdf'].includes(type) || name.match(/\.pdf$/)) {
      return 'pdf';
    }
    if (['ppt', 'pptx', 'powerpoint', 'presentation'].includes(type) || name.match(/\.(ppt|pptx)$/)) {
      return 'ppt';
    }
    if (['xls', 'xlsx', 'excel', 'spreadsheet'].includes(type) || name.match(/\.(xls|xlsx)$/)) {
      return 'excel';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'archive'].includes(type) || name.match(/\.(zip|rar|7z|tar|gz)$/)) {
      return 'archive';
    }
    if (['mp3', 'wav', 'flac', 'aac', 'audio'].includes(type) || name.match(/\.(mp3|wav|flac|aac)$/)) {
      return 'audio';
    }
    if (['mp4', 'avi', 'mov', 'mkv', 'video'].includes(type) || name.match(/\.(mp4|avi|mov|mkv)$/)) {
      return 'video';
    }
    return 'document';
  };

  const category = getFileCategory();

  const getCategoryConfig = () => {
    if (isUser) {
      return {
        icon: <Image className="w-6 h-6 text-white" />,
        bgColor: 'bg-white/20',
        borderColor: 'border-white/30',
        accentColor: 'text-white',
        textColor: 'text-white/90',
        textMutedColor: 'text-white/70',
      };
    }
    
    switch (category) {
      case 'image':
        return {
          icon: <Image className="w-6 h-6 text-blue-500 dark:text-blue-400" />,
          bgColor: 'bg-blue-50 dark:bg-blue-950/30',
          borderColor: 'border-blue-100 dark:border-blue-900/30',
          accentColor: 'text-blue-600 dark:text-blue-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      case 'pdf':
        return {
          icon: <FileText className="w-6 h-6 text-red-500 dark:text-red-400" />,
          bgColor: 'bg-red-50 dark:bg-red-950/30',
          borderColor: 'border-red-100 dark:border-red-900/30',
          accentColor: 'text-red-600 dark:text-red-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      case 'ppt':
        return {
          icon: <Presentation className="w-6 h-6 text-orange-500 dark:text-orange-400" />,
          bgColor: 'bg-orange-50 dark:bg-orange-950/30',
          borderColor: 'border-orange-100 dark:border-orange-900/30',
          accentColor: 'text-orange-600 dark:text-orange-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      case 'excel':
        return {
          icon: <FileSpreadsheet className="w-6 h-6 text-green-500 dark:text-green-400" />,
          bgColor: 'bg-green-50 dark:bg-green-950/30',
          borderColor: 'border-green-100 dark:border-green-900/30',
          accentColor: 'text-green-600 dark:text-green-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      case 'archive':
        return {
          icon: <Archive className="w-6 h-6 text-amber-500 dark:text-amber-400" />,
          bgColor: 'bg-amber-50 dark:bg-amber-950/30',
          borderColor: 'border-amber-100 dark:border-amber-900/30',
          accentColor: 'text-amber-600 dark:text-amber-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      case 'audio':
        return {
          icon: <Music className="w-6 h-6 text-purple-500 dark:text-purple-400" />,
          bgColor: 'bg-purple-50 dark:bg-purple-950/30',
          borderColor: 'border-purple-100 dark:border-purple-900/30',
          accentColor: 'text-purple-600 dark:text-purple-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      case 'video':
        return {
          icon: <Video className="w-6 h-6 text-pink-500 dark:text-pink-400" />,
          bgColor: 'bg-pink-50 dark:bg-pink-950/30',
          borderColor: 'border-pink-100 dark:border-pink-900/30',
          accentColor: 'text-pink-600 dark:text-pink-400',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
      default:
        return {
          icon: <File className="w-6 h-6 text-slate-500 dark:text-slate-400" />,
          bgColor: 'bg-slate-50 dark:bg-slate-900/60',
          borderColor: 'border-slate-200 dark:border-slate-800',
          accentColor: 'text-slate-600 dark:text-slate-300',
          textColor: 'text-slate-800 dark:text-slate-100',
          textMutedColor: 'text-slate-400 dark:text-slate-500',
        };
    }
  };

  const config = getCategoryConfig();

  if (category === 'image') {
    if (isUser) {
      return (
        <div className="relative group max-w-sm rounded-2xl overflow-hidden border border-white/30 bg-white/10 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 my-1">
          {!imageLoaded && !imageError && (
            <div className="w-full h-40 flex items-center justify-center bg-white/10 animate-pulse">
              <Image className="w-10 h-10 text-white/60" />
            </div>
          )}
          {!imageError && (
            <img
              src={attachment.url}
              alt={attachment.name}
              className={`max-h-60 object-cover w-full cursor-zoom-in transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
              onClick={() => setShowLightBox(true)}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
          {imageError && (
            <div className="w-full h-40 flex flex-col items-center justify-center bg-white/10 text-white/60">
              <Image className="w-10 h-10 mb-2" />
              <span className="text-xs font-medium">图片加载失败</span>
            </div>
          )}
          {imageLoaded && (
            <div 
              onClick={() => setShowLightBox(true)}
              className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <p className="text-white text-xs font-semibold truncate max-w-[200px]">{attachment.name}</p>
                  {attachment.size && (
                    <span className="text-white/70 text-[10px] mt-0.5">{formatSize(attachment.size)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLightBox(true);
                    }}
                    className="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/35 transition-all duration-200 active:scale-95"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <a
                    href={attachment.url}
                    download={attachment.name}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/35 transition-all duration-200 active:scale-95"
                    title="下载图片"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {showLightBox && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => setShowLightBox(false)}>
              <button className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-105" onClick={() => setShowLightBox(false)}>
                <X className="w-6 h-6" />
              </button>
              <div className="absolute top-4 left-4 text-white">
                <p className="text-sm font-semibold truncate max-w-xs">{attachment.name}</p>
                {attachment.size && <p className="text-xs text-white/60 mt-0.5">{formatSize(attachment.size)}</p>}
              </div>
              <img
                src={attachment.url}
                alt={attachment.name}
                className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative group max-w-md rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-lg transition-all duration-300 my-1.5">
        {!imageLoaded && !imageError && (
          <div className="w-full h-48 flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse">
            <Image className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          </div>
        )}
        {!imageError && (
          <img
            src={attachment.url}
            alt={attachment.name}
            className={`max-h-64 object-cover w-full cursor-zoom-in transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
            onClick={() => setShowLightBox(true)}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
        {imageError && (
          <div className="w-full h-48 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400">
            <Image className="w-10 h-10 mb-2" />
            <span className="text-xs font-medium">图片加载失败</span>
          </div>
        )}
        {imageLoaded && (
          <div 
            onClick={() => setShowLightBox(true)}
            className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-white text-xs font-semibold truncate max-w-[200px]">{attachment.name}</p>
                {attachment.size && (
                  <span className="text-white/70 text-[10px] mt-0.5">{formatSize(attachment.size)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLightBox(true);
                  }}
                  className="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all duration-200 active:scale-95"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <a
                  href={attachment.url}
                  download={attachment.name}
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all duration-200 active:scale-95"
                  title="下载图片"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {showLightBox && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => setShowLightBox(false)}>
            <button className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-105" onClick={() => setShowLightBox(false)}>
              <X className="w-6 h-6" />
            </button>
            <div className="absolute top-4 left-4 text-white">
              <p className="text-sm font-semibold truncate max-w-xs">{attachment.name}</p>
              {attachment.size && <p className="text-xs text-white/60 mt-0.5">{formatSize(attachment.size)}</p>}
            </div>
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="p-3.5 bg-[#deebff] dark:bg-violet-950/40 border border-[#c3dbff] dark:border-violet-900/50 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 my-1 max-w-sm flex flex-col gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm bg-white/70 dark:bg-white/15 border-white/50">
            {config.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 truncate" title={attachment.name}>
              {attachment.name}
            </h4>
            <p className="text-[11px] text-blue-700/70 dark:text-blue-200/70 mt-0.5 flex items-center gap-1.5 font-medium">
              <span className={`uppercase font-semibold ${config.textMutedColor}`}>{category}</span>
              {attachment.size && (
                <>
                  <span className="w-1 h-1 rounded-full bg-blue-300/60 dark:bg-blue-200/30" />
                  <span>{formatSize(attachment.size)}</span>
                </>
              )}
              {attachment.meta?.pages && (
                <>
                  <span className="w-1 h-1 rounded-full bg-blue-300/60 dark:bg-blue-200/30" />
                  <span>{attachment.meta.pages} 页</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-blue-200/60 dark:via-blue-700/30 to-transparent" />

        <div className="flex items-center justify-end gap-2">
          {(category === 'pdf' || category === 'video') && (
            <button
              onClick={() => window.open(attachment.url, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 border border-white/70 dark:border-white/20 text-blue-700 dark:text-blue-200 transition-all duration-200 active:scale-95 shadow-sm"
              title="在线预览"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>在线预览</span>
            </button>
          )}
          <a
            href={attachment.url}
            download={attachment.name}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl bg-violet-600 dark:bg-violet-500 hover:bg-violet-700 dark:hover:bg-violet-600 text-white transition-all duration-200 active:scale-95 shadow-sm"
            title="下载附件"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg transition-all duration-300 my-1.5 max-w-sm flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm ${config.bgColor} ${config.borderColor}`}>
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={attachment.name}>
            {attachment.name}
          </h4>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
            <span className={`uppercase font-semibold ${config.accentColor}`}>{category}</span>
            {attachment.size && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>{formatSize(attachment.size)}</span>
              </>
            )}
            {attachment.meta?.pages && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>{attachment.meta.pages} 页</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent" />

      <div className="flex items-center justify-end gap-2">
        {(category === 'pdf' || category === 'video') && (
          <button
            onClick={() => window.open(attachment.url, '_blank')}
            className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200/80 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-all duration-200 active:scale-95 shadow-sm"
            title="在线预览"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>在线预览</span>
          </button>
        )}
        <a
          href={attachment.url}
          download={attachment.name}
          className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200/80 dark:border-violet-800/30 text-violet-700 dark:text-violet-300 transition-all duration-200 active:scale-95 shadow-sm"
          title="下载附件"
        >
          <Download className="w-3.5 h-3.5" />
          <span>下载</span>
        </a>
      </div>
    </div>
  );
};

export default AttachmentCard;
