import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '@/types';
import { X, Copy, FileCode, FileText, Globe } from 'lucide-react';

interface ArtifactFullScreenModalProps {
  open: boolean;
  artifact: Artifact | null;
  onClose: () => void;
}

const ArtifactFullScreenModal: React.FC<ArtifactFullScreenModalProps> = ({ open, artifact, onClose }) => {
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

  if (!open || !artifact) return null;

  const renderContent = () => {
    if (artifact.type === 'code') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6 overflow-auto">
            <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-100 font-mono leading-relaxed">
              {artifact.content}
            </pre>
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto">
          <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-100 font-mono leading-relaxed">
            {artifact.content}
          </pre>
        </div>
      );
    }

    if (artifact.type === 'markdown') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6 overflow-auto">
            <article className="prose prose-lg max-w-none text-slate-800">
              <ReactMarkdown>{artifact.content}</ReactMarkdown>
            </article>
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto">
          <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-100 font-mono leading-relaxed">
            {artifact.content}
          </pre>
        </div>
      );
    }

    if (artifact.type === 'html') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6">
            <iframe
              srcDoc={htmlSrcDoc}
              className="w-full h-full border border-slate-200 rounded-xl bg-white"
              title="HTML Full Screen Preview"
              sandbox="allow-scripts"
            />
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto">
          <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-100 font-mono leading-relaxed">
            {artifact.content}
          </pre>
        </div>
      );
    }

    return (
      <div className="h-full p-6 overflow-auto">
        <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-100 font-mono leading-relaxed">
          {artifact.content}
        </pre>
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
      <div className="bg-white rounded-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <span className="text-blue-600">{getTypeIcon()}</span>
            <h2 className="text-lg font-bold text-slate-800">{artifact.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {needTabs && (
              <div className="flex bg-slate-200 rounded-md p-0.5">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-white text-slate-800 shadow-sm font-medium'
                      : 'text-slate-500'
                  }`}
                >
                  预览
                </button>
                <button
                  onClick={() => setActiveTab('source')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === 'source'
                      ? 'bg-white text-slate-800 shadow-sm font-medium'
                      : 'text-slate-500'
                  }`}
                >
                  源码
                </button>
              </div>
            )}
            <button
              onClick={handleCopy}
              className="p-2 rounded-md hover:bg-slate-200 transition-colors"
              title="复制"
            >
              {copied ? (
                <span className="text-xs text-green-600 font-medium">已复制</span>
              ) : (
                <Copy className="w-5 h-5 text-slate-500" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-slate-200 transition-colors"
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
