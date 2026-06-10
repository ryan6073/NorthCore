import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Text as SvgText, Path, Defs, Marker, Polygon } from 'react-native-svg';
import type { Artifact, ArtifactVersion } from '@/types';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

let WebView: any = null;
if (isNative) {
  try {
    WebView = require('react-native-webview').WebView;
  } catch {
    // fallback
  }
}

interface ArtifactPreviewProps {
  artifact: Artifact;
  version: ArtifactVersion | null;
  loading: boolean;
  maxHeight?: number;
}

export default function ArtifactPreview({
  artifact,
  version,
  loading,
  maxHeight,
}: ArtifactPreviewProps) {
  // ── 确定要渲染的内容 ──
  const content = version?.content || artifact.contentPreview || '';
  const type = artifact.type;

  // ── 加载状态 ──
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#3370ff" />
        <Text style={styles.loadingText}>正在加载产物...</Text>
      </View>
    );
  }

  // ── 无内容 ──
  if (!content) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={32} color="#dee0e3" />
        <Text style={styles.emptyText}>暂无内容</Text>
      </View>
    );
  }

  // ── 根据类型渲染 ──
  const renderContent = () => {
    switch (type) {
      case 'code':
      case 'diff':
        return <CodePreview content={content} language={version?.language} maxHeight={maxHeight} />;
      case 'html':
        return <HtmlPreview content={content} maxHeight={maxHeight} />;
      case 'markdown':
        return <MarkdownPreview content={content} maxHeight={maxHeight} />;
      case 'mermaid':
        return <MermaidPreview content={content} maxHeight={maxHeight} />;
      case 'image':
        return <ImagePreview content={content} />;
      case 'document':
        return <DocumentPreview content={content} maxHeight={maxHeight} />;
      case 'ppt':
        return <PptPreview content={content} maxHeight={maxHeight} />;
      default:
        return <TextPreview content={content} maxHeight={maxHeight} />;
    }
  };

  const isFullScreen = maxHeight === 99999;
  return (
    <View style={[styles.container, isFullScreen ? { flex: 1 } : (maxHeight ? { maxHeight } : undefined)]}>
      {renderContent()}
    </View>
  );
}

// ═══════════════════════════════════════════════
//  类型专属预览组件
// ═══════════════════════════════════════════════

/** 代码/差异预览 — WebView + highlight.js */
function CodePreview({ content, language, maxHeight }: { content: string; language?: string; maxHeight?: number }) {
  if (isNative) {
    return <NativeCodePreview content={content} language={language} maxHeight={maxHeight} />;
  }

  const html = useMemo(() => buildCodeHtml(content, language), [content, language]);
  return <SandboxWebView html={html} maxHeight={maxHeight} />;
}

/** HTML 预览 — WebView srcDoc */
function HtmlPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const isFullScreen = maxHeight === 99999;
  if (!isFullScreen && maxHeight) {
    return <HtmlInlinePreview content={content} maxHeight={maxHeight} />;
  }

  if (isNative && !WebView) {
    return <NativeHtmlTextPreview content={content} maxHeight={maxHeight} />;
  }

  const html = useMemo(() => buildHtmlPreview(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} fallbackText={content} disableTimeoutFallback />;
}

function HtmlInlinePreview({ content, maxHeight }: { content: string; maxHeight: number }) {
  const title = useMemo(() => extractHtmlTitle(content), [content]);
  const previewText = useMemo(() => extractHtmlPreviewText(content), [content]);

  return (
    <View style={[styles.htmlInlineCard, { maxHeight }]}>
      <View style={styles.htmlInlineTopBar}>
        <View style={styles.htmlWindowDots}>
          <View style={[styles.htmlWindowDot, { backgroundColor: '#ff5f57' }]} />
          <View style={[styles.htmlWindowDot, { backgroundColor: '#ffbd2e' }]} />
          <View style={[styles.htmlWindowDot, { backgroundColor: '#28c840' }]} />
        </View>
        <Text style={styles.htmlInlineUrl} numberOfLines={1}>
          {title || 'HTML 页面'}
        </Text>
      </View>
      <View style={styles.htmlInlineBody}>
        <Ionicons name="globe-outline" size={20} color="#3370ff" />
        <View style={styles.htmlInlineTextBox}>
          <Text style={styles.htmlInlineTitle} numberOfLines={1}>
            {title || 'HTML 页面预览'}
          </Text>
          <Text style={styles.htmlInlineText} numberOfLines={3}>
            {previewText || '点击卡片进入全屏查看真实页面效果'}
          </Text>
        </View>
      </View>
      <View style={styles.htmlInlineHint}>
        <Ionicons name="expand-outline" size={13} color="#3370ff" />
        <Text style={styles.htmlInlineHintText}>全屏查看交互预览</Text>
      </View>
    </View>
  );
}

