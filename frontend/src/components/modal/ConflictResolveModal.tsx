import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, X, Check, Save, Edit, RefreshCw } from 'lucide-react';
import CodeDiffViewer from '../artifact/CodeDiffViewer';

export interface ConflictResolveModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  onOverwrite: () => void;
  onSaveAs: (newPath: string) => void;
  onViewDiff: () => void;
  localContent?: string;
  artifactContent?: string;
}

const ConflictResolveModal: React.FC<ConflictResolveModalProps> = ({
  open,
  onClose,
  fileName,
  filePath,
  onOverwrite,
  onSaveAs,
  onViewDiff,
  localContent,
  artifactContent,
}) => {
  const [customPath, setCustomPath] = useState('');
  const [showSaveAsInput, setShowSaveAsInput] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [splitView, setSplitView] = useState(true);

  useEffect(() => {
    if (open) {
      setCustomPath(filePath);
      setShowSaveAsInput(false);
      setShowDiff(false);
    }
  }, [open, filePath]);

  if (!open) return null;

  const handleSaveAsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPath.trim()) {
      onSaveAs(customPath.trim());
      onClose();
    }
  };

  // DIFF 独立全屏窗口 — 通过 portal 渲染到 document.body，彻底脱离消息 DOM 层级
  if (showDiff && localContent !== undefined && artifactContent !== undefined) {
    const diffContent = (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999] p-4" onClick={() => setShowDiff(false)}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">文件冲突对比</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">本地文件 vs Artifact 产物 — {fileName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setSplitView(!splitView)}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all">
                {splitView ? '单栏' : '双栏'}
              </button>
              <button onClick={() => setShowDiff(false)}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all">
                返回
              </button>
              <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="关闭">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Diff Content */}
          <div className="flex-1 min-h-0 overflow-hidden p-5">
            <CodeDiffViewer oldValue={localContent} newValue={artifactContent} splitView={splitView} />
          </div>
          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-slate-50/50 dark:bg-slate-950/20">
            <button onClick={() => setShowDiff(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 text-xs font-semibold rounded-xl transition-all bg-white dark:bg-slate-900">
              返回
            </button>
            <button onClick={() => { onOverwrite(); onClose(); }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-red-500/10 transition-all active:scale-95 flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" />覆盖写入
            </button>
          </div>
        </div>
      </div>
    );
    return ReactDOM.createPortal(diffContent, document.body);
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2147483647 }}>
      <div className="absolute inset-0 bg-transparent" onClick={onClose} />
      <div className="bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all duration-300 animate-scale-in flex flex-col relative transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex gap-4 items-start">
            <div className="p-3.5 rounded-2xl flex-shrink-0 bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 border border-amber-150 dark:border-amber-900/40">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 pr-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1.5 leading-snug">
                文件冲突：同名文件已存在
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                目标路径已存在同名文件。请选择您的处理操作：直接覆盖已有文件、重命名另存为，或查看新旧版本差异。
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/45 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-400 select-none">文件名:</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{fileName}</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="font-semibold text-slate-400 select-none flex-shrink-0">目标路径:</span>
              <span className="font-mono text-slate-500 dark:text-slate-400 break-all leading-normal">{filePath}</span>
            </div>
          </div>

          {showSaveAsInput && (
            <form onSubmit={handleSaveAsSubmit} className="mt-2 animate-scale-in">
              <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase tracking-wide">
                另存为路径 / 文件名
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  className="flex-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-150 placeholder-slate-400 outline-none focus:border-lark-primary dark:focus:border-violet-500 focus:ring-2 focus:ring-lark-primary/20 transition-all font-mono"
                  placeholder="请输入完整绝对路径或相对路径"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-lark-primary hover:bg-lark-primary-hover text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:shadow active:scale-95"
                >
                  <Check className="w-3.5 h-3.5" />
                  保存
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div>
            {!showSaveAsInput ? (
              <button
                onClick={() => setShowSaveAsInput(true)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-250 text-xs font-semibold rounded-xl transition-all duration-150 flex items-center gap-1.5 bg-white dark:bg-slate-900"
              >
                <Edit className="w-3.5 h-3.5" />
                另存为...
              </button>
            ) : (
              <button
                onClick={() => setShowSaveAsInput(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 text-xs font-semibold rounded-xl transition-all duration-150 bg-white dark:bg-slate-900"
              >
                取消另存为
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-755 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-95 bg-white dark:bg-slate-900"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (localContent !== undefined && artifactContent !== undefined) {
                  setShowDiff(true);
                } else {
                  onViewDiff();
                }
              }}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-lark-primary dark:text-violet-400 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-95 bg-white dark:bg-slate-900 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              对比差异
            </button>
            <button
              onClick={() => {
                onOverwrite();
                onClose();
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-red-500/10 hover:shadow-red-500/20 transition-all duration-150 active:scale-95 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              覆盖写入
            </button>
          </div>
        </div>
      </div>
    </div>
  , document.body);
};

export default ConflictResolveModal;

 
