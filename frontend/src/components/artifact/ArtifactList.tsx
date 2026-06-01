import React, { useState, useMemo } from 'react';
import { Artifact } from '@/types';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { 
  Folder, 
  ChevronDown, 
  ChevronRight, 
  FileCode, 
  FileText, 
  Globe, 
  Image, 
  Network, 
  Maximize2, 
  Navigation,
  Search,
  Play,
  MessageSquare
} from 'lucide-react';

interface ArtifactListProps {
  artifacts: Artifact[];
  onJumpToMessage: (artifactId: string) => void;
  onFullScreenPreview: (artifactId: string) => void;
}

interface TreeFileNode {
  name: string;
  path: string;
  isFolder: boolean;
  artifact?: Artifact;
  children: TreeFileNode[];
}

const ArtifactList: React.FC<ArtifactListProps> = ({
  artifacts,
  onJumpToMessage,
  onFullScreenPreview
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
  const selectedArtifactId = useAgentHubStore(state => state.selectedArtifactId);

  const toggleExpand = (dirPath: string) => {
    setExpandedDirs(prev => ({ 
      ...prev, 
      [dirPath]: prev[dirPath] === false ? true : false 
    }));
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ 
      ...prev, 
      [groupId]: prev[groupId] === false ? true : false 
    }));
  };

  const filteredArtifacts = useMemo(() => {
    if (!searchQuery) return artifacts;
    return artifacts.filter(art =>
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (art.type && art.type.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (art.runId && art.runId.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [artifacts, searchQuery]);

  const groups = useMemo(() => {
    const result: Record<string, { id: string; name: string; items: Artifact[] }> = {};
    
    filteredArtifacts.forEach(art => {
      const runId = art.runId || 'direct';
      if (!result[runId]) {
        result[runId] = {
          id: runId,
          name: runId === 'direct' ? '直接生成' : `运行: ${runId}`,
          items: []
        };
      }
      result[runId].items.push(art);
    });
    
    return Object.values(result).sort((a, b) => {
      if (a.id === 'direct') return 1;
      if (b.id === 'direct') return -1;
      return b.id.localeCompare(a.id);
    });
  }, [filteredArtifacts]);

  const buildTreeDataForGroup = (groupItems: Artifact[]) => {
    const root: Record<string, any> = {};

    groupItems.forEach(artifact => {
      const path = artifact.title.replace(/\\/g, '/');
      const parts = path.split('/').filter(Boolean);
      
      let currentLevel = root;
      let accumulatedPath = '';

      parts.forEach((part, index) => {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: accumulatedPath,
            isFolder: !isLast,
            children: {},
            ...(isLast ? { artifact } : {})
          };
        } else if (isLast) {
          currentLevel[part].artifact = artifact;
          currentLevel[part].isFolder = false;
        }
        
        currentLevel = currentLevel[part].children;
      });
    });

    const sortTreeNodes = (nodesMap: Record<string, any>): TreeFileNode[] => {
      return Object.values(nodesMap)
        .map(node => ({
          name: node.name,
          path: node.path,
          isFolder: node.isFolder,
          artifact: node.artifact,
          children: sortTreeNodes(node.children)
        }))
        .sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
    };

    return sortTreeNodes(root);
  };

  const getTypeIcon = (type: string) => {
    if (type === 'code') return <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-450 flex-shrink-0" />;
    if (type === 'markdown') return <FileText className="w-4 h-4 text-blue-600 dark:text-blue-450 flex-shrink-0" />;
    if (type === 'html') return <Globe className="w-4 h-4 text-orange-600 dark:text-orange-450 flex-shrink-0" />;
    if (type === 'image') return <Image className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />;
    if (type === 'mermaid') return <Network className="w-4 h-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />;
    return <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />;
  };

  const renderTree = (nodes: TreeFileNode[], groupPrefix: string, depth = 0) => {
    return nodes.map(node => {
      const isFolder = node.isFolder;
      // Prepend groupPrefix to ensure directory paths are unique across groups
      const uniquePath = `${groupPrefix}::${node.path}`;
      const isExpanded = expandedDirs[uniquePath] !== false;
      const isSelected = node.artifact && selectedArtifactId === node.artifact.id;

      return (
        <div key={uniquePath} className="select-none">
          <div
            className={`flex items-center justify-between py-1.5 px-2 rounded-lg group relative cursor-pointer transition-all duration-150 ${
              isSelected
                ? 'bg-lark-primary-light/35 dark:bg-violet-950/20 text-lark-primary dark:text-violet-400 font-semibold ring-1 ring-lark-primary/20 dark:ring-violet-500/20'
                : isFolder
                  ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/40'
                  : 'text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900/30'
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => {
              if (isFolder) {
                toggleExpand(uniquePath);
              } else if (node.artifact) {
                useAgentHubStore.getState().setSelectedArtifactId(node.artifact.id);
              }
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isFolder ? (
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
                  {node.artifact && getTypeIcon(node.artifact.type)}
                </>
              )}
              <span className="text-[12px] truncate group-hover:text-slate-900 dark:group-hover:text-white">
                {node.name}
              </span>
              {node.artifact?.latestVersion && (
                <span className="text-[9px] px-1 bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-500 rounded scale-90 border border-slate-200/50 dark:border-slate-800 flex-shrink-0">
                  v{node.artifact.latestVersion}
                </span>
              )}
            </div>

            {/* Hover Actions */}
            {!isFolder && node.artifact && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0 relative z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.artifact) onJumpToMessage(node.artifact.id);
                  }}
                  className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 border border-slate-200 dark:border-slate-750 active:scale-95 transition-all shadow-sm"
                  title="定位消息"
                >
                  <Navigation className="w-3 h-3 rotate-45" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.artifact) onFullScreenPreview(node.artifact.id);
                  }}
                  className="p-1 rounded-md bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 border border-slate-200 dark:border-slate-750 active:scale-95 transition-all shadow-sm"
                  title="全屏预览"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Render child tree nodes */}
          {isFolder && isExpanded && node.children && node.children.length > 0 && (
            <div className="mt-0.5">{renderTree(node.children, groupPrefix, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Header bar */}
      <div className="p-3 pb-1 border-b border-lark-border/40 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1.5 py-1">
          生成产物树 ({artifacts.length})
        </h3>
      </div>

      {/* Search Input bar */}
      {artifacts.length > 0 && (
        <div className="p-3 pb-1 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索生成的产物..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-[#eff0f1] dark:bg-slate-900 border border-transparent rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-950 focus:border-lark-primary/40 dark:focus:border-violet-650/40 outline-none transition-all"
            />
          </div>
        </div>
      )}

      {/* File Tree scroll view */}
      <div className="flex-grow overflow-y-auto min-h-0 bg-slate-50/50 dark:bg-slate-950/20">
        {artifacts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center p-4">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Agent 生成的代码、文档或网页将在此处以文件树列出。
            </p>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-500 italic text-center py-6">
            没有找到匹配的产物
          </p>
        ) : (
          <div className="flex flex-col">
            {groups.map((group) => {
              const isGroupExpanded = expandedGroups[group.id] !== false;
              const groupTree = buildTreeDataForGroup(group.items);

              return (
                <div key={group.id} className="flex flex-col">
                  {/* Group Header Row */}
                  <div
                    onClick={() => toggleGroup(group.id)}
                    className="flex items-center gap-2 py-2 px-3 bg-slate-100/75 dark:bg-slate-900 border-b border-slate-200/50 dark:border-slate-800/80 cursor-pointer select-none text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-slate-850/50 transition-colors"
                  >
                    {isGroupExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    )}
                    {group.id === 'direct' ? (
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/10 flex-shrink-0" />
                    )}
                    <span className="flex-1 truncate">{group.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full scale-90">
                      {group.items.length} 个文件
                    </span>
                  </div>

                  {/* Group Contents Tree */}
                  {isGroupExpanded && (
                    <div className="p-2 pl-1 space-y-1">
                      {groupTree.map(treeNode => renderTree([treeNode], group.id))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactList;
