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
      if (h > 0) setHeight(h);
    } catch {}
  }, []);

  if (!WebView) return null;

  return (
    <WebView
      source={{ html }}
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