/** Markdown 预览 — WebView + marked.js */
function MarkdownPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  if (isNative && !WebView) {
    return <NativeMarkdownPreview content={content} maxHeight={maxHeight} />;
  }

  const html = useMemo(() => buildMarkdownHtml(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} fallbackText={content} />;
}

/** Mermaid 预览 — WebView + mermaid.js */
function MermaidPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const nativeFlowchart = useMemo(() => parseSimpleFlowchart(content), [content]);
  if (nativeFlowchart) {
    return <NativeMermaidFlowchart chart={nativeFlowchart} maxHeight={maxHeight} />;
  }

  if (isNative && !WebView) {
    return <TextPreview content={content} maxHeight={maxHeight} />;
  }

  const html = useMemo(() => buildMermaidHtml(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} disableTimeoutFallback />;
}

/** 图片预览 */
function ImagePreview({ content }: { content: string }) {
  const source = useMemo(() => {
    if (content.startsWith('data:') || content.startsWith('http://') || content.startsWith('https://')) {
      return { uri: content };
    }
    return { uri: `data:image/png;base64,${content}` };
  }, [content]);
  return (
    <View style={styles.imageContainer}>
      <Image source={source} style={styles.image} resizeMode="contain" />
    </View>
  );
}

/** 文档风格预览 */
function DocumentPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  if (isNative && !WebView) {
    return <TextPreview content={content} maxHeight={maxHeight} />;
  }

  const html = useMemo(() => buildDocumentHtml(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} fallbackText={content} />;
}

