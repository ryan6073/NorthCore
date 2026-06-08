import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, Agent as AgentType } from '@/types';
import { User, Bot, Sparkles, CornerUpLeft, Pin, Copy, Check, Navigation, FileCode, Globe } from 'lucide-react';
import CodeBlock from './CodeBlock';
import TaskPlanCard from './TaskPlanCard';
import ArtifactMessage from './ArtifactMessage';
import AttachmentCard from './AttachmentCard';
import GroupedArtifactsCard from './GroupedArtifactsCard';
import DeploymentCard from './DeploymentCard';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface MessageBubbleProps {
  message: Message;
  agents: AgentType[];
  onCustomReply?: (msg: Message) => void;
  onCustomPin?: (msgId: string) => void;
}

const getPreciseTime = (timeStr: string) => {
  if (!timeStr) return '';
  const parts = timeStr.split(' ');
  return parts[1] || parts[0];
};

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
  const currentUser = useAgentHubStore(state => state.currentUser);
  const userAvatar = currentUser?.avatar || currentUser?.picture || '';

  const allMessages = useAgentHubStore(state => 
    state.conversationMessages[message.conversationId] || state.messages
  );

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

  if (message.metadata?.source === 'chatDeployment') {
    const deploymentMessages = allMessages.filter(m => m.metadata?.source === 'chatDeployment');
    const isLatestDeployment = deploymentMessages.length > 0 && deploymentMessages[deploymentMessages.length - 1].id === message.id;
    if (!isLatestDeployment) {
      return null;
    }
  }

  const sourceRunId = message.metadata?.sourceRunId || message.metadata?.runId;
  if (message.type === 'artifact' && sourceRunId) {
    const runArtifactMessages = allMessages.filter(
      m => 
        m.type === 'artifact' && 
        (m.metadata?.sourceRunId === sourceRunId || m.metadata?.runId === sourceRunId)
    );
    
    if (runArtifactMessages.length > 1) {
      const filePath = message.metadata?.sourceFilePath || message.content;
      const lowerPath = filePath.toLowerCase();
      
      if (lowerPath.endsWith('.css') || lowerPath.endsWith('.js') || lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) {
        const hasHtmlInGroup = runArtifactMessages.some(m => {
          const path = m.metadata?.sourceFilePath || m.content;
          return path.toLowerCase().endsWith('.html');
        });
        
        if (hasHtmlInGroup) {
          return null;
        }
      }
    }
  }

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

  const prepareMarkdownContent = (text: string) => {
    if (!text) return '';
    let result = text;
    // Sort agent names by length descending to match longer names first
    const sortedAgents = [...allAgents].sort((a, b) => b.name.length - a.name.length);
    for (const agent of sortedAgents) {
      const escapedName = agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`@${escapedName}\\b`, 'g');
      result = result.replace(regex, `[@${agent.name}](mention:${agent.id})`);
    }

    // Ensure GFM tables have a blank line before and after them if missing
    const lines = result.split('\n');
    const processedLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trim();
      if (currentLine.startsWith('|')) {
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          if (prevLine !== '' && !prevLine.startsWith('|')) {
            processedLines.push(''); // insert blank line before table
          }
        }
      } else if (currentLine !== '') {
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          if (prevLine.startsWith('|')) {
            processedLines.push(''); // insert blank line after table
          }
        }
      }
      processedLines.push(lines[i]);
    }
    result = processedLines.join('\n');

    return result;
  };

  const renderContent = () => {
    if (message.metadata?.source === 'chatDeployment') {
      return <DeploymentCard metadata={message.metadata as any} />;
    }
    if (message.type === 'artifacts') {
      return <GroupedArtifactsCard message={message} />;
    }
    if (message.metadata?.isGroupedArtifacts) {
      return <GroupedArtifactsCard message={message} />;
    }
    if (message.metadata?.summary === true) {
      return (
        <div className="bg-gradient-to-br from-indigo-50/50 to-slate-50/50 dark:from-slate-900/50 dark:to-indigo-950/20 border border-indigo-100 dark:border-indigo-950 rounded-xl p-4 my-2 w-full shadow-sm max-w-2xl relative overflow-hidden transition-colors">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-indigo-100/50 dark:border-indigo-950/50 flex-shrink-0">
            <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <span className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">协同规划总结</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed break-words overflow-x-auto text-lark-text-primary dark:text-slate-200">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a({ node, href, children, ...props }) {
                  if (href?.startsWith('mention:')) {
                    const agentId = href.split(':')[1];
                    return (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          openAgentProfile(agentId);
                        }}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer select-none"
                      >
                        {children}
                      </span>
                    );
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline" {...props}>
                      {children}
                    </a>
                  );
                }
              }}
            >
              {prepareMarkdownContent(message.content)}
            </ReactMarkdown>
          </div>
        </div>
      );
    }
    if (message.type === 'code') {
      return <CodeBlock code={message.content} language={message.language} />;
    }
    if (message.type === 'task-plan') {
      return <TaskPlanCard content={message.content} stepsData={message.metadata?.taskPlan} />;
    }
    if (message.type === 'artifact') {
      return <ArtifactMessage message={message} />;
    }
    return (
      <div className={`prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed break-words overflow-x-auto select-text ${
        isUser && !message.isPinned ? 'prose-white text-white' : 'text-slate-800 dark:text-slate-100'
      }`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a({ node, href, children, ...props }) {
              if (href?.startsWith('mention:')) {
                const agentId = href.split(':')[1];
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      openAgentProfile(agentId);
                    }}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer select-none"
                  >
                    {children}
                  </span>
                );
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline" {...props}>
                  {children}
                </a>
              );
            }
          }}
        >
          {prepareMarkdownContent(message.content)}
        </ReactMarkdown>
      </div>
    );
  };

  const isBlockType = message.type === 'code' || message.type === 'task-plan' || message.type === 'artifact' || message.type === 'artifacts' || message.metadata?.isGroupedArtifacts || message.metadata?.summary === true || message.metadata?.source === 'chatDeployment';
  const hasContent = message.content && message.content.trim().length > 0;
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const shouldShowBubble = isBlockType || hasContent;

  const bubbleLayout = () => {
    const timeText = getPreciseTime(message.createdAt);

    return (
      <div 
        id={`msg-${message.id}`} 
        className={`group relative flex gap-3.5 mb-3 w-full ${
          isUser ? 'flex-row-reverse' : ''
        } animate-fade-in transition-all duration-300`}
      >
        {/* Avatar */}
        <div 
          className={`w-9 h-9 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-md transition-all duration-300 ${
            isUser 
              ? 'rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 hover:shadow-indigo-500/20' 
              : 'rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80'
          } hover:scale-105 active:scale-95 ${agentInfo ? 'cursor-pointer' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (agentInfo) {
              openAgentProfile(agentInfo.id);
            }
          }}
        >
          {isUser ? (
            userAvatar ? (
              <img
                src={userAvatar}
                alt="用户"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-white" />
            )
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
                className={`${
                  isUser 
                    ? 'w-auto self-end max-w-[90%] bg-white/10 border-l border-white/30 text-white/80 hover:bg-white/15 hover:border-white/50' 
                    : 'w-full self-stretch bg-slate-50 dark:bg-slate-900 border-l-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100/80 dark:hover:bg-slate-850 hover:border-slate-400 dark:hover:border-slate-650'
                } p-2.5 rounded-r-xl text-[10.5px] mb-1.5 flex flex-col gap-0.5 select-none shadow-sm cursor-pointer transition-all`}
                title="点击跳转到被引用的原始消息"
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${isUser ? 'text-white' : 'text-slate-700 dark:text-slate-350'}`}>回复 @{message.quotedMessage.senderName}：</span>
                  <span className={`text-[9px] font-medium ${isUser ? 'text-blue-200/90' : 'text-indigo-500 dark:text-indigo-400'}`}>点击跳转</span>
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
                  className={`absolute opacity-0 group-hover/bubble-content:opacity-100 flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-150 dark:border-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.12)] rounded-xl p-1 z-30 transition-all duration-200 scale-95 origin-center group-hover/bubble-content:scale-100
                    ${isUser 
                      ? 'right-full mr-3 after:absolute after:-right-4 after:top-0 after:bottom-0 after:w-4 after:content-[\'\']' 
                      : 'left-full ml-3 before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-[\'\']'}
                    max-lg:!-top-9 max-lg:left-1/2 max-lg:-translate-x-1/2 max-lg:right-auto max-lg:mr-0 max-lg:ml-0 max-lg:before:hidden max-lg:after:hidden
                    ${showTouchActions ? 'opacity-100 pointer-events-auto scale-100' : ''}`}
                >
                  <button
                    onClick={handleReply}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-lark-primary hover:bg-slate-50 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all"
                    title="回复此消息"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handlePin}
                    className={`p-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all ${
                      message.isPinned 
                        ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40' 
                        : 'text-slate-400 hover:text-amber-600 hover:bg-slate-50/50 dark:hover:bg-slate-850/50'
                    }`}
                    title={message.isPinned ? "取消 Pin 长期记忆" : "Pin 为长期记忆"}
                  >
                    <Pin className={`w-3.5 h-3.5 ${message.isPinned ? 'fill-amber-500 text-amber-600' : ''}`} />
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-lark-primary hover:bg-slate-50 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all"
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
                  <div className={`px-4 py-2 rounded-2xl text-sm leading-relaxed transition-all duration-300 break-words ${
                    message.isPinned
                      ? `bg-amber-50/70 dark:bg-amber-950/15 border border-amber-300 dark:border-amber-900 text-lark-text-primary dark:text-amber-200 shadow-[0_4px_16px_rgba(245,158,11,0.12)] ring-1 ring-amber-400/20 ${
                          isUser ? 'rounded-tr-none' : 'rounded-tl-none'
                        }`
                      : isUser 
                        ? 'bg-gradient-to-br from-indigo-500 via-blue-600 to-blue-600 dark:from-indigo-600/90 dark:to-blue-600/90 text-white rounded-tr-none shadow-md shadow-blue-500/10 dark:shadow-none hover:shadow-lg hover:shadow-blue-500/15 dark:hover:shadow-none' 
                        : isOrchestrator
                          ? 'bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/20 dark:from-slate-900/80 dark:to-indigo-950/25 border border-indigo-150/70 dark:border-indigo-950/70 rounded-tl-none shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-900 transition-all duration-300'
                          : 'bg-white dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-800/80 rounded-tl-none shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300'
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
