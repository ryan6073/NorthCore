import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageAttachment } from '@/types';
import { Download, Eye, FileText, Presentation, File, Image, X, FileSpreadsheet, Archive, Music, Video } from 'lucide-react';

interface AttachmentCardProps {
  attachment: MessageAttachment;
  isUser?: boolean;
}

const resolveAttachmentUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url;
  }
  
  let apiBase = '';
  try {
    apiBase = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';
  } catch {
    apiBase = '/api/v1';
  }

  if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
    const urlObj = new URL(apiBase);
    const origin = urlObj.origin;
    if (url.startsWith('/api/v1')) {
      return `${origin}${url}`;
    } else if (url.startsWith('/')) {
      return `${origin}/api/v1${url}`;
    }
  }
  return url;
};

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment, isUser = false }) => {
  const [showLightBox, setShowLightBox] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const resolvedUrl = resolveAttachmentUrl(attachment.url);

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
    switch (category) {
      case 'image':
        return {
          icon: <Image className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          borderColor: 'border-blue-100/70 dark:border-blue-900/30',
          accentColor: 'text-blue-600 dark:text-blue-400',
        };
      case 'pdf':
        return {
          icon: <FileText className="w-5 h-5 text-red-500 dark:text-red-400" />,
          bgColor: 'bg-red-50 dark:bg-red-950/20',
          borderColor: 'border-red-100/70 dark:border-red-900/30',
          accentColor: 'text-red-600 dark:text-red-400',
        };
      case 'ppt':
        return {
          icon: <Presentation className="w-5 h-5 text-orange-500 dark:text-orange-400" />,
          bgColor: 'bg-orange-50 dark:bg-orange-950/20',
          borderColor: 'border-orange-100/70 dark:border-orange-900/30',
          accentColor: 'text-orange-600 dark:text-orange-400',
        };
      case 'excel':
        return {
          icon: <FileSpreadsheet className="w-5 h-5 text-green-500 dark:text-green-400" />,
          bgColor: 'bg-green-50 dark:bg-green-950/20',
          borderColor: 'border-green-100/70 dark:border-green-900/30',
          accentColor: 'text-green-600 dark:text-green-400',
        };
      case 'archive':
        return {
          icon: <Archive className="w-5 h-5 text-amber-500 dark:text-amber-400" />,
          bgColor: 'bg-amber-50 dark:bg-amber-950/20',
          borderColor: 'border-amber-100/70 dark:border-amber-900/30',
          accentColor: 'text-amber-600 dark:text-amber-400',
        };
      case 'audio':
        return {
          icon: <Music className="w-5 h-5 text-purple-500 dark:text-purple-400" />,
          bgColor: 'bg-purple-50 dark:bg-purple-950/20',
          borderColor: 'border-purple-100/70 dark:border-purple-900/30',
          accentColor: 'text-purple-600 dark:text-purple-400',
        };
      case 'video':
        return {
          icon: <Video className="w-5 h-5 text-pink-500 dark:text-pink-400" />,
          bgColor: 'bg-pink-50 dark:bg-pink-950/20',
          borderColor: 'border-pink-100/70 dark:border-pink-900/30',
          accentColor: 'text-pink-600 dark:text-pink-400',
        };
      default:
        return {
          icon: <File className="w-5 h-5 text-slate-500 dark:text-slate-400" />,
          bgColor: 'bg-slate-50 dark:bg-slate-900/30',
          borderColor: 'border-slate-100 dark:border-slate-800',
          accentColor: 'text-slate-600 dark:text-slate-400',
        };
    }
  };

  const config = getCategoryConfig();

  const getParseStatusBadge = () => {
    if (!attachment.parseStatus) return null;
    
    const statusMap: Record<string, { label: string; color: string; tooltip?: string }> = {
      pending: { label: '解析中', color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30' },
      parsed: { label: '已解析', color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30' },
      partial: { label: '部分解析', color: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900/30', tooltip: '部分文件被跳过解析' },
      empty: { label: '无文本', color: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800' },
      unsupported: { label: '不支持解析', color: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800', tooltip: '暂不支持正文文本解析提取' },
      oversized: { label: '文件超大', color: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800', tooltip: '文件体积超出文本解析上限限制' },
      failed: { label: '解析失败', color: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30' },
    };

    const cfg = statusMap[attachment.parseStatus];
    if (!cfg) return null;

    return (
      <span 
        className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 flex-shrink-0 cursor-help ${cfg.color}`}
        title={cfg.tooltip}
      >
        {attachment.parseStatus === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
        {cfg.label}
      </span>
    );
  };

  const renderZipDetails = () => {
    if (category !== 'archive' || !attachment.meta || attachment.meta.entryCount === undefined) return null;
    return (
      <div className="mt-2 text-[11px] p-2.5 rounded-lg border bg-slate-50/50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
        <p className="font-semibold text-slate-700 dark:text-slate-350">文件夹附件 (Zip 压缩包)</p>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li>解压条目数: {attachment.meta.entryCount}</li>
          {attachment.meta.parsedEntryCount !== undefined && (
            <li>成功解析: {attachment.meta.parsedEntryCount}</li>
          )}
          {attachment.meta.skipped && (
            <li className="text-orange-600 dark:text-orange-400 font-semibold">部分文件由于超出大小或格式不支持被跳过</li>
          )}
        </ul>
      </div>
    );
  };

  const renderSummarySection = () => {
    if (!attachment.summary) return null;
    return (
      <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="flex items-center justify-between w-full text-left font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-1">📄 文本摘要分析</span>
          <span className="text-[10px]">{showSummary ? '收起' : '展开'}</span>
        </button>
        {showSummary && (
          <p className="mt-2 leading-relaxed p-2.5 rounded-lg border bg-slate-50/30 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800/50 text-slate-600 dark:text-slate-350 font-sans max-h-40 overflow-y-auto">
            {attachment.summary}
          </p>
        )}
      </div>
    );
  };

  if (category === 'image') {
    return (
      <div className="relative group max-w-sm rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300 my-1">
        {!imageLoaded && !imageError && (
          <div className="w-full h-40 flex items-center justify-center bg-slate-50 dark:bg-slate-900 animate-pulse">
            <Image className="w-8 h-8 text-slate-300 dark:text-slate-700" />
          </div>
        )}
        {!imageError && (
          <img
            src={resolvedUrl}
            alt={attachment.name}
            className={`max-h-60 object-cover w-full cursor-zoom-in transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
            onClick={() => setShowLightBox(true)}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
        {imageError && (
          <div className="w-full h-40 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-600">
            <Image className="w-8 h-8 mb-2" />
            <span className="text-xs font-medium">图片加载失败</span>
          </div>
        )}
        {imageLoaded && (
          <div 
            onClick={() => setShowLightBox(true)}
            className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3 cursor-zoom-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <p className="text-white text-xs font-semibold truncate pr-2">{attachment.name}</p>
                {attachment.size && (
                  <span className="text-white/70 text-[10px] mt-0.5">{formatSize(attachment.size)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLightBox(true);
                  }}
                  className="p-1.5 rounded-lg bg-black/40 hover:bg-black/65 text-white transition-all duration-200"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <a
                  href={resolvedUrl}
                  download={attachment.name}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg bg-black/40 hover:bg-black/65 text-white transition-all duration-200"
                  title="下载图片"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {showLightBox && createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => setShowLightBox(false)}>
            <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200" onClick={() => setShowLightBox(false)}>
              <X className="w-5 h-5" />
            </button>
            <div className="absolute top-4 left-4 text-white">
              <p className="text-sm font-semibold truncate max-w-xs">{attachment.name}</p>
              {attachment.size && <p className="text-xs text-white/60 mt-0.5">{formatSize(attachment.size)}</p>}
            </div>
            <img
              src={resolvedUrl}
              alt={attachment.name}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-200 my-1 max-w-sm flex flex-col gap-3.5 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-xs ${config.bgColor} ${config.borderColor}`}>
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 justify-between">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={attachment.name}>
              {attachment.name}
            </h4>
            {getParseStatusBadge()}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5 font-medium">
            <span className={`uppercase font-bold tracking-wider text-[10px] ${config.accentColor}`}>{category}</span>
            {attachment.size !== undefined && (
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

      {renderZipDetails()}
      {renderSummarySection()}

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      <div className="flex items-center justify-end gap-2">
        {(category === 'pdf' || category === 'video') && (
          <button
            onClick={() => window.open(resolvedUrl, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all duration-150 active:scale-95 shadow-2xs"
            title="在线预览"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>在线预览</span>
          </button>
        )}
        <a
          href={resolvedUrl}
          download={attachment.name}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200/80 dark:border-violet-900/30 text-violet-700 dark:text-violet-300 transition-all duration-150 active:scale-95 shadow-2xs"
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
