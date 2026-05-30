import React, { useState } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { platform, FileNode } from '@/utils/platform';
import { Folder, FileText, ChevronDown, ChevronRight, Search, Plus, ExternalLink, MoreVertical, Copy, FolderInput, Target } from 'lucide-react';

export const FileTreePanel: React.FC = () => {
  const currentWorkspace = useAgentHubStore(state => state.currentWorkspace);
  const workspaceFiles = useAgentHubStore(state => state.workspaceFiles);
  const workspaceContextFiles = useAgentHubStore(state => state.workspaceContextFiles);
  const addFileToContext = useAgentHubStore(state => state.addFileToContext);
  const removeFileFromContext = useAgentHubStore(state => state.removeFileFromContext);
  const setSelectedWorkspaceFilePath = useAgentHubStore(state => state.setSelectedWorkspaceFilePath);
  const setRightPanelTab = useAgentHubStore(state => state.setRightPanelTab);

  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({ 'src': true });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);

  const toggleExpand = (dirPath: string) => {
    setExpandedDirs(prev => ({ ...prev, [dirPath]: !prev[dirPath] }));
  };

  const isTextFile = (ext?: string) => {
    if (!ext) return false;
    const textExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'html', 'css', 'txt', 'py', 'yml', 'yaml', 'toml'];
    return textExts.includes(ext.toLowerCase());
  };

  const getFullPath = (nodePath: string) => {
    if (!currentWorkspace?.path) return nodePath;
    if (nodePath.startsWith('/') || nodePath.includes(':')) {
      return nodePath;
    }
    return `${currentWorkspace.path}/${nodePath}`;
  };

  const handleFileClick = (node: FileNode) => {
    if (isTextFile(node.extension)) {
      setSelectedWorkspaceFilePath(node.path);
      setRightPanelTab('file-preview' as any);
    } else {
      // Direct open
      const fullPath = getFullPath(node.path);
      platform.file.openPath(fullPath);
    }
  };

  const handleCopyPath = (node: FileNode) => {
    navigator.clipboard.writeText(node.path);
    alert('已复制路径到剪贴板: ' + node.path);
  };

  const handleOpenPath = (node: FileNode) => {
    const fullPath = getFullPath(node.path);
    platform.file.openPath(fullPath);
  };

  const handleRevealInFolder = (node: FileNode) => {
    const fullPath = getFullPath(node.path);
    platform.file.revealInFolder(fullPath);
  };

  const handleSetAsArtifactTarget = (node: FileNode) => {
    // Save path in localStorage or store for target application
    localStorage.setItem('ag_artifact_target_path', node.path);
    alert(`已将 "${node.name}" 设为 Artifact 默认保存目标！`);
  };

  // Filters the tree recursively based on searchQuery
  const filterTree = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes;
    return nodes
      .map(node => {
        if (node.type === 'directory') {
          const children = filterTree(node.children || [], query);
          if (children.length > 0 || node.name.toLowerCase().includes(query.toLowerCase())) {
            return { ...node, children };
          }
        } else if (node.name.toLowerCase().includes(query.toLowerCase())) {
          return node;
        }
        return null;
      })
      .filter((node): node is FileNode => node !== null);
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedDirs[node.path];
      const isAdded = workspaceContextFiles.includes(node.path);
      const isDirectory = node.type === 'directory';

      return (
        <div key={node.path} className="select-none">
          {/* Node Row */}
          <div
            className={`flex items-center justify-between py-1 px-2 rounded-lg hover:bg-slate-200/55 dark:hover:bg-slate-900/40 group relative cursor-pointer ${
              isDirectory ? 'text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-350'
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => {
              if (isDirectory) {
                toggleExpand(node.path);
              } else {
                handleFileClick(node);
              }
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isDirectory ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  <Folder className="w-4 h-4 text-amber-550 dark:text-amber-500 fill-amber-550/10 flex-shrink-0" />
                </>
              ) : (
                <>
                  <span className="w-3.5 h-3.5 flex-shrink-0" />
                  <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                </>
              )}
              <span className="text-[12px] truncate group-hover:text-slate-900 dark:group-hover:text-white">
                {node.name}
              </span>
            </div>

            {/* Hover Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 touch-actions-visible transition-opacity ml-2 flex-shrink-0 relative">
              {!isDirectory && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isAdded) {
                      removeFileFromContext(node.path);
                    } else {
                      addFileToContext(node.path);
                    }
                  }}
                  className={`p-1 rounded-md active:scale-95 transition-all ${
                    isAdded
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 border border-slate-200 dark:border-slate-750'
                  }`}
                  title={isAdded ? '移出上下文' : '加入上下文'}
                >
                  <Plus className={`w-3 h-3 ${isAdded ? 'rotate-45 transform' : ''}`} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuPath(activeMenuPath === node.path ? null : node.path);
                }}
                className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-450 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-750 active:scale-95 transition-all"
                title="更多操作"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {/* Context Actions Dropdown Popover */}
              {activeMenuPath === node.path && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuPath(null);
                    }}
                  />
                  <div className="absolute right-0 top-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 z-50 text-left w-36 flex flex-col gap-0.5 animate-scale-in text-[11px]">
                    {!isDirectory && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAdded) removeFileFromContext(node.path);
                          else addFileToContext(node.path);
                          setActiveMenuPath(null);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAdded ? '移出上下文' : '加入上下文'}</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPath(node);
                        setActiveMenuPath(null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制相对路径</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPath(node);
                        setActiveMenuPath(null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>用本地程序打开</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevealInFolder(node);
                        setActiveMenuPath(null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                      <span>在文件夹中显示</span>
                    </button>
                    {!isDirectory && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetAsArtifactTarget(node);
                          setActiveMenuPath(null);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-350 border-t border-slate-100 dark:border-slate-800 mt-0.5"
                      >
                        <Target className="w-3.5 h-3.5 text-lark-primary" />
                        <span>设为保存目标</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Children Row */}
          {isDirectory && isExpanded && node.children && (
            <div className="mt-0.5">{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const filteredTree = filterTree(workspaceFiles, searchQuery);

  return (
    <div className="w-full h-full flex flex-col bg-lark-sidebar-bg dark:bg-[#090a12] text-lark-text-primary dark:text-slate-250 select-none">
      {/* Header */}
      <div className="p-4 border-b border-lark-border dark:border-[#161828] flex-shrink-0">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-wide font-sans mb-1.5">
          工作区文件
        </h2>
        {currentWorkspace ? (
          <div className="flex items-center gap-1.5 bg-[#eff0f1] dark:bg-slate-900 border border-lark-border/50 dark:border-slate-800/60 px-2.5 py-1.5 rounded-lg">
            <Folder className="w-3.5 h-3.5 text-lark-primary dark:text-violet-400 flex-shrink-0" />
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title={currentWorkspace.path}>
              {currentWorkspace.name}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            暂未选择工作区。
          </p>
        )}
      </div>

      {currentWorkspace ? (
        <>
          {/* Search bar */}
          <div className="p-3 pb-1 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-[#eff0f1] dark:bg-slate-900 border border-transparent rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-450 focus:bg-white dark:focus:bg-slate-950 focus:border-lark-primary/40 dark:focus:border-violet-650/40 outline-none transition-all"
              />
            </div>
          </div>

          {/* Tree Scroll View */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {filteredTree.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-500 italic text-center py-6">没有找到匹配的文件</p>
            ) : (
              renderTree(filteredTree)
            )}
          </div>
        </>
      ) : (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-650">
          <Folder className="w-10 h-10 stroke-[1.5] text-slate-350 dark:text-slate-750 mb-2" />
          <p className="text-xs mb-3">需要先选择一个本地工作区</p>
          <button
            onClick={() => useAgentHubStore.setState({ leftSidebarViewMode: 'workspace' })}
            className="px-3.5 py-1.5 bg-lark-primary hover:bg-lark-primary-hover dark:bg-violet-650 dark:hover:bg-violet-600 text-white font-medium text-[11px] rounded-lg shadow-sm transition-all active:scale-95"
          >
            前往选择工作区
          </button>
        </div>
      )}
    </div>
  );
};
