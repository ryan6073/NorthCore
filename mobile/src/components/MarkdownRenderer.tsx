import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, Platform, Text } from 'react-native';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

let WebView: any = null;
if (isNative) {
  try {
    WebView = require('react-native-webview').WebView;
  } catch {
    // fallback — will use Text fallback below
  }
}

interface MarkdownRendererProps {
  content: string;
  language?: string;
  isCodeBlock?: boolean;
  maxHeight?: number;
}

export default function MarkdownRenderer({
  content,
  language,
  isCodeBlock,
  maxHeight,
}: MarkdownRendererProps) {
  if (!content) return null;

  if (!isNative || !WebView) {
    return (
      <Text
        style={[
          isCodeBlock ? styles.webCodeBlock : styles.webPlain,
          maxHeight ? { maxHeight } : undefined,
        ]}
        selectable
      >
        {content}
      </Text>
    );
  }

  return (
    <NativeWebView
      content={content}
      language={language}
      isCodeBlock={isCodeBlock}
      maxHeight={maxHeight}
    />
  );
}

/** Native WebView that auto-heights via postMessage */
function NativeWebView({ content, language, isCodeBlock, maxHeight }: MarkdownRendererProps) {
  const [height, setHeight] = useState(40);

  const html = useMemo(() => {
    if (isCodeBlock) return buildCodeHtml(content, language);
    return buildMarkdownHtml(content);
  }, [content, language, isCodeBlock]);

  const onMessage = useCallback((e: any) => {
    try {
      const h = parseInt(e.nativeEvent.data, 10);
      if (h > 0) setHeight((current) => (Math.abs(current - h) > 2 ? h : current));
    } catch {}
  }, []);

  if (!WebView) return null;

  return (
    <WebView
      source={{ html, baseUrl: 'https://test2.yeolde.fun' }}
      style={[
        styles.webview,
        { height: Math.min(height, maxHeight || 99999) },
        isCodeBlock ? styles.codeBlock : styles.markdown,
      ]}
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

function buildCodeHtml(code: string, lang?: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-size:13px;line-height:1.5}
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
blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid #3370ff;background:#f0f5ff;border-radius:0 6px 6px 0;color:#1f2329}
code{font-family:'SF Mono','Monaco','Menlo','Courier New',monospace;font-size:13px;background:#f0f2f5;padding:1px 5px;border-radius:4px;color:#d63384}
pre{background:#0d1117;border-radius:8px;padding:14px;margin:10px 0;overflow-x:auto}
pre code{all:unset;font-family:'SF Mono','Monaco','Menlo','Courier New',monospace;font-size:13px;line-height:1.6;color:#e6edf3;background:transparent}
a{color:#3370ff;text-decoration:none}
table{border-collapse:collapse;margin:10px 0;width:100%;font-size:13px}
table{min-width:420px}
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const styles = StyleSheet.create({
  webview: { backgroundColor: 'transparent', width: '100%' },
  codeBlock: { backgroundColor: '#0d1117', borderRadius: 8 },
  markdown: {},
  webCodeBlock: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    fontSize: 12,
    color: '#34d399',
    backgroundColor: '#1e1e1e',
    padding: 10,
    borderRadius: 8,
    lineHeight: 16,
    overflow: 'hidden',
  },
  webPlain: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2329',
  },
});
