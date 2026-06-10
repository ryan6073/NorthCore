import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type GestureResponderEvent } from 'react-native';
import { Conversation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useAgentStore } from '@/stores/useAgentStore';
import AuthImage from './AuthImage';
import { formatConversationTime } from '@/utils/timeFormat';

interface ConversationItemProps {
  conversation: Conversation;
  onPress: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
}

export default function ConversationItem({ conversation, onPress, onLongPress }: ConversationItemProps) {
  const isPinned = conversation.isPinned;
  const isArchived = conversation.isArchived;
  const { agents } = useAgentStore();
  const title = String((conversation as any).title || (conversation as any).name || '未命名会话');
  const updatedAt = String((conversation as any).updatedAt || (conversation as any).createdAt || '');
  const lastMessage = String((conversation as any).lastMessage || (conversation as any).lastMessageContent || '暂无新消息');
  const conversationAgents = Array.isArray((conversation as any).agents) ? (conversation as any).agents : [];

  // 格式化时间：今天→HH:MM，今年→MM-DD，今年以前→YYYY-MM-DD
  const getTimeString = (timeStr: string) => {
    return formatConversationTime(timeStr);
  };

  const getAgentId = (agent: any) => String(agent?.id || agent?.agentId || '');

  const getAgentAvatarFromObject = (agent: any) => (
    agent?.avatar ||
    agent?.avatarUrl ||
    agent?.avatar_url ||
    agent?.icon ||
    agent?.metadata?.avatar ||
    ''
  );

  const getAgentAvatar = (agentLike: any) => {
    if (typeof agentLike === 'object' && agentLike) {
      const directAvatar = getAgentAvatarFromObject(agentLike);
      if (directAvatar) return directAvatar;
    }

    const agentId = String(agentLike || '');
    const fromConversation = conversationAgents.find((a: any) => getAgentId(a) === agentId);
    const fromStore = agents.find((a: any) => getAgentId(a) === agentId);
    return getAgentAvatarFromObject(fromConversation) || getAgentAvatarFromObject(fromStore);
  };

  const normalizeAgentRefs = () => {
    const rawAgentIds = Array.isArray((conversation as any).agentIds) ? (conversation as any).agentIds : [];
    const rawAgentId = (conversation as any).agentId ? [(conversation as any).agentId] : [];
    return [...rawAgentIds, ...rawAgentId, ...conversationAgents].filter(Boolean);
  };

  const renderConversationIcon = () => {
    const agentIds = normalizeAgentRefs();
    
    if (conversation.mode === 'single' || conversation.mode === 'agent') {
      const avatarUrl = getAgentAvatar(agentIds[0] || '');
      if (avatarUrl) {
        return (
          <AuthImage
            uri={avatarUrl}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        );
      }
    } else if (conversation.mode === 'group' && agentIds.length > 0) {
      if (agentIds.length <= 2) {
        return (
          <View style={styles.avatarGrid}>
            {agentIds.slice(0, 2).map((agentRef, index) => {
              const avatarUrl = getAgentAvatar(agentRef);
              return (
                <View key={index} style={{ flex: 1, overflow: 'hidden' }}>
                  <AuthImage uri={avatarUrl} style={{ flex: 1 }} resizeMode="cover" />
                </View>
              );
            })}
          </View>
        );
      }
      
      if (agentIds.length === 3) {
        return (
          <View style={[styles.avatarGrid, { flexDirection: 'row', padding: 1 }]}>
            <View style={{ flex: 1, overflow: 'hidden', marginRight: 1 }}>
              <AuthImage uri={getAgentAvatar(agentIds[0])} style={{ flex: 1 }} resizeMode="cover" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1, overflow: 'hidden', marginBottom: 1 }}>
                <AuthImage uri={getAgentAvatar(agentIds[1])} style={{ flex: 1 }} resizeMode="cover" />
              </View>
              <View style={{ flex: 1, overflow: 'hidden' }}>
                <AuthImage uri={getAgentAvatar(agentIds[2])} style={{ flex: 1 }} resizeMode="cover" />
              </View>
            </View>
          </View>
        );
      }
      
      // More than 3 agents
      return (
        <View style={[styles.avatarGrid, { backgroundColor: '#e8eaed', justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#646a73' }}>+{agentIds.length}</Text>
        </View>
      );
    }

    // Default fallback icon
    return (
      <View style={[styles.avatarGrid, { backgroundColor: '#3370ff', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons
          name={conversation.mode === 'group' ? 'people' : 'chatbubble-ellipses'}
          size={20}
          color="#fff"
        />
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[styles.container, isPinned && styles.containerPinned]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
        {renderConversationIcon()}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            {isPinned && (
              <Ionicons 
                name="pin" 
                size={13} 
                color="#3370ff" 
                style={{ transform: [{ rotate: '45deg' }], marginRight: 4 }} 
              />
            )}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {isArchived && (
              <View style={styles.archiveBadge}>
                <Text style={styles.archiveBadgeText}>已归档</Text>
              </View>
            )}
          </View>
          <Text style={styles.time}>{getTimeString(updatedAt)}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessage}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderRadius: 14,
    marginHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  containerPinned: {
    backgroundColor: '#f7faff',
    borderColor: '#d6e5ff',
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f5f6f7',
    borderWidth: 1,
    borderColor: '#e6eaf2',
  },
  avatarImage: {
    flex: 1,
  },
  avatarGrid: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1f2329',
  },
  archiveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  archiveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d97706',
  },
  time: {
    fontSize: 11,
    color: '#8f959e',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    flex: 1,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
});