/** PPT 预览 — 按 --- 分割为幻灯片 */
function PptPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const slides = useMemo(() => content.split(/\n---+\n/).filter(Boolean), [content]);
  const [currentSlide, setCurrentSlide] = useState(0);

  return (
    <View style={styles.pptContainer}>
      <ScrollView style={[styles.pptContent, maxHeight ? { maxHeight } : undefined]}>
        <Text style={styles.pptSlideText}>{slides[currentSlide] || content}</Text>
      </ScrollView>
      {slides.length > 1 && (
        <View style={styles.pptNav}>
          <Text style={styles.pptNavText}>
            {currentSlide + 1} / {slides.length}
          </Text>
          <View style={styles.pptNavButtons}>
            <Text
              style={[styles.pptNavBtn, currentSlide === 0 && styles.pptNavBtnDisabled]}
              onPress={() => setCurrentSlide((p) => Math.max(0, p - 1))}
            >
              ◀ 上一页
            </Text>
            <Text
              style={[styles.pptNavBtn, currentSlide >= slides.length - 1 && styles.pptNavBtnDisabled]}
              onPress={() => setCurrentSlide((p) => Math.min(slides.length - 1, p + 1))}
            >
              下一页 ▶
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** 纯文本降级预览 */
function TextPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  return (
    <ScrollView style={maxHeight ? { maxHeight } : undefined}>
      <Text style={styles.textPreview} selectable>
        {content}
      </Text>
    </ScrollView>
  );
}

type FlowNode = {
  id: string;
  label: string;
  shape: 'rect' | 'diamond';
  x: number;
  y: number;
};

type FlowEdge = {
  from: string;
  to: string;
  label?: string;
};

type FlowchartModel = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
};

function NativeMermaidFlowchart({ chart, maxHeight }: { chart: FlowchartModel; maxHeight?: number }) {
  const viewHeight = maxHeight || Math.min(chart.height, 520);
  const [zoom, setZoom] = useState(1);
  const zoomPercent = Math.round(zoom * 100);
  const canvasPadding = 24;
  const canvasWidth = chart.width + canvasPadding * 2;
  const canvasHeight = chart.height + canvasPadding * 2;

  const updateZoom = (nextZoom: number) => {
    setZoom(Math.max(0.5, Math.min(2.5, Math.round(nextZoom * 10) / 10)));
  };

  return (
    <View style={[styles.nativeMermaidBox, { maxHeight: viewHeight }]}>
      <View style={styles.mermaidZoomBar}>
        <Text
          style={[styles.mermaidZoomButton, zoom <= 0.5 && styles.mermaidZoomButtonDisabled]}
          onPress={() => updateZoom(zoom - 0.1)}
        >
          -
        </Text>
        <Text style={styles.mermaidZoomText}>{zoomPercent}%</Text>
        <Text
          style={[styles.mermaidZoomButton, zoom >= 2.5 && styles.mermaidZoomButtonDisabled]}
          onPress={() => updateZoom(zoom + 0.1)}
        >
          +
        </Text>
        <Text style={styles.mermaidZoomReset} onPress={() => updateZoom(1)}>
          适配
        </Text>
      </View>
      <ScrollView style={styles.nativeMermaidScroll} nestedScrollEnabled>
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
          <Svg
            width={canvasWidth * zoom}
            height={canvasHeight * zoom}
            viewBox={`${-canvasPadding} ${-canvasPadding} ${canvasWidth} ${canvasHeight}`}
          >
            <Defs>
              <Marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <Path d="M0,0 L0,6 L9,3 z" fill="#8f959e" />
              </Marker>
            </Defs>
            {chart.edges.map((edge, index) => {
              const from = chart.nodes.find((node) => node.id === edge.from);
              const to = chart.nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              const fromBottom = from.y + 54;
              const toTop = to.y;
              const midY = fromBottom + Math.max(24, (toTop - fromBottom) / 2);
              const path = `M${from.x},${fromBottom} L${from.x},${midY} L${to.x},${midY} L${to.x},${toTop}`;
              return (
                <React.Fragment key={`${edge.from}-${edge.to}-${index}`}>
                  <Path d={path} stroke="#8f959e" strokeWidth="1.6" fill="none" markerEnd="url(#arrow)" />
                  {edge.label ? (
                    <SvgText
                      x={(from.x + to.x) / 2}
                      y={midY - 6}
                      fontSize="11"
                      fill="#646a73"
                      textAnchor="middle"
                    >
                      {edge.label}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
            {chart.nodes.map((node) => (
              <React.Fragment key={node.id}>
                {node.shape === 'diamond' ? (
                  <Polygon
                    points={`${node.x},${node.y - 6} ${node.x + 72},${node.y + 31} ${node.x},${node.y + 68} ${node.x - 72},${node.y + 31}`}
                    fill="#fff7ed"
                    stroke="#fed7aa"
                    strokeWidth="1.5"
                  />
                ) : (
                  <Rect
                    x={node.x - 72}
                    y={node.y}
                    width="144"
                    height="62"
                    rx="12"
                    fill="#f7fbff"
                    stroke="#d6e5ff"
                    strokeWidth="1.5"
                  />
                )}
                <WrappedSvgText
                  text={node.label}
                  x={node.x}
                  y={node.shape === 'diamond' ? node.y + 24 : node.y + 24}
                  width={116}
                />
              </React.Fragment>
            ))}
          </Svg>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function WrappedSvgText({ text, x, y, width }: { text: string; x: number; y: number; width: number }) {
  const lines = wrapText(text, Math.max(4, Math.floor(width / 12))).slice(0, 3);
  return (
    <SvgText x={x} y={y} fontSize="12" fill="#1f2329" textAnchor="middle">
      {lines.map((line, index) => (
        <SvgText key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : 16}>
          {line}
        </SvgText>
      ))}
    </SvgText>
  );
}

function parseSimpleFlowchart(content: string): FlowchartModel | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%') && !line.startsWith('style '));

  if (!lines[0] || !/^(flowchart|graph)\s+/i.test(lines[0])) return null;

  const nodes = new Map<string, Omit<FlowNode, 'x' | 'y'>>();
  const edges: FlowEdge[] = [];

  const ensureNode = (raw: string) => {
    const parsed = parseFlowNode(raw);
    if (!parsed) return null;
    if (!nodes.has(parsed.id)) nodes.set(parsed.id, parsed);
    return parsed.id;
  };

  for (const line of lines.slice(1)) {
    if (!line.includes('--')) continue;
    const edgeMatch = line.match(/^(.+?)\s*--(?:\|(.+?)\|)?>+\s*(?:\|(.+?)\|)?\s*(.+)$/);
    if (!edgeMatch) continue;
    const from = ensureNode(edgeMatch[1]);
    const to = ensureNode(edgeMatch[4]);
    if (from && to) {
      edges.push({ from, to, label: (edgeMatch[2] || edgeMatch[3])?.trim() });
    }
  }

  if (nodes.size === 0 || edges.length === 0) return null;

  const indegree = new Map<string, number>();
  nodes.forEach((_, id) => indegree.set(id, 0));
  edges.forEach((edge) => indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1));

  const levels = new Map<string, number>();
  const queue = Array.from(indegree.entries())
    .filter(([, value]) => value === 0)
    .map(([id]) => id);

  if (queue.length === 0) queue.push(Array.from(nodes.keys())[0]);
  queue.forEach((id) => levels.set(id, 0));

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const level = levels.get(id) || 0;
    edges.filter((edge) => edge.from === id).forEach((edge) => {
      const nextLevel = Math.max(levels.get(edge.to) || 0, level + 1);
      levels.set(edge.to, nextLevel);
      if (!queue.includes(edge.to)) queue.push(edge.to);
    });
  }

  Array.from(nodes.keys()).forEach((id) => {
    if (!levels.has(id)) levels.set(id, 0);
  });

  const grouped = new Map<number, string[]>();
  Array.from(nodes.keys()).forEach((id) => {
    const level = levels.get(id) || 0;
    grouped.set(level, [...(grouped.get(level) || []), id]);
  });

  const width = Math.max(320, Math.max(...Array.from(grouped.values()).map((items) => items.length)) * 184 + 48);
  const positioned: FlowNode[] = [];
  grouped.forEach((ids, level) => {
    const gap = width / (ids.length + 1);
    ids.forEach((id, index) => {
      const node = nodes.get(id)!;
      positioned.push({
        ...node,
        x: gap * (index + 1),
        y: 26 + level * 118,
      });
    });
  });

  const height = 120 + Math.max(...Array.from(grouped.keys())) * 118;
  return { nodes: positioned, edges, width, height };
}

function parseFlowNode(raw: string): Omit<FlowNode, 'x' | 'y'> | null {
  const value = raw.trim().replace(/;+$/, '');
  const match = value.match(/^([A-Za-z0-9_]+)\s*(?:\[(.+)\]|\{(.+)\}|\((.+)\))?$/);
  if (!match) return null;

  return {
    id: match[1],
    label: (match[2] || match[3] || match[4] || match[1]).replace(/^["']|["']$/g, ''),
    shape: match[3] ? 'diamond' : 'rect',
  };
}

function wrapText(text: string, maxChars: number) {
  const result: string[] = [];
  let current = '';

  for (const char of text) {
    current += char;
    if (current.length >= maxChars) {
      result.push(current);
      current = '';
    }
  }

  if (current) result.push(current);
  return result.length > 0 ? result : [text];
}

function NativeCodePreview({ content, language, maxHeight }: { content: string; language?: string; maxHeight?: number }) {
  return (
    <View style={styles.nativeCodeBox}>
      <View style={styles.nativeCodeHeader}>
        <Text style={styles.nativeCodeLanguage}>{language || 'code'}</Text>
      </View>
      <ScrollView
        style={[styles.nativeCodeScroll, maxHeight ? { maxHeight } : undefined]}
        horizontal={false}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <Text selectable style={styles.nativeCodeText}>{content}</Text>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function NativeHtmlTextPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const previewText = useMemo(() => extractHtmlPreviewText(content), [content]);

  return (
    <ScrollView style={[styles.nativeDocumentBox, maxHeight ? { maxHeight } : undefined]}>
      <View style={styles.nativeDocumentHeader}>
        <Ionicons name="globe-outline" size={15} color="#3370ff" />
        <Text style={styles.nativeDocumentTitle}>HTML 页面预览</Text>
      </View>
      <Text selectable style={styles.nativeDocumentText}>
        {previewText || content}
      </Text>
    </ScrollView>
  );
}

function NativeMarkdownPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <ScrollView style={[styles.nativeDocumentBox, maxHeight ? { maxHeight } : undefined]}>
      {blocks.map((block, index) => {
        if (block.type === 'h1') {
          return <Text key={index} selectable style={styles.mdH1}>{block.text}</Text>;
        }
        if (block.type === 'h2') {
          return <Text key={index} selectable style={styles.mdH2}>{block.text}</Text>;
        }
        if (block.type === 'h3') {
          return <Text key={index} selectable style={styles.mdH3}>{block.text}</Text>;
        }
        if (block.type === 'quote') {
          return <Text key={index} selectable style={styles.mdQuote}>{block.text}</Text>;
        }
        if (block.type === 'code') {
          return <Text key={index} selectable style={styles.mdCode}>{block.text}</Text>;
        }
        if (block.type === 'list') {
          return <Text key={index} selectable style={styles.mdList}>{block.text}</Text>;
        }
        return <Text key={index} selectable style={styles.mdParagraph}>{block.text}</Text>;
      })}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════
//  WebView 沙箱容器
// ═══════════════════════════════════════════════

function SandboxWebView({
  html,
  maxHeight,
  fallbackText,
  disableTimeoutFallback = false,
}: {
  html: string;
  maxHeight?: number;
  fallbackText?: string;
  disableTimeoutFallback?: boolean;
}) {
  const isFullScreen = maxHeight === 99999;
  const [height, setHeight] = useState(maxHeight || 520);
  const [fallback, setFallback] = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const renderedRef = useRef(false);

  const onMessage = useCallback((e: any) => {
    try {
      const h = parseInt(e.nativeEvent.data, 10);
      if (h > 0) {
        renderedRef.current = true;
        setHeight((current) => (Math.abs(current - h) > 2 ? h : current));
      }
    } catch {}
  }, []);

  useEffect(() => {
    renderedRef.current = false;
    setFallback(false);
    setWebLoading(true);

    if (!isNative || !fallbackText || disableTimeoutFallback) return;

    const timer = setTimeout(() => {
      if (!renderedRef.current) setFallback(true);
    }, 1600);

    return () => clearTimeout(timer);
  }, [disableTimeoutFallback, html, fallbackText]);

  if (fallback && fallbackText) {
    return <TextPreview content={fallbackText} maxHeight={maxHeight} />;
  }

  if (!isNative || !WebView) {
    if (isNative) {
      return <TextPreview content={fallbackText || stripHtmlToText(html)} maxHeight={maxHeight} />;
    }

    // Web平台使用iframe进行预览
    const srcDocBase64 = btoa(unescape(encodeURIComponent(html)));
    const iframeMaxHeight = isFullScreen ? undefined : maxHeight;
    return (
      <iframe
        src={`data:text/html;charset=utf-8;base64,${srcDocBase64}`}
        style={{
          width: '100%',
          height: iframeMaxHeight ? Math.min(height, iframeMaxHeight) : '100%',
          flex: isFullScreen ? 1 : undefined,
          border: 'none',
          borderRadius: 12,
          overflow: 'hidden',
        }}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    );
  }

  return (
    <View style={{ flex: isFullScreen ? 1 : 0, minHeight: isFullScreen ? undefined : (maxHeight || 360) }}>
      {webLoading && !isFullScreen && (
        <View style={styles.webLoadingOverlay}>
          <ActivityIndicator size="small" color="#3370ff" />
          <Text style={styles.loadingText}>正在渲染预览...</Text>
        </View>
      )}
      <WebView
        source={{ html, baseUrl: 'https://test2.yeolde.fun' }}
        style={{
          flex: isFullScreen ? 1 : 0,
          height: isFullScreen ? undefined : Math.min(height, maxHeight || 99999),
          minHeight: isFullScreen ? undefined : (maxHeight || 360),
          backgroundColor: 'transparent',
          width: '100%',
          opacity: webLoading ? 0 : 1,
        }}
        scrollEnabled={!isFullScreen && !!maxHeight && height > maxHeight}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        automaticallyAdjustContentInsets={false}
        onMessage={onMessage}
        onLoadEnd={() => setWebLoading(false)}
        onError={() => {
          setWebLoading(false);
          if (fallbackText) setFallback(true);
        }}
        onHttpError={() => {
          setWebLoading(false);
          if (fallbackText) setFallback(true);
        }}
      />
    </View>
  );
}

function buildHtmlDataUri(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// ═══════════════════════════════════════════════
//  HTML 构建函数
// ═══════════════════════════════════════════════

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildCodeHtml(code: string, lang?: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-size:13px;line-height:1.5;font-family:-apple-system,system-ui,sans-serif}
pre{padding:12px;overflow-x:auto}
code{font-family:'SF Mono','Monaco','Menlo','Courier New',monospace;font-size:12px;line-height:1.6}
.lang-label{padding:4px 12px;font-size:10px;color:#8b949e;background:#161b22;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #21262d}
</style></head><body>
<div class="lang-label">${escapeHtml(lang || 'code')}</div>
<pre><code class="language-${escapeHtml(lang || 'plaintext')}">${escapeHtml(code)}</code></pre>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>
hljs.highlightAll();
function sendHeight() {
  var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
  window.ReactNativeWebView.postMessage(String(h + 8));
}
sendHeight();
window.addEventListener('load', sendHeight);
if (window.ResizeObserver) {
  var observer = new ResizeObserver(sendHeight);
  observer.observe(document.body);
}
</script>
</body></html>`;
}

function buildHtmlPreview(htmlContent: string): string {
  if (isFullHtmlDocument(htmlContent)) {
    return injectPreviewBridge(htmlContent);
  }

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#ffffff;color:#1f2329;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.5;padding:0;overflow-x:hidden}
</style></head><body>
<div id="root">${htmlContent}</div>
<script>
(function(){
  var r = document.getElementById('root');
  if(!r) return;
  function sendHeight() {
    var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
    window.ReactNativeWebView.postMessage(String(h + 8));
  }
  sendHeight();
  window.addEventListener('load', sendHeight);
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(sendHeight);
    observer.observe(r);
  }
})();
</script>
</body></html>`;
}

function isFullHtmlDocument(content: string): boolean {
  const normalized = content.trim().slice(0, 300).toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.includes('<html');
}

function injectPreviewBridge(htmlContent: string): string {
  const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">';
  const bridgeScript = `<script>
(function(){
  function sendHeight() {
    var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 600);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(String(h + 16));
    }
  }
  sendHeight();
  window.addEventListener('load', sendHeight);
  window.addEventListener('resize', sendHeight);
  setTimeout(sendHeight, 100);
  setTimeout(sendHeight, 600);
  if (window.ResizeObserver && document.body) {
    var observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
  }
})();
</script>`;

  let nextHtml = htmlContent;
  if (!/<meta\s+name=["']viewport["']/i.test(nextHtml)) {
    if (/<head[^>]*>/i.test(nextHtml)) {
      nextHtml = nextHtml.replace(/<head([^>]*)>/i, `<head$1>${viewportMeta}`);
    } else {
      nextHtml = `${viewportMeta}${nextHtml}`;
    }
  }

  if (/<\/body>/i.test(nextHtml)) {
    return nextHtml.replace(/<\/body>/i, `${bridgeScript}</body>`);
  }

  return `${nextHtml}${bridgeScript}`;
}

function buildMarkdownHtml(md: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:transparent;color:#1f2329;font-size:15px;line-height:1.6;padding:0;word-wrap:break-word;overflow-wrap:break-word}
h1,h2,h3,h4{margin:14px 0 8px;font-weight:600;line-height:1.3}
h1{font-size:20px}h2{font-size:18px}h3{font-size:16px}
p{margin:8px 0}
ul,ol{margin:8px 0;padding-left:22px}
li{margin:3px 0}
blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid #3370ff;background:#f0f5ff;border-radius:0 6px 6px 0}
code{font-family:'SF Mono','Monaco','Menlo','Courier New',monospace;font-size:13px;background:#f0f2f5;padding:1px 5px;border-radius:4px;color:#d63384}
pre{background:#0d1117;border-radius:8px;padding:14px;margin:10px 0;overflow-x:auto}
pre code{all:unset;font-family:'SF Mono','Monaco','Menlo','Courier New',monospace;font-size:13px;line-height:1.6;color:#e6edf3;background:transparent}
a{color:#3370ff;text-decoration:none}
table{border-collapse:collapse;margin:10px 0;width:100%;min-width:420px;font-size:13px}
.table-wrap{width:100%;overflow-x:auto;margin:10px 0}
th,td{border:1px solid #dee0e3;padding:8px 10px;text-align:left;vertical-align:top;white-space:nowrap}
th{background:#f5f6f7;font-weight:600}
hr{border:none;border-top:1px solid #dee0e3;margin:14px 0}
img{max-width:100%;border-radius:6px;margin:8px 0}
.mermaid{display:flex;justify-content:center;align-items:center;background:#fff;border:1px solid #e6eaf2;border-radius:10px;padding:12px;margin:12px 0;overflow:auto}
.mermaid svg{max-width:100%;height:auto}
.mermaid-error{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;color:#991b1b;font-size:12px;white-space:pre-wrap}
</style></head><body>
<div id="content"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.4/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js"></script>
<script>
marked.setOptions({gfm:true,breaks:true});
var renderer = new marked.Renderer();
renderer.code = function(token) {
  var text = typeof token === 'string' ? token : (token.text || '');
  var lang = typeof token === 'string' ? '' : (token.lang || '');
  if ((lang || '').trim().toLowerCase() === 'mermaid') {
    return '<div class="mermaid">' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
  }
  var highlighted = text;
  if (lang && hljs.getLanguage(lang)) {
    try { highlighted = hljs.highlight(text,{language:lang}).value; } catch(e) {}
  } else {
    highlighted = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  return '<pre><code class="language-' + String(lang || 'plaintext').replace(/[^a-z0-9_-]/gi,'') + '">' + highlighted + '</code></pre>';
};
var raw=${JSON.stringify(md)};
var safe=DOMPurify.sanitize(marked.parse(raw,{renderer:renderer}), {ADD_TAGS:['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','marker','foreignObject'], ADD_ATTR:['viewBox','d','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','points','transform','marker-end','marker-start','text-anchor','dominant-baseline','font-size','font-family','class','id','style']});
document.getElementById('content').innerHTML=safe;
document.querySelectorAll('table').forEach(function(table){
  if (table.parentElement && table.parentElement.className === 'table-wrap') return;
  var wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
});

function sendHeight() {
  var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
  window.ReactNativeWebView.postMessage(String(h + 8));
}
function renderMermaid(){
  if (!window.mermaid) {
    sendHeight();
    return;
  }
  try {
    mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'loose',fontSize:14});
    mermaid.run({nodes:document.querySelectorAll('.mermaid')}).then(sendHeight).catch(function(e){
      document.querySelectorAll('.mermaid').forEach(function(node){
        node.innerHTML='<div class="mermaid-error">图表渲染失败\\n'+String(e && e.message || e)+'</div>';
      });
      sendHeight();
    });
  } catch(e) {
    sendHeight();
  }
}
renderMermaid();
window.addEventListener('load', function(){ renderMermaid(); sendHeight(); });
if (window.ResizeObserver) {
  var observer = new ResizeObserver(sendHeight);
  observer.observe(document.body);
}
</script>
</body></html>`;
}

function buildMermaidHtml(chart: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#ffffff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:12px;overflow:auto}
.error-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;max-width:100%}
.error-box p{color:#dc2626;font-size:12px;font-weight:600;margin-bottom:6px}
.error-box pre{font-size:10px;color:#991b1b;white-space:pre-wrap;word-break:break-all}
#mermaid-container{width:100%;display:flex;justify-content:center;align-items:center;overflow:auto}
#mermaid-container svg{max-width:100%;height:auto}
</style></head><body>
<div id="mermaid-container"><div class="loading">正在渲染图表...</div></div>
<script>
function sendHeight() {
  var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(h + 8));
}
function showError(title, message) {
  document.getElementById('mermaid-container').innerHTML='<div class="error-box"><p>'+title+'</p><pre>'+String(message || '')+'</pre></div>';
  sendHeight();
}
function renderChart() {
  if (!window.mermaid) {
    showError('图表渲染失败', 'Mermaid 渲染库加载失败');
    return;
  }
  var code = ${JSON.stringify(chart)};
  try {
    mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'loose',fontSize:14});
    var renderId = 'mermaid-render-' + Date.now();
    var result = mermaid.render(renderId, code);
    Promise.resolve(result).then(function(r){
      document.getElementById('mermaid-container').innerHTML=r.svg;
      sendHeight();
      setTimeout(sendHeight, 120);
      setTimeout(sendHeight, 600);
    }).catch(function(e){
      showError('图表渲染失败', e && e.message || e);
    });
  } catch(e) {
    showError('图表解析错误', e && e.message || e);
  }
}
var script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js';
script.onload = renderChart;
script.onerror = function(){ showError('图表渲染失败', '无法加载 Mermaid 渲染库'); };
document.head.appendChild(script);
setTimeout(sendHeight, 80);
</script>
</body></html>`;
}

function buildDocumentHtml(content: string): string {
  // 文档风格：使用 marked 渲染加文档样式
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Georgia','Times New Roman',serif;background:#fafafa;color:#1f2329;font-size:16px;line-height:1.8;padding:24px 20px;max-width:100%}
h1{font-size:26px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #e5e7eb;padding-bottom:8px}
h2{font-size:22px;font-weight:700;margin:20px 0 10px}
h3{font-size:18px;font-weight:600;margin:16px 0 8px}
p{margin:10px 0}
ul,ol{margin:10px 0;padding-left:28px}
li{margin:4px 0}
blockquote{margin:14px 0;padding:10px 18px;border-left:4px solid #3370ff;background:#f0f5ff;border-radius:0 6px 6px 0;color:#374151;font-style:italic}
code{font-family:'SF Mono','Monaco','Menlo',monospace;font-size:14px;background:#f3f4f6;padding:2px 6px;border-radius:4px;color:#be185d}
pre{background:#1e293b;border-radius:8px;padding:14px;margin:12px 0;overflow-x:auto}
pre code{all:unset;font-family:'SF Mono','Monaco','Menlo',monospace;font-size:13px;line-height:1.6;color:#e2e8f0;background:transparent}
a{color:#3370ff}
table{border-collapse:collapse;margin:12px 0;width:100%;font-size:14px}
th,td{border:1px solid #d1d5db;padding:8px 12px;text-align:left}
th{background:#f9fafb;font-weight:600}
hr{border:none;border-top:1px solid #d1d5db;margin:20px 0}
</style></head><body>
<div id="content"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.4/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js"></script>
<script>
var raw=${JSON.stringify(content)};
var safe=DOMPurify.sanitize(marked.parse(raw));
document.getElementById('content').innerHTML=safe;

function sendHeight() {
  var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
  window.ReactNativeWebView.postMessage(String(h + 8));
}
sendHeight();
window.addEventListener('load', sendHeight);
if (window.ResizeObserver) {
  var observer = new ResizeObserver(sendHeight);
  observer.observe(document.body);
}
</script>
</body></html>`;
}

// ═══════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#8f959e',
  },
  webLoadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    zIndex: 2,
    gap: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#8f959e',
  },
  imageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  htmlInlineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6eaf2',
    overflow: 'hidden',
  },
  htmlInlineTopBar: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  htmlWindowDots: {
    flexDirection: 'row',
    gap: 4,
  },
  htmlWindowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  htmlInlineUrl: {
    flex: 1,
    fontSize: 10,
    color: '#8f959e',
    fontWeight: '600',
  },
  htmlInlineBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  htmlInlineTextBox: {
    flex: 1,
    minWidth: 0,
  },
  htmlInlineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1f2329',
    marginBottom: 4,
  },
  htmlInlineText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#646a73',
  },
  htmlInlineHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f6f9ff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  htmlInlineHintText: {
    fontSize: 11,
    color: '#3370ff',
    fontWeight: '700',
  },
  mermaidInlineCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eaf2',
    overflow: 'hidden',
  },
  mermaidInlineIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#edf4ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d6e5ff',
  },
  mermaidInlineBody: {
    flex: 1,
    minWidth: 0,
  },
  mermaidInlineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1f2329',
    marginBottom: 6,
  },
  mermaidInlineCode: {
    fontSize: 11,
    lineHeight: 16,
    color: '#4e5969',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  mermaidInlineHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  mermaidInlineHintText: {
    fontSize: 11,
    color: '#3370ff',
    fontWeight: '700',
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
  },
  pptContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pptContent: {
    padding: 16,
    minHeight: 120,
  },
  pptSlideText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2329',
  },
  pptNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eff0f1',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pptNavText: {
    fontSize: 11,
    color: '#8f959e',
  },
  pptNavButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  pptNavBtn: {
    fontSize: 12,
    color: '#3370ff',
    fontWeight: '600',
  },
  pptNavBtnDisabled: {
    color: '#dee0e3',
  },
  textPreview: {
    fontSize: 12,
    lineHeight: 18,
    color: '#1f2329',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    padding: 8,
  },
  nativeCodeBox: {
    backgroundColor: '#0d1117',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#21262d',
  },
  nativeMermaidBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eaf2',
    overflow: 'hidden',
  },
  mermaidZoomBar: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  mermaidZoomButton: {
    width: 26,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#edf4ff',
    borderWidth: 1,
    borderColor: '#d6e5ff',
    color: '#3370ff',
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '800',
  },
  mermaidZoomButtonDisabled: {
    color: '#c9cdd4',
    backgroundColor: '#f5f6f7',
    borderColor: '#eff0f1',
  },
  mermaidZoomText: {
    minWidth: 42,
    fontSize: 11,
    color: '#4e5969',
    textAlign: 'center',
    fontWeight: '700',
  },
  mermaidZoomReset: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: '#f5f6f7',
    color: '#4e5969',
    fontSize: 11,
    lineHeight: 23,
    fontWeight: '700',
    overflow: 'hidden',
  },
  nativeMermaidScroll: {
    flexGrow: 0,
  },
  nativeCodeHeader: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  nativeCodeLanguage: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8b949e',
    textTransform: 'uppercase',
  },
  nativeCodeScroll: {
    maxHeight: 520,
  },
  nativeCodeText: {
    minWidth: '100%',
    padding: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#e6edf3',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  nativeDocumentBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6eaf2',
    padding: 14,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  nativeDocumentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  nativeDocumentTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3370ff',
  },
  nativeDocumentText: {
    fontSize: 14,
    lineHeight: 23,
    color: '#1f2329',
  },
  mdH1: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
    color: '#1f2329',
    marginBottom: 12,
  },
  mdH2: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#1f2329',
    marginTop: 8,
    marginBottom: 8,
  },
  mdH3: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#1f2329',
    marginTop: 6,
    marginBottom: 4,
  },
  mdParagraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1f2329',
    marginBottom: 10,
  },
  mdList: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1f2329',
    marginBottom: 5,
  },
  mdQuote: {
    fontSize: 13,
    lineHeight: 20,
    color: '#374151',
    backgroundColor: '#f6f9ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3370ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    borderRadius: 8,
  },
  mdCode: {
    fontSize: 12,
    lineHeight: 18,
    color: '#e6edf3',
    backgroundColor: '#0d1117',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function extractHtmlPreviewText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(h1|h2|h3|p|div|section|main|nav|li|button)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function extractHtmlTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtmlText(titleMatch[1]).trim();
  }

  const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (headingMatch?.[1]) {
    return decodeHtmlText(headingMatch[1].replace(/<[^>]+>/g, '')).trim();
  }

  return '';
}

function decodeHtmlText(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function parseMarkdownBlocks(markdown: string): Array<{ type: 'h1' | 'h2' | 'h3' | 'quote' | 'code' | 'list' | 'paragraph'; text: string }> {
  const blocks: Array<{ type: 'h1' | 'h2' | 'h3' | 'quote' | 'code' | 'list' | 'paragraph'; text: string }> = [];
  const lines = markdown.split(/\r?\n/);
  let inCode = false;
  let codeBuffer: string[] = [];

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'code', text: codeBuffer.join('\n') });
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4) });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3) });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2) });
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'quote', text: trimmed.slice(2) });
    } else if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      blocks.push({ type: 'list', text: trimmed });
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  });

  if (codeBuffer.length > 0) {
    blocks.push({ type: 'code', text: codeBuffer.join('\n') });
  }

  return blocks;
}
