import React from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { Message, Agent } from '@/types';
import { Ionicons } from '@expo/vector-icons';

interface MessageBubbleProps {
  message: Message;
  agents?: Agent[];
}

export default function MessageBubble({ message, agents = [] }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  const renderMessageContent = () => {
    // 1. Code Block Message
    if (message.type === 'code') {
      return (
        <View style={styles.codeBlockContainer}>
          <View style={styles.blockHeader}>
            <Ionicons name="code-slash" size={14} color="#646a73" />
            <Text style={styles.blockHeaderTitle}>代码片段</Text>
          </View>
          <Text style={styles.codeText}>{message.content}</Text>
        </View>
      );
    }

    // 2. Task Plan / Run Message
    if (message.type === 'task-plan') {
      return (
        <View style={styles.taskPlanContainer}>
          <View style={styles.blockHeader}>
            <Ionicons name="git-network-outline" size={14} color="#3370ff" />
            <Text style={[styles.blockHeaderTitle, { color: '#3370ff' }]}>执行规划</Text>
          </View>
          <Text style={styles.taskPlanText}>{message.content}</Text>
        </View>
      );
    }

    // 3. Artifact (产物预览)
    if (message.type === 'artifact') {
      const filename = message.content.replace(/^生成产物\s*/, '') || '产物文档';
      return (
        <View style={styles.artifactContainer}>
          <View style={styles.artifactHeader}>
            <Ionicons name="document-text" size={20} color="#3370ff" />
            <View style={styles.artifactHeaderMeta}>
              <Text style={styles.artifactTitle} numberOfLines={1}>{filename}</Text>
              <Text style={styles.artifactSubtitle}>智能产物 (移动端预览)</Text>
            </View>
          </View>
          <View style={styles.artifactPreviewBox}>
            <Text style={styles.artifactPreviewText} numberOfLines={4}>
              {message.metadata?.summary || '该产物已在工作区生成，可通过电脑端查看完整版交互式视图或代码。'}
            </Text>
          </View>
        </View>
      );
    }

    // Default: Regular Text Message
    return (
      <Text style={[styles.content, isUser ? styles.userContent : styles.agentContent]}>
        {message.content}
      </Text>
    );
  };

  const senderAgent = !isUser && message.senderName
    ? agents.find(a => a.name === message.senderName)
    : null;

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.agentContainer]}>
      {/* Agent Avatar */}
      {!isUser && (
        <View style={styles.avatar}>
          {senderAgent?.avatar ? (
            <Image
              source={{ uri: senderAgent.avatar }}
              style={{ width: '100%', height: '100%', borderRadius: 10 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>
              {(message.senderName || 'AI').charAt(0)}
            </Text>
          )}
        </View>
      )}

      {/* Message & Name Container */}
      <View style={[styles.bubbleWrapper, isUser ? styles.userBubbleWrapper : styles.agentBubbleWrapper]}>
        {!isUser && (
          <Text style={styles.senderNameOutside}>
            {message.senderName || '智能助手'}
          </Text>
        )}
        {isUser && (
          <Text style={styles.senderNameOutsideUser}>
            我
          </Text>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.agentBubble]}>
          {renderMessageContent()}
          {message.isPinned && (
            <View style={styles.pinnedIndicator}>
              <Ionicons name="pin" size={10} color="#d97706" style={{ transform: [{ rotate: '45deg' }] }} />
              <Text style={styles.pinnedIndicatorText}>长期记忆</Text>
            </View>
          )}
        </View>
      </View>

      {/* User Avatar */}
      {isUser && (
        <View style={[styles.avatar, styles.userAvatar]}>
          <Text style={styles.avatarText}>U</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 8,
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
    marginVertical: 12,
    maxWidth: '90%',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    flexShrink: 1,
  },
  userBubble: {
    backgroundColor: '#deebff',
    borderTopRightRadius: 4,
  },
  agentBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  systemBubble: {
    backgroundColor: '#f5f6f7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  bubbleWrapper: {
    flex: 1,
    flexDirection: 'column',
  },
  userBubbleWrapper: {
    alignItems: 'flex-end',
  },
  agentBubbleWrapper: {
    alignItems: 'flex-start',
  },
  userAvatar: {
    backgroundColor: '#3370ff',
  },
  senderNameOutside: {
    fontSize: 11,
    color: '#8f959e',
    marginBottom: 4,
    marginLeft: 4,
  },
  senderNameOutsideUser: {
    fontSize: 11,
    color: '#8f959e',
    marginBottom: 4,
    marginRight: 4,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
  },
  userContent: {
    color: '#1f2329',
  },
  agentContent: {
    color: '#1f2329',
  },
  systemText: {
    fontSize: 12,
    color: '#646a73',
    textAlign: 'center',
    lineHeight: 18,
  },
  // New Block Render Styles
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
  },
  blockHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#646a73',
  },
  codeBlockContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#34d399',
    fontSize: 12,
    lineHeight: 16,
  },
  taskPlanContainer: {
    backgroundColor: '#f0f5ff',
    borderColor: '#adc6ff',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  taskPlanText: {
    fontSize: 13,
    color: '#1f2329',
    lineHeight: 18,
  },
  artifactContainer: {
    backgroundColor: '#ffffff',
    borderColor: '#dee0e3',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    width: '100%',
  },
  artifactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  artifactHeaderMeta: {
    flex: 1,
  },
  artifactTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2329',
  },
  artifactSubtitle: {
    fontSize: 10,
    color: '#8f959e',
    marginTop: 1,
  },
  artifactPreviewBox: {
    backgroundColor: '#f5f6f7',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  artifactPreviewText: {
    fontSize: 11,
    color: '#646a73',
    lineHeight: 15,
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
});
