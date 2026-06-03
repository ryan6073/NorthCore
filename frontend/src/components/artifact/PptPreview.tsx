import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Presentation } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PptPreviewProps {
  content: string;
  title: string;
}

const PptPreview: React.FC<PptPreviewProps> = ({ content, title }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const slides = React.useMemo(() => {
    // Split content by "---" (Markdown horizontal rules represent slides)
    const rawSections = content.split(/\n---\s*\n/);
    return rawSections.map((section, idx) => {
      const trimmed = section.trim();
      const lines = trimmed.split('\n');
      const titleLineIdx = lines.findIndex(l => l.startsWith('#'));
      let slideTitle = '';
      let slideContent = trimmed;

      if (titleLineIdx > -1) {
        slideTitle = lines[titleLineIdx].replace(/^#+\s*/, '');
        const contentLines = [...lines];
        contentLines.splice(titleLineIdx, 1);
        slideContent = contentLines.join('\n').trim();
      } else {
        slideTitle = `Slide ${idx + 1}`;
      }

      return {
        title: slideTitle,
        content: slideContent
      };
    });
  }, [content]);

  const totalSlides = slides.length;
  const currentSlide = slides[currentSlideIndex] || { title: 'Untitled Slide', content: '' };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center gap-4">
      <div className="w-full max-w-2xl aspect-[16/9] bg-gradient-to-br from-indigo-900 to-indigo-950 text-white rounded-xl shadow-xl p-8 relative flex flex-col justify-between overflow-hidden border border-indigo-950">
        <div className="absolute top-[-20%] right-[-20%] w-[50%] aspect-square bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-20%] w-[50%] aspect-square bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between border-b border-indigo-800/40 pb-3 z-10">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase font-mono">
            <Presentation className="w-3.5 h-3.5" />
            <span>演示文稿预览</span>
          </div>
          <span className="text-[10px] text-indigo-400 font-mono">幻灯片 {currentSlideIndex + 1} / {totalSlides}</span>
        </div>

        <div className="my-auto z-10 pl-4 py-2 border-l-4 border-indigo-500/80">
          <h2 className="text-xl font-bold text-slate-100 tracking-tight leading-snug">
            {currentSlide.title}
          </h2>
          {currentSlide.content && (
            <div className="mt-4 prose prose-sm prose-invert max-w-none text-slate-300 leading-relaxed text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {currentSlide.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[9px] text-indigo-400/70 border-t border-indigo-800/20 pt-2.5 font-mono z-10">
          <span>{title}</span>
          <span>Slide {currentSlideIndex + 1} of {totalSlides}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <button
          onClick={handlePrev}
          disabled={currentSlideIndex === 0}
          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
          {currentSlideIndex + 1} / {totalSlides}
        </span>
        <button
          onClick={handleNext}
          disabled={currentSlideIndex === totalSlides - 1}
          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PptPreview;
