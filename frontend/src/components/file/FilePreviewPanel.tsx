import React, { useState, useEffect } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import {
  FileText, FileSpreadsheet, File, FilePlus, Download,
  AlertTriangle, DownloadCloud, Save, RefreshCw, CheckCircle2
} from 'lucide-react';
import { PptxPreview } from './PptxPreview';
import { PdfPreview } from './PdfPreview';
import { getFileInfo, formatFileSize, downloadFile } from '@/services/http/filePreviewService';
import { getDownloadUrl } from '@/services/http/workspaceService';
import { platform } from '@/utils/platform';

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
    truncated?: boolean;
    sha256?: string;
    isLocal?: boolean;
  };
}

export const FilePreviewPanel: React.FC<FilePreviewPanelProps> = ({ item }) => {
  const { 
    serverCurrentWorkspace, 
    saveServerFileContent, 
    loadServerFileContent,
    currentWorkspace,
    loadWorkspaceFileContent,
    saveWorkspaceFileContent
  } = useAgentHubStore();
  const fileInfo = getFileInfo(item);

  const [editingContent, setEditingContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setEditingContent(item.content || item.contentPreview || '');
    setSaveError(null);
    setSaveSuccess(false);
  }, [item.content, item.contentPreview, item.path]);

  const handleDownload = async () => {
    if (item.isLocal) {
      if (currentWorkspace && item.path) {
        await platform.file.revealInFolder(`${currentWorkspace.path}/${item.path}`);
      }
      return;
    }
    if (serverCurrentWorkspace && item.path) {
      const url = getDownloadUrl(serverCurrentWorkspace.id, item.path);
      window.open(url, '_blank');
      return;
    }
    try {
      await downloadFile(item);
    } catch (err) {
      console.error('[FilePreviewPanel] Download failed:', err);
      alert(err instanceof Error ? err.message : '下载失败');
    }
  };

  const handleSave = async () => {
    if (item.isLocal) {
      if (!currentWorkspace || !item.path) return;
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const success = await saveWorkspaceFileContent(item.path, editingContent);
        if (success) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        } else {
          setSaveError('保存本地文件失败，请检查文件权限或重试');
        }
      } catch (err: any) {
        setSaveError(err?.message || '保存失败');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!serverCurrentWorkspace || !item.path) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveServerFileContent(serverCurrentWorkspace.id, item.path, editingContent);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('[FilePreviewPanel] Save failed:', err);
      if (err?.response?.status === 409 || err?.response?.data?.data?.error === 'file_conflict') {
        setSaveError('保存冲突：文件已被其他任务或用户修改，请先备份您的更改，刷新页面后再保存！');
      } else {
        setSaveError(err?.response?.data?.message || err?.message || '保存失败，请重试');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = async () => {
    if (item.isLocal) {
      if (!currentWorkspace || !item.path) return;
      setIsSaving(true);
      setSaveError(null);
      try {
        const content = await loadWorkspaceFileContent(item.path);
        setEditingContent(content || '');
      } catch (err: any) {
        setSaveError('刷新内容失败: ' + (err?.message || '未知错误'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!serverCurrentWorkspace || !item.path) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const content = await loadServerFileContent(serverCurrentWorkspace.id, item.path);
      setEditingContent(content || '');
    } catch (err: any) {
      setSaveError('刷新内容失败: ' + (err?.message || '未知错误'));
    } finally {
      setIsSaving(false);
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
        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-md animate-scale-in"
      >
        <DownloadCloud className="w-4 h-4" />
        下载文件
      </button>
    </div>
  );

  if (fileInfo.type === 'text') {
    const isTruncated = item.truncated === true;
    return (
      <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-200 truncate">{fileInfo.name}</span>
            {isTruncated && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold flex-shrink-0">
                只读预览
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isSaving}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50 active:scale-95 transition-all"
              title="重新加载内容"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
              title="下载文件"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {((serverCurrentWorkspace && !item.isLocal) || (currentWorkspace && item.isLocal)) && item.path && !isTruncated && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-all active:scale-95"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span className="text-xs font-semibold">保存</span>
              </button>
            )}
          </div>
        </div>

        {/* Error / Success Notifications */}
        {saveError && (
          <div className="p-3 mx-4 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-xs text-red-400 animate-slide-up">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="p-3 mx-4 mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2 text-xs text-emerald-400 animate-slide-up">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>保存成功！</span>
          </div>
        )}

        {/* Editor Body */}
        <div className="flex-grow p-4 min-h-0">
          {isTruncated ? (
            <div className="h-full flex flex-col space-y-3">
              <div className="p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-lg flex items-start gap-2 text-[10px] text-amber-500/80 leading-normal">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>该文本文件大小超出编辑器限制，为了保证流畅，仅加载了前部分内容。在此状态下禁止编辑保存。</span>
              </div>
              <div className="flex-1 overflow-auto bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap break-all leading-relaxed select-text">
                  {editingContent}
                </pre>
              </div>
            </div>
          ) : (
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="w-full h-full bg-slate-900/40 hover:bg-slate-900/60 focus:bg-slate-950 p-3 rounded-lg border border-slate-800 focus:border-indigo-500/80 outline-none text-xs font-mono text-slate-200 leading-relaxed resize-none transition-all placeholder:text-slate-600 select-text"
              placeholder="输入文件内容..."
            />
          )}
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
