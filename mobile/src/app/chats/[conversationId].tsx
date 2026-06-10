import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
  ScrollView,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useMessageStore } from '@/stores/useMessageStore';
import { useConversationStore } from '@/stores/useConversationStore';
import { useAgentStore } from '@/stores/useAgentStore';
import MessageBubble from '@/components/MessageBubble';
import ArtifactFullScreenModal from '@/components/ArtifactFullScreenModal';
import ImageViewer from '@/components/ImageViewer';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { conversationApi } from '@/api/conversationApi';
import ContextRing from '@/components/ContextRing';
import * as DocumentPicker from 'expo-document-picker';
import type { Artifact, ArtifactVersion, MessageAttachment, WorkspaceItem } from '@/types';
import { getWorkspaces, createWorkspace } from '@/services/workspaceService';
import { detectFileCategory, getFileIcon, getFileColor, getFileTypeLabel } from '@/utils/fileType';
import { formatTimeDivider, shouldShowTimeDivider } from '@/utils/timeFormat';

/**
 * 专用于消息列表的 ErrorBoundary，捕获 FlatList renderItem 内的渲染异常
 * 防止一个坏消息导致整个屏幕白屏/闪退
 */
class MsgListErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: any) {
    console.error('[MsgListErrorBoundary] 🚨 消息列表渲染崩溃:', error.message);
    console.error('[MsgListErrorBoundary] 📚 Stack:', error.stack);
    if (info?.componentStack) console.error('[MsgListErrorBoundary] componentStack:', info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f6f8fb' }}>
          <Ionicons name="warning-outline" size={40} color="#ef4444" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1f2329', marginTop: 12, marginBottom: 8 }}>消息渲染异常</Text>
          <Text style={{ fontSize: 12, color: '#646a73', textAlign: 'center', lineHeight: 18, marginBottom: 16 }}>
            {this.state.error?.message || '渲染消息时遇到了未预期的错误'}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#3370ff', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function ConversationScreen() {
  const { conversationId: rawConversationId } = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = rawConversationId || ''; // guard: never undefined — crasher #2
  const currentConversationId = useMessageStore((state) => state.currentConversationId);
  const messages = useMessageStore((state) => state.messages);
  const artifacts = useMessageStore((state) => state.artifacts);
  const loading = useMessageStore((state) => state.loading);
  const loadingMore = useMessageStore((state) => state.loadingMore);
  const hasMore = useMessageStore((state) => state.hasMore);
  const memories = useMessageStore((state) => state.memories);
  const contextUsage = useMessageStore((state) => state.contextUsage);
  const loadConversationData = useMessageStore((state) => state.loadConversationData);
  const loadMoreMessages = useMessageStore((state) => state.loadMoreMessages);
  const sendMessage = useMessageStore((state) => state.sendMessage);
  const togglePinMessage = useMessageStore((state) => state.togglePinMessage);
  const deleteMemory = useMessageStore((state) => state.deleteMemory);
  const compressContext = useMessageStore((state) => state.compressContext);
  const subConv = useMessageStore((state) => state.subscribeConversation);
  const unsubConv = useMessageStore((state) => state.unsubscribeConversation);
  const { conversations, updateConversation } = useConversationStore();
  const { agents, fetchAgents } = useAgentStore();
  
  // Workspace states for chat screen
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      setWorkspaceLoading(true);
      const result = await getWorkspaces();
      if (Array.isArray(result)) {
        setWorkspaces(result);
      }
    } catch (e) {
      console.error(e);
      setWorkspaces([]);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const filteredWorkspaces = workspaces.filter(w => 
    w && w.name && w.name.toLowerCase().includes(workspaceSearch.toLowerCase())
  );

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    try {
      const newWs = await createWorkspace(newWorkspaceName.trim());
      setWorkspaces(prev => [newWs, ...prev]);
      if (conversation) {
        updateConversation(conversation.id, { workspaceId: newWs.id });
      }
      setIsCreatingWorkspace(false);
      setNewWorkspaceName('');
    } catch (e) {
      Alert.alert('提示', '创建工作区失败');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleBindWorkspace = async (workspaceId: string) => {
    if (!conversation) return;
    updateConversation(conversation.id, { workspaceId });
    setShowWorkspaceModal(false);
  };

  // Artifact full-screen preview state
  const [artifactPreview, setArtifactPreview] = useState<{
    visible: boolean;
    artifact: Artifact | null;
    version?: ArtifactVersion;
  }>({ visible: false, artifact: null });
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [webSearchMode, setWebSearchMode] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);

  // Bubble context states
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [msgMenuVisible, setMsgMenuVisible] = useState(false);
  const [msgMenuY, setMsgMenuY] = useState(200);
  const [msgMenuX, setMsgMenuX] = useState(150);
  const [replyContext, setReplyContext] = useState<{ id: string; senderName: string; content: string } | null>(null);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [showArtifactPanel, setShowArtifactPanel] = useState(false);
  const [artifactSearch, setArtifactSearch] = useState('');
  const [showContextDialog, setShowContextDialog] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [imageViewer, setImageViewer] = useState<{ visible: boolean; url: string; name?: string }>({ visible: false, url: '' });
  const [memoryTab, setMemoryTab] = useState<'pins' | 'memories'>('pins');
  // Context popover position
  const contextBtnRef = useRef<any>(null);
  const [contextPopoverPosition, setContextPopoverPosition] = useState<{ x: number; y: number; width: number }>({ x: 0, y: 0, width: 0 });
  // 用户是否在最新消息附近（用于控制新消息是否自动滚动）
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [shouldInvertMessages, setShouldInvertMessages] = useState(false);
  const [isMessageListReady, setIsMessageListReady] = useState(false);
  const listLayoutHeightRef = useRef(0);
  const listContentHeightRef = useRef(0);
  // 是否正在加载历史消息（避免在加载历史时滚动到底部）
  const isLoadingHistory = useRef(false);

  const conversation = conversations.find((c) => c.id === conversationId);

  useEffect(() => {
    if (conversationId) {
      subConv(conversationId);
    }
    return () => {
      if (conversationId) {
        unsubConv(conversationId);
      }
    };
  }, [conversationId]);

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCompressContext = async () => {
    if (!conversationId) return;
    setCompressing(true);
    setShowContextDialog(false);
    try {
      await compressContext(conversationId);
    } catch {
      // 错误处理已在 store 中完成，会插入失败消息
    } finally {
      setCompressing(false);
    }
  };

  const getContextColor = (percent: number) => {
    if (percent >= 80) return '#ef4444';
    if (percent >= 50) return '#f59e0b';
    return '#10b981';
  };

  const formatChars = (n: number) => {
    if (n >= 1000) {
      return `${(n / 1000).toFixed(0)}K`;
    }
    return String(n);
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!conversationId) return;
    await deleteMemory(conversationId, memoryId);
  };

