import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Message, Agent, Artifact, ArtifactVersion } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactMessage from './ArtifactMessage';
import AttachmentCard from './AttachmentCard';
import AuthImage from './AuthImage';
import TaskPlanCard from './TaskPlanCard';
import RollbackRunCard from './RollbackRunCard';
import { useAuthStore } from '@/stores/useAuthStore';

interface MessageBubbleProps {
  message: Message;
  agents?: Agent[];
  onOpenArtifactFullScreen?: (artifact: Artifact, version?: ArtifactVersion) => void;
  onImagePress?: (url: string, name?: string) => void;
}

export default function MessageBubble({ message: rawMessage, agents = [], onOpenArtifactFullScreen, onImagePress }: MessageBubbleProps) {
  // Normalise: ensure all mutable fields have safe defaults — crasher #6
  const message = { ...rawMessage, content: rawMessage.content ?? '', type: rawMessage.type ?? 'text' as any };
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isThinking = message.type === 'status' && message.content === '正在思考...';

  const isBlockType = message.type === 'task-plan' || message.type === 'artifacts' || !!(message.metadata?.isGroupedArtifacts);
  const isRichContent = useMemo(() => {
    if (message.type === 'code' || message.type === 'artifact') {
      return true;
    }
    const markdownRegex = /(^\s*#+\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|([*_`~])|(\[.+\]\(.+\))|(\!\[.+\]\(.+\))|(^\s*>\s)|(\|)/m;
    return message.content ? markdownRegex.test(message.content) : false;
  }, [message.content, message.type]);

  // System messages (status banners)
  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Ionicons
            name={message.content?.includes('完成') ? 'checkmark-circle' : 'information-circle'}
            size={14}
            color="#646a73"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  // Thinking indicator
  if (isThinking) {
    return (
      <View style={[styles.container, styles.agentContainer]}>
        <View style={styles.avatar}>
          <View style={styles.thinkingIndicator}>
            <View style={[styles.thinkingDot, { animationDelay: '0ms' }] as any} />
            <View style={[styles.thinkingDot, { animationDelay: '150ms' }] as any} />
            <View style={[styles.thinkingDot, { animationDelay: '300ms' }] as any} />
          </View>
        </View>
        <View style={[styles.bubbleWrapper, styles.richBubbleWrapper, styles.agentBubbleWrapper]}>
          <Text style={styles.senderNameOutside}>
            {message.senderName || 'AI助手'}
          </Text>
          <View style={[styles.bubble, styles.thinkingBubble]}>
            <Text style={styles.thinkingText}>正在思考...</Text>
          </View>
        </View>
      </View>
    );
  }

  const renderMessageContent = () => {
    // 1. Code block message
    if (message.type === 'code') {
      return (
        <View style={styles.codeBlockWrapper}>
          <MarkdownRenderer
            content={message.content}
            language={message.language}
            isCodeBlock={true}
            maxHeight={300}
          />
        </View>
      );
    }

    // 2. Task plan message — 1:1 复刻 frontend TaskPlanCard 设计
    // 在 renderMessageContent 中返回 null，由外层直接渲染 TaskPlanCard
    if (message.type === 'task-plan') {
      return null;
    }

    // 4. Artifact message — use interactive ArtifactMessage component
    if (message.type === 'artifact') {
      return (
        <ArtifactMessage
          message={message}
          onOpenFullScreen={onOpenArtifactFullScreen}
        />
      );
    }

    // 4. Status messages (other than thinking)
    if (message.type === 'status') {
      return (
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>{message.content}</Text>
        </View>
      );
    }

    // 5. Default: render as markdown (fallback to native text if it's plain text)
    if (!isRichContent) {
      return (
        <Text style={isUser ? styles.userText : styles.agentText} selectable>
          {message.content}
        </Text>
      );
    }

    return (
      <MarkdownRenderer content={message.content} />
    );
  };

  // 优先用 senderId 精确查找，找不到再降级用 senderName 模糊匹配
  const senderAgent = !isUser
    ? agents.find(a => a.id === message.senderId) ||
      (message.senderName ? agents.find(a => a.name === message.senderName) : null)
    : null;
  const senderAvatar = senderAgent?.avatar || (message.metadata?.avatar as string | undefined) || '';
  const { userInfo } = useAuthStore();

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.agentContainer]}>
      {/* Agent Avatar */}
      {!isUser && (
        <View style={styles.avatar}>
          {senderAvatar ? (
            <AuthImage
              uri={senderAvatar}
              style={{ flex: 1, borderRadius: 10 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>
              {(message.senderName || 'AI').charAt(0)}
            </Text>
          )}
        </View>
      )}

      {/* 产物聚合卡片：全宽块级，不带气泡 */}
      {message.type === 'artifacts' || message.metadata?.isGroupedArtifacts ? (
        <View style={[styles.bubbleWrapper, styles.fullWidthWrapper]}>
          {!isUser && (
            <Text style={styles.senderNameOutside}>
              {message.senderName || '智能助手'}
            </Text>
          )}
          <RollbackRunCard message={message} />
        </View>
      ) : isBlockType ? (
        <View style={[styles.bubbleWrapper, styles.richBubbleWrapper, isUser ? styles.userBubbleWrapper : styles.agentBubbleWrapper]}>
          {!isUser && (
            <Text style={styles.senderNameOutside}>
              {message.senderName || '智能助手'}
            </Text>
          )}
          <TaskPlanCard content={message.content} stepsData={message.metadata?.taskPlan as any} />
        </View>
      ) : (
        <View style={[
          styles.bubbleWrapper,
          isRichContent ? styles.richBubbleWrapper : styles.plainBubbleWrapper,
          isUser ? styles.userBubbleWrapper : styles.agentBubbleWrapper
        ]}>
          {!isUser && (
            <Text style={styles.senderNameOutside}>
              {message.senderName || '智能助手'}
            </Text>
          )}
          {isUser && (
            <Text style={styles.senderNameOutsideUser}>我</Text>
          )}

          {/* Only show bubble if has message content or is rich content */}
          {(isRichContent || (message.content && message.content.trim().length > 0)) && (
            <View style={[
              styles.bubble,
              isUser ? styles.userBubble : styles.agentBubble,
              isRichContent ? styles.richBubble : styles.plainBubble
            ]}>
              {renderMessageContent()}
              {message.isPinned && (
                <View style={styles.pinnedIndicator}>
                  <Ionicons name="pin" size={10} color="#d97706" style={{ transform: [{ rotate: '45deg' }] }} />
                  <Text style={styles.pinnedIndicatorText}>长期记忆</Text>
                </View>
              )}
            </View>
          )}

          {/* Attachment Cards list */}
          {message.attachments && message.attachments.length > 0 && (
            <View style={[styles.attachmentsContainer, isUser ? styles.userAttachments : styles.agentAttachments]}>
              {message.attachments.map((attach) => (
                <AttachmentCard key={attach.id} attachment={attach} isUser={isUser} onImagePress={onImagePress} />
              ))}
            </View>
          )}
        </View>
      )}

      {/* User Avatar — 显示用户名首字母 */}
      {isUser && (
        <View style={[styles.avatar, styles.userAvatar]}>
          <Text style={styles.avatarText}>{(userInfo?.username || 'U').charAt(0).toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  userContainer: {
    justifyContent: 'flex-end',
    paddingLeft: 48,
  },
  agentContainer: {
    justifyContent: 'flex-start',
    paddingRight: 48,
  },
  systemContainer: {
    alignSelf: 'center',
    marginVertical: 8,
    maxWidth: '80%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  bubble: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 18,
    overflow: 'hidden',
  },
  richBubble: {
    width: '100%',
  },
  plainBubble: {},
  userBubble: {
    backgroundColor: '#3370ff',
    borderTopRightRadius: 6,
  },
  agentBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  thinkingBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    minWidth: 100,
    paddingVertical: 10,
  },
  systemBubble: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubbleWrapper: {
    flexDirection: 'column',
    maxWidth: '78%',
  },
  richBubbleWrapper: {
    flex: 1,
  },
  plainBubbleWrapper: {
    flexShrink: 1,
  },
  userBubbleWrapper: {
    alignItems: 'flex-end',
  },
  agentBubbleWrapper: {
    alignItems: 'flex-start',
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#ffffff',
  },
  agentText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2329',
  },
  userAvatar: {
    backgroundColor: '#3370ff',
  },
  senderNameOutside: {
    fontSize: 11,
    color: '#9aa1ad',
    marginBottom: 4,
    marginLeft: 4,
  },
  senderNameOutsideUser: {
    fontSize: 11,
    color: '#9aa1ad',
    marginBottom: 4,
    marginRight: 4,
  },
  fullWidthWrapper: {
    flexDirection: 'column',
    maxWidth: '100%',
    width: '100%',
  },

  // ── Thinking indicator ──
  thinkingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  thinkingText: {
    fontSize: 13,
    color: '#8f959e',
    fontStyle: 'italic',
  },

  // ── System / Status ──
  systemText: {
    fontSize: 12,
    color: '#646a73',
    textAlign: 'center',
    lineHeight: 18,
    flexShrink: 1,
  },
  statusContainer: {
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#646a73',
    fontStyle: 'italic',
  },

  // ── Code block ──
  codeBlockWrapper: {
    marginTop: 2,
    marginBottom: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },


  pinnedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: '#eff0f1',
    paddingTop: 4,
    gap: 4,
  },
  pinnedIndicatorText: {
    fontSize: 9,
    color: '#d97706',
    fontWeight: '600',
  },
  attachmentsContainer: {
    marginTop: 6,
    flexDirection: 'column',
    gap: 6,
  },
  userAttachments: {
    alignItems: 'flex-end',
  },
  agentAttachments: {
    alignItems: 'flex-start',
  },
});
