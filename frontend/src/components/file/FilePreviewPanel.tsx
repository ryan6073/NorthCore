import React from 'react';
import {
  FileText, FileSpreadsheet, File, FilePlus, Download,
  AlertTriangle, DownloadCloud
} from 'lucide-react';
import { PptxPreview } from './PptxPreview';
import { PdfPreview } from './PdfPreview';
import { getFileInfo, formatFileSize, downloadFile, FileType } from '@/services/http/filePreviewService';

interface FilePreviewPanelProps {
  item: {
    downloadUrl?: string;
    path?: string;
    filePath?: string;
    mimeType?: string;
    size?: number;
    isText?: boolean;
    content?: string;
    contentPreview?: string;
    runId?: string;
  };
}

export const FilePreviewPanel: React.FC<FilePreviewPanelProps> = ({ item }) => {
  const fileInfo = getFileInfo(item);

  const handleDownload = async () => {
    try {
      await downloadFile(item);
    } catch (err) {
      console.error('[FilePreviewPanel] Download failed:', err);
      alert(err instanceof Error ? err.message : '下载失败');
    }
  };

  const renderFileIcon = () => {
    const iconSize = 48;
    switch (fileInfo.type) {
      case 'pptx':
        return <FilePlus size={iconSize} className="text-orange-500" />;
      case 'pdf':
        return <FileText size={iconSize} className="text-red-500" />;
      case 'docx':
        return <FileText size={iconSize} className="text-blue-500" />;
      case 'xlsx':
        return <FileSpreadsheet size={iconSize} className="text-green-500" />;
      case 'text':
        return <FileText size={iconSize} className="text-indigo-500" />;
      default:
        return <File size={iconSize} className="text-slate-400" />;
    }
  };

  const renderFileInfoCard = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-950 rounded-lg">
      <div className="mb-4 p-4 rounded-full bg-slate-900">
        {renderFileIcon()}
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-2">{fileInfo.name}</h3>
      <p className="text-xs text-slate-500 mb-1">
        类型: {fileInfo.type.toUpperCase()}
      </p>
      {item.size !== undefined && (
        <p className="text-xs text-slate-500 mb-4">
          大小: {formatFileSize(item.size)}
        </p>
      )}
      <p className="text-xs text-slate-400 mb-6 max-w-sm">
        该文件是二进制 Office 文档，暂不支持在线预览。请下载后使用对应软件打开查看。
      </p>
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-md"
      >
        <DownloadCloud className="w-4 h-4" />
        下载文件
      </button>
    </div>
  );

  if (fileInfo.type === 'text') {
    const content = item.content || item.contentPreview || '(无内容)';
    return (
      <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60">
          <span className="text-xs font-semibold text-slate-300">{fileInfo.name}</span>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-semibold text-white">下载</span>
          </button>
        </div>
        <div className="flex-1 p-4 overflow-auto">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
            {content}
          </pre>
        </div>
      </div>
    );
  }

  if (fileInfo.type === 'pdf') {
    return (
      <PdfPreview
        item={item}
        fileName={fileInfo.name}
      />
    );
  }

  if (fileInfo.type === 'pptx') {
    return (
      <PptxPreview
        item={item}
        fileName={fileInfo.name}
      />
    );
  }

  return renderFileInfoCard();
};
