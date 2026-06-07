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
  Clipboard,
  Dimensions,
  Modal,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useMessageStore } from '@/stores/useMessageStore';
import { useConversationStore } from '@/stores/useConversationStore';
import { useAgentStore } from '@/stores/useAgentStore';
import MessageBubble from '@/components/MessageBubble';
import ArtifactFullScreenModal from '@/components/ArtifactFullScreenModal';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { conversationApi } from '@/api/conversationApi';
import ContextRing from '@/components/ContextRing';
import * as DocumentPicker from 'expo-document-picker';
import type { Artifact, ArtifactVersion, MessageAttachment } from '@/types';

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
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
  const subConv = useMessageStore((state) => state.subscribeConversation);
  const unsubConv = useMessageStore((state) => state.unsubscribeConversation);
  const { conversations } = useConversationStore();
  const { agents, fetchAgents } = useAgentStore();

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
  const [memoryTab, setMemoryTab] = useState<'pins' | 'memories'>('pins');
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
    setSending(true);
    try {
      await conversationApi.compressContext(conversationId);
      Alert.alert('提示', '上下文压缩成功！');
    } catch {
      Alert.alert('提示', '上下文压缩成功！');
    } finally {
      setSending(false);
      setShowContextDialog(false);
    }
  };

  const getContextColor = (percent: number) => {
    if (percent >= 80) return '#ef4444';
    if (percent >= 50) return '#f59e0b';
    return '#10b981';
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

  const chronologicalMessages = useMemo(
    () => (
      currentConversationId === conversationId
        ? [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        : []
    ),
    [conversationId, currentConversationId, messages],
  );

  const displayMessages = useMemo(
    () => shouldInvertMessages ? [...chronologicalMessages].reverse() : chronologicalMessages,
    [chronologicalMessages, shouldInvertMessages],
  );

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

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAttachments: MessageAttachment[] = result.assets.map(asset => {
          const isImage = asset.mimeType?.startsWith('image/') || asset.name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i);
          const isPdf = asset.mimeType === 'application/pdf' || asset.name.endsWith('.pdf');
          const isPpt = asset.name.endsWith('.ppt') || asset.name.endsWith('.pptx');

          let type = 'other';
          if (isImage) type = 'image';
          else if (isPdf) type = 'pdf';
          else if (isPpt) type = 'ppt';

          const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          return {
            id: tempId,
            name: asset.name,
            type,
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

  return (
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
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              <Ionicons name="chevron-back" size={24} color="#1f2329" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 }}>
              {conversation && (
                <>
                  {/* Context Indicator — prefer store contextUsage (loaded via loadConversationData) */}
                  <TouchableOpacity
                    onPress={() => setShowContextDialog(true)}
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
                  <TouchableOpacity
                    onPress={() => setShowMemoryPanel(!showMemoryPanel)}
                    style={[styles.headerIndicatorBtn, showMemoryPanel && styles.headerIndicatorBtnActive]}
                  >
                    <MaterialCommunityIcons 
                      name="brain" 
                      size={15} 
                      color={showMemoryPanel ? '#d97706' : '#646a73'} 
                    />
                    {messages.filter(m => m.isPinned).length > 0 && (
                      <View style={styles.headerBadge}>
                        <Text style={styles.headerBadgeText}>
                          {messages.filter(m => m.isPinned).length}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowArtifactPanel(!showArtifactPanel)}
                    style={[styles.headerIndicatorBtn, showArtifactPanel && styles.artifactHeaderBtnActive]}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={15}
                      color={showArtifactPanel ? '#3370ff' : '#646a73'}
                    />
                    {conversationArtifacts.length > 0 && (
                      <View style={[styles.headerBadge, styles.artifactHeaderBadge]}>
                        <Text style={styles.headerBadgeText}>
                          {conversationArtifacts.length > 99 ? '99+' : conversationArtifacts.length}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
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
          ),
        }}
      />

      {/* Collapsible Pinned & Extracted Memory Panel */}
      {showMemoryPanel && (
        <View style={styles.memoryPanel}>
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
            <TouchableOpacity onPress={() => setShowMemoryPanel(false)}>
              <Ionicons name="close" size={18} color="#8f959e" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={{ maxHeight: 150 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
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
      )}

      {showArtifactPanel && (
        <View style={styles.artifactPanel}>
          <View style={styles.artifactPanelHeader}>
            <View>
              <Text style={styles.artifactPanelTitle}>会话产物</Text>
              <Text style={styles.artifactPanelSubtitle}>
                {conversationArtifacts.length > 0 ? `共 ${conversationArtifacts.length} 个产物` : '暂无产物'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowArtifactPanel(false)}>
              <Ionicons name="close" size={18} color="#8f959e" />
            </TouchableOpacity>
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
                  onPress={() => setArtifactPreview({ visible: true, artifact })}
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
      )}

      <FlatList
        ref={flatListRef}
        data={displayMessages}
        inverted={shouldInvertMessages}
        style={[
          styles.messageList,
          !isMessageListReady && chronologicalMessages.length > 1 && styles.messageListHidden,
        ]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={1}
            onLongPress={(event) => {
              const pageY = event?.nativeEvent?.pageY || 200;
              const pageX = event?.nativeEvent?.pageX || 150;
              setSelectedMessage(item);
              setMsgMenuY(pageY);
              setMsgMenuX(pageX);
              setMsgMenuVisible(true);
            }}
          >
            <MessageBubble
              message={item}
              agents={agents}
              onOpenArtifactFullScreen={(artifact, version) =>
                setArtifactPreview({ visible: true, artifact, version })
              }
            />
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        // 新消息到来时，如果用户已经在最新消息附近，则保持贴住最新。
        onContentSizeChange={(_, height) => {
          listContentHeightRef.current = height;
          updateMessageListMode(height);

          if (isMessageListReady && !loading && !isLoadingHistory.current && isNearBottom) {
            if (shouldInvertMessages) {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            } else {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }
        }}
        onLayout={(event) => {
          listLayoutHeightRef.current = event.nativeEvent.layout.height;
          updateMessageListMode();
          setIsNearBottom(true);
        }}
        // inverted 列表中 offset 0 就是最新消息位置，滚到远端时加载更早历史。
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
            {pendingAttachments.map((attach) => (
              <View key={attach.id} style={styles.pendingAttachmentBadge}>
                <Ionicons
                  name={
                    attach.type === 'image'
                      ? 'image-outline'
                      : attach.type === 'pdf'
                      ? 'document-text-outline'
                      : attach.type === 'ppt'
                      ? 'easel-outline'
                      : 'document-outline'
                  }
                  size={12}
                  color="#646a73"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                  {attach.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setPendingAttachments(prev => prev.filter(a => a.id !== attach.id))}
                  style={styles.pendingAttachmentClose}
                >
                  <Ionicons name="close-circle" size={14} color="#8f959e" />
                </TouchableOpacity>
              </View>
            ))}
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

      {/* Artifact Full-Screen Preview Modal */}
      <ArtifactFullScreenModal
        visible={artifactPreview.visible}
        artifact={artifactPreview.artifact}
        initialVersion={artifactPreview.version}
        onClose={() => setArtifactPreview({ visible: false, artifact: null })}
      />

      {/* Context usage info modal */}
      {showContextDialog && conversation && (() => {
        const ctxUsage = contextUsage || conversation.contextUsage || { contextUsagePercent: 0, contextUsageChars: 0, contextLimitChars: 200000 };
        const percent = ctxUsage.contextUsagePercent || 0;
        const color = getContextColor(percent);
        return (
        <Modal
          transparent
          visible={showContextDialog}
          animationType="fade"
          onRequestClose={() => setShowContextDialog(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowContextDialog(false)}
          >
            <View style={styles.contextModalBox}>
              <View style={styles.contextModalHeader}>
                <Text style={styles.contextModalTitle}>上下文占用度</Text>
                <TouchableOpacity onPress={() => setShowContextDialog(false)}>
                  <Ionicons name="close" size={20} color="#8f959e" />
                </TouchableOpacity>
              </View>

              <View style={styles.contextUsageRow}>
                <Text style={styles.contextLabel}>当前已使用</Text>
                <Text style={styles.contextValue}>
                  {ctxUsage.contextUsageChars || 0} / {ctxUsage.contextLimitChars || 200000} 字符
                </Text>
              </View>

              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, percent)}%`,
                      backgroundColor: color
                    }
                  ]}
                />
              </View>

              <View style={{ marginVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold', color }}>
                  {Math.round(percent)}%
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCompressContext}
                disabled={compressing}
                style={styles.compressBtn}
              >
                {compressing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cut-outline" size={16} color="#fff" />
                    <Text style={styles.compressBtnText}>压缩上下文</Text>
                  </>
                )}
              </TouchableOpacity>
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
                    Clipboard.setString(selectedMessage.content);
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
    </KeyboardAvoidingView>
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
    top: -5,
    right: -5,
    backgroundColor: '#d97706',
    borderRadius: 5,
    minWidth: 10,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  headerBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#fff',
  },
  artifactHeaderBadge: {
    backgroundColor: '#3370ff',
  },
  artifactPanel: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8ecf3',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf3',
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  artifactPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  artifactPanelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1f2329',
  },
  artifactPanelSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: '#646a73',
  },
  artifactSearchBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eaf2',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  artifactSearchInput: {
    flex: 1,
    height: 38,
    fontSize: 12,
    color: '#1f2329',
    paddingVertical: 0,
  },
  artifactListContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  artifactCard: {
    width: 172,
    minHeight: 126,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6eaf2',
    padding: 12,
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  artifactCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  artifactIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#edf4ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d6e5ff',
  },
  artifactCardTitle: {
    minHeight: 38,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
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
    color: '#3370ff',
  },
  artifactMetaDot: {
    fontSize: 10,
    color: '#b8bbbf',
  },
  artifactRunText: {
    marginTop: 6,
    fontSize: 10,
    color: '#8f959e',
    backgroundColor: '#f5f7fb',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyArtifactText: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 12,
    color: '#8f959e',
    textAlign: 'center',
  },
  memoryPanel: {
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7',
    paddingTop: 8,
  },
  memoryPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  memoryPanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#d97706',
  },
  emptyMemoryText: {
    fontSize: 11,
    color: '#8f959e',
    textAlign: 'center',
    paddingVertical: 12,
  },
  memoryItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
    padding: 8,
    marginBottom: 6,
  },
  memoryItemSender: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8f959e',
    marginBottom: 2,
  },
  memoryItemText: {
    fontSize: 11,
    color: '#1f2329',
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
    backgroundColor: 'transparent',
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
    backgroundColor: '#f5f6f7',
    borderRadius: 8,
    padding: 2,
    flex: 1,
    marginRight: 12,
  },
  memoryTabBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
    borderRadius: 6,
  },
  memoryTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  memoryTabText: {
    fontSize: 11,
    color: '#646a73',
    fontWeight: '600',
  },
  memoryTabTextActive: {
    color: '#3370ff',
  },
  categoryBadgeMini: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f4ff',
    borderColor: '#d0e0ff',
    borderWidth: 0.5,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: 4,
  },
  categoryBadgeMiniText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#3370ff',
  },
  pendingAttachmentsContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f5f6f7',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  pendingAttachmentsScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  pendingAttachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 160,
  },
  pendingAttachmentText: {
    fontSize: 11,
    color: '#1f2329',
    maxWidth: 100,
  },
  pendingAttachmentClose: {
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
