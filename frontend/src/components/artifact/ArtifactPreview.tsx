import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '@/types';
import { Copy, FileCode, FileText, Globe, Maximize2, GitCompare, RefreshCw } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import CodeDiffViewer from './CodeDiffViewer';

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onOpenFullScreen?: (artifactId: string) => void;
}

const ArtifactPreview: React.FC<ArtifactPreviewProps> = ({ artifact, onOpenFullScreen }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'source' | 'diff'>('preview');
  const [copied, setCopied] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [localArtifactId, setLocalArtifactId] = useState<string | null>(null);

  const allArtifacts = useAgentHubStore(state => state.artifacts);
  const loadArtifactContent = useAgentHubStore(state => state.loadArtifactContent);

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

  // Group all versions of this artifact (same title, sorted by creation date ascending)
  const versions = useMemo(() => {
    if (!currentArtifact) return [];
    return allArtifacts
      .filter(a => a.title === currentArtifact.title)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [currentArtifact, allArtifacts]);

  const currentVersionIndex = useMemo(() => {
    if (!currentArtifact) return -1;
    return versions.findIndex(v => v.id === currentArtifact.id);
  }, [currentArtifact, versions]);

  const previousArtifact = useMemo(() => {
    if (currentVersionIndex > 0) {
      return versions[currentVersionIndex - 1];
    }
    return null;
  }, [currentVersionIndex, versions]);

  // Proactively load current artifact content if missing
  useEffect(() => {
    if (currentArtifact && !currentArtifact.content) {
      loadArtifactContent(currentArtifact.id);
    }
  }, [currentArtifact, loadArtifactContent]);

  // Proactively load previous version's content when in diff view
  useEffect(() => {
    if (activeTab === 'diff' && previousArtifact && !previousArtifact.content) {
      loadArtifactContent(previousArtifact.id);
    }
  }, [activeTab, previousArtifact, loadArtifactContent]);

  const handleCopy = async () => {
    if (!currentArtifact) return;
    await navigator.clipboard.writeText(currentArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const htmlSrcDoc = useMemo(() => {
    if (!currentArtifact || currentArtifact.type !== 'html') return undefined;
    return currentArtifact.content;
  }, [currentArtifact]);

  if (!currentArtifact) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-4">
        <p className="text-sm text-slate-400">请选择一个产物进行预览</p>
      </div>
    );
  }

  const renderContent = () => {
    if (activeTab === 'diff') {
      const oldValue = previousArtifact?.content || '';
      const newValue = currentArtifact.content || '';
      return (
        <div className="h-full w-full overflow-hidden p-3 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-2 pb-2 flex-shrink-0 text-xs text-slate-400">
            <span>对比版本: {previousArtifact ? `v${currentVersionIndex}` : '无'} ➔ v{currentVersionIndex + 1}</span>
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
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
          {!currentArtifact.content ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800">
              {currentArtifact.content}
            </pre>
          )}
        </div>
      );
    }

    if (currentArtifact.type === 'markdown') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full w-full overflow-y-auto p-5 bg-[#fafbfb]">
            {!currentArtifact.content ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <article className="prose prose-sm max-w-none text-lark-text-primary bg-white border border-lark-border p-6 rounded-2xl shadow-sm leading-relaxed">
                <ReactMarkdown>{currentArtifact.content}</ReactMarkdown>
              </article>
            )}
          </div>
        );
      }
      return (
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
          {!currentArtifact.content ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800">
              {currentArtifact.content}
            </pre>
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
              {!currentArtifact.content ? (
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
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
          {!currentArtifact.content ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800">
              {currentArtifact.content}
            </pre>
          )}
        </div>
      );
    }

    return (
      <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
        {!currentArtifact.content ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : (
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono whitespace-pre-wrap break-words">
            {currentArtifact.content}
          </pre>
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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden text-lark-text-primary bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-lark-border bg-white flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">{getTypeIcon()}</span>
          <h4 className="text-xs font-semibold text-lark-text-primary truncate max-w-[120px]" title={currentArtifact.title}>{currentArtifact.title}</h4>
          
          {/* Version Dropdown Select */}
          {versions.length > 1 && (
            <select
              value={currentArtifact.id}
              onChange={(e) => setLocalArtifactId(e.target.value)}
              className="bg-[#f2f4f6] border border-lark-border/60 text-lark-text-secondary text-[10px] rounded px-1.5 py-0.5 outline-none font-medium focus:ring-1 focus:ring-lark-primary cursor-pointer hover:bg-lark-bg-hover"
            >
              {versions.slice().reverse().map((v, idx) => {
                const verNum = versions.length - idx;
                return (
                  <option key={v.id} value={v.id}>
                    v{verNum} {verNum === versions.length ? '(最新)' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>
        
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
      </div>
      <div className="flex-1 overflow-hidden min-h-0 bg-[#fafbfb]">
        {renderContent()}
      </div>
    </div>
  );
};

export default ArtifactPreview;
