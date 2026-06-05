import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Agent } from '@/types';
import { Ionicons } from '@expo/vector-icons';

interface AgentCardProps {
  agent: Agent;
  onPress: () => void;
}

export default function AgentCard({ agent, onPress }: AgentCardProps) {
  const isOnline = agent.status === 'online';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {agent.avatar ? (
            <Image
              source={{ uri: agent.avatar }}
              style={{ width: '100%', height: '100%', borderRadius: 14 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>{agent.name.charAt(0)}</Text>
          )}
          <View style={[styles.statusIndicator, isOnline ? styles.statusOnline : styles.statusOffline]} />
        </View>
        
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {agent.category === 'coding' ? '代码开发' : '协作助手'}
          </Text>
        </View>
      </View>
      
      <Text style={styles.name} numberOfLines={1}>{agent.name}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {agent.description}
      </Text>
      
      <View style={styles.tagsContainer}>
        {agent.tags.slice(0, 2).map((tag, index) => (
          <View key={index} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dee0e3',
    shadowColor: '#1f2329',
    shadowOpacity: 0.02,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f5f6f7',
  },
  categoryText: {
    fontSize: 10,
    color: '#646a73',
    fontWeight: '600',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
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
    paddingVertical: 3,
    backgroundColor: '#deebff',
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    color: '#3370ff',
    fontWeight: '500',
  },
});
