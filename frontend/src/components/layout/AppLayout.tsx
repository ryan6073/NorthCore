import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Menu, Info } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { LeftNavBar } from './LeftNavBar';

interface AppLayoutProps {
  leftSidebar: React.ReactNode;
  chatPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

const LEFT_MIN = 200;
const LEFT_MAX = 450;
const RIGHT_MIN = 250;
const RIGHT_MAX = 500;

const AppLayout: React.FC<AppLayoutProps> = ({
  leftSidebar,
  chatPanel,
  rightPanel
}) => {
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [isLeftOpen, setIsLeftOpen] = useState(false);
  const [isRightOpen, setIsRightOpen] = useState(false);

  const activeConversationId = useAgentHubStore(state => state.activeConversationId);
  const selectedArtifactId = useAgentHubStore(state => state.selectedArtifactId);

  // Auto close drawers on mobile when active conversation or artifact changes
  useEffect(() => {
    setIsLeftOpen(false);
  }, [activeConversationId]);

  useEffect(() => {
    setIsRightOpen(false);
  }, [selectedArtifactId]);

  const isLeftDragging = useRef(false);
  const isRightDragging = useRef(false);

  const dragStateRef = useRef({
    leftStartX: 0,
    leftStartWidth: 0,
    rightStartX: 0,
    rightStartWidth: 0
  });

  const clamp = (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  };

  const handleLeftMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    isLeftDragging.current = true;
    dragStateRef.current.leftStartX = e.clientX;
    dragStateRef.current.leftStartWidth = leftWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleRightMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    isRightDragging.current = true;
    dragStateRef.current.rightStartX = e.clientX;
    dragStateRef.current.rightStartWidth = rightWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isLeftDragging.current) {
      const deltaX = e.clientX - dragStateRef.current.leftStartX;
      const newWidth = dragStateRef.current.leftStartWidth + deltaX;

      setLeftWidth(clamp(newWidth, LEFT_MIN, LEFT_MAX));
    }

    if (isRightDragging.current) {
      const deltaX = e.clientX - dragStateRef.current.rightStartX;
      const newWidth = dragStateRef.current.rightStartWidth - deltaX;

      setRightWidth(clamp(newWidth, RIGHT_MIN, RIGHT_MAX));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isLeftDragging.current && !isRightDragging.current) {
      return;
    }

    isLeftDragging.current = false;
    isRightDragging.current = false;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div className="h-full w-full flex bg-white dark:bg-[#06070d] overflow-hidden text-lark-text-primary dark:text-slate-100 transition-colors relative">
      {/* Slim leftmost navigation bar */}
      <div className="hidden lg:block h-full">
        <LeftNavBar />
      </div>
      {/* Mobile left sidebar overlay backdrop */}
      {isLeftOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity animate-fade-in" 
          onClick={() => setIsLeftOpen(false)}
        />
      )}

      {/* 左侧区域 */}
      <aside
        style={{
          '--aside-width': `${leftWidth}px`
        } as React.CSSProperties}
        className={`
          h-full min-w-0 overflow-hidden border-r border-lark-border dark:border-[#161828] bg-lark-sidebar-bg dark:bg-[#090a12] transition-transform duration-300 lg:transition-none
          fixed lg:relative top-0 bottom-0 left-0 z-50 lg:z-auto
          w-[320px] lg:w-[var(--aside-width)] lg:flex-[0_0_var(--aside-width)] lg:min-w-[200px] lg:max-w-[450px]
          ${isLeftOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex
        `}
      >
        <div className="lg:hidden h-full flex-shrink-0">
          <LeftNavBar />
        </div>
        <div className="h-full w-full min-w-0 overflow-hidden flex-1">
          {leftSidebar}
        </div>
      </aside>

      {/* 左侧拖拽条 */}
      <div
        onMouseDown={handleLeftMouseDown}
        className="
          hidden lg:block h-full w-[2px] flex-none cursor-col-resize
          bg-lark-border dark:bg-[#1b1e32] hover:bg-lark-primary active:bg-lark-primary
          transition-colors select-none z-20 relative
          before:content-[''] before:absolute before:-left-1 before:right-1 before:top-0 before:bottom-0 before:w-3 before:bg-transparent
        "
      />

      {/* 中间区域 */}
      <main
        className="
          h-full flex-1 min-w-0 overflow-hidden
          bg-white dark:bg-[#0b0c16] transition-colors flex flex-col
        "
      >
        {/* Mobile Top Header Bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2.5 border-b border-lark-border dark:border-[#161828] bg-lark-sidebar-bg dark:bg-[#090a12] flex-shrink-0 select-none">
          <button 
            onClick={() => setIsLeftOpen(true)}
            className="p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight">AgentHub</span>
          <button 
            onClick={() => setIsRightOpen(true)}
            className="p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>

        <div className="h-full w-full min-w-0 overflow-hidden flex-1">
          {chatPanel}
        </div>
      </main>

      {/* Mobile right sidebar overlay backdrop */}
      {isRightOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity animate-fade-in" 
          onClick={() => setIsRightOpen(false)}
        />
      )}

      {/* 右侧拖拽条 */}
      <div
        onMouseDown={handleRightMouseDown}
        className="
          hidden lg:block h-full w-[2px] flex-none cursor-col-resize
          bg-lark-border dark:bg-[#1b1e32] hover:bg-lark-primary active:bg-lark-primary
          transition-colors select-none z-20 relative
          before:content-[''] before:absolute before:-left-1 before:right-1 before:top-0 before:bottom-0 before:w-3 before:bg-transparent
        "
      />

      {/* 右侧区域 */}
      <aside
        style={{
          '--right-aside-width': `${rightWidth}px`
        } as React.CSSProperties}
        className={`
          h-full min-w-0 overflow-hidden border-l border-lark-border dark:border-[#161828] bg-lark-sidebar-bg dark:bg-[#090a12] transition-transform duration-300 lg:transition-none
          fixed lg:relative top-0 bottom-0 right-0 z-50 lg:z-auto
          w-[320px] max-w-[90vw] lg:max-w-none lg:w-[var(--right-aside-width)] lg:flex-[0_0_var(--right-aside-width)] lg:min-w-[320px] lg:max-w-[700px]
          ${isRightOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-full w-full min-w-0 overflow-hidden">
          {rightPanel}
        </div>
      </aside>
    </div>
  );
};

export default AppLayout;