import React, { useState, useRef, useEffect } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { 
  Folder, FileText, ChevronDown, ChevronRight, Search, 
  Plus, ExternalLink, MoreVertical, Copy, Upload, Download, AlertTriangle, RefreshCw, Cloud, Laptop
} from 'lucide-react';
import { getDownloadUrl } from '@/services/http/workspaceService';
import { platform } from '@/utils/platform';

export const FileTreePanel: React.FC = () => {
  const {
    serverCurrentWorkspace,
    serverWorkspaceTree,
    loadServerWorkspaceTree,
    loadServerFileContent,
    uploadServerFile,
    setRightPanelTab,
    isDesktop,
    currentWorkspace,
    workspaceFiles,
    selectWorkspace,
    scanWorkspace,
    setSelectedWorkspaceFilePath
  } = useAgentHubStore();

  const [viewMode, setViewMode] = useState<'sandbox' | 'local'>('sandbox');
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({ '': true });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [dragOverDir, setDragOverDir] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetDir, setUploadTargetDir] = useState<string>('');

  // Automatically default to local if isDesktop is true and no server workspace exists
  useEffect(() => {
    if (isDesktop && !serverCurrentWorkspace && currentWorkspace) {
      setViewMode('local');
    }
  }, [isDesktop, serverCurrentWorkspace, currentWorkspace]);

  // Load local files if switching to local mode
  useEffect(() => {
    if (viewMode === 'local' && currentWorkspace) {
      scanWorkspace();
    }
  }, [viewMode, currentWorkspace]);

  const toggleExpand = (dirPath: string) => {
    setExpandedDirs(prev => ({ ...prev, [dirPath]: !prev[dirPath] }));
  };

  const isTextFile = (name: string) => {
    const ext = name.split('.').pop() || '';
    const textExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'html', 'css', 'txt', 'py', 'yml', 'yaml', 'toml', 'sh', 'sql', 'go', 'rs', 'java', 'c', 'cpp', 'h'];
    return textExts.includes(ext.toLowerCase());
  };

  const handleFileClick = async (node: any) => {
    if (viewMode === 'local') {
      if (!currentWorkspace) return;
      if (isTextFile(node.name)) {
        setSelectedWorkspaceFilePath(node.path);
        setRightPanelTab('file-preview' as any);
      } else {
        await platform.file.openPath(`${currentWorkspace.path}/${node.path}`);
      }
      return;
    }

    // Sandbox workspace mode
    if (!serverCurrentWorkspace) return;
    if (isTextFile(node.name)) {
      useAgentHubStore.setState({ selectedWorkspaceFilePath: node.path });
      setRightPanelTab('file-preview' as any);
      await loadServerFileContent(serverCurrentWorkspace.id, node.path);
    } else {
      handleDownload(node.path);
    }
  };

  const handleDownload = (path: string) => {
    if (!serverCurrentWorkspace) return;
    const url = getDownloadUrl(serverCurrentWorkspace.id, path);
    window.open(url, '_blank');
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    alert('已复制路径到剪贴板: ' + path);
  };

  const triggerUpload = (dirPath: string) => {
    setUploadTargetDir(dirPath);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!serverCurrentWorkspace || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      await uploadServerFile(serverCurrentWorkspace.id, uploadTargetDir, file);
      alert('上传成功！');
    } catch (err: any) {
      console.error(err);
      if (err?.response?.data?.data?.error === 'file_exists') {
        alert(`冲突：工作区目录下已存在名为 "${file.name}" 的文件，暂不支持直接覆盖，请重命名后上传。`);
      } else {
        alert(err?.response?.data?.message || '上传文件失败，请重试');
      }
    }
  };

  const handleDrop = async (e: React.DragEvent, dirPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverRoot(false);
    setDragOverDir(null);

    if (viewMode === 'local') return; // Local filesystem drag-drop not implemented via web UI
    if (!serverCurrentWorkspace || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files);
    
    let successCount = 0;
    for (const file of files) {
      try {
        await uploadServerFile(serverCurrentWorkspace.id, dirPath, file);
        successCount++;
      } catch (err: any) {
        console.error(err);
        if (err?.response?.data?.data?.error === 'file_exists') {
          alert(`冲突外观："${file.name}" 已经存在，已被跳过，请重命名后上传。`);
        } else {
          alert(`上传 "${file.name}" 失败: ${err?.message || '未知错误'}`);
        }
      }
    }
    if (successCount > 0) {
      alert(`成功上传了 ${successCount} 个文件！`);
    }
  };

  const handleDragOver = (e: React.DragEvent, dirPath: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'local') return;
    if (dirPath === null) {
      setIsDragOverRoot(true);
    } else {
      setDragOverDir(dirPath);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverRoot(false);
    setDragOverDir(null);
  };

  const filterTree = (node: any, query: string): any => {
    if (!query) return node;
    const isMatched = node.name.toLowerCase().includes(query.toLowerCase());
    
    if (node.type === 'directory') {
      const children = (node.children || [])
        .map((child: any) => filterTree(child, query))
        .filter((child: any) => child !== null);
      
      if (children.length > 0 || isMatched) {
        return { ...node, children };
      }
    } else if (isMatched) {
      return node;
    }
    return null;
  };

  const renderTree = (node: any, depth = 0): React.ReactNode => {
    if (!node) return null;
    const isDirectory = node.type === 'directory';
    const isExpanded = expandedDirs[node.path];
    const isDraggingOver = dragOverDir === node.path;

    return (
      <div key={node.path} className="select-none animate-fade-in">
        <div
          className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-slate-200/55 dark:hover:bg-slate-900/40 group relative cursor-pointer transition-colors ${
            isDirectory ? 'text-slate-800 dark:text-slate-200 font-semibold' : 'text-slate-655 dark:text-slate-355'
          } ${isDraggingOver ? 'bg-indigo-500/10 border-dashed border border-indigo-500/40' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (isDirectory) {
              toggleExpand(node.path);
            } else {
              handleFileClick(node);
            }
          }}
          onDragOver={(e) => isDirectory && handleDragOver(e, node.path)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => isDirectory && handleDrop(e, node.path)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isDirectory ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-450 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-455 flex-shrink-0" />
                )}
                <Folder className="w-4 h-4 text-amber-500 dark:text-amber-500 fill-amber-500/10 flex-shrink-0" />
              </>
            ) : (
              <>
                <span className="w-3.5 h-3.5 flex-shrink-0" />
                <FileText className="w-4 h-4 text-indigo-550 dark:text-indigo-400 flex-shrink-0" />
              </>
            )}
            <span className="text-[12px] truncate group-hover:text-slate-900 dark:group-hover:text-white font-sans">
              {node.name}
            </span>
          </div>

          {/* Hover Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 touch-actions-visible transition-opacity ml-2 flex-shrink-0 relative" onClick={(e) => e.stopPropagation()}>
            {viewMode === 'local' ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentWorkspace) return;
                    await platform.file.revealInFolder(`${currentWorkspace.path}/${node.path}`);
                  }}
                  className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 border border-slate-205 dark:border-slate-750 active:scale-95 transition-all"
                  title="在系统文件管理器中定位"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMenuPath(activeMenuPath === node.path ? null : node.path)}
                  className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-550 dark:text-slate-450 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-205 dark:border-slate-750 active:scale-95 transition-all"
                  title="更多操作"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                {isDirectory && (
                  <button
                    type="button"
                    onClick={() => triggerUpload(node.path)}
                    className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-505 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 border border-slate-205 dark:border-slate-755 active:scale-95 transition-all"
                    title="上传文件"
                  >
                    <Upload className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveMenuPath(activeMenuPath === node.path ? null : node.path)}
                  className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-505 dark:text-slate-450 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-205 dark:border-slate-755 active:scale-95 transition-all"
                  title="更多操作"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {/* Context Actions Dropdown Popover */}
            {activeMenuPath === node.path && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setActiveMenuPath(null)}
                />
                <div className="absolute right-0 top-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-50 text-left w-36 flex flex-col gap-0.5 animate-scale-in text-[11px]">
                  {viewMode === 'local' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (currentWorkspace) {
                          await platform.file.revealInFolder(`${currentWorkspace.path}/${node.path}`);
                        }
                        setActiveMenuPath(null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      <span>在管理器中定位</span>
                    </button>
                  ) : (
                    <>
                      {isDirectory && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerUpload(node.path);
                            setActiveMenuPath(null);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350"
                        >
                          <Upload className="w-3.5 h-3.5 text-slate-400" />
                          <span>上传文件</span>
                        </button>
                      )}
                      {!isDirectory && (
                        <button
                          type="button"
                          onClick={() => {
                            handleDownload(node.path);
                            setActiveMenuPath(null);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-400" />
                          <span>下载文件</span>
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyPath(node.path);
                      setActiveMenuPath(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>复制相对路径</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {isDirectory && isExpanded && node.children && node.children.length > 0 && (
          <div className="mt-0.5">
            {node.children.map((child: any) => renderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Source files select
  const activeTreeRoot = viewMode === 'local' 
    ? (workspaceFiles && workspaceFiles.length > 0 ? { name: currentWorkspace?.name || 'Local', type: 'directory', path: '', children: workspaceFiles } : null)
    : serverWorkspaceTree;

  const rootNode = activeTreeRoot ? filterTree(activeTreeRoot, searchQuery) : null;
  const isTruncated = viewMode === 'sandbox' && serverWorkspaceTree?.truncated === true;

  const isCurrentActive = viewMode === 'local' ? !!currentWorkspace : !!serverCurrentWorkspace;
  const activeWorkspaceName = viewMode === 'local' ? currentWorkspace?.name : serverCurrentWorkspace?.name;

  return (
    <div 
      className={`w-full h-full flex flex-col bg-lark-sidebar-bg dark:bg-[#090a12] text-lark-text-primary dark:text-slate-250 select-none transition-all ${
        isDragOverRoot ? 'bg-indigo-500/5 dark:bg-indigo-950/10 border-2 border-dashed border-indigo-500/30' : ''
      }`}
      onDragOver={(e) => handleDragOver(e, null)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, '')}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Desktop Mode Tab Switcher */}
      {isDesktop && (
        <div className="flex px-3 pt-2.5 pb-1 border-b border-lark-border/50 dark:border-slate-900/60 bg-slate-50/50 dark:bg-slate-950/10 flex-shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('sandbox')}
            className={`flex-1 py-1.5 text-[11px] font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'sandbox'
                ? 'border-lark-primary dark:border-indigo-500 text-lark-primary dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-350'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>沙箱工作区</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('local')}
            className={`flex-1 py-1.5 text-[11px] font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'local'
                ? 'border-lark-primary dark:border-indigo-500 text-lark-primary dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-350'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>本地工作区</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-lark-border dark:border-[#161828] flex-shrink-0">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-wide font-sans mb-1.5 flex items-center justify-between">
          <span>{viewMode === 'local' ? '本地文件' : '沙箱文件'}</span>
          {isCurrentActive && (
            <button
              type="button"
              onClick={() => viewMode === 'local' ? scanWorkspace() : loadServerWorkspaceTree(serverCurrentWorkspace!.id)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-850 active:scale-95 transition-all text-slate-400 hover:text-slate-600"
              title="刷新文件"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </h2>
        {isCurrentActive ? (
          <div className="flex items-center gap-1.5 bg-[#eff0f1] dark:bg-slate-900 border border-lark-border/50 dark:border-slate-800/60 px-2.5 py-1.5 rounded-lg">
            {viewMode === 'local' ? (
              <Laptop className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-lark-primary dark:text-violet-400 flex-shrink-0" />
            )}
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title={activeWorkspaceName}>
              {activeWorkspaceName}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-450 italic">
            {viewMode === 'local' ? '未关联本地目录' : '未选择沙箱工作区'}
          </p>
        )}
      </div>

      {isCurrentActive ? (
        <>
          {/* Truncation warning */}
          {isTruncated && (
            <div className="m-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 leading-normal animate-slide-up">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">文件显示已截断：</span>
                文件过多（后端限制最多加载 2000 个文件），建议精简工作区目录文件或刷新后重试。
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="p-3 pb-1 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-450" />
              <input
                type="text"
                placeholder={viewMode === 'local' ? "搜索本地文件..." : "搜索沙箱文件..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#eff0f1] dark:bg-slate-900 border border-transparent rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-450 focus:bg-white dark:focus:bg-slate-950 focus:border-lark-primary/40 dark:focus:border-violet-650/40 outline-none transition-all"
              />
            </div>
          </div>

          {/* Tree Scroll View */}
          <div className="flex-grow overflow-y-auto p-3 space-y-1">
            {!rootNode ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-405 text-xs text-center">
                <span>{viewMode === 'local' ? '本地工作区为空或未找到匹配文件' : '沙箱工作区为空或未找到匹配文件'}</span>
                {viewMode === 'sandbox' && (
                  <button
                    type="button"
                    onClick={() => triggerUpload('')}
                    className="mt-2.5 px-3 py-1 bg-lark-primary hover:bg-lark-primary-hover text-white text-[11px] font-semibold rounded-lg shadow-sm"
                  >
                    上传文件
                  </button>
                )}
              </div>
            ) : (
              rootNode.children && rootNode.children.length > 0 ? (
                rootNode.children.map((child: any) => renderTree(child))
              ) : (
                renderTree(rootNode)
              )
            )}
          </div>
        </>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-655">
          {viewMode === 'local' ? (
            <>
              <Laptop className="w-10 h-10 stroke-[1.5] text-slate-350 dark:text-slate-750 mb-2" />
              <p className="text-xs mb-3">需要先关联本地工作区目录</p>
              <button
                type="button"
                onClick={selectWorkspace}
                className="px-3.5 py-1.5 bg-lark-primary hover:bg-lark-primary-hover dark:bg-violet-650 dark:hover:bg-violet-600 text-white font-medium text-[11px] rounded-lg shadow-sm transition-all active:scale-95"
              >
                选择本地目录
              </button>
            </>
          ) : (
            <>
              <Folder className="w-10 h-10 stroke-[1.5] text-slate-350 dark:text-slate-750 mb-2" />
              <p className="text-xs mb-3">需要先选择一个沙箱工作区</p>
              <button
                type="button"
                onClick={() => useAgentHubStore.setState({ leftSidebarViewMode: 'workspace' })}
                className="px-3.5 py-1.5 bg-lark-primary hover:bg-lark-primary-hover dark:bg-violet-650 dark:hover:bg-violet-600 text-white font-medium text-[11px] rounded-lg shadow-sm transition-all active:scale-95"
              >
                前往沙箱面板
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
