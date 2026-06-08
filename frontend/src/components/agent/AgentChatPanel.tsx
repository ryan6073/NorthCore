import React, { useState, useRef, useEffect } from 'react';
import { Agent, Conversation, Message, MessageAttachment } from '@/types';
import { WorkspaceItem } from '@/services/http/workspaceService';
import MessageBubble from '../chat/MessageBubble';
import { ArrowLeft, Send, Paperclip, Smile, GripVertical, X, FileCode, ChevronDown, Search, Plus, Cloud, Check, Loader2 } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import workspaceService from '@/services/http/workspaceService';

interface AgentChatPanelProps {
  agent: Agent;
  conversation: Conversation;
  messages: Message[];
  onBack: () => void;
}

const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
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

const AgentChatPanel: React.FC<AgentChatPanelProps> = ({ agent, conversation, messages, onBack }) => {
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

  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isWorkspaceSubmitting, setIsWorkspaceSubmitting] = useState(false);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);

  const replyContext = useAgentHubStore(state => state.replyContext);
  const setReplyContext = useAgentHubStore(state => state.setReplyContext);
  const quoteArtifactRef = useAgentHubStore(state => state.quoteArtifactRef);
  const setQuoteArtifactRef = useAgentHubStore(state => state.setQuoteArtifactRef);
  const sendMessage = useAgentHubStore(state => state.sendMessage);
  const workspaces = useAgentHubStore(state => state.serverWorkspaces);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : null;
  const messagesLength = messages.length;

  const lastScrolledConvId = useRef<string | undefined>(undefined);

  // Reset input and attachments when conversation changes
  useEffect(() => {
    setInputValue('');
    setPendingAttachments([]);
  }, [conversation.id]);

  useEffect(() => {
    const belongsToCurrentConv = messages.length > 0 && messages[0].conversationId === conversation.id;

    if (lastScrolledConvId.current !== conversation.id) {
      scrollToBottom('instant');
      if (belongsToCurrentConv || messages.length === 0 || !conversation.id) {
        lastScrolledConvId.current = conversation.id;
      }
    } else {
      scrollToBottom('smooth');
    }
  }, [conversation.id, messagesLength, lastMessageId, lastMessageContent]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = inputAreaHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    const newHeight = startHeight.current + deltaY;
    if (newHeight >= 150 && newHeight <= 350) {
      setInputAreaHeight(newHeight);
    }
  };

  const handleDragEnd = () => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(event.target as Node)) {
        setShowWorkspaceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const bindConversationWorkspace = async (conversationId: string, workspaceId: string | null) => {
    try {
      await workspaceService.updateConversationWorkspace(conversationId, workspaceId);
    } catch (err) {
      console.error('Failed to bind workspace:', err);
    }
  };

  const createWorkspace = async (name: string): Promise<WorkspaceItem | null> => {
    try {
      const res = await workspaceService.createWorkspace(name);
      if (res.code === 0 && res.data) {
        return res.data;
      }
      return null;
    } catch (err) {
      console.error('Failed to create workspace:', err);
      return null;
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = inputValue;
      setInputValue(text.substring(0, start) + emoji + text.substring(end));
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const filesArray = Array.from(files);
    if (filesArray.length === 0) return;

    // Create temporary pending attachments in local state (no immediate upload)
    const tempAttachments: MessageAttachment[] = filesArray.map(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const isPpt = file.name.endsWith('.ppt') || file.name.endsWith('.pptx');
      
      let type = 'other';
      if (isImage) type = 'image';
      else if (isPdf) type = 'pdf';
      else if (isPpt) type = 'ppt';

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return {
        id: tempId,
        name: file.name,
        type,
        url: URL.createObjectURL(file),
        size: file.size,
        isUploading: false,
        file
      };
    });

    setPendingAttachments(prev => [...prev, ...tempAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasHeader = !!replyContext || !!quoteArtifactRef || pendingAttachments.length > 0;
  const isUploadingAny = pendingAttachments.some(a => a.isUploading);
  const canSend = (inputValue.trim() || pendingAttachments.length > 0) && !isUploadingAny;

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    
    const useMockMode = useAgentHubStore.getState().useMockMode;
    const conversationId = conversation?.id;
    
    let finalAttachments: MessageAttachment[] = [];

    if (pendingAttachments.length > 0) {
      // Set all pending attachments to uploading state in UI
      setPendingAttachments(prev => prev.map(a => ({ ...a, isUploading: true })));

      const filesToUpload = pendingAttachments.map(a => a.file).filter(Boolean) as File[];

      if (useMockMode || !conversationId) {
        // Mock mode upload simulation
        await new Promise(resolve => setTimeout(resolve, 1000));
        finalAttachments = pendingAttachments.map(item => ({
          ...item,
          isUploading: false,
          parseStatus: 'parsed' as const,
          summary: `[Mock 摘要] 这是关于 ${item.name} 的模型提取摘要分析。`,
          meta: item.name.endsWith('.zip') ? { entryCount: 5, parsedEntryCount: 4, skipped: true } : item.meta,
          createdAt: new Date().toISOString()
        }));
      } else {
        try {
          const { uploadAttachmentBatch } = await import('@/services/http/attachmentService');
          const res = await uploadAttachmentBatch(conversationId, filesToUpload);
          if (res.code === 0 && res.data && res.data.results) {
            const failed: MessageAttachment[] = [];
            res.data.results.forEach((result, idx) => {
              const orig = pendingAttachments[idx];
              if (!orig) return;
              if (result && result.ok && result.attachment) {
                finalAttachments.push({
                  ...result.attachment,
                  isUploading: false
                });
              } else {
                failed.push({
                  ...orig,
                  isUploading: false,
                  uploadError: result?.error || '上传失败'
                });
              }
            });

            if (failed.length > 0) {
              setPendingAttachments(failed);
              alert('部分附件上传失败，请重试');
              return;
            }
          } else {
            const errMsg = res.message || '上传接口调用失败';
            setPendingAttachments(prev => prev.map(a => ({ ...a, isUploading: false, uploadError: errMsg })));
            alert(`附件上传失败: ${errMsg}`);
            return;
          }
        } catch (err: any) {
          const errMsg = err.message || '上传网络错误';
          setPendingAttachments(prev => prev.map(a => ({ ...a, isUploading: false, uploadError: errMsg })));
          alert(`附件上传失败: ${errMsg}`);
          return;
        }
      }
    }

    await sendMessage(trimmed, finalAttachments, agent.id);
    
    setInputValue('');
    setPendingAttachments([]);
    setShowEmojiPicker(false);
    if (replyContext) setReplyContext(null);
    if (quoteArtifactRef) setQuoteArtifactRef(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
              <div className="h-[1px] bg-slate-200/80 dark:bg-slate-800/80 flex-grow" />
              <span className="bg-slate-100 dark:bg-slate-800 text-lark-text-secondary dark:text-slate-400 text-[10px] font-semibold px-3 py-1 rounded-full border border-lark-border/60 dark:border-slate-800/80 mx-4 shadow-sm">
                {friendlyLabel}
              </span>
              <div className="h-[1px] bg-slate-200/80 dark:bg-slate-800/80 flex-grow" />
            </div>
          )}
          <MessageBubble 
            message={msg} 
            agents={[agent]}
            onCustomReply={(m) => setReplyContext({ id: m.id, senderName: m.senderName, content: m.content })}
            onCustomPin={undefined}
          />
        </React.Fragment>
      );
    });
  };

  return (
    <div className="h-full w-full flex bg-white dark:bg-slate-900 transition-colors">
      <div className="flex-grow h-full flex flex-col bg-[#fafbfb] dark:bg-slate-950/40 relative z-0">
        {(showEmojiPicker) && (
          <div className="fixed inset-0 z-50 bg-transparent" onClick={() => {
            setShowEmojiPicker(false);
          }} />
        )}

        {showEmojiPicker && (
          <div className="absolute bottom-[200px] left-4 z-[60] mb-2 p-3 bg-white dark:bg-slate-950 border border-lark-border dark:border-slate-800 rounded-xl shadow-2xl w-72 max-h-52 overflow-y-auto select-none animate-scale-in">
            <div className="text-[10px] text-lark-text-tertiary mb-1.5 font-semibold">常用表情</div>
            <div className="grid grid-cols-8 gap-1">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectEmoji(emoji)}
                  className="w-7 h-7 flex items-center justify-center text-sm rounded-md hover:bg-lark-bg-hover dark:hover:bg-slate-800 active:scale-90 transition-all"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 py-3.5 border-b border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between flex-shrink-0 z-20 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 transition-all"
              title="返回"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <img src={agent.avatar} alt="" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-lark-text-primary dark:text-slate-100 truncate">
                  {agent.name}
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">一对一专属对话</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex items-center flex-shrink-0" ref={workspaceDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowWorkspaceDropdown(!showWorkspaceDropdown);
                setIsCreatingWorkspace(false);
                setNewWorkspaceName('');
                setWorkspaceSearch('');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer select-none
                ${showWorkspaceDropdown
                  ? 'bg-violet-500/10 border-violet-500/50 text-violet-600 dark:text-violet-400 shadow-sm shadow-violet-500/10'
                  : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 dark:bg-slate-800/60 dark:border-slate-700/80 dark:hover:bg-slate-800 dark:hover:border-slate-650 dark:text-slate-200'
                }`}
              title="选择或切换绑定的 Sandbox 沙箱工作区"
            >
              <Cloud className="w-3.5 h-3.5 text-slate-400 dark:text-slate-450" />
              <span className="max-w-[100px] truncate">
                {workspaces.find(w => w.id === conversation.workspaceId)?.name || '未绑定工作区'}
              </span>
              <ChevronDown className={`w-3 h-3 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${showWorkspaceDropdown ? 'rotate-180 text-violet-500 dark:text-violet-400' : ''}`} />
            </button>

            {showWorkspaceDropdown && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-xl backdrop-blur-md p-2 z-[99] flex flex-col min-w-0 max-h-80 select-none animate-fade-in">
                
                {/* Search box */}
                <div className="relative mb-2 flex-shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={workspaceSearch}
                    onChange={(e) => setWorkspaceSearch(e.target.value)}
                    placeholder="搜索工作区..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-violet-500/80 dark:focus:border-violet-500/50 text-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Workspace List Container */}
                <div className="flex-grow overflow-y-auto max-h-48 pr-0.5 space-y-1">
                  {/* Unbind option */}
                  <button
                    type="button"
                    onClick={async () => {
                      await bindConversationWorkspace(conversation.id, null);
                      setShowWorkspaceDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-all
                      ${!conversation.workspaceId
                        ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-455 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                    <div className="flex items-center gap-2 min-w-0">
                      <Cloud className="w-3.5 h-3.5 flex-shrink-0 opacity-60 text-slate-400" />
                      <span className="truncate">未绑定工作区</span>
                    </div>
                    {!conversation.workspaceId && <Check className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />}
                  </button>

                  {/* Filtered workspace list */}
                  {(() => {
                    const filtered = workspaces.filter(w =>
                      w.name.toLowerCase().includes(workspaceSearch.toLowerCase())
                    );
                    if (filtered.length === 0 && workspaceSearch) {
                      return <div className="text-[11px] text-slate-400 italic text-center py-4">无匹配工作区</div>;
                    }

                    return filtered.map(w => {
                      const isSelected = conversation.workspaceId === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={async () => {
                            await bindConversationWorkspace(conversation.id, w.id);
                            setShowWorkspaceDropdown(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-all group
                            ${isSelected
                              ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 font-bold border border-violet-500/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-350 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 pr-1.5">
                            <Cloud className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-violet-500' : 'text-slate-400 group-hover:text-violet-500/80 transition-colors'}`} />
                            <span className="truncate">{w.name}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />}
                        </button>
                      );
                    });
                  })()}
                </div>

                {/* Separator */}
                <div className="h-px bg-slate-100 dark:bg-slate-850/80 my-1.5 flex-shrink-0" />

                {/* Create input or action button */}
                <div className="flex-shrink-0">
                  {isCreatingWorkspace ? (
                    <div className="flex flex-col gap-1.5 p-1 animate-scale-in">
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="工作区名称..."
                        autoFocus
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newWorkspaceName.trim()) {
                            setIsWorkspaceSubmitting(true);
                            try {
                              const newWS = await createWorkspace(newWorkspaceName.trim());
                              if (newWS) {
                                await bindConversationWorkspace(conversation.id, newWS.id);
                              }
                              setShowWorkspaceDropdown(false);
                            } catch (err) {
                              console.error('Failed to create workspace:', err);
                            } finally {
                              setIsWorkspaceSubmitting(false);
                              setIsCreatingWorkspace(false);
                              setNewWorkspaceName('');
                            }
                          }
                        }}
                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-violet-500 text-slate-800 dark:text-slate-100"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingWorkspace(false);
                            setNewWorkspaceName('');
                          }}
                          className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={!newWorkspaceName.trim() || isWorkspaceSubmitting}
                          onClick={async () => {
                            setIsWorkspaceSubmitting(true);
                            try {
                              const newWS = await createWorkspace(newWorkspaceName.trim());
                              if (newWS) {
                                await bindConversationWorkspace(conversation.id, newWS.id);
                              }
                              setShowWorkspaceDropdown(false);
                            } catch (err) {
                              console.error('Failed to create workspace:', err);
                            } finally {
                              setIsWorkspaceSubmitting(false);
                              setIsCreatingWorkspace(false);
                              setNewWorkspaceName('');
                            }
                          }}
                          className="px-2 py-1 text-[10px] bg-violet-600 hover:bg-violet-550 disabled:bg-slate-300 text-white rounded font-semibold transition-all"
                        >
                          {isWorkspaceSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : '创建'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCreatingWorkspace(true)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>新建工作区</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-grow flex min-h-0 relative bg-[#fafbfb] dark:bg-slate-950/40 z-10 transition-colors">
          <div className="flex-grow overflow-y-auto px-6 py-5 min-h-0 space-y-4 transition-all duration-300">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto">
                <img src={agent.avatar} alt="" className="w-20 h-20 rounded-full object-cover shadow-lg mb-4" />
                <h3 className="text-sm font-semibold text-lark-text-primary dark:text-slate-100 mb-1">开始与 {agent.name} 对话</h3>
                <p className="text-xs text-lark-text-secondary dark:text-slate-400 leading-relaxed">
                  这是你们的一对一专属对话空间，所有消息仅在你们之间传递。
                </p>
              </div>
            ) : (
              renderMessageList()
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div 
          className="flex-shrink-0 bg-white dark:bg-slate-900 transition-colors" 
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

          <div className="flex-1 p-4 pt-1 border-t border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 h-full flex flex-col min-h-0 z-20 transition-colors">
            <div className="border border-lark-border dark:border-slate-800 hover:border-lark-border/80 dark:hover:border-slate-700 focus-within:border-lark-primary dark:focus-within:border-violet-650 focus-within:ring-2 focus-within:ring-lark-primary/10 dark:focus-within:ring-violet-600/10 rounded-xl bg-white dark:bg-slate-950 transition-all flex flex-col relative z-30 flex-1 min-h-0 overflow-hidden">
              
              {replyContext && (
                <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-b border-lark-border/40 dark:border-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400 animate-slide-up flex-shrink-0 rounded-t-xl">
                  <span className="truncate flex items-center gap-1 min-w-0">
                    <span className="font-semibold text-slate-700 dark:text-slate-350 flex-shrink-0">回复 @{replyContext.senderName}：</span>
                    <span className="truncate text-slate-500 dark:text-slate-400">{replyContext.content}</span>
                  </span>
                  <button 
                    type="button"
                    onClick={() => setReplyContext(null)} 
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-full transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {quoteArtifactRef && (
                <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-b border-lark-border/40 dark:border-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400 animate-slide-up flex-shrink-0 rounded-t-xl">
                  <span className="truncate flex items-center gap-2 min-w-0">
                    <FileCode className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-700 dark:text-slate-350 flex-shrink-0">引用产物 {quoteArtifactRef.artifactTitle} (v{quoteArtifactRef.version})</span>
                    {quoteArtifactRef.startLine && (
                      <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-450 px-1 rounded text-[9px] border border-emerald-100 dark:border-emerald-900/50 font-mono flex-shrink-0">
                        L{quoteArtifactRef.startLine}{quoteArtifactRef.endLine && quoteArtifactRef.endLine !== quoteArtifactRef.startLine && ` - L${quoteArtifactRef.endLine}`}
                      </span>
                    )}
                    <span className="text-slate-400 dark:text-slate-500 font-mono italic truncate">"{quoteArtifactRef.quotedText}"</span>
                  </span>
                  <button 
                    type="button"
                    onClick={() => setQuoteArtifactRef(null)} 
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-full transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3.5 py-1.5 bg-slate-50/50 dark:bg-slate-900/30 border-b border-lark-border/40 dark:border-slate-800/40 flex-shrink-0 select-none max-h-16 overflow-y-auto">
                  {pendingAttachments.map((attach) => (
                    <div key={attach.id} className="flex items-center gap-1.5 px-2 py-0.5 bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 rounded-lg text-xs shadow-sm max-w-[180px]">
                      <span 
                        className={`truncate flex-1 text-[10px] font-medium ${attach.uploadError ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}`}
                        title={attach.uploadError || attach.name}
                      >
                        {attach.name}
                        {attach.isUploading && ' (上传中...)'}
                        {attach.uploadError && ' (失败)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== attach.id))}
                        className="text-slate-400 hover:text-red-500 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex-shrink-0"
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

              <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-lark-border/30 dark:border-slate-800/20 relative flex-shrink-0 ${hasHeader ? '' : 'rounded-t-xl'}`}>
                <button 
                  type="button"
                  onClick={handleFileClick}
                  className="p-1 rounded-lg text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800 transition-colors"
                  title="添加附件"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-1 rounded-lg transition-colors ${showEmojiPicker ? 'text-lark-primary bg-lark-primary-light dark:bg-violet-950/45 dark:text-violet-400' : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800'}`}
                    title="表情符号"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="w-[1px] h-3 bg-lark-border/60 dark:bg-slate-800 mx-1" />
                <span className="text-[10px] text-lark-text-tertiary dark:text-slate-500">Shift + Enter 换行</span>
              </div>

              <div className="flex-1 p-2 bg-transparent flex flex-row items-end gap-2 min-h-0 overflow-hidden">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  className="w-full px-2 py-1.5 text-sm outline-none resize-none text-lark-text-primary dark:text-slate-100 placeholder:text-lark-text-tertiary dark:placeholder:text-slate-650 bg-transparent flex-1 h-full min-h-[36px]"
                />
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all flex-shrink-0 active:scale-95 mb-0.5 ${
                    canSend
                      ? 'bg-lark-primary text-white shadow-sm hover:bg-lark-primary-hover'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
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

export default AgentChatPanel;
