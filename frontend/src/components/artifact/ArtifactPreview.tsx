import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Artifact, ArtifactVersion } from '@/types';
import { Copy, FileCode, FileText, Globe, Maximize2, GitCompare, RefreshCw, Edit3, Save, X, FolderOpen, ArrowDownToLine, History, Folder, Network, Presentation } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import CodeDiffViewer from './CodeDiffViewer';
import CodeEditorContainer from './CodeEditorContainer';
import { platform } from '@/utils/platform';
import ConflictResolveModal from '../modal/ConflictResolveModal';
import mermaid from 'mermaid';
import sandboxService from '@/services/http/sandboxService';
import DocPreview from './DocPreview';
import PptPreview from './PptPreview';

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onOpenFullScreen?: (artifactId: string) => void;
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  logLevel: 2,
});

const MermaidRenderer: React.FC<{ chart: string }> = ({ chart }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elementId = useRef(`mermaid-md-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      // Proactively clean up any previous stale/orphaned dmermaid elements for this id
      const oldEl = document.getElementById(`d${elementId.current}`);
      if (oldEl) oldEl.remove();

      try {
        setError(null);
        const cleanChart = chart.trim();
        const { svg: renderedSvg } = await mermaid.render(elementId.current, cleanChart);
        if (isMounted) {
          if (renderedSvg.includes('Syntax error in text') || renderedSvg.includes('class="error-icon"')) {
            setError('图表语法错误');
            setTimeout(() => {
              const errEl = document.getElementById(`d${elementId.current}`);
              if (errEl) errEl.remove();
            }, 16);
          } else {
            setSvg(renderedSvg);
          }
        }
      } catch (err) {
        console.warn('Mermaid render error inside markdown:', err);
        if (isMounted) {
          setError('图表语法错误');
        }
        setTimeout(() => {
          const errEl = document.getElementById(`d${elementId.current}`);
          if (errEl) errEl.remove();
          
          // Also clean up any other orphan element matching elementId
          const matchingOrphan = document.querySelectorAll(`[id^="d${elementId.current}"]`);
          matchingOrphan.forEach(el => el.remove());
        }, 16);
      }
    };
    render();
    return () => {
      isMounted = false;
      const errEl = document.getElementById(`d${elementId.current}`);
      if (errEl) errEl.remove();
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

const ArtifactPreview: React.FC<ArtifactPreviewProps> = ({ artifact, onOpenFullScreen }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'source' | 'diff'>('preview');
  const [copied, setCopied] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [integratedHtml, setIntegratedHtml] = useState<string | undefined>(undefined);
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const [serverPreviewHtml, setServerPreviewHtml] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Desktop integration states
  const [showHistory, setShowHistory] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictFileName, setConflictFileName] = useState('');
  const [conflictFilePath, setConflictFilePath] = useState('');

  const currentWorkspace = useAgentHubStore(state => state.currentWorkspace);
  const applyArtifactToLocal = useAgentHubStore(state => state.applyArtifactToLocal);
  const isDesktop = useAgentHubStore(state => state.isDesktop);

  const handleRevealInFolder = async () => {
    if (!currentArtifact) return;
    const defaultPath = currentArtifact.title;
    let absolutePath = defaultPath;
    if (currentWorkspace && !defaultPath.startsWith('/') && !defaultPath.includes(':')) {
      absolutePath = `${currentWorkspace.path}/${defaultPath}`;
    }
    const res = await platform.file.revealInFolder(absolutePath);
    if (!res.success) {
      alert(`无法定位文件: ${(res as any).error || '未知错误'}`);
    }
  };

  const handleSaveAsDirect = async () => {
    if (!currentArtifact || !currentVersion) return;
    const newFileName = prompt("另存为到本地工作区路径 (相对路径或绝对路径):", currentArtifact.title);
    if (newFileName && newFileName.trim()) {
      await handleApplyToLocal(true, newFileName.trim());
    }
  };

  const handleApplyToLocal = async (autoOverwrite = false, customPath?: string) => {
    if (!currentArtifact || !currentVersion) return;
    
    const defaultPath = currentArtifact.title;
    const targetPath = customPath || defaultPath;
    
    const res = await applyArtifactToLocal(
      currentArtifact.id,
      currentVersion.id,
      targetPath,
      autoOverwrite
    );
    
    if (res.conflict) {
      let absolutePath = targetPath;
      if (currentWorkspace && !targetPath.startsWith('/') && !targetPath.includes(':')) {
        absolutePath = `${currentWorkspace.path}/${targetPath}`;
      }
      setConflictFileName(currentArtifact.title);
      setConflictFilePath(absolutePath);
      setConflictModalOpen(true);
    } else if (res.success) {
      // Success is indicated by desktop notifications/system chat messages in store
    } else {
      alert(`应用失败: ${res.error || '未知错误'}`);
    }
  };


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

  const currentArtifact = artifact;

  // Group all versions of this artifact (sorted by version number ascending)
  const versions = useMemo(() => {
    if (!currentArtifact) return [];
    return (artifactVersions[currentArtifact.id] || [])
      .sort((a, b) => a.version - b.version);
  }, [currentArtifact, artifactVersions]);

  // Active version that is currently selected or default currentVersionId
  const currentVersion: ArtifactVersion | null = useMemo(() => {
    if (!versions.length) return null;
    if (selectedArtifactId && artifact && selectedArtifactId === artifact.id && selectedArtifactVersion !== null) {
      return versions.find(v => v.version === selectedArtifactVersion) || versions[versions.length - 1];
    }
    return versions.find(v => v.id === currentArtifact?.currentVersionId) || versions[versions.length - 1];
  }, [versions, selectedArtifactId, selectedArtifactVersion, currentArtifact]);

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
    if (selectedArtifactId && artifact && selectedArtifactId === artifact.id) {
      if (selectedArtifactVersion !== null) {
        if ((window as any).__ag_from_message_bubble_click) {
          (window as any).__ag_from_message_bubble_click = false;
          setActiveTab('source'); // Auto-switch to source code view to show highlighted lines
        }
      }
    }
  }, [selectedArtifactId, selectedArtifactVersion, artifact]);

  // Proactively load current artifact content if missing
  useEffect(() => {
    if (currentArtifact && versions.length === 0) {
      loadArtifactContent(currentArtifact.id);
    }
  }, [currentArtifact, versions.length, loadArtifactContent]);

  // Render mermaid diagram with error protection
  useEffect(() => {
    if (currentArtifact?.type === 'mermaid' && activeTab === 'preview' && currentVersion?.content) {
      const id = `mermaid-${currentArtifact.id}-${currentVersion.version}`;
      const renderMermaid = async () => {
        // Proactively clean up any previous stale/orphaned dmermaid elements for this id
        const oldEl = document.getElementById(`d${id}`);
        if (oldEl) oldEl.remove();

        try {
          setMermaidError(null);
          const { svg } = await mermaid.render(id, currentVersion.content);
          // Validate the SVG - check if it contains error text
          if (svg.includes('Syntax error in text') || svg.includes('class="error-icon"')) {
            setMermaidError('图表语法错误，请检查源码');
            setMermaidSvg(null);
            setTimeout(() => {
              const errEl = document.getElementById(`d${id}`);
              if (errEl) errEl.remove();
            }, 16);
          } else {
            setMermaidSvg(svg);
          }
        } catch (err) {
          console.warn('Mermaid render skipped (protected):', err);
          setMermaidError('图表语法错误，请检查源码');
          setMermaidSvg(null);
          setTimeout(() => {
            const errEl = document.getElementById(`d${id}`);
            if (errEl) errEl.remove();
            
            // Clean up any stale elements starting with this ID
            const matchingStale = document.querySelectorAll(`[id^="d${id}"]`);
            matchingStale.forEach(el => el.remove());
          }, 16);
        }
      };
      renderMermaid();
    } else {
      setMermaidSvg(null);
      setMermaidError(null);
    }
  }, [currentArtifact?.id, currentArtifact?.type, activeTab, currentVersion?.version, currentVersion?.content]);

  // Inline multi-file HTML assets (CSS, JS, Images) in frontend, ensure 100% matches user's latest edits
  const buildIntegratedHtml = (baseHtml: string): string => {
    let result = baseHtml;
    
    const resolvePath = (relPath: string) => {
      if (!currentArtifact) return relPath;
      const baseParts = currentArtifact.title.replace(/\\/g, '/').split('/');
      baseParts.pop(); // remove file name
      
      const relParts = relPath.replace(/\\/g, '/').split('/');
      for (const part of relParts) {
        if (part === '.' || part === '') continue;
        if (part === '..') {
          baseParts.pop();
        } else {
          baseParts.push(part);
        }
      }
      return baseParts.join('/');
    };

    // Inline CSS files: replace <link rel="stylesheet" href="xxx.css"> with <style>...</style>
    const cssLinkRegex = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
    let cssMatch;
    while ((cssMatch = cssLinkRegex.exec(result)) !== null) {
      const filePath = cssMatch[1];
      const targetPath = resolvePath(filePath).toLowerCase();
      const cssArtifact = allArtifacts?.find((a: any) => 
        a.title.replace(/\\/g, '/').toLowerCase() === targetPath ||
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
      const targetPath = resolvePath(filePath).toLowerCase();
      const jsArtifact = allArtifacts?.find((a: any) => 
        a.title.replace(/\\/g, '/').toLowerCase() === targetPath ||
        a.title.toLowerCase() === filePath.toLowerCase() || 
        a.title.toLowerCase().endsWith('/' + filePath.toLowerCase())
      );
      const jsVersion = jsArtifact && artifactVersions[jsArtifact.id]?.find(v => v.id === jsArtifact.currentVersionId);
      if (jsVersion?.content) {
        result = result.replace(jsMatch[0], `<script>${jsVersion.content}</script>`);
      }
    }

    // Inline Images: replace image src with base64 data URI
    const imgRegex = /<img[^>]*src=["']([^"']+\.(png|jpg|jpeg|gif|svg|webp|ico))["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(result)) !== null) {
      const filePath = imgMatch[1];
      const targetPath = resolvePath(filePath).toLowerCase();
      const imgArtifact = allArtifacts?.find((a: any) => 
        a.title.replace(/\\/g, '/').toLowerCase() === targetPath ||
        a.title.toLowerCase() === filePath.toLowerCase() || 
        a.title.toLowerCase().endsWith('/' + filePath.toLowerCase())
      );
      const imgVersion = imgArtifact && artifactVersions[imgArtifact.id]?.find(v => v.id === imgArtifact.currentVersionId);
      if (imgVersion?.content) {
        let mimeType = 'image/png';
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext === 'svg') mimeType = 'image/svg+xml';
        else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'ico') mimeType = 'image/x-icon';

        const base64Content = imgVersion.content.startsWith('data:') 
          ? imgVersion.content 
          : `data:${mimeType};base64,${imgVersion.content}`;
        
        result = result.replace(imgMatch[1], base64Content);
      }
    }
    
    return result;
  };

  const rewriteRelativeUrls = (html: string, runId: string): string => {
    if (!html || !currentArtifact) return html;
    let result = html;
    
    const resolvePath = (relPath: string) => {
      const baseParts = currentArtifact.title.replace(/\\/g, '/').split('/');
      baseParts.pop(); // remove file name
      
      const relParts = relPath.replace(/\\/g, '/').split('/');
      for (const part of relParts) {
        if (part === '.' || part === '') continue;
        if (part === '..') {
          baseParts.pop();
        } else {
          baseParts.push(part);
        }
      }
      return baseParts.join('/');
    };

    let base = '';
    try {
      base = (import.meta as any).env?.VITE_API_BASE_URL || '';
    } catch {
      base = '';
    }
    if (base && !base.startsWith('http')) {
      base = `${window.location.protocol}//${window.location.host}${base}`;
    } else if (!base) {
      base = `${window.location.protocol}//${window.location.host}/api/v1`;
    }

    // 1. Rewrite Images: <img src="xxx">
    const imgRegex = /(<img[^>]*src=["'])([^"']+\.(png|jpg|jpeg|gif|svg|webp|ico))(["'][^>]*>)/gi;
    result = result.replace(imgRegex, (match, prefix, filePath, ext, suffix) => {
      const resolved = resolvePath(filePath);
      const backendUrl = `${base}/runs/${runId}/preview/${encodeURIComponent(resolved)}`;
      return `${prefix}${backendUrl}${suffix}`;
    });

    // 2. Rewrite CSS links: <link rel="stylesheet" href="xxx">
    const cssRegex = /(<link[^>]*href=["'])([^"']+\.css)(["'][^>]*>)/gi;
    result = result.replace(cssRegex, (match, prefix, filePath, suffix) => {
      if (match.toLowerCase().includes('stylesheet')) {
        const resolved = resolvePath(filePath);
        const backendUrl = `${base}/runs/${runId}/preview/${encodeURIComponent(resolved)}`;
        return `${prefix}${backendUrl}${suffix}`;
      }
      return match;
    });

    // 3. Rewrite Script tags: <script src="xxx">
    const jsRegex = /(<script[^>]*src=["'])([^"']+\.js)(["'][^>]*>)/gi;
    result = result.replace(jsRegex, (match, prefix, filePath, suffix) => {
      const resolved = resolvePath(filePath);
      const backendUrl = `${base}/runs/${runId}/preview/${encodeURIComponent(resolved)}`;
      return `${prefix}${backendUrl}${suffix}`;
    });

    return result;
  };

  // Process multi-file inline HTML for preview
  useEffect(() => {
    let active = true;
    if (
      currentArtifact?.type === 'html' && 
      activeTab === 'preview' &&
      currentVersion?.content
    ) {
      const { useMockMode } = useAgentHubStore.getState();
      if (useMockMode) {
        const fullyIntegrated = buildIntegratedHtml(currentVersion.content);
        setIntegratedHtml(fullyIntegrated);
        setServerPreviewHtml(null);
      } else {
        const runId = currentArtifact.runId && currentArtifact.runId !== 'direct' 
          ? currentArtifact.runId 
          : useAgentHubStore.getState().getActiveRunId(useAgentHubStore.getState().activeConversationId);
        
        if (runId) {
          setIsPreviewLoading(true);
          sandboxService.getSandboxHtmlPreview(runId, currentArtifact.title)
            .then(res => {
              if (active) {
                if (res.code === 0 && res.data) {
                  const resolvedHtml = rewriteRelativeUrls(res.data.html, runId);
                  setServerPreviewHtml(resolvedHtml);
                } else {
                  setServerPreviewHtml(null);
                }
              }
            })
            .catch(err => {
              console.error('Failed to get sandbox html preview:', err);
              if (active) setServerPreviewHtml(null);
            })
            .finally(() => {
              if (active) setIsPreviewLoading(false);
            });
        } else {
          setServerPreviewHtml(null);
        }
      }
    } else {
      setIntegratedHtml(undefined);
      setServerPreviewHtml(null);
    }

    return () => {
      active = false;
    };
  }, [currentArtifact?.id, currentArtifact?.type, activeTab, currentVersion?.version, currentVersion?.content, allArtifacts, artifactVersions]);



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
    setIsEditing(false);
    setActiveTab('preview');
    await saveEditedArtifact(currentArtifact.id, editedContent);
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
    if (activeTab === 'source' || (currentArtifact && currentArtifact.type === 'code')) {
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
      <div className="h-full w-full flex items-center justify-center text-center p-4 bg-white dark:bg-slate-900">
        <p className="text-sm text-slate-400 dark:text-slate-500">请选择一个产物进行预览</p>
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

    if (currentArtifact.type === 'document') {
      if (activeTab === 'preview') {
        return (
          <DocPreview
            content={currentVersion?.content || ''}
            title={currentArtifact.title}
          />
        );
      }
      return (
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950 relative">
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

    if (currentArtifact.type === 'ppt') {
      if (activeTab === 'preview') {
        return (
          <PptPreview
            content={currentVersion?.content || ''}
            title={currentArtifact.title}
          />
        );
      }
      return (
        <div className="h-full w-full overflow-y-auto p-4 bg-slate-950 relative">
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

    if (currentArtifact.type === 'code') {
      return (
        <div 
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
          <div className="h-full w-full overflow-y-auto p-5 bg-[#fafbfb] dark:bg-slate-950">
            {!currentVersion ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <article className="prose prose-sm dark:prose-invert max-w-none text-lark-text-primary dark:text-slate-200 bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 p-6 rounded-2xl shadow-sm leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
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
                            className="mx-auto max-w-full max-h-[350px] object-contain rounded-xl shadow-md border border-slate-200 dark:border-slate-800 transition-all hover:shadow-lg cursor-zoom-in"
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
                  {(() => {
                    const content = currentVersion.content || '';
                    const lines = content.split('\n');
                    const processedLines: string[] = [];
                    for (let i = 0; i < lines.length; i++) {
                      const currentLine = lines[i].trim();
                      if (currentLine.startsWith('|')) {
                        if (i > 0) {
                          const prevLine = lines[i - 1].trim();
                          if (prevLine !== '' && !prevLine.startsWith('|')) {
                            processedLines.push('');
                          }
                        }
                      } else if (currentLine !== '') {
                        if (i > 0) {
                          const prevLine = lines[i - 1].trim();
                          if (prevLine.startsWith('|')) {
                            processedLines.push('');
                          }
                        }
                      }
                      processedLines.push(lines[i]);
                    }
                    return processedLines.join('\n');
                  })()}
                </ReactMarkdown>
              </article>
            )}
          </div>
        );
      }
      return (
        <div 
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
        const previewHtml = integratedHtml || htmlSrcDoc;
        return (
          <div className="h-full w-full p-4 overflow-hidden flex flex-col bg-[#fafbfb] dark:bg-slate-950">
            {/* Browser Header Bar */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border-t border-l border-r border-slate-200 dark:border-slate-800 rounded-t-xl flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="flex-grow mx-4 bg-white dark:bg-slate-950 rounded-md border border-slate-200 dark:border-slate-800 py-1 px-3.5 text-[10px] text-slate-400 dark:text-slate-500 font-sans truncate select-all flex items-center gap-1.5 shadow-inner">
                <span className="text-slate-300 dark:text-slate-700">https://</span>localhost:5173/{currentArtifact.title.toLowerCase()}
              </div>
            </div>
            {/* Browser Content */}
            <div className="flex-1 min-h-0 border-l border-r border-b border-slate-200 dark:border-slate-800 rounded-b-xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              {(isPreviewLoading || (!previewHtml && !currentVersion)) ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
                </div>
              ) : (
                <iframe
                  key={`html-preview-${currentVersion?.version || 1}-${currentArtifact?.id}`}
                  srcDoc={useAgentHubStore.getState().useMockMode ? previewHtml : (serverPreviewHtml || '')}
                  className="w-full h-full bg-white"
                  title="HTML Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              )}
            </div>
          </div>
        );
      }
      return (
        <div 
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

    if (currentArtifact.type === 'image') {
      return (
        <div className="h-full w-full overflow-auto p-6 bg-[#0a0a0a] flex items-center justify-center">
          {!currentVersion ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            <img
              src={currentVersion.content}
              alt={currentArtifact.title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          )}
        </div>
      );
    }

    if (currentArtifact.type === 'mermaid') {
      if (activeTab === 'preview') {
        return (
          <div className="h-full w-full overflow-auto p-6 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
            {!currentVersion ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : mermaidError ? (
              <div className="text-center p-6 max-w-md">
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/30 p-4 rounded-xl">
                  <p className="text-yellow-700 dark:text-yellow-300 text-xs font-semibold mb-2">
                    ⚠️ 图表语法提示
                  </p>
                  <p className="text-yellow-600 dark:text-yellow-400 text-[11px]">
                    {mermaidError}
                  </p>
                  <p className="text-yellow-500 dark:text-yellow-500 text-[10px] mt-2">
                    请切换到「源码」标签页检查和修改 mermaid 代码
                  </p>
                </div>
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
        <div 
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
    if (currentArtifact.type === 'image') return <Globe className="w-4 h-4 text-purple-500" />;
    if (currentArtifact.type === 'mermaid') return <Network className="w-4 h-4 text-cyan-500" />;
    if (currentArtifact.type === 'document') return <FileText className="w-4 h-4 text-blue-600" />;
    if (currentArtifact.type === 'ppt') return <Presentation className="w-4 h-4 text-orange-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const needTabs = currentArtifact.type !== undefined && ['code', 'markdown', 'html', 'image', 'mermaid', 'document', 'ppt'].includes(currentArtifact.type);
  const isReadOnly = currentArtifact.metadata?.readOnly === true;
  const isEditable = currentArtifact.type !== 'image' && !isReadOnly;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden text-lark-text-primary dark:text-slate-100 bg-white dark:bg-slate-900 relative">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">{getTypeIcon()}</span>
          <h4 className="text-xs font-semibold text-lark-text-primary dark:text-slate-200 truncate max-w-[120px]" title={currentArtifact.title}>{currentArtifact.title}</h4>
          {isReadOnly && (
            <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded font-medium select-none flex-shrink-0">
              只读分析 / 建议
            </span>
          )}
          
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
              className="bg-[#f2f4f6] dark:bg-slate-800 border border-lark-border/60 dark:border-slate-700 text-lark-text-secondary dark:text-slate-300 text-[10px] rounded px-1.5 py-0.5 outline-none font-medium focus:ring-1 focus:ring-lark-primary dark:focus:ring-violet-600 cursor-pointer hover:bg-lark-bg-hover dark:hover:bg-slate-700"
            >
              {versions.slice().reverse().map((v) => {
                return (
                  <option key={v.id} value={v.id} className="dark:bg-slate-900 dark:text-slate-300">
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
              onClick={() => {
                setIsEditing(false);
                setActiveTab('preview');
              }}
              className="px-2.5 py-1 text-[10px] rounded-lg border border-lark-border dark:border-slate-700 hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-350 transition-all shadow-sm bg-white dark:bg-slate-900 flex items-center gap-1 active:scale-95"
              title="取消"
            >
              <X className="w-3.5 h-3.5" />
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            {needTabs && (
              <div className="flex bg-[#eef0f2] dark:bg-slate-950 rounded-lg p-0.5 border border-lark-border/30 dark:border-slate-800">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-2.5 py-0.5 text-[10px] rounded-md transition-all ${
                    activeTab === 'preview'
                      ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                      : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
                  }`}
                >
                  预览
                </button>
                <button
                  onClick={() => setActiveTab('source')}
                  className={`px-2.5 py-0.5 text-[10px] rounded-md transition-all ${
                    activeTab === 'source'
                      ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                      : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
                  }`}
                >
                  源码
                </button>
                <button
                  onClick={() => setActiveTab('diff')}
                  className={`px-2.5 py-0.5 text-[10px] rounded-md transition-all flex items-center gap-0.5 ${
                    activeTab === 'diff'
                      ? 'bg-white dark:bg-slate-800 text-lark-primary dark:text-violet-400 shadow-sm font-semibold'
                      : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-text-primary dark:hover:text-slate-200'
                  }`}
                >
                  <GitCompare className="w-2.5 h-2.5" />
                  对比
                </button>
              </div>
            )}
            {/* Version History Toggle Button */}
            {!isEditing && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-lg border transition-all shadow-sm flex items-center gap-1 active:scale-95 ${
                  showHistory 
                    ? 'bg-lark-primary-light/20 text-lark-primary dark:bg-violet-950/20 dark:text-violet-400 border-lark-primary/30 dark:border-violet-500/30'
                    : 'border-lark-border dark:border-slate-800 text-lark-text-secondary dark:text-slate-350 hover:bg-lark-bg-hover dark:hover:bg-slate-800 bg-white dark:bg-slate-900'
                }`}
                title="查看版本历史时间线"
              >
                <History className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold pr-0.5">历史</span>
              </button>
            )}
            {isEditable && (
              <button
                onClick={() => {
                  setEditedContent(currentVersion?.content || '');
                  setIsEditing(true);
                }}
                className="p-1.5 rounded-lg hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-350 hover:text-lark-primary dark:hover:text-violet-400 transition-all border border-lark-border dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 flex items-center gap-1 active:scale-95"
                title="编辑内容"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold pr-0.5">编辑</span>
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-350 hover:text-lark-primary dark:hover:text-violet-400 transition-all border border-lark-border dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900"
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
                className="p-1.5 rounded-lg hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-350 hover:text-lark-primary dark:hover:text-violet-400 transition-all border border-lark-border dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900"
                title="放大全屏预览"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Workspace Action Bar */}
      {isDesktop && currentWorkspace && currentArtifact && !isReadOnly && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-lark-border/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs flex-shrink-0 flex-wrap gap-2 select-none">
          <div className="flex items-center gap-1.5 min-w-0 text-slate-500 dark:text-slate-400">
            <Folder className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="font-semibold select-none flex-shrink-0">本地工作区:</span>
            <span className="font-mono truncate max-w-[150px] md:max-w-[240px]" title={`${currentWorkspace.path}/${currentArtifact.title}`}>
              {currentArtifact.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <button
              onClick={handleRevealInFolder}
              className="px-2 py-1 text-[10px] rounded-lg border border-lark-border dark:border-slate-700 hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-350 transition-all shadow-sm bg-white dark:bg-slate-900 flex items-center gap-1 active:scale-95"
              title="在系统文件管理器中显示文件"
            >
              <FolderOpen className="w-3 h-3 text-slate-450" />
              定位
            </button>
            <button
              onClick={handleSaveAsDirect}
              className="px-2 py-1 text-[10px] rounded-lg border border-lark-border dark:border-slate-700 hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-lark-text-secondary dark:text-slate-350 transition-all shadow-sm bg-white dark:bg-slate-900 flex items-center gap-1 active:scale-95"
              title="另存为其他文件名"
            >
              <ArrowDownToLine className="w-3 h-3 text-slate-450" />
              另存为
            </button>
            <button
              onClick={() => handleApplyToLocal(false)}
              className="px-2.5 py-1 text-[10px] rounded-lg bg-lark-primary hover:bg-lark-primary-hover text-white font-semibold flex items-center gap-1 transition-all active:scale-95 shadow-sm"
              title="将生成的代码写入本地工作区文件"
            >
              <ArrowDownToLine className="w-3 h-3" />
              应用到本地
            </button>
          </div>
        </div>
      )}

      <div 
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onKeyUp={handleKeyUp}
        className="flex-1 overflow-hidden min-h-0 bg-[#fafbfb] dark:bg-slate-950 relative flex"
      >
        <div className="flex-1 overflow-hidden min-h-0 relative flex flex-col">
          {renderContent()}
        </div>

        {/* Version History timeline sidebar */}
        {showHistory && (
          <div className="w-64 border-l border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full flex-shrink-0 animate-slide-in relative z-10">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-lark-border dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">版本历史时间线</span>
              <button 
                onClick={() => setShowHistory(false)} 
                className="text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 p-0.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
              {versions.slice().reverse().map((v) => (
                <div 
                  key={v.id} 
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                    v.version === currentVersion?.version
                      ? 'border-lark-primary/50 dark:border-violet-500/50 bg-lark-primary-light/10 dark:bg-violet-950/10 shadow-sm'
                      : 'border-slate-100 dark:border-slate-850 hover:border-slate-205 dark:hover:border-slate-750'
                  }`}
                  onClick={() => useAgentHubStore.getState().setSelectedArtifactVersion(v.version)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">v{v.version}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-150 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                      {v.createdByType === 'user' ? '用户编辑' : v.createdBy}
                    </span>
                  </div>
                  {v.changeSummary && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-1.5">
                      {v.changeSummary}
                    </p>
                  )}
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-mono">
                    {v.createdAt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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

      {/* Conflict Resolution Modal */}
      <ConflictResolveModal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        fileName={conflictFileName}
        filePath={conflictFilePath}
        onOverwrite={() => handleApplyToLocal(true, conflictFilePath)}
        onSaveAs={(newPath) => handleApplyToLocal(true, newPath)}
        onViewDiff={() => {
          setActiveTab('diff');
          setConflictModalOpen(false);
        }}
      />
    </div>
  );
};

export default ArtifactPreview;
