import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Conversation, Message, Agent, Artifact, MessageAttachment, AgentMentionItem } from '@/types';
import MessageBubble from './MessageBubble';
import ContextUsageRing from '@/components/common/ContextUsageRing';
import { Send, Paperclip, Smile, AtSign, GripVertical, X, FileCode, Brain, Pin, Trash2, ArrowUpRight, Settings, Pencil, Check, Terminal, Cpu, FileText, Folder, Save, Globe, Loader2, ChevronDown, Plus, Search, AlertTriangle, Cloud, Laptop } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface ChatPanelProps {
  conversation: Conversation | undefined;
  agents: Agent[];
  messages: Message[];
  artifacts: Artifact[];
  onSendMessage: (content: string, attachments?: MessageAttachment[], targetAgentId?: string, useSandbox?: boolean, webSearchMode?: 'auto' | 'force' | 'off') => void;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
  const webSearchMode = useAgentHubStore(state => state.webSearchMode);
  const setWebSearchMode = useAgentHubStore(state => state.setWebSearchMode);

  const pins = useAgentHubStore(state => state.pins);
  const memories = useAgentHubStore(state => state.memories);
  const deleteMemory = useAgentHubStore(state => state.deleteMemory);
  const updateMemory = useAgentHubStore(state => state.updateMemory);
  const togglePinMessage = useAgentHubStore(state => state.togglePinMessage);
  const setConfiguringAgentId = useAgentHubStore(state => state.setConfiguringAgentId);
  const allAgents = useAgentHubStore(state => state.agents);
  
  // Desktop workspace context files
  const workspaceContextFiles = useAgentHubStore(state => state.workspaceContextFiles);
  const removeFileFromContext = useAgentHubStore(state => state.removeFileFromContext);
  const currentWorkspace = useAgentHubStore(state => state.currentWorkspace);
  const isDesktop = useAgentHubStore(state => state.isDesktop);
  const workspaces = useAgentHubStore(state => state.serverWorkspaces);
  const bindConversationWorkspace = useAgentHubStore(state => state.bindConversationWorkspace);
  const createWorkspace = useAgentHubStore(state => state.createServerWorkspace);
  const fetchServerWorkspaces = useAgentHubStore(state => state.fetchServerWorkspaces);

  const conversationHasMore = useAgentHubStore(state => state.conversationHasMore);
  const isLoadingMoreMessages = useAgentHubStore(state => state.isLoadingMoreMessages);
  const loadMoreMessages = useAgentHubStore(state => state.loadMoreMessages);

  // Custom Workspace Switcher states
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isWorkspaceSubmitting, setIsWorkspaceSubmitting] = useState(false);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(event.target as Node)) {
        setShowWorkspaceDropdown(false);
        setIsCreatingWorkspace(false);
        setNewWorkspaceName('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (conversation && conversation.mode !== 'agent') {
      fetchServerWorkspaces('active');
    }
  }, [conversation?.id]);
  const [isApplyToLocal, setIsApplyToLocal] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memoryTab, setMemoryTab] = useState<'pins' | 'memories'>('pins');

  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState<string>('');
  const [editingMemoryCategory, setEditingMemoryCategory] = useState<any>('preference');

  const lastScrolledConversationId = useRef<string | undefined>(undefined);
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const justSwitchedRef = useRef<boolean>(true);
  const initialBottomTimersRef = useRef<number[]>([]);
  const ignoreHistoryLoadUntilRef = useRef<number>(0);
  const isLoadingHistoryRef = useRef<boolean>(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  const clearInitialBottomTimers = useCallback(() => {
    initialBottomTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    initialBottomTimersRef.current = [];
  }, []);

  const pinToLatestMessage = useCallback(() => {
    scrollToBottom('instant');
    requestAnimationFrame(() => scrollToBottom('instant'));
  }, [scrollToBottom]);

  const scheduleInitialBottomPin = useCallback(() => {
    clearInitialBottomTimers();
    pinToLatestMessage();

    initialBottomTimersRef.current = [30, 80, 160, 320, 640].map((delay) =>
      window.setTimeout(pinToLatestMessage, delay)
    );
  }, [clearInitialBottomTimers, pinToLatestMessage]);

  const isNearBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 150; // pixels from the bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
  };

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : null;
  const messagesLength = messages.length;
  const conversationId = conversation?.id;

  // Reset input and attachments when conversation changes
  useEffect(() => {
    setInputValue('');
    setPendingAttachments([]);
    setShowMentionPopup(false);
  }, [conversationId]);

  const renderHighlightedInput = () => {
    if (!inputValue) return null;
    
    // Sort agent names by length descending to match longer names first (e.g. "Claude Code" before "Claude")
    const agentNames = allAgents.map(a => a.name).sort((a, b) => b.length - a.length);
    
    if (agentNames.length === 0) {
      return inputValue;
    }
    
    const escapedNames = agentNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // Match @ followed by one of the agent names
    const regex = new RegExp(`(@(?:${escapedNames}))`, 'gi');
    
    const parts = inputValue.split(regex);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const nameWithoutAt = part.substring(1).toLowerCase();
        const agentExists = allAgents.some(a => a.name.toLowerCase() === nameWithoutAt);
        if (agentExists) {
          return (
            <span key={index} className="text-blue-600 dark:text-blue-400 font-semibold">
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  useEffect(() => {
    if (!conversationId) return;

    const isSameConv = lastScrolledConversationId.current === conversationId;
    
    const prevLength = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isLoadingHistoryRef.current) {
      return;
    }

    if (!isSameConv) {
      lastScrolledConversationId.current = conversationId;
      justSwitchedRef.current = true;
      ignoreHistoryLoadUntilRef.current = Date.now() + 900;
      scheduleInitialBottomPin();
      const timer = setTimeout(() => {
        justSwitchedRef.current = false;
        clearInitialBottomTimers();
      }, 800);
      return () => {
        clearTimeout(timer);
        clearInitialBottomTimers();
      };
    }

    if (justSwitchedRef.current) {
      scheduleInitialBottomPin();
      return clearInitialBottomTimers;
    }

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;

    if (messages.length > prevLength) {
      if (lastMsg.role === 'user') {
        scrollToBottom('smooth');
      } else {
        if (isNearBottom()) {
          scrollToBottom('smooth');
        }
      }
    } else {
      if (isNearBottom() && lastMsg.role === 'agent' && lastMsg.type !== 'status') {
        scrollToBottom('instant');
      }
    }
  }, [
    conversationId,
    messagesLength,
    lastMessageId,
    lastMessageContent,
    scrollToBottom,
    scheduleInitialBottomPin,
    clearInitialBottomTimers,
  ]);

  // Handle scrolling to load more history messages
  const handleScroll = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (!container || !conversationId) return;
    if (Date.now() < ignoreHistoryLoadUntilRef.current) return;

    const hasMore = conversationHasMore[conversationId] ?? false;
    if (container.scrollTop <= 15 && hasMore && !isLoadingMoreMessages) {
      const prevScrollHeight = container.scrollHeight;
      const prevScrollTop = container.scrollTop;

      isLoadingHistoryRef.current = true;
      try {
        await loadMoreMessages(conversationId);

        // Keep scroll position anchored so it doesn't jump
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            const newScrollHeight = scrollContainerRef.current.scrollHeight;
            scrollContainerRef.current.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
          }
          window.setTimeout(() => {
            isLoadingHistoryRef.current = false;
          }, 80);
        });
      } catch {
        isLoadingHistoryRef.current = false;
      }
    }
  }, [conversationId, conversationHasMore, isLoadingMoreMessages, loadMoreMessages]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);

  const renameConversation = useAgentHubStore(state => state.renameConversation);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const activeAgents = conversation && conversation.agentIds
    ? agents.filter(a => a.enabled && conversation.agentIds.includes(a.id))
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

  const handleAtButtonClick = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    
    const cursor = textarea.selectionStart;
    const text = inputValue;
    
    const before = text.substring(0, cursor);
    const after = text.substring(cursor);
    const newValue = `${before}@${after}`;
    
    setInputValue(newValue);
    setMentionSearch('');
    setShowMentionPopup(true);
    
    setTimeout(() => {
      textarea.focus();
      const newCursor = cursor + 1;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (conversation?.mode === 'group' && lastAtIdx !== -1 && !textBeforeCursor.substring(lastAtIdx, cursor).includes(' ')) {
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
    const found = agents.find(a => a.name === lastName && a.enabled === true && a.status !== 'disabled');
    return found ? found.id : null;
  }, [agents]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed && pendingAttachments.length === 0 && (!workspaceContextFiles || workspaceContextFiles.length === 0)) return;

    if (conversation && !conversation.workspaceId) {
      alert('请先选择或新建工作区以绑定此会话！');
      setShowWorkspaceDropdown(true);
      return;
    }

    const targetAgentId = parseTargetAgentId(trimmed);
    onSendMessage(trimmed, pendingAttachments, targetAgentId || undefined, undefined, webSearchMode);
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

  const hasHeader = !!replyContext || !!quoteArtifactRef || pendingAttachments.length > 0 || (workspaceContextFiles && workspaceContextFiles.length > 0);
  const isUploadingAny = pendingAttachments.some(a => a.isUploading);
  const canSend = (inputValue.trim() || pendingAttachments.length > 0 || (workspaceContextFiles && workspaceContextFiles.length > 0)) && !isUploadingAny;

  const renderMessageList = () => {
    let lastDateLabel = '';
    
    // Group artifact messages by senderId (starts with run-)
    const groupedMessagesList: Message[] = [];
    const runGroups: Record<string, Message[]> = {};
    
    messages.forEach(msg => {
      if (msg.senderId && msg.senderId.startsWith('run-') && msg.type === 'artifact') {
        if (!runGroups[msg.senderId]) {
          runGroups[msg.senderId] = [];
        }
        runGroups[msg.senderId].push(msg);
      }
    });
    
    const processedRunIds = new Set<string>();
    messages.forEach(msg => {
      if (msg.senderId && msg.senderId.startsWith('run-') && msg.type === 'artifact') {
        if (!processedRunIds.has(msg.senderId)) {
          processedRunIds.add(msg.senderId);
          const group = runGroups[msg.senderId];
          if (group.length > 1) {
            groupedMessagesList.push({
              ...msg,
              metadata: {
                ...msg.metadata,
                isGroupedArtifacts: true,
                groupedMessages: group,
              }
            });
          } else {
            groupedMessagesList.push(msg);
          }
        }
      } else {
        groupedMessagesList.push(msg);
      }
    });

    return groupedMessagesList.map((msg) => {
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
          <MessageBubble message={msg} agents={agents} />
        </React.Fragment>
      );
    });
  };

  return (
    <div className="flex-grow h-full flex flex-col bg-white dark:bg-slate-900 relative z-0 transition-colors">
      {(showEmojiPicker || showMentionPopup) && (
        <div className="fixed inset-0 z-50 bg-transparent" onClick={() => {
          setShowEmojiPicker(false);
          setShowMentionPopup(false);
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

      {showMentionPopup && mentionCandidates.length > 0 && (
        <div className="absolute bottom-[200px] left-4 z-[60] bg-white dark:bg-slate-950 border border-lark-border dark:border-slate-800 rounded-xl shadow-2xl w-60 max-h-52 overflow-y-auto p-1.5 animate-scale-in">
          <div className="text-[10px] text-lark-text-tertiary dark:text-slate-500 px-2 py-1 font-semibold">选择要 @ 的 Agent</div>
          {mentionCandidates.map((agent, idx) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => selectMention(agent.name)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                idx === mentionIndex
                  ? 'bg-lark-primary-light dark:bg-violet-950/40 text-lark-primary dark:text-violet-400 font-medium'
                  : 'hover:bg-lark-bg-hover dark:hover:bg-slate-900 text-lark-text-primary dark:text-slate-200'
              }`}
            >
              <img src={agent.avatar} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0 bg-slate-100 dark:bg-slate-900" />
              <span className="truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="px-5 py-3.5 border-b border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between flex-shrink-0 z-20 transition-colors">
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
                className="text-xs font-semibold text-lark-text-primary dark:text-slate-100 px-2 py-0.5 border border-lark-primary dark:border-violet-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-lark-primary dark:focus:ring-violet-650 bg-white dark:bg-slate-950 flex-grow"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 max-w-full">
              <h2 
                className={`text-sm font-semibold text-lark-text-primary dark:text-slate-100 truncate ${
                  conversation?.mode !== 'agent' ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 px-1 py-0.5 rounded transition-colors' : ''
                }`}
                onClick={() => {
                  if (conversation && conversation.mode !== 'agent') {
                    setEditedTitle(conversation.title);
                    setIsEditingTitle(true);
                  }
                }}
                title={conversation?.mode !== 'agent' ? "点击重命名会话" : undefined}
              >
                {conversation?.mode === 'agent' 
                  ? (agents.find(a => conversation.agentIds?.includes(a.id))?.name || conversation.title) 
                  : (conversation?.title || '选择一个会话')}
              </h2>
              {conversation && conversation.mode !== 'agent' && (
                <button
                  onClick={() => {
                    setEditedTitle(conversation.title);
                    setIsEditingTitle(true);
                  }}
                  className="p-1 text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800 rounded transition-colors"
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
                ? 'bg-[#e1f9eb] dark:bg-[#103a20] text-[#00b04a] dark:text-[#38e680]'
                : conversation.mode === 'agent'
                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30'
                  : 'bg-[#f2e9fc] dark:bg-[#2b104a] text-[#7f3ec8] dark:text-[#be80ff]'
            }`}>
              {conversation.mode === 'single' ? '单聊' : conversation.mode === 'agent' ? 'Agent' : '群聊'}
            </span>
          )}

          {conversation && conversation.mode !== 'agent' && (
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
                  {workspaces.find(w => w.id === conversation.workspaceId)?.name || '未绑定沙箱'}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${showWorkspaceDropdown ? 'rotate-180 text-violet-500 dark:text-violet-400' : ''}`} />
              </button>

              {showWorkspaceDropdown && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-xl backdrop-blur-md p-2 z-[99] flex flex-col min-w-0 max-h-80 select-none animate-fade-in">
                  
                  {/* Search box */}
                  <div className="relative mb-2 flex-shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={workspaceSearch}
                      onChange={(e) => setWorkspaceSearch(e.target.value)}
                      placeholder="搜索沙箱工作区..."
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
                        <span className="truncate">未绑定沙箱</span>
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
                          placeholder="沙箱名称..."
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
                            className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-[10px] text-white rounded font-bold transition-all flex items-center gap-1"
                          >
                            {isWorkspaceSubmitting && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            确定
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCreatingWorkspace(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-[11px] text-slate-550 dark:text-slate-450 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg transition-all font-semibold border border-dashed border-slate-200 dark:border-slate-800/80 hover:border-violet-500/30"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>新建沙箱工作区</span>
                      </button>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}


          {/* Stacked Participating Agent Avatars */}
          {conversation && activeAgents.length > 0 && (
            <div className="flex items-center -space-x-1.5 overflow-hidden ml-3 hidden sm:flex select-none">
              {activeAgents.map(agent => (
                <img
                  key={agent.id}
                  className="inline-block h-5 w-5 rounded-full border-2 border-white dark:border-slate-900 object-cover"
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
              {/* Trae Style Context Usage Ring */}
              <ContextUsageRing 
                usage={conversation.contextUsage} 
                onCompress={compressContext}
              />

              {/* Long-term Memory Sidebar Toggle */}
              <button
                onClick={() => setShowMemoryPanel(!showMemoryPanel)}
                className={`p-1.5 border rounded-lg transition-all flex items-center gap-1.5 shadow-sm relative group
                  ${showMemoryPanel 
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 font-semibold shadow-inner' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/30'
                  }`}
                title="查看会话长期记忆与 Pin 消息"
              >
                <Brain className={`w-3.5 h-3.5 ${showMemoryPanel ? 'text-amber-600 animate-pulse' : ''}`} />
                <span className="text-xs font-medium hidden md:inline">长期记忆</span>
                {pins.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-sm border border-white dark:border-slate-900">
                    {pins.length}
                  </span>
                )}
              </button>

              {/* Exclusive Chat Settings button */}
              {conversation.mode === 'agent' && (
                <button
                  onClick={() => {
                    const agentId = conversation.agentIds?.[0];
                    if (agentId) {
                      setConfiguringAgentId(agentId);
                    }
                  }}
                  className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-50 dark:hover:bg-slate-800/45 rounded-lg transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  title="智能体配置设置"
                >
                  <Settings className="w-3.5 h-3.5 text-violet-500 animate-spin-hover" />
                  <span className="text-xs font-medium hidden md:inline">设置</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {conversation && conversation.mode !== 'agent' && !conversation.workspaceId && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 px-5 py-2.5 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 select-none animate-slide-down">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>当前会话未关联沙箱工作区。请先选择或新建一个沙箱工作区，否则智能体协同和沙箱运行将无法正常启动。</span>
          </div>
          <button
            onClick={() => setShowWorkspaceDropdown(true)}
            className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded font-semibold transition-all active:scale-95"
          >
            绑定沙箱
          </button>
        </div>
      )}

      <div className="flex-grow flex min-h-0 relative bg-[#fafbfb] dark:bg-slate-950/40 z-10 transition-colors">
        {/* Messages List Area */}
        <div ref={scrollContainerRef} className="flex-grow overflow-y-auto px-6 py-5 min-h-0 space-y-4 transition-all duration-300">
          {isLoadingMoreMessages && (
            <div className="flex items-center justify-center py-2 text-xs text-slate-500 dark:text-slate-400 gap-1.5 select-none animate-fade-in">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
              <span>正在加载历史消息...</span>
            </div>
          )}
          {messages.length === 0 ? (
            conversation?.mode === 'agent' ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto select-none">
                {agents[0] ? (
                  <img src={agents[0].avatar} alt="" className="w-16 h-16 rounded-full object-cover shadow-lg mb-4 hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/45 flex items-center justify-center mb-4 text-emerald-500">
                    <Smile className="w-6 h-6" />
                  </div>
                )}
                <h3 className="text-sm font-semibold text-lark-text-primary dark:text-slate-100 mb-1">
                  开始与 {agents[0]?.name || 'Agent'} 对话
                </h3>
                <p className="text-xs text-lark-text-secondary dark:text-slate-400 leading-relaxed">
                  这是你与 {agents[0]?.name || 'Agent'} 的一对一专属对话空间。你可以在此向它发送特定的指令与问题，它会直接为你解答。
                </p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto select-none">
                <div className="w-12 h-12 rounded-2xl bg-lark-primary-light dark:bg-violet-950/45 flex items-center justify-center mb-4 text-lark-primary dark:text-violet-400">
                  <Smile className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-lark-text-primary dark:text-slate-100 mb-1">开始与 Agent 协作</h3>
                <p className="text-xs text-lark-text-secondary dark:text-slate-400 leading-relaxed">
                  在此发送你的开发需求或指令，Orchestrator 将会自动分析，分发任务给对应 Agent 并输出代码或文档产物。
                </p>
              </div>
            )
          ) : (
            renderMessageList()
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Long-term Memory Panel (Slide-out Sidebar) */}
        {showMemoryPanel && (
          <div className="w-80 border-l border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col z-20 flex-shrink-0 animate-slide-left shadow-xl transition-colors">
            {/* Panel Header */}
            <div className="px-4 py-3 border-b border-lark-border dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">会话长期记忆</span>
              </div>
              <button 
                onClick={() => setShowMemoryPanel(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="关闭侧边栏"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-lark-border dark:border-slate-800 px-2 pt-2 bg-slate-50/20 dark:bg-slate-950/20 flex-shrink-0 select-none">
              <button
                onClick={() => setMemoryTab('pins')}
                className={`flex-1 pb-2 text-xs font-semibold text-center border-b-2 transition-all
                  ${memoryTab === 'pins' 
                    ? 'border-amber-500 text-amber-600 font-bold' 
                    : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
              >
                已 Pin 消息 ({pins.length})
              </button>
              <button
                onClick={() => setMemoryTab('memories')}
                className={`flex-1 pb-2 text-xs font-semibold text-center border-b-2 transition-all
                  ${memoryTab === 'memories' 
                    ? 'border-amber-500 text-amber-600 font-bold' 
                    : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
              >
                提取的记忆 ({memories.length})
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fafbfb] dark:bg-slate-950/30">
              {memoryTab === 'pins' ? (
                pins.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500 select-none">
                    <Pin className="w-8 h-8 stroke-1 mb-2 text-slate-400 dark:text-slate-600" />
                    <p className="text-xs">暂无已 Pin 消息</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1">悬停于气泡旁在悬浮菜单点击 Pin</p>
                  </div>
                ) : (
                  pins.map(pin => {
                    const senderImg = pin.message.role === 'user' ? null : agents.find(a => a.name === pin.message.senderName)?.avatar;
                    const isUserRole = pin.message.role === 'user';
                    
                    return (
                      <div 
                        key={pin.id} 
                        className="p-3 bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 rounded-xl shadow-sm hover:border-amber-300 dark:hover:border-amber-600/40 transition-all group/pin-item flex flex-col gap-2 relative"
                      >
                        {/* Sender info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                              {isUserRole ? (
                                <span className="text-[10px] font-bold text-white bg-lark-primary w-full h-full flex items-center justify-center">U</span>
                              ) : senderImg ? (
                                <img src={senderImg} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-bold text-white bg-indigo-500 w-full h-full flex items-center justify-center">A</span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{pin.message.senderName || '用户'}</span>
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
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-lark-primary dark:hover:text-violet-400 rounded text-slate-400 dark:text-slate-500 transition-colors"
                              title="在聊天中定位"
                            >
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                            {/* Unpin */}
                            <button
                              onClick={() => togglePinMessage(pin.messageId)}
                              className="p-1 hover:bg-red-50 dark:hover:bg-red-955/20 hover:text-red-500 dark:hover:text-red-400 rounded text-slate-400 dark:text-slate-500 transition-colors"
                              title="取消 Pin"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Snippet content */}
                        <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed whitespace-pre-wrap font-sans bg-slate-50/50 dark:bg-slate-950/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                          {pin.message.content}
                        </div>
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 text-right font-mono select-none">
                          {pin.createdAt.split(' ')[1] || pin.createdAt}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                memories.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500 select-none">
                    <Brain className="w-8 h-8 stroke-1 mb-2 text-slate-400 dark:text-slate-600" />
                    <p className="text-xs">暂无提取的记忆</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1">系统会自动分析并提取会话中关键信息</p>
                  </div>
                ) : (
                  memories.map(mem => {
                    const categoryLabels: Record<string, { label: string, color: string }> = {
                      constraint: { label: '开发约束', color: 'bg-red-50 dark:bg-red-950/25 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900/30' },
                      project: { label: '项目信息', color: 'bg-blue-50 dark:bg-blue-950/25 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-900/30' },
                      preference: { label: '用户偏好', color: 'bg-green-50 dark:bg-green-950/25 text-green-700 dark:text-green-300 border-green-100 dark:border-green-900/30' },
                      profile: { label: '基本属性', color: 'bg-purple-50 dark:bg-purple-950/25 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-900/30' }
                    };
                    const badge = categoryLabels[mem.category] || { label: '其他记忆', color: 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-100 dark:border-slate-800' };
                    const isEditing = editingMemoryId === mem.id;

                    return (
                      <div 
                        key={mem.id} 
                        className="p-3 bg-white dark:bg-slate-900 border border-lark-border dark:border-slate-800 rounded-xl shadow-sm hover:border-amber-300 dark:hover:border-amber-600/40 transition-all group/mem-item flex flex-col gap-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          {isEditing ? (
                            <select
                              value={editingMemoryCategory}
                              onChange={(e) => setEditingMemoryCategory(e.target.value as any)}
                              className="text-[9px] font-semibold px-1 py-0.5 border rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 border-lark-border dark:border-slate-800 focus:outline-none focus:border-amber-500"
                            >
                              <option value="preference">用户偏好</option>
                              <option value="project">项目信息</option>
                              <option value="constraint">开发约束</option>
                              <option value="profile">基本属性</option>
                            </select>
                          ) : (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 border rounded-md ${badge.color}`}>
                              {badge.label}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={async () => {
                                    if (editingMemoryContent.trim()) {
                                      await updateMemory(mem.id, editingMemoryContent.trim(), editingMemoryCategory);
                                      setEditingMemoryId(null);
                                    }
                                  }}
                                  className="p-1 hover:bg-green-50 dark:hover:bg-green-950/20 text-green-600 dark:text-green-400 rounded transition-colors"
                                  title="保存修改"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingMemoryId(null)}
                                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded transition-colors"
                                  title="取消"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingMemoryId(mem.id);
                                    setEditingMemoryContent(mem.content);
                                    setEditingMemoryCategory(mem.category);
                                  }}
                                  className="p-1 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-500 rounded text-slate-400 dark:text-slate-500 transition-colors opacity-0 group-hover/mem-item:opacity-100 transition-opacity"
                                  title="修改记忆"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => deleteMemory(mem.id)}
                                  className="p-1 hover:bg-red-50 dark:hover:bg-red-955/20 hover:text-red-500 dark:hover:text-red-400 rounded text-slate-400 dark:text-slate-500 transition-colors opacity-0 group-hover/mem-item:opacity-100 transition-opacity"
                                  title="删除记忆"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editingMemoryContent}
                            onChange={(e) => setEditingMemoryContent(e.target.value)}
                            rows={3}
                            className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-lark-border dark:border-slate-800 rounded-lg p-1.5 focus:outline-none focus:border-amber-500 w-full resize-none leading-relaxed font-sans"
                            placeholder="请输入记忆内容..."
                          />
                        ) : (
                          <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                            {mem.content}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500 select-none">
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
        className="flex-shrink-0 bg-white dark:bg-slate-900 transition-colors" 
        style={{ height: inputAreaHeight }}
      >
        <div
          onMouseDown={!conversation?.isArchived ? handleDragStart : undefined}
          className="h-[6px] bg-transparent hover:bg-slate-100/80 cursor-ns-resize transition-colors flex items-center justify-center group relative z-10 before:content-[''] before:absolute before:-top-2 before:bottom-2 before:left-0 before:right-0"
        >
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <GripVertical className="w-3.5 h-3.5 text-slate-300" />
          </div>
        </div>

        {/* 归档会话提示条 */}
        {conversation?.isArchived && (
          <div className="px-6 py-2 bg-slate-50 dark:bg-slate-950/30 border-t border-b border-lark-border dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span>当前会话已归档，处于只读状态，不允许发送消息。您可以在左侧侧边栏中对其取消归档以恢复正常会话。</span>
            </div>
          </div>
        )}

        {!(conversation?.mode === 'agent' && agents.length > 0 && (agents[0].enabled === false || agents[0].status === 'disabled')) ? (
          <div className="flex-1 p-4 pt-1 border-t border-lark-border dark:border-slate-800 bg-white dark:bg-slate-900 h-full flex flex-col min-h-0 z-20 transition-colors">
            <div className={`border rounded-xl bg-white dark:bg-slate-950 transition-all flex flex-col relative z-30 flex-1 min-h-0 overflow-hidden ${
              conversation?.isArchived 
                ? 'border-slate-200/50 dark:border-slate-800/50 opacity-60' 
                : 'border-lark-border dark:border-slate-800 hover:border-lark-border/80 dark:hover:border-slate-700 focus-within:border-lark-primary dark:focus-within:border-violet-650 focus-within:ring-2 focus-within:ring-lark-primary/10 dark:focus-within:ring-violet-600/10'
            }`}>
              
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

            {workspaceContextFiles && workspaceContextFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3.5 py-1.5 bg-slate-50/55 dark:bg-slate-950/20 border-b border-lark-border/40 dark:border-slate-800/40 flex-shrink-0 select-none max-h-16 overflow-y-auto">
                {workspaceContextFiles.map((file) => (
                  <div key={file} className="flex items-center gap-1.5 px-2 py-0.5 bg-white dark:bg-slate-900 border border-emerald-500/30 dark:border-emerald-500/20 rounded-lg text-xs shadow-sm max-w-[200px]">
                    <FileText className="w-3 h-3 text-emerald-500" />
                    <span className="truncate flex-1 text-slate-600 dark:text-slate-300 font-medium text-[10px]">{file.split('/').pop()}</span>
                    <button
                      type="button"
                      onClick={() => removeFileFromContext(file)}
                      className="text-slate-400 hover:text-red-500 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 animate-pulse"
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
              disabled={conversation?.isArchived}
            />

            <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/50 dark:bg-slate-900/20 border-b border-lark-border/30 dark:border-slate-800/20 relative flex-shrink-0 ${hasHeader ? '' : 'rounded-t-xl'}`}>
              <div className="relative flex items-center">
                <button 
                  type="button"
                  onClick={handleFileClick}
                  disabled={conversation?.isArchived}
                  className={`p-1 rounded-lg transition-colors ${
                    conversation?.isArchived 
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' 
                      : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800'
                  }`}
                  title="添加附件"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="relative flex items-center">
                <button 
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  disabled={conversation?.isArchived}
                  className={`p-1 rounded-lg transition-colors ${
                    conversation?.isArchived 
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : showEmojiPicker 
                        ? 'text-lark-primary bg-lark-primary-light dark:bg-violet-950/45 dark:text-violet-400' 
                        : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800'
                  }`}
                  title="表情符号"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
              </div>

              {conversation?.mode === 'group' && (
                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={handleAtButtonClick}
                    disabled={conversation?.isArchived}
                    className={`p-1 rounded-lg transition-colors ${
                      conversation?.isArchived 
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-lark-text-secondary dark:text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 hover:bg-lark-bg-hover dark:hover:bg-slate-800'
                    }`}
                    title="提及 Agent (@)"
                  >
                    <AtSign className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              
              <div className="w-[1px] h-3 bg-lark-border/60 dark:bg-slate-800 mx-1" />
              <span className="text-[10px] text-lark-text-tertiary dark:text-slate-500">Shift + Enter 换行</span>


              <div className="w-[1px] h-3 bg-lark-border/60 dark:bg-slate-800 mx-1" />
              <button
                type="button"
                onClick={() => {
                  const modes: ('auto' | 'force' | 'off')[] = ['auto', 'force', 'off'];
                  const nextIndex = (modes.indexOf(webSearchMode) + 1) % modes.length;
                  setWebSearchMode(modes[nextIndex]);
                }}
                disabled={conversation?.isArchived}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                  conversation?.isArchived 
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed border-transparent'
                    : webSearchMode === 'force'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-450 border-emerald-500/35 ring-1 ring-emerald-500/20'
                      : webSearchMode === 'auto'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-500 hover:bg-slate-500/5 border-transparent'
                }`}
                title={`联网搜索模式: ${
                  webSearchMode === 'auto'
                    ? '自动 (按需搜索)'
                    : webSearchMode === 'force'
                      ? '强制 (必须搜索)'
                      : '禁用 (不联网)'
                } - 点击切换`}
              >
                <Globe className={`w-3.5 h-3.5 mr-0.5 ${webSearchMode === 'force' ? 'animate-pulse' : ''}`} />
                <span>
                  联网: {
                    webSearchMode === 'auto'
                      ? '自动'
                      : webSearchMode === 'force'
                        ? '强制'
                        : '关闭'
                  }
                </span>
              </button>

              {isDesktop && currentWorkspace && (
                <>
                  <div className="w-[1px] h-3 bg-lark-border/60 dark:bg-slate-800 mx-1" />
                  <button
                    type="button"
                    onClick={() => setIsApplyToLocal(!isApplyToLocal)}
                    disabled={conversation?.isArchived}
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                      conversation?.isArchived 
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed border-transparent'
                        : isApplyToLocal
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35 ring-1 ring-emerald-500/20'
                          : 'text-slate-400 dark:text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/5 border-transparent'
                    }`}
                    title="自动将生成的代码产物写入到本地工作区文件"
                  >
                    <Save className="w-3.5 h-3.5 mr-0.5" />
                    应用到本地
                  </button>
                </>
              )}

              {currentWorkspace && (
                <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-550 font-mono ml-auto select-none" title={currentWorkspace.path}>
                  <Laptop className="w-3 h-3 text-slate-350 dark:text-slate-700" />
                  <span>本地: {currentWorkspace.name}</span>
                </div>
              )}
            </div>

            <div className="flex-1 p-2 bg-transparent flex flex-row items-end gap-2 min-h-0 overflow-hidden">
              <div className="relative flex-1 h-full min-h-[36px] overflow-hidden">
                {/* Highlight text mirror layer */}
                <div
                  ref={overlayRef}
                  className="absolute inset-0 px-2 py-1.5 text-sm font-sans leading-normal whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100 pointer-events-none select-none overflow-y-auto overflow-x-hidden border border-transparent bg-transparent"
                  style={{ wordBreak: 'break-word' }}
                >
                  {renderHighlightedInput()}
                </div>
                {/* Native Textarea layer */}
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={conversation?.isArchived ? undefined : handleInputChange}
                  onKeyDown={conversation?.isArchived ? undefined : handleKeyDown}
                  onScroll={(e) => {
                    if (overlayRef.current && !conversation?.isArchived) {
                      overlayRef.current.scrollTop = e.currentTarget.scrollTop;
                      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                  }}
                  placeholder={conversation?.isArchived ? '会话已归档，无法输入消息' : '输入消息，输入 @ 唤起 Agent 选择器...'}
                  disabled={conversation?.isArchived}
                  className={`absolute inset-0 w-full h-full px-2 py-1.5 text-sm font-sans leading-normal outline-none resize-none bg-transparent focus:ring-0 border border-transparent ${
                    conversation?.isArchived 
                      ? 'text-slate-300 dark:text-slate-600 placeholder:text-slate-400 dark:placeholder:text-slate-600'
                      : inputValue ? 'text-transparent' : 'text-lark-text-primary dark:text-slate-150 placeholder:text-lark-text-tertiary dark:placeholder:text-slate-650'
                  }`}
                  style={{ wordBreak: 'break-word', caretColor: conversation?.isArchived ? 'transparent' : '#7c3aed' }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!canSend || conversation?.isArchived}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all flex-shrink-0 active:scale-95 mb-0.5 ${
                  conversation?.isArchived || !canSend
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    : 'bg-lark-primary text-white shadow-sm hover:bg-lark-primary-hover'
                }`}
                title="发送消息"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        ) : (
          <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-lark-border dark:border-slate-800 px-6 py-4 flex items-center gap-3 transition-colors">
            <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.73-3L13.73 4a2 2 0 00-3.46 0L3.27 16a2 2 0 001.8 3z" />
              </svg>
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                {agents[0].status === 'disabled' || agents[0].enabled === false ? `${agents[0].name} 已被隐藏停用，无法继续发送消息。` : `该智能体当前不可用，无法发送消息。`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
