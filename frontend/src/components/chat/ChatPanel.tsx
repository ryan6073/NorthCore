import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Conversation, Message, Agent, Artifact, MessageAttachment } from '@/types';
import MessageBubble from './MessageBubble';
import { Send, Paperclip, Smile, GripVertical, X, FileCode, Scissors } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface ChatPanelProps {
  conversation: Conversation | undefined;
  agents: Agent[];
  messages: Message[];
  artifacts: Artifact[];
  onSendMessage: (content: string, attachments?: MessageAttachment[], targetAgentId?: string) => void;
}

const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', 
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', 
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', 
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', 
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', 
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', 
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', 
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', 
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👋', 
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤝', '🙌', '👏', '🙏', 
  '🔥', '🎉', '💡', '🚀', '💻', '❤️', '✨', '🌟', '👀', '💯'
];

const getFriendlyDateLabel = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const datePart = timeStr.split(' ')[0].replace(/\//g, '-');
    const parts = datePart.split('-');
    
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    
    if (isNaN(d.getTime())) return datePart;
    
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDay(d, today)) {
      return '今天';
    } else if (isSameDay(d, yesterday)) {
      return '昨天';
    } else {
      return `${parts[0]}年${parts[1]}月${parts[2]}日`;
    }
  } catch (e) {
    return timeStr.split(' ')[0] || timeStr;
  }
};

const normalizeDatePart = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const datePart = timeStr.split(' ')[0].replace(/\//g, '-');
    const parts = datePart.split('-');
    if (parts.length < 3) return datePart;
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  } catch (e) {
    return timeStr.split(' ')[0] || timeStr;
  }
};

