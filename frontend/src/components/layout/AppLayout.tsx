import React, { useState, useRef, useCallback, useEffect } from 'react';

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
    <div className="h-screen w-screen flex bg-white dark:bg-[#06070d] overflow-hidden text-lark-text-primary dark:text-slate-100 transition-colors">
      {/* 左侧区域 */}
      <aside
        style={{
          width: leftWidth,
          minWidth: LEFT_MIN,
          maxWidth: LEFT_MAX,
          flex: `0 0 ${leftWidth}px`
        }}
        className="h-full min-w-0 overflow-hidden border-r border-lark-border dark:border-[#161828] bg-lark-sidebar-bg dark:bg-[#090a12] transition-colors"
      >
        <div className="h-full w-full min-w-0 overflow-hidden">
          {leftSidebar}
        </div>
      </aside>

      {/* 左侧拖拽条 */}
      <div
        onMouseDown={handleLeftMouseDown}
        className="
          h-full w-[2px] flex-none cursor-col-resize
          bg-lark-border dark:bg-[#1b1e32] hover:bg-lark-primary active:bg-lark-primary
          transition-colors select-none z-20 relative
          before:content-[''] before:absolute before:-left-1 before:right-1 before:top-0 before:bottom-0 before:w-3 before:bg-transparent
        "
      />

      {/* 中间区域 */}
      <main
        className="
          h-full flex-1 min-w-0 overflow-hidden
          bg-white dark:bg-[#0b0c16] transition-colors
        "
      >
        <div className="h-full w-full min-w-0 overflow-hidden">
          {chatPanel}
        </div>
      </main>

      {/* 右侧拖拽条 */}
      <div
        onMouseDown={handleRightMouseDown}
        className="
          h-full w-[2px] flex-none cursor-col-resize
          bg-lark-border dark:bg-[#1b1e32] hover:bg-lark-primary active:bg-lark-primary
          transition-colors select-none z-20 relative
          before:content-[''] before:absolute before:-left-1 before:right-1 before:top-0 before:bottom-0 before:w-3 before:bg-transparent
        "
      />

      {/* 右侧区域 */}
      <aside
        style={{
          width: rightWidth,
          minWidth: RIGHT_MIN,
          maxWidth: RIGHT_MAX,
          flex: `0 0 ${rightWidth}px`
        }}
        className="h-full min-w-0 overflow-hidden border-l border-lark-border dark:border-[#161828] bg-lark-sidebar-bg dark:bg-[#090a12] transition-colors"
      >
        <div className="h-full w-full min-w-0 overflow-hidden">
          {rightPanel}
        </div>
      </aside>
    </div>
  );
};

export default AppLayout;