  // 进入会话时统一加载：消息 / pin / 记忆 / 上下文使用
  useEffect(() => {
    if (conversationId) {
      loadConversationData(conversationId);
    }
  }, [conversationId]);

  const chronologicalMessages = useMemo(() => {
    if (currentConversationId !== conversationId) return [];
    try {
      return [...messages].sort((a, b) => {
        // Defensive: NaN comparator crashes Hermes — crasher #3
        const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        return timeA - timeB;
      });
    } catch {
      return messages;
    }
  }, [conversationId, currentConversationId, messages]);

  // 生成带时间分隔的消息条目数组 (chronological 正序排列)
  // FlatList 的 inverted 属性负责反向展示，data 保持正序
  const messageItems = useMemo(() => {
    const items: ({ type: 'time-divider'; label: string } | { type: 'message'; msg: Message })[] = [];
    for (let i = 0; i < chronologicalMessages.length; i++) {
      const msg = chronologicalMessages[i];
      const prev = i > 0 ? chronologicalMessages[i - 1] : null;
      if (shouldShowTimeDivider(msg.createdAt, prev?.createdAt)) {
        items.push({ type: 'time-divider', label: formatTimeDivider(msg.createdAt) });
      }
      items.push({ type: 'message', msg });
    }
    return items;
  }, [chronologicalMessages]);

  const conversationArtifacts = useMemo(
    () => (currentConversationId === conversationId ? artifacts : []),
    [artifacts, conversationId, currentConversationId],
  );

