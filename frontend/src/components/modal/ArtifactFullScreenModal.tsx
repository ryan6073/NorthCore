import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '@/types';
import { X, Copy, FileCode, FileText, Globe, GitCompare, RefreshCw } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import CodeDiffViewer from '../artifact/CodeDiffViewer';

interface ArtifactFullScreenModalProps {
  open: boolean;
  artifact: Artifact | null;
  onClose: () => void;
}

const ArtifactFullScreenModal: React.FC<ArtifactFullScreenModalProps> = ({ open, artifact, onClose }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'source' | 'diff'>('preview');
  const [copied, setCopied] = useState(false);
  const [splitView, setSplitView] = useState(true);

  const allArtifacts = useAgentHubStore(state => state.artifacts);
  const loadArtifactContent = useAgentHubStore(state => state.loadArtifactContent);
  const onSelectArtifact = useAgentHubStore(state => state.setSelectedArtifactId);

  // Group all versions of this artifact (same title, sorted by creation date ascending)
  const versions = useMemo(() => {
    if (!artifact) return [];
    return allArtifacts
      .filter(a => a.title === artifact.title)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [artifact, allArtifacts]);

  const currentVersionIndex = useMemo(() => {
    if (!artifact) return -1;
    return versions.findIndex(v => v.id === artifact.id);
  }, [artifact, versions]);

  const previousArtifact = useMemo(() => {
    if (currentVersionIndex > 0) {
      return versions[currentVersionIndex - 1];
    }
    return null;
  }, [currentVersionIndex, versions]);

  // Proactively load current artifact content if missing
  useEffect(() => {
    if (open && artifact && !artifact.content) {
      loadArtifactContent(artifact.id);
    }
  }, [open, artifact, loadArtifactContent]);

  // Proactively load previous version's content when in diff view
  useEffect(() => {
    if (open && activeTab === 'diff' && previousArtifact && !previousArtifact.content) {
      loadArtifactContent(previousArtifact.id);
    }
  }, [open, activeTab, previousArtifact, loadArtifactContent]);

  const handleCopy = async () => {
    if (!artifact) return;
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const htmlSrcDoc = useMemo(() => {
    if (!artifact || artifact.type !== 'html') return undefined;
    return artifact.content;
  }, [artifact]);

  if (!open || !artifact) return null;

  const renderCodeLines = (content: string) => {
    const lines = content.split('\n');
    return (
      <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-100 font-mono leading-relaxed border border-slate-800 flex flex-col gap-0.5 overflow-x-auto whitespace-pre-wrap break-words">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          return (
            <div 
              key={lineNum} 
              data-line-number={lineNum}
              className="flex hover:bg-slate-850 px-2 py-0.5 rounded transition-all duration-150 group relative"
            >
              <span className="w-10 select-none text-slate-500 text-right pr-4 font-mono border-r border-slate-800 mr-4 flex-shrink-0">
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

  const renderContent = () => {
    if (activeTab === 'diff') {
      const oldValue = previousArtifact?.content || '';
      const newValue = artifact.content || '';
      return (
        <div className="h-full w-full overflow-hidden p-4 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-2 pb-2 flex-shrink-0 text-xs text-slate-400">
            <span>对比版本: {previousArtifact ? `v${currentVersionIndex}` : '无'} ➔ v{currentVersionIndex + 1}</span>
            <button
              onClick={() => setSplitView(!splitView)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
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

    if (artifact.type === 'code') {
      return (
        <div className="h-full p-6 overflow-auto bg-slate-950">
          {!artifact.content ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            renderCodeLines(artifact.content)
          )}
        </div>
      );
    }

    if (artifact.type === 'markdown') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6 overflow-auto bg-[#fafbfb]">
            {!artifact.content ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <article className="prose prose-lg max-w-none text-slate-800 bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                <ReactMarkdown>{artifact.content}</ReactMarkdown>
              </article>
            )}
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto bg-slate-950">
          {!artifact.content ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            renderCodeLines(artifact.content)
          )}
        </div>
      );
    }

    if (artifact.type === 'html') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6 bg-[#fafbfb] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-t-xl flex-shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="flex-grow mx-4 bg-white rounded border border-slate-200 py-0.5 px-3 text-xs text-slate-400 truncate">
                https://localhost:5173/{artifact.title.toLowerCase()}
              </div>
            </div>
            <div className="flex-1 min-h-0 border-l border-r border-b border-slate-200 rounded-b-xl bg-white overflow-hidden">
              {!artifact.content ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
                </div>
              ) : (
                <iframe
                  srcDoc={htmlSrcDoc}
                  className="w-full h-full bg-white"
                  title="HTML Full Screen Preview"
                  sandbox="allow-scripts"
                />
              )}
            </div>
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto bg-slate-950">
          {!artifact.content ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            renderCodeLines(artifact.content)
          )}
        </div>
      );
    }

    return (
      <div className="h-full p-6 overflow-auto bg-slate-950">
        {!artifact.content ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : (
          renderCodeLines(artifact.content)
        )}
      </div>
    );
  };

  const getTypeIcon = () => {
    if (artifact.type === 'code') return <FileCode className="w-5 h-5" />;
    if (artifact.type === 'markdown') return <FileText className="w-5 h-5" />;
    if (artifact.type === 'html') return <Globe className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  const needTabs = artifact.type !== undefined && ['code', 'markdown', 'html'].includes(artifact.type);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-blue-600 flex-shrink-0">{getTypeIcon()}</span>
            <h2 className="text-lg font-bold text-slate-800 truncate max-w-[200px]" title={artifact.title}>{artifact.title}</h2>

            {/* Version dropdown select in full screen modal */}
            {versions.length > 1 && (
              <select
                value={artifact.id}
                onChange={(e) => onSelectArtifact(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1 outline-none font-medium focus:ring-1 focus:ring-lark-primary cursor-pointer hover:bg-slate-100"
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
          
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {needTabs && (
              <div className="flex bg-slate-200 rounded-md p-0.5 border border-slate-200">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-white text-slate-800 shadow-sm font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  预览
                </button>
                <button
                  onClick={() => setActiveTab('source')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === 'source'
                      ? 'bg-white text-slate-800 shadow-sm font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  源码
                </button>
                <button
                  onClick={() => setActiveTab('diff')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
                    activeTab === 'diff'
                      ? 'bg-white text-slate-800 shadow-sm font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  对比
                </button>
              </div>
            )}
            <div className="w-px h-6 bg-slate-300 mx-0.5" />
            <button
              onClick={handleCopy}
              className="p-2 rounded-md hover:bg-slate-200 transition-colors flex items-center justify-center"
              title="复制"
            >
              {copied ? (
                <span className="text-xs text-green-600 font-medium px-1">已复制</span>
              ) : (
                <Copy className="w-5 h-5 text-slate-500" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-slate-200 transition-colors flex items-center justify-center"
              title="关闭"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-white">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ArtifactFullScreenModal;
