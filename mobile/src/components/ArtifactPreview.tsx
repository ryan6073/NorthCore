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

  return (
    <View style={[styles.container, maxHeight ? { maxHeight } : undefined]}>
      {renderContent()}
    </View>
  );
}

// ═══════════════════════════════════════════════
//  类型专属预览组件
// ═══════════════════════════════════════════════

/** 代码/差异预览 — WebView + highlight.js */
function CodePreview({ content, language, maxHeight }: { content: string; language?: string; maxHeight?: number }) {
  const html = useMemo(() => buildCodeHtml(content, language), [content, language]);
  return <SandboxWebView html={html} maxHeight={maxHeight} />;
}

/** HTML 预览 — WebView srcDoc */
function HtmlPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const html = useMemo(() => buildHtmlPreview(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} />;
}

/** Markdown 预览 — WebView + marked.js */
function MarkdownPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const html = useMemo(() => buildMarkdownHtml(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} />;
}

/** Mermaid 预览 — WebView + mermaid.js */
function MermaidPreview({ content, maxHeight }: { content: string; maxHeight?: number }) {
  const html = useMemo(() => buildMermaidHtml(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} />;
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
  const html = useMemo(() => buildDocumentHtml(content), [content]);
  return <SandboxWebView html={html} maxHeight={maxHeight} />;
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

// ═══════════════════════════════════════════════
//  WebView 沙箱容器
// ═══════════════════════════════════════════════

function SandboxWebView({ html, maxHeight }: { html: string; maxHeight?: number }) {
  const [height, setHeight] = useState(200);

  const onMessage = useCallback((e: any) => {
    try {
      const h = parseInt(e.nativeEvent.data, 10);
      if (h > 0) setHeight(h);
    } catch {}
  }, []);

  if (!isNative || !WebView) {
    // 非原生环境降级为纯文本
    return <TextPreview content="预览仅在 iOS/Android 设备上可用" />;
  }

  return (
    <WebView
      source={{ html }}
      style={{
        height: Math.min(height, maxHeight || 99999),
        backgroundColor: 'transparent',
        width: '100%',
      }}
      scrollEnabled={!!maxHeight && height > maxHeight}
      showsVerticalScrollIndicator={false}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      bounces={false}
      automaticallyAdjustContentInsets={false}
      onMessage={onMessage}
    />
  );
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
table{border-collapse:collapse;margin:10px 0;width:100%;font-size:13px}
th,td{border:1px solid #dee0e3;padding:6px 10px;text-align:left}
th{background:#f5f6f7;font-weight:600}
hr{border:none;border-top:1px solid #dee0e3;margin:14px 0}
img{max-width:100%;border-radius:6px;margin:8px 0}
</style></head><body>
<div id="content"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.4/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>
marked.setOptions({gfm:true,breaks:true,highlight:function(c,l){if(l&&hljs.getLanguage(l))try{return hljs.highlight(c,{language:l}).value}catch(e){}return c}});
var raw=${JSON.stringify(md)};
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

function buildMermaidHtml(chart: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#ffffff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:16px}
.error-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;max-width:100%}
.error-box p{color:#dc2626;font-size:12px;font-weight:600;margin-bottom:6px}
.error-box pre{font-size:10px;color:#991b1b;white-space:pre-wrap;word-break:break-all}
#mermaid-container{width:100%;display:flex;justify-content:center}
</style></head><body>
<div id="mermaid-container"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js"></script>
<script>
mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'loose',fontSize:14});
function sendHeight() {
  var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight);
  window.ReactNativeWebView.postMessage(String(h + 8));
}
try {
  var code = ${JSON.stringify(chart)};
  mermaid.render('mermaid-render', code).then(function(r){
    document.getElementById('mermaid-container').innerHTML=r.svg;
    sendHeight();
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(sendHeight);
      observer.observe(document.body);
    }
  }).catch(function(e){
    document.getElementById('mermaid-container').innerHTML='<div class="error-box"><p>⚠️ 图表渲染失败</p><pre>'+e.message+'</pre></div>';
    window.ReactNativeWebView.postMessage(String(200));
  });
} catch(e){
  document.getElementById('mermaid-container').innerHTML='<div class="error-box"><p>⚠️ 图表解析错误</p><pre>'+e.message+'</pre></div>';
  window.ReactNativeWebView.postMessage(String(200));
}
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
});