  const filteredArtifacts = useMemo(() => {
    const query = artifactSearch.trim().toLowerCase();
    if (!query) return conversationArtifacts;

    return conversationArtifacts.filter((artifact) => {
      const searchable = [
        artifact.title,
        artifact.type,
        (artifact as any).description,
        artifact.runId,
        artifact.filePath,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [artifactSearch, conversationArtifacts]);

  const updateMessageListMode = (contentHeight = listContentHeightRef.current) => {
    const layoutHeight = listLayoutHeightRef.current;
    const canInvert = chronologicalMessages.length > 1 && layoutHeight > 0;

    setShouldInvertMessages((prev) => {
      if (!canInvert) return false;
      if (contentHeight > layoutHeight + 48) return true;
      if (contentHeight < layoutHeight - 80) return false;
      return prev;
    });
    setIsMessageListReady(layoutHeight > 0 && (chronologicalMessages.length <= 1 || contentHeight > 0));
  };

  useEffect(() => {
    listContentHeightRef.current = 0;
    setShouldInvertMessages(false);
    setIsMessageListReady(false);
    setIsNearBottom(true);
  }, [conversationId]);

  // 消息加载完成后自动滚动到底部（最新消息）
  useEffect(() => {
    if (!loading && messageItems.length > 0 && isMessageListReady) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [loading, messageItems.length, isMessageListReady]);

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAttachments: MessageAttachment[] = result.assets.map(asset => {
          const category = detectFileCategory({
            mimeType: asset.mimeType,
            name: asset.name,
          });

          const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          return {
            id: tempId,
            name: asset.name,
            type: category,
            mimeType: asset.mimeType || 'application/octet-stream',
            url: asset.uri,
            size: asset.size || undefined,
            file: asset as any,
          };
        });

        setPendingAttachments(prev => [...prev, ...selectedAttachments]);
      }
    } catch (error) {
      console.warn('Pick documents error:', error);
      Alert.alert('错误', '无法选择文件');
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && pendingAttachments.length === 0) || !conversationId) return;

    const text = inputText;
    const attachmentsToSend = pendingAttachments;
    setInputText('');
    setPendingAttachments([]);
    setReplyContext(null);
    setShowEmojiPicker(false);
    setShowMentionPopup(false);
    setSending(true);

    try {
      // Find agentId mentioned at the end of input if any
      const matches = [...text.matchAll(/@([^\s]+)/g)];
      let targetAgentId: string | undefined;
      if (matches.length > 0) {
        const lastName = matches[matches.length - 1][1];
        const found = agents.find(a => a.name === lastName);
        if (found) targetAgentId = found.id;
      }

      await sendMessage(
        conversationId,
        text,
        attachmentsToSend,
        targetAgentId,
        webSearchMode ? 'force' : 'off',
        replyContext?.id || undefined
      );
    } finally {
      setSending(false);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const selectMention = (agentName: string) => {
    setInputText(prev => {
      const lastAt = prev.lastIndexOf('@');
      if (lastAt === -1) return prev + `@${agentName} `;
      return prev.substring(0, lastAt) + `@${agentName} `;
    });
    setShowMentionPopup(false);
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (conversation?.mode === 'group' && text.endsWith('@')) {
      setShowMentionPopup(true);
    } else if (!text.includes('@')) {
      setShowMentionPopup(false);
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'code': return 'code-slash-outline';
      case 'html': return 'globe-outline';
      case 'markdown': return 'document-text-outline';
      case 'mermaid': return 'git-network-outline';
      case 'image': return 'image-outline';
      case 'document': return 'reader-outline';
      case 'ppt': return 'easel-outline';
      case 'diff': return 'git-compare-outline';
      default: return 'cube-outline';
    }
  };

  const COMMON_EMOJIS = ['😊', '😂', '👍', '🔥', '🙌', '🎉', '🤔', '👀', '💡', '🚀', '💻', '📝', '✨', '⚠️', '❌', '✅'];

  // 必须独立提取出来，不能写在 Stack.Screen options 的内联函数里
  const headerLeftComponent = () => {
    return (
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
        <Ionicons name="chevron-back" size={24} color="#1f2329" />
      </TouchableOpacity>
    );
  };

  const headerRightComponent = () => {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 }}>
        {conversation && (
          <>
            {/* Workspace Switcher Button */}
            <TouchableOpacity
                      onPress={() => {
                        if (!conversation) return;
                        setShowWorkspaceModal(true);
                        setWorkspaceSearch('');
                        setIsCreatingWorkspace(false);
                      }}
                      disabled={!conversation}
                      style={[styles.workspaceHeaderBtn, !!(conversation?.workspaceId) && styles.workspaceHeaderBtnActive]}
                    >
                      <Ionicons
                        name="cloud-outline"
                        size={15}
                        color={!!(conversation?.workspaceId) ? '#3370ff' : '#646a73'}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.workspaceHeaderBtnText,
                          !!(conversation?.workspaceId) && styles.workspaceHeaderBtnTextActive
                        ]}
                      >
                        {workspaces.find(w => w.id === conversation?.workspaceId)?.name || '未绑定'}
                      </Text>
                    </TouchableOpacity>

            {/* Context Indicator — prefer store contextUsage */}
            <TouchableOpacity
              ref={contextBtnRef}
              onLayout={(e) => {
                const layout = e.nativeEvent.layout;
                setContextPopoverPosition({
                  x: layout.x,
                  y: layout.y,
                  width: layout.width,
                });
              }}
              onPress={() => setShowContextDialog(!showContextDialog)}
              style={styles.headerIndicatorBtn}
            >
              <ContextRing
                percent={contextUsage?.contextUsagePercent || conversation.contextUsage?.contextUsagePercent || 0}
                color={getContextColor(contextUsage?.contextUsagePercent || conversation.contextUsage?.contextUsagePercent || 0)}
              />
              <Text style={styles.headerIndicatorText}>
                {Math.round(contextUsage?.contextUsagePercent || conversation.contextUsage?.contextUsagePercent || 0)}%
              </Text>
            </TouchableOpacity>

            {/* Long-term memory toggle */}
            <View style={styles.headerBtnWithBadge}>
              <TouchableOpacity
                onPress={() => setShowMemoryPanel(!showMemoryPanel)}
                style={[styles.headerIndicatorBtn, showMemoryPanel && styles.headerIndicatorBtnActive]}
              >
                <MaterialCommunityIcons
                  name="brain"
                  size={15}
                  color={showMemoryPanel ? '#d97706' : '#646a73'}
                />
              </TouchableOpacity>
              {messages.filter(m => m.isPinned).length > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>
                    {messages.filter(m => m.isPinned).length}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.headerBtnWithBadge}>
              <TouchableOpacity
                onPress={() => setShowArtifactPanel(!showArtifactPanel)}
                style={[styles.headerIndicatorBtn, showArtifactPanel && styles.artifactHeaderBtnActive]}
              >
                <Ionicons
                  name="cube-outline"
                  size={15}
                  color={showArtifactPanel ? '#3370ff' : '#646a73'}
                />
              </TouchableOpacity>
              {conversationArtifacts.length > 0 && (
                <View style={[styles.headerBadge, styles.artifactHeaderBadge]}>
                  <Text style={styles.headerBadgeText}>
                    {conversationArtifacts.length > 99 ? '99+' : conversationArtifacts.length}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
        
        <TouchableOpacity 
          onPress={() => {
            router.push(`/chats/settings?conversationId=${conversationId}`);
          }}
          style={{ padding: 4 }}
        >
          <Ionicons name="settings-outline" size={20} color="#646a73" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <Stack.Screen
          options={{
            headerTitle: conversation?.title || '会话聊天',
            headerTitleStyle: { fontSize: 16, fontWeight: '700', color: '#1f2329' },
            headerStyle: { backgroundColor: '#ffffff' },
            headerTintColor: '#1f2329',
            headerShadowVisible: false,
            headerLeft: headerLeftComponent,
            headerRight: headerRightComponent,
          }}
        />

        {/* 未绑定工作区提示条 */}
        {!!(conversation && !conversation.workspaceId) && (
          <View style={styles.noWorkspaceBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#d97706" />
            <Text style={styles.noWorkspaceBannerText}>
              当前会话未关联沙箱工作区。请先选择或新建一个沙箱工作区，否则智能体协同和沙箱运行将无法正常启动。
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (!conversation) return;
                setShowWorkspaceModal(true);
              }}
              style={styles.bindWorkspaceBannerBtn}
            >
              <Text style={styles.bindWorkspaceBannerBtnText}>绑定沙箱</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsible Pinned & Extracted Memory Panel - tap outside to close */}
        {showMemoryPanel && (
          <Modal
            transparent
            visible={showMemoryPanel}
            animationType="fade"
            onRequestClose={() => setShowMemoryPanel(false)}
          >
            <TouchableOpacity
              style={styles.panelOverlay}
              activeOpacity={1}
              onPress={() => setShowMemoryPanel(false)}
            >
              <View
                style={styles.memoryPanel}
                onStartShouldSetResponder={() => true}
              >
                <View style={styles.memoryPanelHeader}>
                  <View style={styles.memoryTabContainer}>
                    <TouchableOpacity
                      style={[styles.memoryTabBtn, memoryTab === 'pins' && styles.memoryTabBtnActive]}
                      onPress={() => setMemoryTab('pins')}
                    >
                      <Text style={[styles.memoryTabText, memoryTab === 'pins' && styles.memoryTabTextActive]}>
                        已pin消息 ({messages.filter(m => m.isPinned).length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.memoryTabBtn, memoryTab === 'memories' && styles.memoryTabBtnActive]}
                      onPress={() => setMemoryTab('memories')}
                    >
                      <Text style={[styles.memoryTabText, memoryTab === 'memories' && styles.memoryTabTextActive]}>
                        长期记忆 ({memories.length})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                  {memoryTab === 'pins' ? (
                    messages.filter(m => m.isPinned).length === 0 ? (
                      <Text style={styles.emptyMemoryText}>暂无已 Pin 消息。长按气泡可以 Pin 进记忆。</Text>
                    ) : (
                      messages.filter(m => m.isPinned).map((msg) => (
                        <View key={msg.id} style={styles.memoryItemCard}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.memoryItemSender}>@{msg.senderName}:</Text>
                            <Text style={styles.memoryItemText} numberOfLines={2}>{msg.content}</Text>
                          </View>
                          <TouchableOpacity onPress={() => togglePinMessage(conversationId!, msg.id)}>
                            <Ionicons name="trash-outline" size={15} color="#ff3b30" />
                          </TouchableOpacity>
                        </View>
                      ))
                    )
                  ) : (
                    memories.length === 0 ? (
                      <Text style={styles.emptyMemoryText}>暂无提取的记忆。系统会自动分析并提取会话中关键信息。</Text>
                    ) : (
                      memories.map((mem) => {
                        const categoryLabels: Record<string, string> = {
                          constraint: '开发约束',
                          project: '项目信息',
                          preference: '用户偏好',
                          profile: '基本属性'
                        };
                        return (
                          <View key={mem.id} style={styles.memoryItemCard}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <View style={styles.categoryBadgeMini}>
                                <Text style={styles.categoryBadgeMiniText}>
                                  {categoryLabels[mem.category] || '其他记忆'}
                                </Text>
                              </View>
                              <Text style={styles.memoryItemText}>{mem.content}</Text>
                            </View>
                            <TouchableOpacity onPress={() => handleDeleteMemory(mem.id)}>
                              <Ionicons name="trash-outline" size={15} color="#ff3b30" />
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )
                  )}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Artifact Panel - tap outside to close */}
        {showArtifactPanel && (
          <Modal
            transparent
            visible={showArtifactPanel}
            animationType="fade"
            onRequestClose={() => setShowArtifactPanel(false)}
          >
            <TouchableOpacity
              style={styles.panelOverlay}
              activeOpacity={1}
              onPress={() => setShowArtifactPanel(false)}
            >
              <View
                style={styles.artifactPanel}
                onStartShouldSetResponder={() => true}
              >
                <View style={styles.artifactPanelHeader}>
                  <View>
                    <Text style={styles.artifactPanelTitle}>会话产物</Text>
                    <Text style={styles.artifactPanelSubtitle}>
                      {conversationArtifacts.length > 0 ? `共 ${conversationArtifacts.length} 个产物` : '暂无产物'}
                    </Text>
                  </View>
                </View>

                {conversationArtifacts.length > 0 && (
                  <View style={styles.artifactSearchBox}>
                    <Ionicons name="search-outline" size={15} color="#8f959e" />
                    <TextInput
                      value={artifactSearch}
                      onChangeText={setArtifactSearch}
                      placeholder="搜索产物名称、类型或运行批次"
                      placeholderTextColor="#8f959e"
                      style={styles.artifactSearchInput}
                    />
                    {artifactSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setArtifactSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#8f959e" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {conversationArtifacts.length === 0 ? (
                  <Text style={styles.emptyArtifactText}>当前会话还没有生成产物。</Text>
                ) : filteredArtifacts.length === 0 ? (
                  <Text style={styles.emptyArtifactText}>没有匹配的产物。</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.artifactListContent}
                  >
                    {filteredArtifacts.map((artifact) => (
                      <TouchableOpacity
                        key={artifact.id}
                        style={styles.artifactCard}
                        activeOpacity={0.86}
                        onPress={() => {
                          setShowArtifactPanel(false);
                          setArtifactPreview({ visible: true, artifact });
                        }}
                      >
                        <View style={styles.artifactCardTop}>
                          <View style={styles.artifactIconBox}>
                            <Ionicons name={getArtifactIcon(artifact.type) as any} size={18} color="#3370ff" />
                          </View>
                          <Ionicons name="expand-outline" size={15} color="#8f959e" />
                        </View>
                        <Text style={styles.artifactCardTitle} numberOfLines={2}>
                          {artifact.title || '未命名产物'}
                        </Text>
                        <View style={styles.artifactCardMeta}>
                          <Text style={styles.artifactTypeText}>{artifact.type.toUpperCase()}</Text>
                          <Text style={styles.artifactMetaDot}>·</Text>
                          <Text style={styles.artifactTypeText}>v{artifact.latestVersion || '?'}</Text>
                        </View>
                        {artifact.runId ? (
                          <Text style={styles.artifactRunText} numberOfLines={1}>
                            {artifact.runId === 'direct' ? '直接生成' : artifact.runId}
                          </Text>
                        ) : (
                          <Text style={styles.artifactRunText}>未关联运行批次</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        <MsgListErrorBoundary>
        <FlatList
          ref={flatListRef}
          data={messageItems}
          inverted={false}
          style={[
            styles.messageList,
            !isMessageListReady && chronologicalMessages.length > 1 && styles.messageListHidden,
          ]}
          keyExtractor={(item) => item.type === 'time-divider' ? `divider-${item.label}` : item.msg?.id || `msg-${Math.random()}`}
          renderItem={({ item }) => {
            if (!item) return null;
            // 时间分隔行
            if (item.type === 'time-divider') {
              return (
                <View style={styles.timeDivider}>
                  <View style={styles.timeDividerLine} />
                  <View style={styles.timeDividerLabel}>
                    <Text style={styles.timeDividerText}>{item.label}</Text>
                  </View>
                  <View style={styles.timeDividerLine} />
                </View>
              );
            }
            // 普通消息
            const msg = item.msg;
            if (!msg) return null;
            return (
              <TouchableOpacity
                activeOpacity={1}
                onLongPress={(event) => {
                  const pageY = event?.nativeEvent?.pageY || 200;
                  const pageX = event?.nativeEvent?.pageX || 150;
                  setSelectedMessage(msg);
                  setMsgMenuY(pageY);
                  setMsgMenuX(pageX);
                  setMsgMenuVisible(true);
                }}
              >
                <MessageBubble
                  message={msg}
                  agents={agents}
                  onOpenArtifactFullScreen={(artifact, version) =>
                    setArtifactPreview({ visible: true, artifact, version })}
                  onImagePress={(url, name) =>
                    setImageViewer({ visible: true, url, name })
                  }
                />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={(_, height) => {
            listContentHeightRef.current = height;
            updateMessageListMode(height);
          }}
          onLayout={(event) => {
            listLayoutHeightRef.current = event.nativeEvent.layout.height;
            updateMessageListMode();
            setIsNearBottom(true);
          }}
          onScroll={(e) => {
            if (!isMessageListReady) return;

            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            const latestDistance = shouldInvertMessages
              ? contentOffset.y
              : contentSize.height - layoutMeasurement.height - contentOffset.y;
            const olderDistance = shouldInvertMessages
              ? contentSize.height - layoutMeasurement.height - contentOffset.y
              : contentOffset.y;

            setIsNearBottom(latestDistance < 80);

            if (hasMore && conversationId && !loadingMore) {
              const canLoadOlder = contentSize.height > layoutMeasurement.height + 40;
              if (canLoadOlder && olderDistance >= 0 && olderDistance < 40) {
                isLoadingHistory.current = true;
                loadMoreMessages(conversationId).finally(() => {
                  isLoadingHistory.current = false;
                });
              }
            }
          }}
          scrollEventThrottle={100}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#208AEF" />
              </View>
            ) : !currentConversationId ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="cloud-offline-outline" size={32} color="#c4c9d1" />
                <Text style={styles.emptyText}>数据加载失败，请下拉刷新重试</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>没有消息，开始聊天吧！</Text>
              </View>
            )
          }
          ListHeaderComponent={
            !shouldInvertMessages && loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color="#8f959e" />
                <Text style={styles.loadingMoreText}>加载更多...</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            shouldInvertMessages && loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color="#8f959e" />
                <Text style={styles.loadingMoreText}>加载更多...</Text>
              </View>
            ) : null
          }
        />
      </MsgListErrorBoundary>

        {/* Floating Mention List Popover */}
        {showMentionPopup && (
          <View style={styles.floatingPanel}>
            <Text style={styles.floatingPanelTitle}>提及成员 (@)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {agents.filter(a => a.id !== 'agent-orchestrator').map((agent) => (
                <TouchableOpacity
                  key={agent.id}
                  style={styles.mentionItem}
                  onPress={() => selectMention(agent.name)}
                >
                  <Text style={styles.mentionItemText}>@{agent.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Floating Emoji Picker Popover */}
        {showEmojiPicker && (
          <View style={styles.floatingPanel}>
            <Text style={styles.floatingPanelTitle}>常用表情</Text>
            <View style={styles.emojiGrid}>
              {COMMON_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiBtn}
                  onPress={() => handleSelectEmoji(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Reply Banner Above Input */}
        {replyContext && (
          <View style={styles.replyBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyTitle}>回复 @{replyContext.senderName}</Text>
              <Text style={styles.replyContent} numberOfLines={1}>{replyContext.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyContext(null)}>
              <Ionicons name="close-circle" size={18} color="#8f959e" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Toolbar actions */}
        <View style={styles.toolbarContainer}>
          <TouchableOpacity
            style={[styles.toolbarBtn, webSearchMode && styles.toolbarBtnActive]}
            onPress={() => setWebSearchMode(!webSearchMode)}
          >
            <Ionicons name="globe-outline" size={16} color={webSearchMode ? '#3370ff' : '#646a73'} />
            <Text style={[styles.toolbarBtnText, webSearchMode && styles.toolbarBtnTextActive]}>
              联网搜索
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Ionicons name="happy-outline" size={16} color="#646a73" />
            <Text style={styles.toolbarBtnText}>表情</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={pickDocuments}
          >
            <Ionicons name="attach-outline" size={16} color="#646a73" />
            <Text style={styles.toolbarBtnText}>上传文件</Text>
          </TouchableOpacity>

          {conversation?.mode === 'group' && (
            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={() => setShowMentionPopup(!showMentionPopup)}
            >
              <Ionicons name="at-outline" size={16} color="#646a73" />
              <Text style={styles.toolbarBtnText}>提及成员</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Pending Attachments list */}
        {pendingAttachments.length > 0 && (
          <View style={styles.pendingAttachmentsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingAttachmentsScroll}>
              {pendingAttachments.map((attach) => {
                const cat = detectFileCategory(attach);
                const iconName = getFileIcon(cat);
                const iconColor = getFileColor(cat);
                return (
                  <View key={attach.id} style={styles.pendingAttachmentBadge}>
                    <Ionicons name={iconName} size={14} color={iconColor} style={{ marginRight: 4 }} />
                    <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                      {attach.name}
                    </Text>
                    <Text style={[styles.pendingAttachmentType, { color: iconColor, backgroundColor: iconColor + '18' }]}>
                      {getFileTypeLabel(cat)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setPendingAttachments(prev => prev.filter(a => a.id !== attach.id))}
                      style={styles.pendingAttachmentClose}
                    >
                      <Ionicons name="close-circle" size={14} color="#8f959e" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="发送消息..."
            value={inputText}
            onChangeText={handleInputChange}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() && pendingAttachments.length === 0) && styles.sendButtonDisabled
            ]}
            onPress={() => {
              handleSend();
              if (replyContext) setReplyContext(null);
            }}
            disabled={(!inputText.trim() && pendingAttachments.length === 0) || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* All Modal components outside KeyboardAvoidingView */}
      <ArtifactFullScreenModal
        visible={artifactPreview.visible}
        artifact={artifactPreview.artifact}
        initialVersion={artifactPreview.version}
        onClose={() => setArtifactPreview({ visible: false, artifact: null })}
      />

      <ImageViewer
        visible={imageViewer.visible}
        imageUrl={imageViewer.url}
        imageName={imageViewer.name}
        onClose={() => setImageViewer({ visible: false, url: '' })}
      />

      {/* Context usage popover - aligned with frontend */}
      {showContextDialog && conversation && (() => {
        const ctxUsage = contextUsage || conversation.contextUsage || { contextUsagePercent: 0, contextUsageChars: 0, contextLimitChars: 200000 };
        const percent = ctxUsage.contextUsagePercent || 0;
        const color = getContextColor(percent);
        const screenWidth = Dimensions.get('window').width;
        const popoverWidth = 180;
        // 计算弹窗位置：从按钮中心向左偏移一半宽度，按钮在headerRight区域，所以x轴位置在屏幕右侧区域
        // Header right区域在右上角，所以弹窗定位在右上角按钮正下方
        const popupLeft = Math.max(16, screenWidth - 180 - 16 - 40);
        const popupTop = 60; // 在header下方
        
        const arrowLeft = Math.min(popoverWidth - 24, Math.max(16, popoverWidth / 2 - 8));
        
        return (
          <Modal
            transparent
            visible={showContextDialog}
            animationType="fade"
            onRequestClose={() => setShowContextDialog(false)}
          >
            <TouchableOpacity
              style={styles.popoverFullOverlay}
              activeOpacity={1}
              onPress={() => setShowContextDialog(false)}
            >
              <View style={[styles.contextPopoverBox, { left: popupLeft, top: popupTop, width: popoverWidth }]}>
                <View style={styles.contextPopoverContent}>
                  <View style={styles.contextPopoverTopRow}>
                    <Text style={styles.contextPopoverLabel}>占合度</Text>
                    <Text style={styles.contextPopoverChars}>
                      {formatChars(ctxUsage.contextUsageChars || 0)} / {formatChars(ctxUsage.contextLimitChars || 200000)}
                    </Text>
                  </View>
                  
                  <View style={styles.contextPopoverPercentRow}>
                    <Text style={[styles.contextPopoverBigPercent, { color }]}>
                      {Math.round(percent)}%
                    </Text>
                    <Text style={styles.contextPopoverUsedLabel}>已使用</Text>
                  </View>
                  
                  <TouchableOpacity
                    onPress={() => {
                      handleCompressContext();
                      setShowContextDialog(false);
                    }}
                    disabled={compressing}
                    style={styles.contextPopoverCompressBtn}
                  >
                    {compressing ? (
                      <ActivityIndicator size="small" color="#64748b" />
                    ) : (
                      <>
                        <Ionicons name="cut-outline" size={10} color="#64748b" />
                        <Text style={styles.contextPopoverCompressBtnText}>压缩上下文</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {/* 尖角箭头 */}
                <View style={[styles.contextPopoverArrow, { left: arrowLeft }]} />
              </View>
            </TouchableOpacity>
          </Modal>
        );
      })()}

      {/* Message Long-Press Context Menu */}
      {selectedMessage && (() => {
        const screenWidth = Dimensions.get('window').width;
        const screenHeight = Dimensions.get('window').height;
        const menuHeight = 120;
        let topPosition = msgMenuY + 10;
        let arrowDirection = 'up';

        if (topPosition + menuHeight > screenHeight - 60) {
          topPosition = msgMenuY - menuHeight - 10;
          arrowDirection = 'down';
        }
        if (topPosition < 60) {
          topPosition = 60;
          arrowDirection = topPosition < msgMenuY ? 'down' : 'up';
        }

        let leftPosition = msgMenuX - 100;
        if (leftPosition + 200 > screenWidth - 16) {
          leftPosition = screenWidth - 200 - 16;
        }
        if (leftPosition < 16) {
          leftPosition = 16;
        }

        let arrowLeft = msgMenuX - leftPosition - 8;
        if (arrowLeft < 16) arrowLeft = 16;
        if (arrowLeft > 200 - 32) arrowLeft = 200 - 32;

        return (
          <Modal
            transparent
            visible={msgMenuVisible}
            animationType="fade"
            onRequestClose={() => setMsgMenuVisible(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setMsgMenuVisible(false)}
            >
              <View style={[styles.msgMenuBox, { top: topPosition, left: leftPosition }]}>
                {arrowDirection === 'up' ? (
                  <View style={[styles.arrow, styles.arrowUp, { left: arrowLeft }]} />
                ) : (
                  <View style={[styles.arrow, styles.arrowDown, { left: arrowLeft }]} />
                )}

                <TouchableOpacity
                  style={styles.msgMenuBtn}
                  onPress={() => {
                    setReplyContext({
                      id: selectedMessage.id,
                      senderName: selectedMessage.senderName || 'AI',
                      content: selectedMessage.content,
                    });
                    setMsgMenuVisible(false);
                  }}
                >
                  <Ionicons name="arrow-undo-outline" size={16} color="#1f2329" />
                  <Text style={styles.msgMenuBtnText}>回复</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.msgMenuBtn}
                  onPress={() => {
                    togglePinMessage(conversationId!, selectedMessage.id);
                    setMsgMenuVisible(false);
                  }}
                >
                  <Ionicons name="bookmark-outline" size={16} color="#1f2329" />
                  <Text style={styles.msgMenuBtnText}>
                    {selectedMessage.isPinned ? '取消 Pin 长期记忆' : 'Pin 为长期记忆'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.msgMenuDivider} />

                <TouchableOpacity
                  style={styles.msgMenuBtn}
                  onPress={() => {
                    Clipboard.setStringAsync(selectedMessage.content);
                    Alert.alert('提示', '已复制消息内容到剪贴板！');
                    setMsgMenuVisible(false);
                  }}
                >
                  <Ionicons name="copy-outline" size={16} color="#1f2329" />
                  <Text style={styles.msgMenuBtnText}>复制</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        );
      })()}

      {/* Workspace Selection Modal */}
      <Modal
        visible={showWorkspaceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWorkspaceModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowWorkspaceModal(false);
            setIsCreatingWorkspace(false);
            setWorkspaceSearch('');
          }}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择工作区</Text>
              <TouchableOpacity onPress={() => {
                setShowWorkspaceModal(false);
                setIsCreatingWorkspace(false);
                setWorkspaceSearch('');
              }}>
                <Ionicons name="close" size={22} color="#8f959e" />
              </TouchableOpacity>
            </View>

            {/* Search Box */}
            <View style={styles.workspaceSearchBox}>
              <Ionicons name="search-outline" size={16} color="#8f959e" />
              <TextInput
                style={styles.workspaceSearchInput}
                value={workspaceSearch}
                onChangeText={setWorkspaceSearch}
                placeholder="搜索沙箱工作区..."
                placeholderTextColor="#8f959e"
              />
              {workspaceSearch.length > 0 && (
                <TouchableOpacity onPress={() => setWorkspaceSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#8f959e" />
                </TouchableOpacity>
              )}
            </View>

            {/* Workspace List with Scroll */}
            {workspaceLoading ? (
              <View style={styles.loadingWrapper}>
                <ActivityIndicator size="small" color="#3370ff" />
              </View>
            ) : (
              <ScrollView style={styles.workspaceListScroll} showsVerticalScrollIndicator={false}>
                {/* Unbind option */}
                {conversation?.workspaceId ? (
                  <TouchableOpacity
                    style={styles.wsItem}
                    onPress={() => {
                      if (conversation && conversation.id) {
                        updateConversation(conversation.id, { workspaceId: '' });
                      }
                      setShowWorkspaceModal(false);
                    }}
                  >
                    <View style={styles.wsItemLeft}>
                      <Ionicons
                        name="cloud-outline"
                        size={18}
                        color={!conversation?.workspaceId ? '#3370ff' : '#646a73'}
                      />
                      <Text
                        style={[styles.wsItemName, !conversation?.workspaceId && styles.wsItemNameActive]}
                        numberOfLines={1}
                      >
                        未绑定沙箱
                      </Text>
                    </View>
                    {!conversation?.workspaceId && <Ionicons name="checkmark-circle" size={18} color="#3370ff" />}
                  </TouchableOpacity>
                ) : null}

                {filteredWorkspaces.length === 0 && workspaceSearch ? (
                  <Text style={styles.noMatchText}>无匹配工作区</Text>
                ) : filteredWorkspaces.length === 0 && !workspaceSearch ? (
                  <Text style={styles.noMatchText}>暂无工作区，请新建</Text>
                ) : (
                  filteredWorkspaces.map((w) => {
                    const isSelected = conversation?.workspaceId === w.id;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.wsItem, isSelected && styles.wsItemActive]}
                        onPress={() => handleBindWorkspace(w.id)}
                      >
                        <View style={styles.wsItemLeft}>
                          <Ionicons
                            name="cloud-outline"
                            size={18}
                            color={isSelected ? '#3370ff' : '#646a73'}
                          />
                          <Text
                            style={[styles.wsItemName, isSelected && styles.wsItemNameActive]}
                            numberOfLines={1}
                          >
                            {w.name}
                          </Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={18} color="#3370ff" />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Separator */}
            <View style={styles.wsSeparator} />

            {/* Create New Workspace Area */}
            {isCreatingWorkspace ? (
              <View style={styles.createWsCard}>
                <TextInput
                  style={styles.newWsInput}
                  placeholder="沙箱名称..."
                  placeholderTextColor="#8f959e"
                  value={newWorkspaceName}
                  onChangeText={setNewWorkspaceName}
                  autoFocus
                />
                <View style={styles.newWsActions}>
                  <TouchableOpacity
                    style={styles.newWsCancelBtn}
                    onPress={() => {
                      setIsCreatingWorkspace(false);
                      setNewWorkspaceName('');
                    }}
                  >
                    <Text style={styles.newWsCancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.newWsConfirmBtn}
                    onPress={handleCreateWorkspace}
                    disabled={creatingWorkspace || !newWorkspaceName.trim()}
                  >
                    {creatingWorkspace ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.newWsConfirmBtnText}>确定</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.createNewWsBtn}
                onPress={() => setIsCreatingWorkspace(true)}
              >
                <Ionicons name="add" size={16} color="#3370ff" />
                <Text style={styles.createNewWsBtnText}>新建沙箱工作区</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8fb',
  },
  messageList: {
    flex: 1,
  },
  messageListHidden: {
    opacity: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 24,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#8f959e',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  loadingMoreText: {
    fontSize: 12,
    color: '#8f959e',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
  },
  input: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e1e7f0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    fontSize: 15,
    color: '#1f2329',
    lineHeight: 20,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    marginBottom: 2,
    shadowColor: '#3370ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#eff0f1',
    shadowColor: 'transparent',
    elevation: 0,
  },
  // Toolbar and Floating Panel Styles
  toolbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    gap: 8,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f5f7fb',
    gap: 4,
  },
  toolbarBtnActive: {
    backgroundColor: '#deebff',
  },
  toolbarBtnText: {
    fontSize: 11,
    color: '#646a73',
    fontWeight: '600',
  },
  toolbarBtnTextActive: {
    color: '#3370ff',
  },
  pendingAttachmentsContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    paddingVertical: 8,
    paddingLeft: 14,
  },
  pendingAttachmentsScroll: {
    gap: 8,
    paddingRight: 14,
  },
  pendingAttachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f7fb',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },
  pendingAttachmentText: {
    fontSize: 11,
    color: '#1f2329',
    maxWidth: 120,
  },
  pendingAttachmentType: {
    fontSize: 8,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  pendingAttachmentClose: {
    marginLeft: 2,
  },
  floatingPanel: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eff0f1',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 4,
  },
  floatingPanelTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8f959e',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  emojiBtn: {
    width: '10%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 18,
  },
  mentionItem: {
    backgroundColor: '#deebff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3370ff',
  },
  mentionItemText: {
    fontSize: 12,
    color: '#3370ff',
    fontWeight: '600',
  },
  headerBtnWithBadge: {
    position: 'relative',
  },
  headerIndicatorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f7fb',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
  },
  headerIndicatorBtnActive: {
    backgroundColor: '#fef3c7',
  },
  artifactHeaderBtnActive: {
    backgroundColor: '#deebff',
  },
  headerIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#646a73',
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#d97706',
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    zIndex: 20,
  },
  headerBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
  },
  artifactHeaderBadge: {
    backgroundColor: '#3370ff',
  },
  artifactPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: 14,
    paddingBottom: 14,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 10,
  },
  artifactPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  artifactPanelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1f2329',
  },
  artifactPanelSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#8f959e',
  },
  artifactSearchBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eef2f7',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  artifactSearchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    color: '#1f2329',
    paddingVertical: 0,
  },
  artifactListContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  artifactCard: {
    width: 180,
    minHeight: 130,
    backgroundColor: '#fafbfc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eef2f7',
    padding: 14,
  },
  artifactCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  artifactIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artifactCardTitle: {
    minHeight: 40,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#1f2329',
  },
  artifactCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  artifactTypeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4f6ef7',
  },
  artifactMetaDot: {
    fontSize: 10,
    color: '#c4c9d1',
  },
  artifactRunText: {
    marginTop: 8,
    fontSize: 10,
    color: '#8f959e',
    backgroundColor: '#f0f2f5',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  emptyArtifactText: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 12,
    color: '#8f959e',
    textAlign: 'center',
  },
  memoryPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 8,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 10,
  },
  memoryPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  memoryPanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#d97706',
  },
  emptyMemoryText: {
    fontSize: 12,
    color: '#8f959e',
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 18,
  },
  memoryItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  memoryItemSender: {
    fontSize: 10,
    fontWeight: '700',
    color: '#646a73',
    marginBottom: 3,
  },
  memoryItemText: {
    fontSize: 12,
    color: '#1f2329',
    lineHeight: 17,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderTopWidth: 1,
    borderTopColor: '#eff0f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  replyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3370ff',
    marginBottom: 2,
  },
  replyContent: {
    fontSize: 12,
    color: '#646a73',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  contextModalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 280,
    padding: 16,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  contextModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
    paddingBottom: 8,
    marginBottom: 12,
  },
  contextModalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2329',
  },
  contextUsageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contextLabel: {
    fontSize: 12,
    color: '#8f959e',
  },
  contextValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2329',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#f5f6f7',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  compressBtn: {
    backgroundColor: '#3370ff',
    borderRadius: 8,
    height: 36,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  compressBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  msgMenuBox: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    width: 180,
    paddingVertical: 4,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#eff0f1',
  },
  msgMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  msgMenuBtnText: {
    fontSize: 13,
    color: '#1f2329',
    marginLeft: 10,
  },
  msgMenuDivider: {
    height: 1,
    backgroundColor: '#eff0f1',
    marginVertical: 4,
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
  },
  arrowUp: {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
    borderTopColor: 'transparent',
    borderBottomWidth: 6,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 0,
    top: -6,
  },
  arrowDown: {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderTopColor: '#ffffff',
    borderBottomWidth: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    bottom: -6,
  },
  contextCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  memoryTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f2f5',
    borderRadius: 10,
    padding: 3,
    flex: 1,
    marginRight: 0,
  },
  memoryTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  memoryTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  memoryTabText: {
    fontSize: 12,
    color: '#8f959e',
    fontWeight: '600',
  },
  memoryTabTextActive: {
    color: '#3370ff',
    fontWeight: '700',
  },
  categoryBadgeMini: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  categoryBadgeMiniText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4f6ef7',
  },
  noWorkspaceBanner: {
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(217, 119, 6, 0.2)',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
  },
  noWorkspaceBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#d97706',
    fontWeight: '500',
  },
  bindWorkspaceBannerBtn: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  bindWorkspaceBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#d97706',
  },
  workspaceHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f7fb',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  workspaceHeaderBtnActive: {
    backgroundColor: '#deebff',
    borderWidth: 1,
    borderColor: '#3370ff',
  },
  workspaceHeaderBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#646a73',
    maxWidth: 70,
  },
  workspaceHeaderBtnTextActive: {
    color: '#3370ff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2329',
  },
  workspaceSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  workspaceSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    paddingHorizontal: 8,
    color: '#1f2329',
  },
  loadingWrapper: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  workspaceListScroll: {
    maxHeight: 250,
  },
  wsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  wsItemActive: {
    backgroundColor: '#deebff',
  },
  wsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  wsItemName: {
    fontSize: 13,
    color: '#1f2329',
    flex: 1,
  },
  wsItemNameActive: {
    fontWeight: '700',
    color: '#3370ff',
  },
  noMatchText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 12,
    color: '#8f959e',
  },
  wsSeparator: {
    height: 1,
    backgroundColor: '#eff0f1',
    marginVertical: 12,
  },
  createNewWsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#3370ff',
    borderStyle: 'dashed',
    borderRadius: 10,
    gap: 6,
  },
  createNewWsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3370ff',
  },
  createWsCard: {
    padding: 12,
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  newWsInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: '#1f2329',
    marginBottom: 10,
  },
  newWsActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  newWsCancelBtn: {
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f5f6f7',
  },
  newWsCancelBtnText: {
    fontSize: 12,
    color: '#646a73',
    fontWeight: '600',
  },
  newWsConfirmBtn: {
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#3370ff',
  },
  newWsConfirmBtnText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  // Context Popover styles - aligned with frontend
  panelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-start',
  },
  popoverFullOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  contextPopoverBox: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  contextPopoverContent: {
    padding: 10,
  },
  contextPopoverTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contextPopoverLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  contextPopoverChars: {
    fontSize: 10,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '500',
  },
  contextPopoverPercentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  contextPopoverBigPercent: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  contextPopoverUsedLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: 'normal',
  },
  contextPopoverCompressBtn: {
    marginTop: 8,
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  contextPopoverCompressBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  contextPopoverArrow: {
    position: 'absolute',
    top: -4,
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#e5e7eb',
    transform: [{ rotate: '45deg' }],
  },

  // ── 时间分隔行 ──
  timeDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    paddingHorizontal: 16,
  },
  timeDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#dee0e3',
  },
  timeDividerLabel: {
    marginHorizontal: 12,
    backgroundColor: '#f6f8fb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeDividerText: {
    fontSize: 11,
    color: '#8f959e',
    fontWeight: '600',
  },
});