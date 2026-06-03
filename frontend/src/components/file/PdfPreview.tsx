import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Download, AlertTriangle } from 'lucide-react';
import { getDownloadUrl, fetchFileWithAuth, createObjectURL, revokeObjectURL, downloadFile } from '@/services/http/filePreviewService';

interface PdfPreviewProps {
  item: {
    downloadUrl?: string;
    path?: string;
    filePath?: string;
    runId?: string;
  };
  fileName?: string;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({ item, fileName = 'document.pdf' }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const loadPdf = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = getDownloadUrl(item);
      const blob = await fetchFileWithAuth(url);
      const urlObj = createObjectURL(blob);
      setObjectUrl(urlObj);
      setIsLoading(false);
    } catch (err) {
      console.error('[PdfPreview] Load failed:', err);
      setError(err instanceof Error ? err.message : 'PDF 文件加载失败');
      setIsLoading(false);
    }
  }, [item]);

  useEffect(() => {
    loadPdf();

    return () => {
      if (objectUrl) {
        revokeObjectURL(objectUrl);
      }
    };
  }, [loadPdf]);

  const handleDownload = async () => {
    try {
      await downloadFile(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-950 rounded-lg">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <p className="text-sm text-slate-300 font-medium mb-2">预览失败</p>
        <p className="text-xs text-slate-500 mb-4 max-w-sm">{error}</p>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          下载文件
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 rounded-lg">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
        <p className="text-xs text-slate-400 font-medium">正在加载 PDF...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <span className="text-xs font-semibold text-slate-300">{fileName}</span>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-white" />
          <span className="text-xs font-semibold text-white">下载</span>
        </button>
      </div>
      {objectUrl && (
        <iframe
          src={objectUrl}
          className="flex-1 min-h-0 w-full border-none bg-white"
          title={fileName}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
    </div>
  );
};
