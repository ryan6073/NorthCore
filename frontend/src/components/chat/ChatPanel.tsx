import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Conversation, Message, Agent, Artifact } from '@/types';
import MessageBubble from './MessageBubble';
import { Send, Paperclip, Smile, GripVertical } from 'lucide-react';

interface ChatPanelProps {
  conversation: Conversation | undefined;
  agents: Agent[];
  messages: Message[];
  artifacts: Artifact[];
  onSendMessage: (content: string) => void;
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

const ChatPanel: React.FC<ChatPanelProps> = ({ conversation, agents, messages, artifacts: _artifacts, onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputAreaHeight, setInputAreaHeight] = useState(130);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    if (newHeight >= 90 && newHeight <= 350) {
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

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputValue('');
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  return (
    <div className="flex-grow h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-lark-border bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-lark-text-primary">
            {conversation?.title || '选择一个会话'}
          </h2>
          {conversation && (
            <span className={`text-[10px] tracking-wide px-1.5 py-0.5 rounded font-medium ${
              conversation.mode === 'single'
                ? 'bg-[#e1f9eb] text-[#00b04a]'
                : 'bg-[#f2e9fc] text-[#7f3ec8]'
            }`}>
              {conversation.mode === 'single' ? '单聊' : '群聊'}
            </span>
          )}
        </div>
      </div>
      
      {/* Message Area */}
      <div className="flex-grow overflow-y-auto px-6 py-5 bg-[#fafbfb] min-h-0 space-y-4">
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
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} agents={agents} />
          ))
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

        <div className="flex-1 p-4 pt-1 border-t border-lark-border bg-white h-full flex flex-col">
          <div className="border border-lark-border hover:border-lark-border/80 focus-within:border-lark-primary focus-within:ring-2 focus-within:ring-lark-primary/10 rounded-xl bg-white transition-all flex flex-col relative z-20 flex-1 min-h-0">
            {/* Input Area Toolbar (Top of the Input Box) */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/50 border-b border-lark-border/30 rounded-t-xl relative flex-shrink-0">
              <button 
                type="button"
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
                {showEmojiPicker && (
                  <>
                    <div 
                      className="fixed inset-0 z-20 bg-transparent" 
                      onClick={() => setShowEmojiPicker(false)} 
                    />
                    <div className="absolute bottom-full left-0 mb-2 p-3 bg-white border border-lark-border rounded-xl shadow-xl z-30 w-72 max-h-52 overflow-y-auto select-none animate-scale-in">
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
                  </>
                )}
              </div>
              
              <div className="w-[1px] h-3 bg-lark-border/60 mx-1" />
              <span className="text-[10px] text-lark-text-tertiary">Shift + Enter 换行</span>
            </div>

            {/* Text Area - 发送按钮在右下方，右边界与容器右边界对齐 */}
            <div className="flex-1 p-2 bg-transparent flex flex-col min-h-0">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，发送任务..."
                rows={2}
                className="w-full px-2 py-1 text-sm outline-none resize-none text-lark-text-primary placeholder:text-lark-text-tertiary bg-transparent flex-1 min-h-0"
              />
              <div className="flex justify-end mt-1">
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all flex-shrink-0 active:scale-95 ${
                    inputValue.trim()
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
    </div>
  );
};

export default ChatPanel;
