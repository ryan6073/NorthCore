import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type GestureResponderEvent } from 'react-native';
import { Conversation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useAgentStore } from '@/stores/useAgentStore';
import AuthImage from './AuthImage';

interface ConversationItemProps {
  conversation: Conversation;
  onPress: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
}

export default function ConversationItem({ conversation, onPress, onLongPress }: ConversationItemProps) {
  const isPinned = conversation.isPinned;
  const isArchived = conversation.isArchived;
  const { agents } = useAgentStore();

  // Format time (e.g., "2024-01-15 10:30:00" -> "10:30")
  const getTimeString = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      const parts = timeStr.split(' ');
      if (parts.length > 1) {
        return parts[1].substring(0, 5);
      }
      return timeStr.substring(11, 16);
    } catch {
      return timeStr;
    }
  };

  const getAgentAvatar = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.avatar || '';
  };

  const renderConversationIcon = () => {
    const agentIds = conversation.agentIds || [];
    
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
            {agentIds.slice(0, 2).map((id, index) => {
              const avatarUrl = getAgentAvatar(id);
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
              {conversation.title}
            </Text>
            {isArchived && (
              <View style={styles.archiveBadge}>
                <Text style={styles.archiveBadgeText}>已归档</Text>
              </View>
            )}
          </View>
          <Text style={styles.time}>{getTimeString(conversation.updatedAt)}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {conversation.lastMessage || '暂无新消息'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eff0f1',
  },
  containerPinned: {
    backgroundColor: '#f4f6fa',
  },
  avatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f5f6f7',
    borderWidth: 1,
    borderColor: '#eff0f1',
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
    fontSize: 14,
    fontWeight: '600',
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
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    flex: 1,
    fontSize: 13,
    color: '#646a73',
  },
});
