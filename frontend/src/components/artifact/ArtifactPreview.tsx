import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '@/types';
import { Copy, FileCode, FileText, Globe, Maximize2 } from 'lucide-react';

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onOpenFullScreen?: () => void;
}

const ArtifactPreview: React.FC<ArtifactPreviewProps> = ({ artifact, onOpenFullScreen }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');
  const [copied, setCopied] = useState(false);

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

  if (!artifact) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-4">
        <p className="text-sm text-slate-400">请选择一个产物进行预览</p>
      </div>
    );
  }

  const renderContent = () => {
    if (artifact.type === 'code') {
      return (
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
          <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800">
            {artifact.content}
          </pre>
        </div>
      );
    }

    if (artifact.type === 'markdown') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full w-full overflow-y-auto p-5 bg-[#fafbfb]">
            <article className="prose prose-sm max-w-none text-lark-text-primary bg-white border border-lark-border p-6 rounded-2xl shadow-sm leading-relaxed">
              <ReactMarkdown>{artifact.content}</ReactMarkdown>
            </article>
          </div>
        );
      }
      return (
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
          <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800">
            {artifact.content}
          </pre>
        </div>
      );
    }

    if (artifact.type === 'html') {
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
                <span className="text-slate-300">https://</span>localhost:5173/{artifact.title.toLowerCase()}
              </div>
            </div>
            {/* Browser Content */}
            <div className="flex-1 min-h-0 border-l border-r border-b border-slate-200 rounded-b-xl bg-white overflow-hidden shadow-sm">
              <iframe
                srcDoc={htmlSrcDoc}
                className="w-full h-full bg-white"
                title="HTML Preview"
                sandbox="allow-scripts"
              />
            </div>
          </div>
        );
      }
      return (
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
          <pre className="bg-slate-900/50 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words border border-slate-800">
            {artifact.content}
          </pre>
        </div>
      );
    }

    return (
      <div className="h-full w-full overflow-y-auto p-4 bg-slate-950">
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto font-mono whitespace-pre-wrap break-words">
          {artifact.content}
        </pre>
      </div>
    );
  };

  const getTypeIcon = () => {
    if (artifact.type === 'code') return <FileCode className="w-4 h-4 text-green-500" />;
    if (artifact.type === 'markdown') return <FileText className="w-4 h-4 text-blue-500" />;
    if (artifact.type === 'html') return <Globe className="w-4 h-4 text-orange-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const needTabs = artifact.type !== undefined && ['code', 'markdown', 'html'].includes(artifact.type);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden text-lark-text-primary bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-lark-border bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">{getTypeIcon()}</span>
          <h4 className="text-xs font-semibold text-lark-text-primary truncate" title={artifact.title}>{artifact.title}</h4>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {needTabs && (
            <div className="flex bg-[#eef0f2] rounded-lg p-0.5 border border-lark-border/30">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-[11px] rounded-md transition-all ${
                  activeTab === 'preview'
                    ? 'bg-white text-lark-primary shadow-sm font-semibold'
                    : 'text-lark-text-secondary hover:text-lark-text-primary'
                }`}
              >
                预览
              </button>
              <button
                onClick={() => setActiveTab('source')}
                className={`px-3 py-1 text-[11px] rounded-md transition-all ${
                  activeTab === 'source'
                    ? 'bg-white text-lark-primary shadow-sm font-semibold'
                    : 'text-lark-text-secondary hover:text-lark-text-primary'
                }`}
              >
                源码
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
              onClick={onOpenFullScreen}
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
