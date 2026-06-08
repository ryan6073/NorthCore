import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface ZoomableContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const ZoomableContainer: React.FC<ZoomableContainerProps> = ({ children, className = '' }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const startDrag = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Wheel zoom handler
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.15;
    const factor = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
    
    // Zoom centered on container
    setScale(prevScale => {
      const newScale = prevScale * factor;
      return Math.min(Math.max(newScale, 0.15), 10);
    });
  };

  // Prevent default scroll on container wheel
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [scale]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Left click only
    if (e.button !== 0) return;
    setIsDragging(true);
    startDrag.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - startDrag.current.x,
      y: e.clientY - startDrag.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setScale(s => Math.min(s * 1.25, 10));
  };

  const handleZoomOut = () => {
    setScale(s => Math.max(s * 0.8, 0.15));
  };

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleReset}
      className={`relative overflow-hidden cursor-grab active:cursor-grabbing select-none w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-200 ${className}`}
    >
      {/* Target Content */}
      <div 
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
        className="w-full h-full flex items-center justify-center pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center justify-center p-4">
          {children}
        </div>
      </div>
      
      {/* Indicator overlay */}
      <div className="absolute top-4 left-4 pointer-events-none flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-900/40 px-2 py-1 rounded-md border border-slate-200/40 dark:border-slate-800/40 backdrop-blur-sm shadow-sm">
        <Move className="w-3.5 h-3.5" />
        <span>拖动以平移 • 双击以重置</span>
      </div>

      {/* Control Buttons */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-lg p-1 shadow-lg z-10 pointer-events-auto select-none">
        <button 
          onClick={handleZoomIn}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-350 hover:text-indigo-500 dark:hover:text-indigo-400 active:scale-90 transition-all"
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          onClick={handleZoomOut}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-350 hover:text-indigo-500 dark:hover:text-indigo-400 active:scale-90 transition-all"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5" />
        <button 
          onClick={handleReset}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-350 hover:text-indigo-500 dark:hover:text-indigo-400 active:scale-90 transition-all"
          title="重置"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
