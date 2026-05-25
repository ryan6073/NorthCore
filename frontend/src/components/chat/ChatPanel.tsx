import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Conversation, Message, Agent, Artifact, MessageAttachment, AgentMentionItem } from '@/types';
import MessageBubble from './MessageBubble';
import { Send, Paperclip, Smile, GripVertical, X, FileCode, Scissors, Brain, Pin, Trash2, ArrowUpRight } from 'lucide-react';
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

  const getMentionAgents = useAgentHubStore(state => state.getMentionAgents);
  const compressContext = useAgentHubStore(state => state.compressContext);

  const replyContext = useAgentHubStore(state => state.replyContext);
  const setReplyContext = useAgentHubStore(state => state.setReplyContext);
  const quoteArtifactRef = useAgentHubStore(state => state.quoteArtifactRef);
  const setQuoteArtifactRef = useAgentHubStore(state => state.setQuoteArtifactRef);

  const pins = useAgentHubStore(state => state.pins);
  const memories = useAgentHubStore(state => state.memories);
  const deleteMemory = useAgentHubStore(state => state.deleteMemory);
  const togglePinMessage = useAgentHubStore(state => state.togglePinMessage);

  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memoryTab, setMemoryTab] = useState<'pins' | 'memories'>('pins');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : null;
  const messagesLength = messages.length;
  const conversationId = conversation?.id;

  useEffect(() => {
    scrollToBottom();
  }, [conversationId, messagesLength, lastMessageId, lastMessageContent]);

  const renameConversation = useAgentHubStore(state => state.renameConversation);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const activeAgents = conversation
    ? agents.filter(a => conversation.agentIds.includes(a.id))
    : [];

  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionCandidates, setMentionCandidates] = useState<AgentMentionItem[]>([]);
  const lastSearchKeyword = useRef('$$__INITIAL__$$');

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

  useEffect(() => {
    if (!showMentionPopup) {
      lastSearchKeyword.current = '$$__INITIAL__$$';
      return;
    }
    if (lastSearchKeyword.current === mentionSearch) return;
    lastSearchKeyword.current = mentionSearch;

    (async () => {
      const results = await getMentionAgents(mentionSearch || undefined);
      setMentionCandidates(results);
    })();
  }, [showMentionPopup, mentionSearch, getMentionAgents]);

  const selectMention = (agentName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const text = inputValue;
    const lastAtIdx = text.substring(0, cursor).lastIndexOf('@');
    if (lastAtIdx === -1) return;

    const before = text.substring(0, lastAtIdx);
    const after = text.substring(cursor);
    const newValue = `${before}@${agentName} ${after}`;

    setInputValue(newValue);
    setShowMentionPopup(false);
    lastSearchKeyword.current = '$$__INITIAL__$$';

    setTimeout(() => {
      textarea.focus();
      const newCursor = lastAtIdx + agentName.length + 2;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

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
    if (showMentionPopup && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectMention(mentionCandidates[mentionIndex].name);
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
      {(showEmojiPicker || showMentionPopup) && (
        <div className="fixed inset-0 z-50 bg-transparent" onClick={() => {
          setShowEmojiPicker(false);
          setShowMentionPopup(false);
        }} />
      )}

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

      {showMentionPopup && mentionCandidates.length > 0 && (
        <div className="absolute bottom-[200px] left-4 z-[60] bg-white border border-lark-border rounded-xl shadow-2xl w-60 max-h-52 overflow-y-auto p-1.5 animate-scale-in">
          <div className="text-[10px] text-lark-text-tertiary px-2 py-1 font-semibold">选择要 @ 的 Agent</div>
          {mentionCandidates.map((agent, idx) => (
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

          {/* Stacked Participating Agent Avatars */}
          {conversation && activeAgents.length > 0 && (
            <div className="flex items-center -space-x-1.5 overflow-hidden ml-3 hidden sm:flex select-none">
              {activeAgents.map(agent => (
                <img
                  key={agent.id}
                  className="inline-block h-5 w-5 rounded-full ring-2 ring-white object-cover"
                  src={agent.avatar}
                  alt={agent.name}
                  title={`${agent.name} (${agent.description || agent.status})`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Multi-functional toolbar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {conversation && (
            <>
              {/* Context Compression Button */}
              <button
                onClick={compressContext}
                className="p-1.5 text-slate-500 hover:text-lark-primary hover:bg-slate-50 border border-slate-200 rounded-lg transition-all flex items-center gap-1.5 shadow-sm bg-white"
                title="压缩上下文历史以节省 token 消耗"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span className="text-xs font-medium hidden md:inline">压缩上下文</span>
              </button>

              {/* Long-term Memory Sidebar Toggle */}
              <button
                onClick={() => setShowMemoryPanel(!showMemoryPanel)}
                className={`p-1.5 border rounded-lg transition-all flex items-center gap-1.5 shadow-sm relative group
                  ${showMemoryPanel 
                    ? 'bg-amber-50 border-amber-200 text-amber-700 font-semibold shadow-inner' 
                    : 'bg-white border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50/30'
                  }`}
                title="查看会话长期记忆与 Pin 消息"
              >
                <Brain className={`w-3.5 h-3.5 ${showMemoryPanel ? 'text-amber-600 animate-pulse' : ''}`} />
                <span className="text-xs font-medium hidden md:inline">长期记忆</span>
                {pins.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                    {pins.length}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="flex-grow flex min-h-0 relative bg-[#fafbfb] z-10">
        {/* Messages List Area */}
        <div className="flex-grow overflow-y-auto px-6 py-5 min-h-0 space-y-4 transition-all duration-300">
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

        {/* Long-term Memory Panel (Slide-out Sidebar) */}
        {showMemoryPanel && (
          <div className="w-80 border-l border-lark-border bg-white flex flex-col z-20 flex-shrink-0 animate-slide-left shadow-xl">
            {/* Panel Header */}
            <div className="px-4 py-3 border-b border-lark-border flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-slate-800">会话长期记忆</span>
              </div>
              <button 
                onClick={() => setShowMemoryPanel(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                title="关闭侧边栏"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-lark-border px-2 pt-2 bg-slate-50/20 flex-shrink-0 select-none">
              <button
                onClick={() => setMemoryTab('pins')}
                className={`flex-1 pb-2 text-xs font-semibold text-center border-b-2 transition-all
                  ${memoryTab === 'pins' 
                    ? 'border-amber-500 text-amber-600 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                已 Pin 消息 ({pins.length})
              </button>
              <button
                onClick={() => setMemoryTab('memories')}
                className={`flex-1 pb-2 text-xs font-semibold text-center border-b-2 transition-all
                  ${memoryTab === 'memories' 
                    ? 'border-amber-500 text-amber-600 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                提取的记忆 ({memories.length})
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fafbfb]">
              {memoryTab === 'pins' ? (
                pins.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
                    <Pin className="w-8 h-8 stroke-1 mb-2 text-slate-300" />
                    <p className="text-xs">暂无已 Pin 消息</p>
                    <p className="text-[10px] text-slate-400 mt-1">悬停于气泡旁在悬浮菜单点击 Pin</p>
                  </div>
                ) : (
                  pins.map(pin => {
                    const senderImg = pin.message.role === 'user' ? null : agents.find(a => a.name === pin.message.senderName)?.avatar;
                    const isUserRole = pin.message.role === 'user';
                    
                    return (
                      <div 
                        key={pin.id} 
                        className="p-3 bg-white border border-lark-border rounded-xl shadow-sm hover:border-amber-300 transition-all group/pin-item flex flex-col gap-2 relative"
                      >
                        {/* Sender info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
                              {isUserRole ? (
                                <span className="text-[10px] font-bold text-white bg-lark-primary w-full h-full flex items-center justify-center">U</span>
                              ) : senderImg ? (
                                <img src={senderImg} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-bold text-white bg-indigo-500 w-full h-full flex items-center justify-center">A</span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-700 truncate">{pin.message.senderName || '用户'}</span>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover/pin-item:opacity-100 transition-opacity">
                            {/* Go to message */}
                            <button
                              onClick={() => {
                                const element = document.getElementById(`msg-${pin.messageId}`);
                                if (element) {
                                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  element.classList.add('animate-highlight-flash');
                                  setTimeout(() => {
                                    element.classList.remove('animate-highlight-flash');
                                  }, 1500);
                                }
                              }}
                              className="p-1 hover:bg-slate-100 hover:text-lark-primary rounded text-slate-400 transition-colors"
                              title="在聊天中定位"
                            >
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                            {/* Unpin */}
                            <button
                              onClick={() => togglePinMessage(pin.messageId)}
                              className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-slate-400 transition-colors"
                              title="取消 Pin"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Snippet content */}
                        <div className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-wrap font-sans bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                          {pin.message.content}
                        </div>
                        <div className="text-[9px] text-slate-400 text-right font-mono select-none">
                          {pin.createdAt.split(' ')[1] || pin.createdAt}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                memories.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
                    <Brain className="w-8 h-8 stroke-1 mb-2 text-slate-300" />
                    <p className="text-xs">暂无提取的记忆</p>
                    <p className="text-[10px] text-slate-400 mt-1">系统会自动分析并提取会话中关键信息</p>
                  </div>
                ) : (
                  memories.map(mem => {
                    const categoryLabels: Record<string, { label: string, color: string }> = {
                      constraint: { label: '开发约束', color: 'bg-red-50 text-red-700 border-red-100' },
                      project: { label: '项目信息', color: 'bg-blue-50 text-blue-700 border-blue-100' },
                      preference: { label: '用户偏好', color: 'bg-green-50 text-green-700 border-green-100' },
                      profile: { label: '基本属性', color: 'bg-purple-50 text-purple-700 border-purple-100' }
                    };
                    const badge = categoryLabels[mem.category] || { label: '其他记忆', color: 'bg-slate-50 text-slate-700 border-slate-100' };

                    return (
                      <div 
                        key={mem.id} 
                        className="p-3 bg-white border border-lark-border rounded-xl shadow-sm hover:border-amber-300 transition-all group/mem-item flex flex-col gap-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 border rounded-md ${badge.color}`}>
                            {badge.label}
                          </span>
                          <button
                            onClick={() => deleteMemory(mem.id)}
                            className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-slate-400 transition-colors opacity-0 group-hover/mem-item:opacity-100 transition-opacity"
                            title="删除记忆"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed font-sans">
                          {mem.content}
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-400 select-none">
                          <span>置信度: {(mem.confidence * 100).toFixed(0)}%</span>
                          <span>{mem.createdAt.split(' ')[0]}</span>
                        </div>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        )}
      </div>
      
      <div 
        className="flex-shrink-0 bg-white" 
        style={{ height: inputAreaHeight }}
      >
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

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              multiple 
              className="hidden" 
            />

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

            <div className="flex-1 p-2 bg-transparent flex flex-row items-end gap-2 min-h-0 overflow-hidden">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，输入 @ 唤起 Agent 选择器..."
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
