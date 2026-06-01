import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact, ArtifactVersion } from '@/types';
import { X, Copy, FileCode, FileText, Globe, GitCompare, RefreshCw, Edit3, Save, Network } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import CodeDiffViewer from '../artifact/CodeDiffViewer';
import CodeEditorContainer from '../artifact/CodeEditorContainer';
import { getSandboxHtmlPreview } from '@/services/http/sandboxService';
import mermaid from 'mermaid';

interface ArtifactFullScreenModalProps {
  open: boolean;
  artifact: Artifact | null;
  onClose: () => void;
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

const MermaidRenderer: React.FC<{ chart: string }> = ({ chart }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elementId = useRef(`mermaid-fs-md-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      try {
        setError(null);
        const cleanChart = chart.trim();
        const { svg: renderedSvg } = await mermaid.render(elementId.current, cleanChart);
        if (isMounted) {
          if (renderedSvg.includes('Syntax error in text') || renderedSvg.includes('class="error-icon"')) {
            setError('图表语法错误');
          } else {
            setSvg(renderedSvg);
          }
        }
      } catch (err) {
        console.warn('Mermaid render error inside markdown:', err);
        if (isMounted) {
          setError('图表语法错误');
        }
      }
    };
    render();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-250 dark:border-yellow-800/30 p-3 rounded-lg text-xs my-2">
        <p className="text-yellow-700 dark:text-yellow-300 font-semibold mb-1">⚠️ Mermaid 渲染失败</p>
        <pre className="text-[10px] text-slate-500 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-4 text-slate-400 text-xs gap-2">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 正在渲染图表...
      </div>
    );
  }

  return (
    <div 
      className="w-full flex items-center justify-center my-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-800 overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

const ArtifactFullScreenModal: React.FC<ArtifactFullScreenModalProps> = ({ open, artifact, onClose }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'source' | 'diff'>('preview');
  const [copied, setCopied] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [integratedHtml, setIntegratedHtml] = useState<string | undefined>(undefined);
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);

  // Editing states
  const [isEditing, setIsEditing] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; text: string; startLine?: number; endLine?: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleQuoteSelection = () => {
    if (!selectionBox || !artifact || !currentVersion) return;
    setQuoteArtifactRef({
      artifactId: artifact.id,
      artifactTitle: artifact.title,
      version: currentVersion.version,
      quotedText: selectionBox.text,
      startLine: selectionBox.startLine,
      endLine: selectionBox.endLine,
    });
    // Clear browser selection
    window.getSelection()?.removeAllRanges();
    setSelectionBox(null);
  };

  const triggerSelection = (e: React.MouseEvent<HTMLDivElement> | MouseEvent | null) => {
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

    // Check if selection is within the parent container
    if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) {
      return;
    }

    let startLine: number | undefined = undefined;
    let endLine: number | undefined = undefined;

    // Check if we are in code view or text/source tabs where line containers exist
    if (activeTab === 'source' || (artifact && artifact.type === 'code')) {
      try {
        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;

        const findLineNumber = (node: Node | null): number | undefined => {
          let curr = node;
          while (curr && curr !== containerRef.current) {
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

    if (!containerRef.current) return;
    const parentRect = containerRef.current.getBoundingClientRect();

    if (e && e.clientX !== 0 && e.clientY !== 0) {
      // Position near the mouse cursor
      const x = Math.max(10, Math.min(parentRect.width - 10, e.clientX - parentRect.left));
      const y = Math.max(10, e.clientY - parentRect.top - 45);
      setSelectionBox({
        x,
        y,
        text,
        startLine,
        endLine
      });
    } else {
      // Fallback to selection bounding box
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = Math.max(10, Math.min(parentRect.width - 10, rect.left - parentRect.left + (rect.width / 2)));
        const y = Math.max(10, rect.top - parentRect.top - 45);
        setSelectionBox({
          x,
          y,
          text,
          startLine,
          endLine
        });
      } catch (err) {
        console.error('Failed to calculate selection rect fallback', err);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    triggerSelection(e);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.shiftKey && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown')) {
      triggerSelection(null);
    }
  };
  const [editedContent, setEditedContent] = useState('');

  const allArtifacts = useAgentHubStore(state => state.artifacts);
  const artifactVersions = useAgentHubStore(state => state.artifactVersions);
  const selectedArtifactVersion = useAgentHubStore(state => state.selectedArtifactVersion);
  const loadArtifactContent = useAgentHubStore(state => state.loadArtifactContent);
  const saveEditedArtifact = useAgentHubStore(state => state.saveEditedArtifact);
  const setQuoteArtifactRef = useAgentHubStore(state => state.setQuoteArtifactRef);

  // Reset editing mode when selected artifact changes
  useEffect(() => {
    setIsEditing(false);
  }, [artifact?.id]);

  const handleSaveEdit = async () => {
    if (!artifact) return;
    setIsEditing(false);
    setActiveTab('preview');
    await saveEditedArtifact(artifact.id, editedContent);
  };

  // Group all versions of this artifact (sorted by version number ascending)
  const versions = useMemo(() => {
    if (!artifact) return [];
    return (artifactVersions[artifact.id] || [])
      .sort((a, b) => a.version - b.version);
  }, [artifact, artifactVersions]);

  // Active version that is currently selected or default currentVersionId
  const currentVersion: ArtifactVersion | null = useMemo(() => {
    if (!versions.length) return null;
    if (selectedArtifactVersion !== null) {
      return versions.find(v => v.version === selectedArtifactVersion) || versions[versions.length - 1];
    }
    return versions.find(v => v.id === artifact?.currentVersionId) || versions[versions.length - 1];
  }, [versions, selectedArtifactVersion, artifact]);

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

  // Proactively load current artifact content if missing
  useEffect(() => {
    if (open && artifact && versions.length === 0) {
      loadArtifactContent(artifact.id);
    }
  }, [open, artifact, versions.length, loadArtifactContent]);

  // Render mermaid diagram (moved after currentVersion definition)
  useEffect(() => {
    if (open && artifact?.type === 'mermaid' && activeTab === 'preview' && currentVersion?.content) {
      const renderMermaid = async () => {
        try {
          setMermaidError(null);
          const id = `mermaid-fs-${artifact.id}-${currentVersion.version}`;
          const { svg } = await mermaid.render(id, currentVersion.content);
          setMermaidSvg(svg);
        } catch (err) {
          console.error('Mermaid render error:', err);
          setMermaidError(String(err));
          setMermaidSvg(null);
        }
      };
      renderMermaid();
    } else {
      setMermaidSvg(null);
      setMermaidError(null);
    }
  }, [open, artifact?.id, artifact?.type, activeTab, currentVersion?.version, currentVersion?.content]);

  // Inline multi-file HTML assets (CSS, JS) in frontend, ensure 100% matches user's latest edits
  const buildIntegratedHtml = (baseHtml: string): string => {
    let result = baseHtml;
    
    // Inline CSS files: replace <link rel="stylesheet" href="xxx.css"> with <style>...</style>
    const cssLinkRegex = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
    let cssMatch;
    while ((cssMatch = cssLinkRegex.exec(result)) !== null) {
      const filePath = cssMatch[1];
      const cssArtifact = allArtifacts?.find((a: any) => 
        a.title.toLowerCase() === filePath.toLowerCase() || 
        a.title.toLowerCase().endsWith('/' + filePath.toLowerCase())
      );
      const cssVersion = cssArtifact && artifactVersions[cssArtifact.id]?.find(v => v.id === cssArtifact.currentVersionId);
      if (cssVersion?.content) {
        result = result.replace(cssMatch[0], `<style>${cssVersion.content}</style>`);
      }
    }
    
    // Inline JS files: replace <script src="xxx.js"></script> with <script>...</script>
    const scriptSrcRegex = /<script[^>]*src=["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi;
    let jsMatch;
    while ((jsMatch = scriptSrcRegex.exec(result)) !== null) {
      const filePath = jsMatch[1];
      const jsArtifact = allArtifacts?.find((a: any) => 
        a.title.toLowerCase() === filePath.toLowerCase() || 
        a.title.toLowerCase().endsWith('/' + filePath.toLowerCase())
      );
      const jsVersion = jsArtifact && artifactVersions[jsArtifact.id]?.find(v => v.id === jsArtifact.currentVersionId);
      if (jsVersion?.content) {
        result = result.replace(jsMatch[0], `<script>${jsVersion.content}</script>`);
      }
    }
    
    return result;
  };

  // Process multi-file inline HTML for preview
  useEffect(() => {
    if (
      open &&
      artifact?.type === 'html' && 
      activeTab === 'preview' &&
      currentVersion?.content
    ) {
      const fullyIntegrated = buildIntegratedHtml(currentVersion.content);
      setIntegratedHtml(fullyIntegrated);
    } else {
      setIntegratedHtml(undefined);
    }
  }, [open, artifact?.id, artifact?.type, activeTab, currentVersion?.version, currentVersion?.content, allArtifacts, artifactVersions]);



  const handleCopy = async () => {
    if (!artifact) return;
    if (currentVersion) await navigator.clipboard.writeText(currentVersion.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const htmlSrcDoc = useMemo(() => {
    if (!artifact || artifact.type !== 'html' || !currentVersion) return undefined;
    return integratedHtml || currentVersion.content;
  }, [artifact, currentVersion, integratedHtml]);

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
        <div className="h-full w-full overflow-hidden p-4 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-2 pb-2 flex-shrink-0 text-xs text-slate-400">
            <span>对比版本: {previousVersion ? `v${previousVersion.version}` : '无'} ➔ v{currentVersion?.version || 1}</span>
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
        <div className="h-full p-6 overflow-auto bg-slate-950 relative">
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

    if (artifact.type === 'markdown') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6 overflow-auto bg-[#fafbfb] dark:bg-slate-950">
            {!currentVersion ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <article className="prose prose-lg dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-sm">
                <ReactMarkdown
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (match && match[1] === 'mermaid') {
                        return <MermaidRenderer chart={String(children).replace(/\n$/, '')} />;
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    img({ node, src, alt, ...props }) {
                      return (
                        <span className="block my-4 text-center">
                          <img
                            src={src}
                            alt={alt}
                            className="mx-auto max-w-full max-h-[500px] object-contain rounded-xl shadow-md border border-slate-200 dark:border-slate-800 transition-all hover:shadow-lg cursor-zoom-in"
                            {...props}
                          />
                          {alt && (
                            <span className="block mt-2 text-xs text-slate-400 dark:text-slate-500 font-sans italic">
                              {alt}
                            </span>
                          )}
                        </span>
                      );
                    }
                  }}
                >
                  {currentVersion.content}
                </ReactMarkdown>
              </article>
            )}
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto bg-slate-950 relative">
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

    if (artifact.type === 'html') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full p-6 bg-[#fafbfb] dark:bg-slate-950 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl flex-shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="flex-grow mx-4 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 py-0.5 px-3 text-xs text-slate-400 dark:text-slate-500 truncate">
                https://localhost:5173/{artifact.title.toLowerCase()}
              </div>
            </div>
            <div className="flex-1 min-h-0 border-l border-r border-b border-slate-200 dark:border-slate-800 rounded-b-xl bg-white dark:bg-slate-900 overflow-hidden">
              {(!htmlSrcDoc && !currentVersion) ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
                </div>
              ) : (
                <iframe
                  key={`html-full-preview-${currentVersion?.version || 1}-${artifact?.id}`}
                  srcDoc={htmlSrcDoc}
                  className="w-full h-full bg-white"
                  title="HTML Full Screen Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              )}
            </div>
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto bg-slate-950 relative">
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

    if (artifact.type === 'image') {
      return (
        <div className="h-full w-full overflow-auto p-6 bg-[#0a0a0a] flex items-center justify-center">
          {!currentVersion ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            <img
              src={currentVersion.content}
              alt={artifact.title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          )}
        </div>
      );
    }

    if (artifact.type === 'mermaid') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full w-full overflow-auto p-6 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
            {!currentVersion ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : mermaidError ? (
              <div className="text-center p-6">
                <p className="text-red-500 text-xs font-semibold mb-2">图表渲染失败</p>
                <pre className="text-xs text-red-400 bg-red-950/30 p-3 rounded-lg whitespace-pre-wrap max-w-md">
                  {mermaidError}
                </pre>
              </div>
            ) : mermaidSvg ? (
              <div 
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 渲染中...
              </div>
            )}
          </div>
        );
      }
      return (
        <div className="h-full p-6 overflow-auto bg-slate-950 relative">
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
      <div className="h-full p-6 overflow-auto bg-slate-950 relative">
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
    if (artifact.type === 'code') return <FileCode className="w-5 h-5" />;
    if (artifact.type === 'markdown') return <FileText className="w-5 h-5" />;
    if (artifact.type === 'html') return <Globe className="w-5 h-5" />;
    if (artifact.type === 'image') return <Globe className="w-5 h-5" />;
    if (artifact.type === 'mermaid') return <Network className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  const needTabs = artifact.type !== undefined && ['code', 'markdown', 'html', 'image', 'mermaid'].includes(artifact.type);
  const isEditable = artifact.type !== 'image';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full h-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex-shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-blue-600 dark:text-blue-450 flex-shrink-0">{getTypeIcon()}</span>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]" title={artifact.title}>{artifact.title}</h2>

            {/* Version dropdown select in full screen modal */}
            {versions.length > 1 && currentVersion && (
              <select
                value={currentVersion.id}
                onChange={(e) => {
                  const selectedVer = versions.find(v => v.id === e.target.value);
                  if (selectedVer) {
                    useAgentHubStore.getState().setSelectedArtifactVersion(selectedVer.version);
                  }
                }}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-lg px-2.5 py-1 outline-none font-medium focus:ring-1 focus:ring-lark-primary dark:focus:ring-violet-600 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {versions.slice().reverse().map((v) => {
                  return (
                    <option key={v.id} value={v.id} className="dark:bg-slate-900 dark:text-slate-300">
                      v{v.version} {v.version === artifact.latestVersion ? '(最新)' : ''}
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
                className="px-3.5 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 transition-all shadow-sm active:scale-95"
                title="保存新版本"
              >
                <Save className="w-4 h-4" />
                保存新版本
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setActiveTab('preview');
                }}
                className="px-3.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-all shadow-sm bg-white dark:bg-slate-900 flex items-center gap-1 active:scale-95"
                title="取消"
              >
                <X className="w-4 h-4" />
                取消
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {needTabs && (
                <div className="flex bg-slate-200 dark:bg-slate-950 rounded-md p-0.5 border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      activeTab === 'preview'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-semibold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    预览
                  </button>
                  <button
                    onClick={() => setActiveTab('source')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      activeTab === 'source'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-semibold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    源码
                  </button>
                  <button
                    onClick={() => setActiveTab('diff')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
                      activeTab === 'diff'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-semibold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    对比
                  </button>
                </div>
              )}
              
              <button
                onClick={() => {
                  setEditedContent(currentVersion?.content || '');
                  setIsEditing(true);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-305 hover:text-blue-600 dark:hover:text-violet-400 transition-all border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900 flex items-center gap-1 active:scale-95"
                title="编辑"
              >
                <Edit3 className="w-4 h-4" />
                <span className="text-xs font-semibold pr-0.5">编辑</span>
              </button>

              <div className="w-px h-6 bg-slate-300 dark:bg-slate-800 mx-0.5" />
              <button
                onClick={handleCopy}
                className="p-2 rounded-md hover:bg-slate-250 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                title="复制"
              >
                {copied ? (
                  <span className="text-xs text-green-600 font-medium px-1">已复制</span>
                ) : (
                  <Copy className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-md hover:bg-slate-250 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                title="关闭"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          )}
        </div>
        <div 
          ref={containerRef}
          onMouseUp={handleMouseUp}
          onKeyUp={handleKeyUp}
          className="flex-1 overflow-hidden bg-white dark:bg-slate-900 relative"
        >
          {renderContent()}

          {/* Floating Selection Popover */}
          {!isEditing && selectionBox && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
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
    </div>
  );
};

export default ArtifactFullScreenModal;
