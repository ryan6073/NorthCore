import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ContextUsage } from '@/types';

interface ContextUsageRingProps {
  usage?: ContextUsage;
  onCompress?: () => void;
}

const ContextUsageRing: React.FC<ContextUsageRingProps> = ({ usage, onCompress }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const portalRootRef = useRef<HTMLElement | null>(null);
  const hoverTimeoutRef = useRef<any>(null);

  const percent = usage?.contextUsagePercent ?? 0;
  const limitChars = usage?.contextLimitChars ?? 200000;
  const usageChars = usage?.contextUsageChars ?? 0;

  const size = 14;
  const strokeWidth = 2.0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  const getColor = () => {
    if (percent >= 80) return 'rgb(239, 68, 68)';
    if (percent >= 50) return 'rgb(245, 158, 11)';
    return 'rgb(16, 185, 129)';
  };

  const formatChars = (n: number) => {
    if (n >= 1000) {
      return `${(n / 1000).toFixed(0)}K`;
    }
    return String(n);
  };

  const updatePopupPosition = useCallback(() => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const popupWidth = 180;
    const gapBelowContainer = 4;
    
    const buttonCenterX = containerRect.left + containerRect.width / 2;
    const popupLeft = buttonCenterX - popupWidth / 2;

    setPopupStyle({
      position: 'fixed',
      top: `${containerRect.bottom + gapBelowContainer}px`,
      left: `${popupLeft}px`,
      width: `${popupWidth}px`,
      zIndex: 99999,
    });

    const arrowLeft = buttonCenterX - popupLeft - 8;
    setArrowStyle({
      left: `${arrowLeft}px`,
    });
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 150);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClicked(prev => !prev);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isClicked) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        return;
      }
      
      const target = e.target as HTMLElement;
      if (target.closest('.context-popup-content')) {
        return;
      }
      
      setIsClicked(false);
    };

    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [isClicked]);

  const showPopup = isHovering || isClicked;

  useEffect(() => {
    portalRootRef.current = document.body;

    if (showPopup) {
      updatePopupPosition();
      window.addEventListener('scroll', updatePopupPosition, true);
      window.addEventListener('resize', updatePopupPosition);
    }

    return () => {
      window.removeEventListener('scroll', updatePopupPosition, true);
      window.removeEventListener('resize', updatePopupPosition);
    };
  }, [showPopup, updatePopupPosition]);

  const popupContent = showPopup ? (
    <div
      style={popupStyle}
      className="select-none animate-scale-in pointer-events-auto context-popup-content"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-2.5 relative">
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="text-[10px] text-slate-400 dark:text-slate-555 font-semibold tracking-wider">占合度</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium">
            {formatChars(usageChars)} / {formatChars(limitChars)}
          </span>
        </div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-baseline gap-1">
          {Math.round(percent)}%
          <span className="text-[10px] text-slate-450 dark:text-slate-555 font-normal">已使用</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onCompress?.(); setIsClicked(false); }}
          className="w-full mt-2 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 rounded-md py-1 text-xs font-semibold transition-all flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-800 shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5 text-slate-500 dark:text-slate-455">
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="9.8" y1="8.2" x2="21" y2="12" />
            <line x1="9.8" y1="15.8" x2="21" y2="12" />
          </svg>
          <span>压缩上下文</span>
        </button>
      </div>
      <div 
        style={arrowStyle}
        className="absolute -top-1 w-2 h-2 bg-white dark:bg-slate-950 border-t border-l border-slate-200 dark:border-slate-800 rotate-45 z-[65]"
      />
    </div>
  ) : null;

  return (
    <>
      <div
        ref={containerRef}
        className="relative flex items-center h-[30px]"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleTriggerClick}
      >
        <div 
          className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg transition-all cursor-pointer h-[30px] shadow-sm select-none"
        >
          <div className="relative w-3.5 h-3.5 flex items-center justify-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 w-full h-full">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--ring-bg-light, rgb(229, 231, 235))"
                strokeWidth={strokeWidth}
                className="dark:[--ring-bg-light:rgba(255,255,255,0.12)]"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={getColor()}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
              />
            </svg>
          </div>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-550 hidden md:inline select-none">上下文</span>
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 font-mono select-none">{Math.round(percent)}%</span>
        </div>
      </div>
      {portalRootRef.current && popupContent && createPortal(popupContent, portalRootRef.current)}
    </>
  );
};

export default ContextUsageRing;
