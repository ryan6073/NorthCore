import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Agent } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import AuthImage from './AuthImage';

interface AgentCardProps {
  agent: Agent;
  onPress: () => void;
}

export default function AgentCard({ agent, onPress }: AgentCardProps) {
  const isOnline = agent.status === 'online';
  const name = String((agent as any).name || (agent as any).displayName || '未命名智能体');
  const description = String((agent as any).description || (agent as any).summary || '暂无智能体说明');
  const tags: unknown[] = Array.isArray((agent as any).tags) ? (agent as any).tags : [];

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {agent.avatar ? (
            <AuthImage
              uri={agent.avatar}
              style={{ flex: 1, borderRadius: 14 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>{name.charAt(0)}</Text>
          )}
          <View style={[styles.statusIndicator, isOnline ? styles.statusOnline : styles.statusOffline]} />
        </View>
        
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {agent.category === 'coding' ? '代码开发' : '协作助手'}
          </Text>
        </View>
      </View>
      
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>
      
      <View style={styles.tagsContainer}>
        {tags.slice(0, 2).map((tag, index) => (
          <View key={index} style={styles.tag}>
            <Text style={styles.tagText}>{String(tag)}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  statusOnline: {
    backgroundColor: '#34c759',
  },
  statusOffline: {
    backgroundColor: '#8f959e',
  },
  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f5f7fb',
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  categoryText: {
    fontSize: 10,
    color: '#646a73',
    fontWeight: '600',
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1f2329',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: '#646a73',
    lineHeight: 18,
    height: 36,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#edf4ff',
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    color: '#3370ff',
    fontWeight: '500',
  },
});
