import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText } from 'lucide-react';

interface DocPreviewProps {
  content: string;
  title: string;
}

const DocPreview: React.FC<DocPreviewProps> = ({ content, title }) => {
  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 flex flex-col items-center">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md p-8 min-h-[600px] relative flex flex-col transition-colors">
        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-6 font-mono">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span>文档预览 (Document Preview)</span>
          <span className="ml-auto">文件名: {title}</span>
        </div>
        <article className="prose prose-sm dark:prose-invert max-w-none text-lark-text-primary dark:text-slate-200 leading-relaxed flex-grow">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </article>
        <div className="mt-8 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-between font-mono">
          <span>NorthCore Document Indexer v1.0</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
};

export default DocPreview;
