import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden w-full my-2">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 flex-shrink-0">
        <span className="text-xs text-slate-400 font-mono">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-slate-700 transition-colors flex-shrink-0"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4 text-slate-400" />
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto overflow-y-auto max-h-80">
        <code ref={codeRef} className={`language-${language || 'tsx'} text-sm text-slate-100 font-mono leading-relaxed whitespace-pre-wrap break-words`}>
          {code}
        </code>
      </pre>
    </div>
  );
};

export default CodeBlock;
