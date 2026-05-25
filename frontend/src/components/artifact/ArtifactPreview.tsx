import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact, ArtifactVersion } from '@/types';
import { Copy, FileCode, FileText, Globe, Maximize2, GitCompare, RefreshCw, Edit3, Save, X } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import CodeDiffViewer from './CodeDiffViewer';
import CodeEditorContainer from './CodeEditorContainer';

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onOpenFullScreen?: (artifactId: string) => void;
}

const ArtifactPreview: React.FC<ArtifactPreviewProps> = ({ artifact, onOpenFullScreen }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'source' | 'diff'>('preview');
  const [copied, setCopied] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [localArtifactId, setLocalArtifactId] = useState<string | null>(null);

  // Phase 4 editing states
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  // Floating Selection Popover states
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; text: string; startLine?: number; endLine?: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allArtifacts = useAgentHubStore(state => state.artifacts);
  const artifactVersions = useAgentHubStore(state => state.artifactVersions);
  const loadArtifactContent = useAgentHubStore(state => state.loadArtifactContent);
  const saveEditedArtifact = useAgentHubStore(state => state.saveEditedArtifact);
  const setQuoteArtifactRef = useAgentHubStore(state => state.setQuoteArtifactRef);

  const selectedArtifactId = useAgentHubStore(state => state.selectedArtifactId);
  const selectedArtifactVersion = useAgentHubStore(state => state.selectedArtifactVersion);

  // Sync local version state with the incoming prop
  useEffect(() => {
    if (artifact) {
      setLocalArtifactId(artifact.id);
    } else {
      setLocalArtifactId(null);
    }
  }, [artifact]);

  const currentArtifact = useMemo(() => {
    if (!localArtifactId) return artifact;
    return allArtifacts.find(a => a.id === localArtifactId) || artifact;
  }, [localArtifactId, allArtifacts, artifact]);

  // Group all versions of this artifact (sorted by version number ascending)
  const versions = useMemo(() => {
    if (!currentArtifact) return [];
    return (artifactVersions[currentArtifact.id] || [])
      .sort((a, b) => a.version - b.version);
  }, [currentArtifact, artifactVersions]);

  // Active version that is currently selected or default currentVersionId
  const currentVersion: ArtifactVersion | null = useMemo(() => {
    if (!versions.length) return null;
    if (selectedArtifactVersion !== null) {
      return versions.find(v => v.version === selectedArtifactVersion) || versions[versions.length - 1];
    }
    return versions.find(v => v.id === currentArtifact?.currentVersionId) || versions[versions.length - 1];
  }, [versions, selectedArtifactVersion, currentArtifact]);

  const currentVersionIndex = useMemo(() => {
    if (!currentVersion || !versions.length) return -1;
    return versions.findIndex(v => v.id === currentVersion.id);
  }, [currentVersion, versions]);

  const previousVersion: ArtifactVersion | null = useMemo(() => {
    if (currentVersionIndex > 0) {
      return versions[currentVersionIndex - 1];
    }
    return null;
  }, [currentVersionIndex, versions]);

  // Sync when an artifact reference version is selected from message bubble click
  useEffect(() => {
    if (selectedArtifactId) {
      setLocalArtifactId(selectedArtifactId);
      if (selectedArtifactVersion !== null) {
        setActiveTab('source'); // Auto-switch to source code view to show highlighted lines
      }
    }
  }, [selectedArtifactId, selectedArtifactVersion]);

  // Proactively load current artifact content if missing
  useEffect(() => {
    if (currentArtifact && versions.length === 0) {
      loadArtifactContent(currentArtifact.id);
    }
  }, [currentArtifact, versions.length, loadArtifactContent]);



  // Reset editing mode when selected artifact changes
  useEffect(() => {
    setIsEditing(false);
  }, [currentArtifact?.id]);

  // Listen for document selection changes to hide popover when selection disappears
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionBox(null);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleCopy = async () => {
    if (!currentArtifact) return;
    if (currentVersion) await navigator.clipboard.writeText(currentVersion.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = async () => {
    if (!currentArtifact) return;
    await saveEditedArtifact(currentArtifact.id, editedContent);
    setIsEditing(false);
  };

  const handleQuoteSelection = () => {
    if (!selectionBox || !currentArtifact) return;
    if (currentVersion) {
      setQuoteArtifactRef({
        artifactId: currentArtifact.id,
        artifactTitle: currentArtifact.title,
        version: currentVersion.version,
        quotedText: selectionBox.text,
        startLine: selectionBox.startLine,
        endLine: selectionBox.endLine,
      });
    }
    // Clear browser selection
    window.getSelection()?.removeAllRanges();
    setSelectionBox(null);
  };

  const handleContainerMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionBox(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      setSelectionBox(null);
      return;
    }

    let startLine: number | undefined = undefined;
    let endLine: number | undefined = undefined;

    // Check if we are in code view or text/source tabs where line containers exist
    if (activeTab === 'source' || (currentArtifact && currentArtifact.type === 'code')) {
      try {
        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;

        const findLineNumber = (node: Node | null): number | undefined => {
          let curr = node;
          while (curr && curr !== e.currentTarget) {
            if (curr instanceof HTMLElement && curr.hasAttribute('data-line-number')) {
              const val = curr.getAttribute('data-line-number');
              if (val) return parseInt(val, 10);
            }
            curr = curr.parentNode;
          }
          return undefined;
        };

        const anchorLine = findLineNumber(anchorNode);
        const focusLine = findLineNumber(focusNode);

        if (anchorLine !== undefined && focusLine !== undefined) {
          startLine = Math.min(anchorLine, focusLine);
          endLine = Math.max(anchorLine, focusLine);
        }
      } catch (err) {
        console.warn('Failed to calculate line numbers for selection', err);
      }
    }

    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const parentRect = e.currentTarget.getBoundingClientRect();
      
      setSelectionBox({
        x: rect.left - parentRect.left + (rect.width / 2) + e.currentTarget.scrollLeft,
        y: rect.top - parentRect.top - 40 + e.currentTarget.scrollTop,
        text,
        startLine,
        endLine
      });
    } catch (err) {
      const rect = e.currentTarget.getBoundingClientRect();
      setSelectionBox({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 40,
        text,
        startLine,
        endLine
      });
    }
  };

  const renderCodeLines = (content: string) => {
    const lines = content.split('\n');
    return (
      <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800 flex flex-col gap-0.5">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          return (
            <div 
              key={lineNum} 
              data-line-number={lineNum}
              className="flex hover:bg-slate-850 px-2 py-0.5 rounded transition-all duration-150 group relative"
            >
              <span className="w-8 select-none text-slate-500 text-right pr-3 font-mono border-r border-slate-850 mr-3 flex-shrink-0">
                {lineNum}
              </span>
              <span className="flex-1 whitespace-pre-wrap font-mono">
                {line || ' '}
              </span>
            </div>
          );
        })}
      </pre>
    );
  };

  const htmlSrcDoc = useMemo(() => {
    if (!currentArtifact || currentArtifact.type !== 'html' || !currentVersion) return undefined;
    return currentVersion.content;
  }, [currentArtifact, currentVersion]);

  if (!currentArtifact) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-4">
        <p className="text-sm text-slate-400">请选择一个产物进行预览</p>
      </div>
    );
  }

  const renderContent = () => {
    if (isEditing) {
      return (
        <CodeEditorContainer
          initialValue={currentVersion?.content || ''}
          onChange={(val) => setEditedContent(val)}
        />
      );
    }

    if (activeTab === 'diff') {
      const oldValue = previousVersion?.content || '';
      const newValue = currentVersion?.content || '';
      return (
        <div className="h-full w-full overflow-hidden p-3 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-2 pb-2 flex-shrink-0 text-xs text-slate-400">
            <span>对比版本: {previousVersion ? `v${previousVersion.version}` : '无'} ➔ v{currentVersion?.version || 1}</span>
            <button
              onClick={() => setSplitView(!splitView)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              {splitView ? '单栏视图' : '双栏视图'}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <CodeDiffViewer oldValue={oldValue} newValue={newValue} splitView={splitView} />
          </div>
        </div>
      );
    }

    if (currentArtifact.type === 'code') {
      return (
        <div 
          ref={containerRef}
          onMouseUp={handleContainerMouseUp}
          className="h-full w-full overflow-y-auto p-4 bg-slate-950 relative"
        >
          {!currentVersion ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            renderCodeLines(currentVersion.content)
          )}
        </div>
      );
    }

    if (currentArtifact.type === 'markdown') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full w-full overflow-y-auto p-5 bg-[#fafbfb]">
            {!currentVersion ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <article className="prose prose-sm max-w-none text-lark-text-primary bg-white border border-lark-border p-6 rounded-2xl shadow-sm leading-relaxed">
                <ReactMarkdown>{currentVersion.content}</ReactMarkdown>
              </article>
            )}
          </div>
        );
      }
      return (
        <div 
          ref={containerRef}
          onMouseUp={handleContainerMouseUp}
          className="h-full w-full overflow-y-auto p-4 bg-slate-950 relative"
        >
          {!currentVersion ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            renderCodeLines(currentVersion.content)
          )}
        </div>
      );
    }

    if (currentArtifact.type === 'html') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full w-full p-4 overflow-hidden flex flex-col bg-[#fafbfb]">
            {/* Browser Header Bar */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-100 border-t border-l border-r border-slate-200 rounded-t-xl flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="flex-grow mx-4 bg-white rounded-md border border-slate-200 py-1 px-3.5 text-[10px] text-slate-400 font-sans truncate select-all flex items-center gap-1.5 shadow-inner">
                <span className="text-slate-300">https://</span>localhost:5173/{currentArtifact.title.toLowerCase()}
              </div>
            </div>
            {/* Browser Content */}
            <div className="flex-1 min-h-0 border-l border-r border-b border-slate-200 rounded-b-xl bg-white overflow-hidden shadow-sm">
              {!currentVersion ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
                </div>
              ) : (
                <iframe
                  srcDoc={htmlSrcDoc}
                  className="w-full h-full bg-white"
                  title="HTML Preview"
                  sandbox="allow-scripts"
                />
              )}
            </div>
          </div>
        );
      }
      return (
        <div 
          ref={containerRef}
          onMouseUp={handleContainerMouseUp}
          className="h-full w-full overflow-y-auto p-4 bg-slate-950 relative"
        >
          {!currentVersion ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            renderCodeLines(currentVersion.content)
          )}
        </div>
      );
    }

    return (
      <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
        {!currentVersion ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : (
          renderCodeLines(currentVersion.content)
        )}
      </div>
    );
  };

  const getTypeIcon = () => {
    if (currentArtifact.type === 'code') return <FileCode className="w-4 h-4 text-green-500" />;
    if (currentArtifact.type === 'markdown') return <FileText className="w-4 h-4 text-blue-500" />;
    if (currentArtifact.type === 'html') return <Globe className="w-4 h-4 text-orange-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const needTabs = currentArtifact.type !== undefined && ['code', 'markdown', 'html'].includes(currentArtifact.type);
  const isEditable = true;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden text-lark-text-primary bg-white relative">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-lark-border bg-white flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">{getTypeIcon()}</span>
          <h4 className="text-xs font-semibold text-lark-text-primary truncate max-w-[120px]" title={currentArtifact.title}>{currentArtifact.title}</h4>
          
          {/* Version Dropdown Select */}
          {!isEditing && versions.length > 1 && currentVersion && (
            <select
              value={currentVersion.id}
              onChange={(e) => {
                const selectedVer = versions.find(v => v.id === e.target.value);
                if (selectedVer) {
                  useAgentHubStore.getState().setSelectedArtifactVersion(selectedVer.version);
                }
              }}
              className="bg-[#f2f4f6] border border-lark-border/60 text-lark-text-secondary text-[10px] rounded px-1.5 py-0.5 outline-none font-medium focus:ring-1 focus:ring-lark-primary cursor-pointer hover:bg-lark-bg-hover"
            >
              {versions.slice().reverse().map((v) => {
                return (
                  <option key={v.id} value={v.id}>
                    v{v.version} {v.version === currentArtifact.latestVersion ? '(最新)' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>
        
        {isEditing ? (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <button
              onClick={handleSaveEdit}
              className="px-2.5 py-1 text-[10px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 transition-all shadow-sm active:scale-95"
              title="保存新版本"
            >
              <Save className="w-3.5 h-3.5" />
              保存新版本
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 text-[10px] rounded-lg border border-lark-border hover:bg-lark-bg-hover text-lark-text-secondary transition-all shadow-sm bg-white flex items-center gap-1 active:scale-95"
              title="取消"
            >
              <X className="w-3.5 h-3.5" />
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            {needTabs && (
              <div className="flex bg-[#eef0f2] rounded-lg p-0.5 border border-lark-border/30">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-2.5 py-0.5 text-[10px] rounded-md transition-all ${
                    activeTab === 'preview'
                      ? 'bg-white text-lark-primary shadow-sm font-semibold'
                      : 'text-lark-text-secondary hover:text-lark-text-primary'
                  }`}
                >
                  预览
                </button>
                <button
                  onClick={() => setActiveTab('source')}
                  className={`px-2.5 py-0.5 text-[10px] rounded-md transition-all ${
                    activeTab === 'source'
                      ? 'bg-white text-lark-primary shadow-sm font-semibold'
                      : 'text-lark-text-secondary hover:text-lark-text-primary'
                  }`}
                >
                  源码
                </button>
                <button
                  onClick={() => setActiveTab('diff')}
                  className={`px-2.5 py-0.5 text-[10px] rounded-md transition-all flex items-center gap-0.5 ${
                    activeTab === 'diff'
                      ? 'bg-white text-lark-primary shadow-sm font-semibold'
                      : 'text-lark-text-secondary hover:text-lark-text-primary'
                  }`}
                >
                  <GitCompare className="w-2.5 h-2.5" />
                  对比
                </button>
              </div>
            )}
            {isEditable && (
              <button
                onClick={() => {
                  setEditedContent(currentVersion?.content || '');
                  setIsEditing(true);
                }}
                className="p-1.5 rounded-lg hover:bg-lark-bg-hover text-lark-text-secondary hover:text-lark-primary transition-all border border-lark-border shadow-sm bg-white flex items-center gap-1 active:scale-95"
                title="编辑内容"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold pr-0.5">编辑</span>
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-lark-bg-hover text-lark-text-secondary hover:text-lark-primary transition-all border border-lark-border shadow-sm bg-white"
              title="复制内容"
            >
              {copied ? (
                <span className="text-[10px] text-green-600 font-semibold px-0.5">已复制</span>
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            {onOpenFullScreen && (
              <button
                onClick={() => onOpenFullScreen(currentArtifact.id)}
                className="p-1.5 rounded-lg hover:bg-lark-bg-hover text-lark-text-secondary hover:text-lark-primary transition-all border border-lark-border shadow-sm bg-white"
                title="放大全屏预览"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden min-h-0 bg-[#fafbfb] relative">
        {renderContent()}

        {/* Floating Selection Popover */}
        {!isEditing && selectionBox && (
          <button
            type="button"
            onClick={handleQuoteSelection}
            className="absolute bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-xl hover:bg-slate-800 border border-slate-700 z-50 flex items-center gap-1 hover:scale-105 active:scale-95 transition-all select-none"
            style={{
              top: `${selectionBox.y}px`,
              left: `${selectionBox.x}px`,
              transform: 'translateX(-50%)',
            }}
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.9 19c0 .5-.4.9-.9.9h-5c-.5 0-.9-.4-.9-.9v-5c0-.5.4-.9.9-.9h2.3c-.6-1.5-2.1-2.5-3.8-2.5-.2 0-.4 0-.6.1-.5.1-.9-.3-.8-.8l.5-2.7c.1-.4.4-.7.8-.7h.2c4.1 0 7.4 3.3 7.4 7.4v4.2zm10 0c0 .5-.4.9-.9.9h-5c-.5 0-.9-.4-.9-.9v-5c0-.5.4-.9.9-.9h2.3c-.6-1.5-2.1-2.5-3.8-2.5-.2 0-.4 0-.6.1-.5.1-.9-.3-.8-.8l.5-2.7c.1-.4.4-.7.8-.7h.2c4.1 0 7.4 3.3 7.4 7.4v4.2z"/>
            </svg>
            <span>引用选中文本</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ArtifactPreview;
