import React, { useState } from 'react';
import { Message, Agent as AgentType } from '@/types';
import { User, Bot, Sparkles, CornerUpLeft, Pin, Copy, Check, Navigation, FileCode, Globe } from 'lucide-react';
import CodeBlock from './CodeBlock';
import TaskPlanCard from './TaskPlanCard';
import ArtifactMessage from './ArtifactMessage';
import AttachmentCard from './AttachmentCard';
import GroupedArtifactsCard from './GroupedArtifactsCard';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface MessageBubbleProps {
  message: Message;
  agents: AgentType[];
  onCustomReply?: (msg: Message) => void;
  onCustomPin?: (msgId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, agents, onCustomReply, onCustomPin }) => {
  const [copied, setCopied] = useState(false);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [isHoveringBar, setIsHoveringBar] = useState(false);
  const [showTouchActions, setShowTouchActions] = useState(false);
  const isUser = message.role === 'user';
  const isOrchestrator = message.role === 'orchestrator';
  const agentInfo = !isUser && message.senderName 
    ? agents.find(a => a.name === message.senderName) 
    : null;

  const globalSetReplyContext = useAgentHubStore(state => state.setReplyContext);
  const globalTogglePinMessage = useAgentHubStore(state => state.togglePinMessage);
  const setSelectedArtifactId = useAgentHubStore(state => state.setSelectedArtifactId);
  const setSelectedArtifactVersion = useAgentHubStore(state => state.setSelectedArtifactVersion);
  const openAgentProfile = useAgentHubStore(state => state.openAgentProfile);
  const allAgents = useAgentHubStore(state => state.agents);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isHoveringBar) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const barHeight = 34;
    const padding = 6;
    const minTop = padding;
    const maxTop = Math.max(padding, rect.height - barHeight - padding);
    const computedTop = Math.min(maxTop, Math.max(minTop, relativeY - barHeight / 2));
    setMouseY(computedTop);
  };

  const handleMouseLeave = () => {
    setIsHoveringBar(false);
  };

  const getPreciseTime = (timeStr: string) => {
    if (!timeStr) return '';
    const parts = timeStr.split(' ');
    return parts[1] || parts[0];
  };

  const handleReply = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowTouchActions(false);
    if (onCustomReply) {
      onCustomReply(message);
    } else {
      globalSetReplyContext({
        id: message.id,
        senderName: message.senderName,
        content: message.content,
      });
    }
  };

  const handlePin = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowTouchActions(false);
    if (onCustomPin) {
      onCustomPin(message.id);
    } else {
      globalTogglePinMessage(message.id);
    }
  };

  const handleCopy = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShowTouchActions(false);
    }, 2000);
  };

  const handleBubbleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('span[onClick]') || target.closest('pre')) {
      return;
    }
    setShowTouchActions(prev => !prev);
  };

  React.useEffect(() => {
    if (!showTouchActions) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const bubbleEl = document.getElementById(`msg-${message.id}`);
      if (bubbleEl && !bubbleEl.contains(e.target as Node)) {
        setShowTouchActions(false);
      }
    };
    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [showTouchActions, message.id]);

  const handleRefClick = () => {
    if (!message.artifactRef) return;
    (window as any).__ag_from_message_bubble_click = true;
    setSelectedArtifactId(message.artifactRef.artifactId);
    setSelectedArtifactVersion(message.artifactRef.version);
    
    setTimeout(() => {
      const startLine = message.artifactRef?.startLine;
      if (startLine !== undefined) {
        const element = document.querySelector(`[data-line-number="${startLine}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('bg-yellow-500/25', 'ring-2', 'ring-yellow-400');
          setTimeout(() => {
            element.classList.remove('bg-yellow-500/25', 'ring-2', 'ring-yellow-400');
          }, 2000);
        }
      }
    }, 150);
  };

  const handleQuoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!message.quotedMessage) return;
    const element = document.getElementById(`msg-${message.quotedMessage.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add visual highlighting classes smoothly
      element.classList.add('ring-2', 'ring-indigo-400/60', 'bg-indigo-50/50', 'dark:bg-indigo-950/30', 'p-2.5', '-m-2.5', 'rounded-xl');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-indigo-400/60', 'bg-indigo-50/50', 'dark:bg-indigo-950/30', 'p-2.5', '-m-2.5', 'rounded-xl');
      }, 1500);
    }
  };

  const formatMessageText = (text: string) => {
    if (!text) return '';
    // Match @ followed by non-whitespace characters (including Chinese, letters, numbers, etc.)
    const regex = /(@[^\s@\uff1a\uff0c\u3002:,.!?]+)/g;
    const parts = text.split(regex);
    
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const nameWithoutAt = part.substring(1);
        const matchedAgent = allAgents.find(a => a.name.toLowerCase() === nameWithoutAt.toLowerCase());
        if (matchedAgent) {
          return (
            <span 
              key={index} 
              onClick={() => openAgentProfile(matchedAgent.id)}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
            >
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  const renderContent = () => {
    if (message.metadata?.isGroupedArtifacts) {
      return <GroupedArtifactsCard message={message} />;
    }
    if (message.type === 'code') {
      return <CodeBlock code={message.content} language={message.language} />;
    }
    if (message.type === 'task-plan') {
      return <TaskPlanCard content={message.content} />;
    }
    if (message.type === 'artifact') {
      return <ArtifactMessage message={message} />;
    }
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{formatMessageText(message.content)}</p>;
  };

  const isBlockType = message.type === 'code' || message.type === 'task-plan' || message.type === 'artifact' || message.metadata?.isGroupedArtifacts;
  const hasContent = message.content && message.content.trim().length > 0;
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const shouldShowBubble = isBlockType || hasContent;

  const bubbleLayout = () => {
    const timeText = getPreciseTime(message.createdAt);

    return (
      <div 
        id={`msg-${message.id}`} 
        className={`group relative flex gap-3.5 mb-5 w-full ${
          isUser ? 'flex-row-reverse' : ''
        } animate-fade-in transition-all duration-300`}
      >
        {/* Avatar */}
        <div 
          className={`w-9 h-9 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-sm transition-colors ${
            isUser ? 'rounded-full bg-lark-primary' : 'rounded-lg bg-white dark:bg-slate-950 border border-lark-border dark:border-slate-800'
          } ${agentInfo ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (agentInfo) {
              openAgentProfile(agentInfo.id);
            }
          }}
        >
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : agentInfo ? (
            <img
              src={agentInfo.avatar}
              alt={message.senderName}
              className="w-full h-full object-cover"
            />
          ) : isOrchestrator ? (
            <Sparkles className="w-4 h-4 text-indigo-600" />
          ) : (
            <Bot className="w-4 h-4 text-lark-text-secondary" />
          )}
        </div>

        {/* Bubble Container */}
        <div className={`flex-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col min-w-0 max-w-[75%] relative`}>
          {isUser ? (
            <div className="text-[11px] text-lark-text-secondary mb-1 mr-1 font-medium flex items-center gap-1.5 justify-end select-none">
              <span className="text-[11px] text-slate-400 font-mono font-normal mr-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{timeText}</span>
              <span>{message.senderName || '用户'}</span>
            </div>
          ) : (
            message.senderName && (
              <div className="text-[11px] text-lark-text-secondary mb-1 ml-1 font-medium flex items-center gap-1.5 select-none">
                <span>{message.senderName}</span>
                {isOrchestrator && (
                  <span className="text-[9px] px-1 bg-indigo-50 text-indigo-700 rounded font-normal scale-90 origin-left border border-indigo-100">智能调度</span>
                )}
                <span className="text-[11px] text-slate-400 font-mono font-normal ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{timeText}</span>
              </div>
            )
          )}

          <div className={`w-full flex flex-col gap-1.5 relative ${isUser ? 'items-end' : 'items-start'}`}>
            {message.quotedMessage && (
              <div 
                onClick={handleQuoteClick}
                className={`${isUser ? 'w-auto self-end max-w-[90%]' : 'w-full self-stretch'} p-2 bg-slate-50 dark:bg-slate-900 border-l-2 border-slate-300 dark:border-slate-700 rounded-r-lg text-[10px] text-slate-500 dark:text-slate-400 mb-1 flex flex-col gap-0.5 select-none shadow-sm cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-850 hover:border-slate-400 dark:hover:border-slate-650 transition-all`}
                title="点击跳转到被引用的原始消息"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">回复 @{message.quotedMessage.senderName}：</span>
                  <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-medium">点击跳转</span>
                </div>
                <span className="truncate">{message.quotedMessage.content}</span>
              </div>
            )}

            {/* 2. Artifact Reference snippet if exists */}
            {message.artifactRef && (
              <div 
                onClick={handleRefClick}
                className={`${isUser ? 'w-auto self-end max-w-[90%]' : 'w-full self-stretch'} p-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl mb-1 cursor-pointer hover:bg-slate-800 hover:border-slate-700 transition-all select-none shadow-md flex flex-col gap-1.5`}
                title="点击在右侧定位此行代码"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold border-b border-slate-800 pb-1">
                  <div className="flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                    <span>引用产物 {message.artifactRef.artifactTitle} (v{message.artifactRef.version})</span>
                  </div>
                  {message.artifactRef.startLine && (
                    <span className="flex items-center gap-1 px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] border border-slate-700">
                      L{message.artifactRef.startLine}
                      {message.artifactRef.endLine && message.artifactRef.endLine !== message.artifactRef.startLine && ` - L${message.artifactRef.endLine}`}
                    </span>
                  )}
                </div>
                <pre className="text-[10px] font-mono leading-relaxed truncate px-1 text-emerald-400/90 whitespace-pre-wrap max-h-16 overflow-hidden">
                  {message.artifactRef.quotedText}
                </pre>
                <div className="flex items-center gap-1 text-[9px] text-lark-primary hover:text-lark-primary-hover font-semibold self-end">
                  <Navigation className="w-2.5 h-2.5 rotate-45" />
                  <span>定位源码</span>
                </div>
              </div>
            )}

            {/* 3. Main Message bubble content - only show if has content */}
            {shouldShowBubble && (
              <div 
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleBubbleClick}
                className={`relative group/bubble-content max-w-full cursor-pointer lg:cursor-default ${
                  isBlockType 
                    ? 'w-full self-stretch' 
                    : isUser 
                      ? 'self-end w-fit' 
                      : 'self-start w-fit'
                }`}
              >
                {/* Golden Pin Badge (Clickable to Unpin) */}
                {message.isPinned && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePin(e);
                    }}
                    className={`absolute -top-2 ${isUser ? '-left-2' : '-right-2'} bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-650 border border-amber-500 text-white rounded-full p-1 shadow-[0_0_8px_rgba(245,158,11,0.45)] z-20 flex items-center justify-center transition-all hover:scale-110 active:scale-95 animate-bounce-subtle`}
                    title="点击取消 Pin"
                  >
                    <Pin className="w-3 h-3 fill-white text-white" />
                  </button>
                )}

                <div 
                  onMouseEnter={() => setIsHoveringBar(true)}
                  onMouseLeave={() => setIsHoveringBar(false)}
                  style={{ top: mouseY !== null ? `${mouseY}px` : '8px' }}
                  className={`absolute opacity-0 group-hover/bubble-content:opacity-100 transition-opacity duration-150 flex items-center gap-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-md rounded-lg p-1 z-30 transition-colors
                    ${isUser 
                      ? 'right-full mr-3 after:absolute after:-right-4 after:top-0 after:bottom-0 after:w-4 after:content-[\'\']' 
                      : 'left-full ml-3 before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-[\'\']'}
                    max-lg:!-top-9 max-lg:left-1/2 max-lg:-translate-x-1/2 max-lg:right-auto max-lg:mr-0 max-lg:ml-0 max-lg:before:hidden max-lg:after:hidden
                    ${showTouchActions ? 'opacity-100 pointer-events-auto' : ''}`}
                >
                  <button
                    onClick={handleReply}
                    className="p-1 rounded text-slate-400 hover:text-lark-primary hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="回复此消息"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handlePin}
                    className={`p-1 rounded transition-colors ${
                      message.isPinned 
                        ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40' 
                        : 'text-slate-400 hover:text-amber-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
                    }`}
                    title={message.isPinned ? "取消 Pin 长期记忆" : "Pin 为长期记忆"}
                  >
                    <Pin className={`w-3.5 h-3.5 ${message.isPinned ? 'fill-amber-500 text-amber-600' : ''}`} />
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded text-slate-400 hover:text-lark-primary hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="复制消息内容"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Main Content Box */}
                {isBlockType ? (
                  <div className={`w-full self-stretch transition-all duration-300 ${
                    message.isPinned 
                      ? 'shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/25 rounded-xl border border-amber-300 p-1 bg-amber-50/20' 
                      : ''
                  }`}>
                    {renderContent()}
                  </div>
                ) : (
                  <div className={`px-4 py-2.5 rounded-xl text-sm leading-relaxed shadow-sm transition-all duration-300 ${
                    message.isPinned
                      ? `bg-amber-50/60 dark:bg-amber-950/15 border border-amber-300 dark:border-amber-900 text-lark-text-primary dark:text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/20 ${
                          isUser ? 'rounded-tr-none' : 'rounded-tl-none'
                        }`
                      : isUser 
                        ? 'bg-[#deebff] dark:bg-violet-950/40 text-lark-text-primary dark:text-violet-300 rounded-tr-none border border-[#c3dbff] dark:border-violet-900/50' 
                        : isOrchestrator
                          ? 'bg-[#f5f5fc] dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950/60 text-lark-text-primary dark:text-slate-100 rounded-tl-none shadow-[0_0_12px_rgba(99,102,241,0.05)]'
                          : 'bg-white dark:bg-slate-950 border border-lark-border dark:border-slate-800 text-lark-text-primary dark:text-slate-100 rounded-tl-none'
                  }`}>
                    {renderContent()}
                  </div>
                )}
              </div>
            )}

            {/* 4. Attachment Cards if exists - user attachments should be right-aligned */}
              {hasAttachments && message.attachments && (
                <div className={`flex flex-col gap-1.5 mt-1 ${isUser ? 'self-end' : 'self-start'}`}>
                  {message.attachments.map((attach) => (
                    <AttachmentCard key={attach.id} attachment={attach} isUser={isUser} />
                  ))}
                </div>
              )}

            {/* 5. Web Search V1 Results & Error indicators */}
            {!isUser && message.metadata?.webSearch && (
              <>
                {message.metadata.webSearch.error && (
                  <div className="text-[10px] text-rose-500/85 dark:text-rose-400/85 font-semibold mt-1.5 flex items-center gap-1 select-none bg-rose-50/40 dark:bg-rose-950/10 border border-rose-200/50 dark:border-rose-900/30 px-2 py-0.5 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                    <span>联网搜索失败 ({message.metadata.webSearch.error})，已使用普通回复</span>
                  </div>
                )}

                {message.metadata.webSearch.used && message.metadata.webSearch.results && message.metadata.webSearch.results.length > 0 && (
                  <div className="mt-2 w-full self-stretch bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 rounded-xl p-3 shadow-xs animate-fade-in flex flex-col gap-2">
                    {/* Header */}
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-450 select-none uppercase tracking-wider">
                      <Globe className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
                      <span>已联网搜索: "{message.metadata.webSearch.query}"</span>
                      <span className="text-[9px] opacity-75 font-normal ml-auto text-slate-400 bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded-sm">
                        {message.metadata.webSearch.results.length} 个来源
                      </span>
                    </div>
                    
                    {/* Results List */}
                    <div className="flex flex-wrap gap-2">
                      {message.metadata.webSearch.results.map((result: any, idx: number) => (
                        <a
                          key={idx}
                          href={result.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/source relative flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-850 hover:border-emerald-500/30 hover:ring-1 hover:ring-emerald-500/10 rounded-lg text-[10px] font-medium text-slate-600 dark:text-slate-350 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-xs truncate max-w-[220px]"
                        >
                          <span className="w-4 h-4 rounded-md bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-[9px] font-bold text-slate-400 dark:text-slate-550 border border-slate-200/40 dark:border-slate-850 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate flex-1 font-sans">{result.title}</span>
                          
                          {/* Body Tooltip on Hover */}
                          {result.body && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/source:block z-40 bg-slate-900 text-white text-[9.5px] p-2.5 rounded-xl shadow-xl w-64 whitespace-normal border border-slate-850 leading-normal">
                              <div className="font-bold text-emerald-400 mb-1">{result.title}</div>
                              <div className="text-slate-300">{result.body}</div>
                              <div className="text-[8px] text-slate-500 font-mono mt-1.5 truncate">{result.href}</div>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return bubbleLayout();
};

export default MessageBubble;
