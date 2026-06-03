import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react';
import { getDownloadUrl, fetchArrayBufferWithAuth, downloadFile } from '@/services/http/filePreviewService';

interface PptxPreviewProps {
  item: {
    downloadUrl?: string;
    path?: string;
    filePath?: string;
    runId?: string;
  };
  fileName?: string;
}

declare global {
  interface Window {
    __pptxPreviewData?: any;
  }
}

export const PptxPreview: React.FC<PptxPreviewProps> = ({ item, fileName = 'presentation.pptx' }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [totalSlides, setTotalSlides] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 960, height: 540 });

  useEffect(() => {
    const handleResize = () => {
      if (outerRef.current) {
        setDimensions({
          width: outerRef.current.clientWidth || 960,
          height: outerRef.current.clientHeight || 540
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLoading]);

  const renderPptx = useCallback(async (arrayBuffer: ArrayBuffer) => {
    if (!containerRef.current) {
      setError('无法找到 PPTX 渲染容器');
      setIsLoading(false);
      return;
    }

    try {
      // Validate magic bytes for ZIP format ('P' 'K' -> 0x50 0x4B) to filter out JSON errors or HTML fallbacks
      const uint8 = new Uint8Array(arrayBuffer.slice(0, 4));
      if (uint8[0] !== 0x50 || uint8[1] !== 0x4B) {
        throw new Error('PPTX 文件数据损坏或加载失败（可能文件已清理或路径无效）');
      }

      const { init } = await import('pptx-preview');
      containerRef.current.innerHTML = '';
      
      const previewer = init(containerRef.current, {
        mode: 'slide',
        width: 960,
        height: 540,
      });

      previewerRef.current = previewer;

      // Add a timeout race in case the parsing library hangs on malformed or overly large files
      const previewPromise = previewer.preview(arrayBuffer);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PPTX 渲染超时，文件结构可能过于复杂或损坏')), 15000)
      );
      await Promise.race([previewPromise, timeoutPromise]);
      
      if (previewer.slideCount) {
        setTotalSlides(previewer.slideCount);
      }

      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error('[PptxPreview] Render failed:', err);
      setError(err instanceof Error ? err.message : 'PPTX 预览渲染失败，请尝试下载后查看');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const downloadUrl = item?.downloadUrl;
    const filePath = item?.filePath;
    const path = item?.path;
    const runId = item?.runId;

    const loadPptx = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const url = getDownloadUrl({ downloadUrl, filePath, path, runId });
        const arrayBuffer = await fetchArrayBufferWithAuth(url);

        if (!cancelled) {
          await renderPptx(arrayBuffer);
        }
      } catch (err) {
        console.error('[PptxPreview] Load failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'PPTX 文件加载失败');
          setIsLoading(false);
        }
      }
    };

    loadPptx();

    return () => {
      cancelled = true;
      if (previewerRef.current) {
        try {
          previewerRef.current.destroy?.();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [item?.downloadUrl, item?.filePath, item?.path, item?.runId, renderPptx]);

  const goToPrevSlide = () => {
    if (currentSlide > 1 && previewerRef.current) {
      const newSlide = currentSlide - 1;
      setCurrentSlide(newSlide);
      previewerRef.current.renderSingleSlide(newSlide - 1);
    }
  };

  const goToNextSlide = () => {
    if (currentSlide < totalSlides && previewerRef.current) {
      const newSlide = currentSlide + 1;
      setCurrentSlide(newSlide);
      previewerRef.current.renderSingleSlide(newSlide - 1);
    }
  };

  const handleDownload = async () => {
    try {
      await downloadFile(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-950 rounded-lg">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <p className="text-sm text-slate-300 font-medium mb-2">预览失败</p>
        <p className="text-xs text-slate-500 mb-4 max-w-sm">{error}</p>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          下载文件
        </button>
      </div>
    );
  }

  const targetWidth = 960;
  const targetHeight = 540;

  // Compute the scale factor to fit target inside outer container, leaving 32px padding (16px on each side)
  const pad = 32;
  const scale = Math.min(
    Math.max(dimensions.width - pad, 200) / targetWidth,
    Math.max(dimensions.height - pad, 150) / targetHeight
  );

  const scaledWidth = targetWidth * scale;
  const scaledHeight = targetHeight * scale;

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden relative">
      <style dangerouslySetInnerHTML={{ __html: `
        .pptx-preview-wrapper-next, 
        .pptx-preview-wrapper-pagination {
          display: none !important;
        }
      ` }} />
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-300">{fileName}</span>
          {totalSlides > 0 && (
            <span className="text-[10px] text-slate-500 font-mono">
              第 {currentSlide} / {totalSlides} 页
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevSlide}
            disabled={isLoading || currentSlide <= 1}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={goToNextSlide}
            disabled={isLoading || currentSlide >= totalSlides}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-semibold text-white">下载</span>
          </button>
        </div>
      </div>
      <div 
        ref={outerRef} 
        className="flex-1 min-h-0 bg-slate-900 overflow-hidden relative flex items-center justify-center p-4"
      >
        <div 
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
            position: 'relative',
            overflow: 'hidden',
          }}
          className="flex items-center justify-center"
        >
          <div 
            ref={containerRef} 
            style={{
              width: `${targetWidth}px`,
              height: `${targetHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginTop: `-${targetHeight / 2}px`,
              marginLeft: `-${targetWidth / 2}px`,
            }}
          />
        </div>
        
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
            <p className="text-xs text-slate-400 font-medium">正在加载 PPTX...</p>
          </div>
        )}
      </div>
    </div>
  );
};