const ChatPanel: React.FC<ChatPanelProps> = ({ conversation, agents, messages, artifacts: _artifacts, onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [inputAreaHeight, setInputAreaHeight] = useState(180);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const lastNotifiedAgentIdRef = useRef<string | null>(null);

  const notifyMentionAgent = useAgentHubStore(state => state.notifyMentionAgent);
  const compressContext = useAgentHubStore(state => state.compressContext);

  const replyContext = useAgentHubStore(state => state.replyContext);
  const setReplyContext = useAgentHubStore(state => state.setReplyContext);
  const quoteArtifactRef = useAgentHubStore(state => state.quoteArtifactRef);
  const setQuoteArtifactRef = useAgentHubStore(state => state.setQuoteArtifactRef);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const renameConversation = useAgentHubStore(state => state.renameConversation);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    if (conversation) {
      setEditedTitle(conversation.title);
    }
    setIsEditingTitle(false);
  }, [conversation]);

  const handleSaveTitle = () => {
    if (conversation && editedTitle.trim() && editedTitle !== conversation.title) {
      renameConversation(conversation.id, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const filteredMentionAgents = useMemo(() => {
    return agents.filter(a => 
      a.id !== 'agent-orchestrator' &&
      a.name.toLowerCase().includes(mentionSearch.toLowerCase())
    );
  }, [agents, mentionSearch]);

  const selectMention = (agentName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const text = inputValue;
    const lastAtIdx = text.substring(0, cursor).lastIndexOf('@');
    if (lastAtIdx === -1) return;

    const targetAgent = agents.find(a => a.name === agentName);
    if (targetAgent && conversation) {
      // 选中Agent时，立即向后端发送通知
      if (lastNotifiedAgentIdRef.current !== targetAgent.id) {
        lastNotifiedAgentIdRef.current = targetAgent.id;
        notifyMentionAgent(targetAgent.id);
      }
    }

    const before = text.substring(0, lastAtIdx);
    const after = text.substring(cursor);
    const newValue = `${before}@${agentName} ${after}`;

    setInputValue(newValue);
    setShowMentionPopup(false);

    setTimeout(() => {
      textarea.focus();
      const newCursor = lastAtIdx + agentName.length + 2;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // 检查当前文本里最后一个 @ 后面是否还有合法的 Agent 引用
    const matches = [...value.matchAll(/@([^\s]+)/g)];
    if (matches.length === 0) {
      // 没有任何 @ 了，重置通知标记
      lastNotifiedAgentIdRef.current = null;
    } else {
      // 检查最后一个 match 的名字是否匹配当前 agents 中的任何一个
      const lastName = matches[matches.length - 1][1];
      const foundAgent = agents.find(a => a.name === lastName);
      if (!foundAgent) {
        // 不再是已选中的 Agent 名字，重置标记
        lastNotifiedAgentIdRef.current = null;
      }
    }

    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1 && !textBeforeCursor.substring(lastAtIdx, cursor).includes(' ')) {
      const search = textBeforeCursor.substring(lastAtIdx + 1, cursor);
      setMentionSearch(search);
      setShowMentionPopup(true);
      setMentionIndex(0);
    } else {
      setShowMentionPopup(false);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = inputAreaHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    const newHeight = startHeight.current + deltaY;
    if (newHeight >= 150 && newHeight <= 350) {
      setInputAreaHeight(newHeight);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  const parseTargetAgentId = useCallback((inputText: string) => {
    const matches = [...inputText.matchAll(/@([^\s]+)/g)];
    if (matches.length === 0) return null;
    const lastName = matches[matches.length - 1][1];
    const found = agents.find(a => a.name === lastName);
    return found ? found.id : null;
  }, [agents]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    const targetAgentId = parseTargetAgentId(trimmed);
    onSendMessage(trimmed, pendingAttachments, targetAgentId || undefined);
    setInputValue('');
    setPendingAttachments([]);
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPopup && filteredMentionAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMentionAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMentionAgents.length) % filteredMentionAgents.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectMention(filteredMentionAgents[mentionIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionPopup(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      setInputValue(before + emoji + after);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setInputValue(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: MessageAttachment[] = Array.from(files).map(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const isPpt = file.name.endsWith('.ppt') || file.name.endsWith('.pptx');
      
      let type: 'image' | 'pdf' | 'ppt' | 'other' = 'other';
      if (isImage) type = 'image';
      else if (isPdf) type = 'pdf';
      else if (isPpt) type = 'ppt';

      const url = URL.createObjectURL(file);
      
      return {
        id: `attach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type,
        url,
        size: file.size,
        meta: type === 'pdf' ? { pages: Math.floor(Math.random() * 20) + 5 } : undefined
      };
    });
    
    setPendingAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasHeader = !!replyContext || !!quoteArtifactRef || pendingAttachments.length > 0;
  const canSend = inputValue.trim() || pendingAttachments.length > 0;

  const renderMessageList = () => {
    let lastDateLabel = '';
    
    return messages.map((msg) => {
      const msgDateLabel = msg.createdAt ? normalizeDatePart(msg.createdAt) : '';
      const showDivider = msgDateLabel && msgDateLabel !== lastDateLabel;
      if (showDivider) {
        lastDateLabel = msgDateLabel;
      }
      
      const friendlyLabel = showDivider ? getFriendlyDateLabel(msg.createdAt) : '';

      return (
        <React.Fragment key={msg.id}>
          {showDivider && (
            <div className="flex items-center justify-center my-6 select-none animate-fade-in w-full">
              <div className="h-[1px] bg-slate-200/80 flex-grow" />
              <span className="bg-slate-100 text-lark-text-secondary text-[10px] font-semibold px-3 py-1 rounded-full border border-lark-border/60 mx-4 shadow-sm">
                {friendlyLabel}
              </span>
              <div className="h-[1px] bg-slate-200/80 flex-grow" />
            </div>
          )}
          <MessageBubble message={msg} agents={agents} />
        </React.Fragment>
      );
    });
  };

  return (
    <div className="flex-grow h-full flex flex-col bg-white relative z-0">
      {/* 最高层级弹窗区域 - 解决覆盖问题 */}
      {(showEmojiPicker || showMentionPopup) && (
        <div className="fixed inset-0 z-50 bg-transparent" onClick={() => {
          setShowEmojiPicker(false);
          setShowMentionPopup(false);
        }} />
      )}

      {/* 表情选择器 */}
      {showEmojiPicker && (
        <div className="absolute bottom-[200px] left-4 z-[60] mb-2 p-3 bg-white border border-lark-border rounded-xl shadow-2xl w-72 max-h-52 overflow-y-auto select-none animate-scale-in">
          <div className="text-[10px] text-lark-text-tertiary mb-1.5 font-semibold">常用表情</div>
          <div className="grid grid-cols-8 gap-1">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center text-sm rounded-md hover:bg-lark-bg-hover active:scale-90 transition-all"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* @提及选择器 */}
      {showMentionPopup && filteredMentionAgents.length > 0 && (
        <div className="absolute bottom-[200px] left-4 z-[60] bg-white border border-lark-border rounded-xl shadow-2xl w-60 max-h-52 overflow-y-auto p-1.5 animate-scale-in">
          <div className="text-[10px] text-lark-text-tertiary px-2 py-1 font-semibold">选择要 @ 的 Agent</div>
          {filteredMentionAgents.map((agent, idx) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => selectMention(agent.name)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                idx === mentionIndex
                  ? 'bg-lark-primary-light text-lark-primary font-medium'
                  : 'hover:bg-lark-bg-hover text-lark-text-primary'
              }`}
            >
              <img src={agent.avatar} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0 bg-slate-100" />
              <span className="truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-lark-border bg-white flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 flex-grow max-w-sm">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setEditedTitle(conversation?.title || '');
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="text-xs font-semibold text-lark-text-primary px-2 py-0.5 border border-lark-primary rounded-lg focus:outline-none focus:ring-1 focus:ring-lark-primary flex-grow"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 max-w-full">
              <h2 
                className="text-sm font-semibold text-lark-text-primary truncate cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded transition-colors"
                onClick={() => {
                  if (conversation) {
                    setEditedTitle(conversation.title);
                    setIsEditingTitle(true);
                  }
                }}
                title="点击重命名会话"
              >
                {conversation?.title || '选择一个会话'}
              </h2>
              {conversation && (
                <button
                  onClick={() => {
                    setEditedTitle(conversation.title);
                    setIsEditingTitle(true);
                  }}
                  className="p-1 text-slate-400 hover:text-lark-primary hover:bg-lark-bg-hover rounded transition-colors"
                  title="重命名会话"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {conversation && (
            <span className={`text-[10px] tracking-wide px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
              conversation.mode === 'single'
                ? 'bg-[#e1f9eb] text-[#00b04a]'
                : 'bg-[#f2e9fc] text-[#7f3ec8]'
            }`}>
              {conversation.mode === 'single' ? '单聊' : '群聊'}
            </span>
          )}
        </div>
        {/* 右侧操作按钮区域 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {conversation && (
            <button
              onClick={compressContext}
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 group"
              title="压缩上下文"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium hidden sm:inline">压缩上下文</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Message Area */}
      <div className="flex-grow overflow-y-auto px-6 py-5 bg-[#fafbfb] min-h-0 space-y-4 z-10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-lark-primary-light flex items-center justify-center mb-4 text-lark-primary">
              <Smile className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-lark-text-primary mb-1">开始与 Agent 协作</h3>
            <p className="text-xs text-lark-text-secondary leading-relaxed">
              在此发送你的开发需求或指令，Orchestrator 将会自动分析，分发任务给对应 Agent 并输出代码或文档产物。
            </p>
          </div>
        ) : (
          renderMessageList()
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area with Resizable Handle */}
      <div 
        className="flex-shrink-0 bg-white" 
        style={{ height: inputAreaHeight }}
      >
        {/* Drag Resize Handle */}
        <div
          onMouseDown={handleDragStart}
          className="h-[6px] bg-transparent hover:bg-slate-100/80 cursor-ns-resize transition-colors flex items-center justify-center group relative z-10 before:content-[''] before:absolute before:-top-2 before:bottom-2 before:left-0 before:right-0"
        >
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <GripVertical className="w-3.5 h-3.5 text-slate-300" />
          </div>
        </div>

        <div className="flex-1 p-4 pt-1 border-t border-lark-border bg-white h-full flex flex-col min-h-0 z-20">
          <div className="border border-lark-border hover:border-lark-border/80 focus-within:border-lark-primary focus-within:ring-2 focus-within:ring-lark-primary/10 rounded-xl bg-white transition-all flex flex-col relative z-30 flex-1 min-h-0 overflow-hidden">
            
            {/* 1. Reply Context Bar */}
            {replyContext && (
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50 border-b border-lark-border/40 text-[11px] text-slate-500 animate-slide-up flex-shrink-0 rounded-t-xl">
                <span className="truncate flex items-center gap-1 min-w-0">
                  <span className="font-semibold text-slate-700 flex-shrink-0">回复 @{replyContext.senderName}：</span>
                  <span className="truncate text-slate-500">{replyContext.content}</span>
                </span>
                <button 
                  type="button"
                  onClick={() => setReplyContext(null)} 
                  className="text-slate-400 hover:text-slate-600 p-0.5 hover:bg-slate-200/50 rounded-full transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 2. Artifact Reference Bar */}
            {quoteArtifactRef && (
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50 border-b border-lark-border/40 text-[11px] text-slate-500 animate-slide-up flex-shrink-0 rounded-t-xl">
                <span className="truncate flex items-center gap-2 min-w-0">
                  <FileCode className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="font-semibold text-slate-700 flex-shrink-0">引用产物 {quoteArtifactRef.artifactTitle} (v{quoteArtifactRef.version})</span>
                  {quoteArtifactRef.startLine && (
                    <span className="bg-emerald-50 text-emerald-700 px-1 rounded text-[9px] border border-emerald-100 font-mono flex-shrink-0">
                      L{quoteArtifactRef.startLine}{quoteArtifactRef.endLine && quoteArtifactRef.endLine !== quoteArtifactRef.startLine && ` - L${quoteArtifactRef.endLine}`}
                    </span>
                  )}
                  <span className="text-slate-400 font-mono italic truncate">"{quoteArtifactRef.quotedText}"</span>
                </span>
                <button 
                  type="button"
                  onClick={() => setQuoteArtifactRef(null)} 
                  className="text-slate-400 hover:text-slate-600 p-0.5 hover:bg-slate-200/50 rounded-full transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 3. Pending Attachments Bar */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3.5 py-1.5 bg-slate-50/50 border-b border-lark-border/40 flex-shrink-0 select-none max-h-16 overflow-y-auto">
                {pendingAttachments.map((attach) => (
                  <div key={attach.id} className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-lark-border rounded-lg text-xs shadow-sm max-w-[180px]">
                    <span className="truncate flex-1 text-slate-600 font-medium text-[10px]">{attach.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== attach.id))}
                      className="text-slate-400 hover:text-red-500 p-0.5 rounded-full hover:bg-slate-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Hidden File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              multiple 
              className="hidden" 
            />

            {/* Input Area Toolbar (Top of the Input Box) */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/50 border-b border-lark-border/30 relative flex-shrink-0 ${hasHeader ? '' : 'rounded-t-xl'}`}>
              <button 
                type="button"
                onClick={handleFileClick}
                className="p-1 rounded-lg text-lark-text-secondary hover:text-lark-primary hover:bg-lark-bg-hover transition-colors"
                title="添加附件"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-1 rounded-lg transition-colors ${showEmojiPicker ? 'text-lark-primary bg-lark-primary-light' : 'text-lark-text-secondary hover:text-lark-primary hover:bg-lark-bg-hover'}`}
                  title="表情符号"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="w-[1px] h-3 bg-lark-border/60 mx-1" />
              <span className="text-[10px] text-lark-text-tertiary">Shift + Enter 换行</span>
            </div>

            {/* Text Area - 发送按钮在右侧，横向排列防止挤压 */}
            <div className="flex-1 p-2 bg-transparent flex flex-row items-end gap-2 min-h-0 overflow-hidden">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，发送任务..."
                className="w-full px-2 py-1.5 text-sm outline-none resize-none text-lark-text-primary placeholder:text-lark-text-tertiary bg-transparent flex-1 h-full min-h-[36px]"
              />
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all flex-shrink-0 active:scale-95 mb-0.5 ${
                  canSend
                    ? 'bg-lark-primary text-white shadow-sm hover:bg-lark-primary-hover'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
