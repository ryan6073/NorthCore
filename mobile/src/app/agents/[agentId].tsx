import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useAgentStore } from '@/stores/useAgentStore';
import { useConversationStore } from '@/stores/useConversationStore';
import { conversationApi } from '@/api/conversationApi';
import { Ionicons } from '@expo/vector-icons';

export default function AgentDetailScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const { agents } = useAgentStore();
  const { conversations, fetchConversations } = useConversationStore();
  const [loading, setLoading] = useState(false);

  const agent = agents.find((a) => a.id === agentId);

  if (!agent) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>找不到该智能体</Text>
      </View>
    );
  }

  const handleStartChat = async () => {
    setLoading(true);
    try {
      // Check if existing agent conversation exists
      const existingConv = conversations.find(
        (c) => c.mode === 'agent' && c.agentIds.includes(agent.id)
      );

      if (existingConv) {
        router.push(`/chats/${existingConv.id}`);
        return;
      }

      // Create a new conversation if it doesn't exist
      const newConv = await conversationApi.createConversation({
        title: `${agent.name}`,
        mode: 'agent',
        agentIds: [agent.id],
      });

      await fetchConversations();
      router.push(`/chats/${newConv.id}`);
    } catch (error) {
      // Fallback: create conversation failed
      const tempId = 'temp_' + Date.now();
      Alert.alert('提示', '创建对话失败');
      router.push(`/chats/${tempId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: '智能体名片',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/agents/create?agentId=${agent.id}`)}
            >
              <Text style={{ color: '#3370ff', fontWeight: '600', fontSize: 15 }}>编辑</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{agent.name.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{agent.name}</Text>
        <Text style={styles.category}>{agent.category === 'coding' ? '开发工具' : '效率助手'}</Text>
        
        <View style={styles.tagsContainer}>
          {agent.tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>简介</Text>
        <Text style={styles.description}>{agent.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>系统提示词 (System Prompt)</Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>{agent.systemPrompt}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>权限配置</Text>
        <View style={styles.permissionRow}>
          <Ionicons
            name={agent.permissions.canReadFiles ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={agent.permissions.canReadFiles ? '#4caf50' : '#f44336'}
          />
          <Text style={styles.permissionText}>读取文件权限</Text>
        </View>
        <View style={styles.permissionRow}>
          <Ionicons
            name={agent.permissions.canWriteFiles ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={agent.permissions.canWriteFiles ? '#4caf50' : '#f44336'}
          />
          <Text style={styles.permissionText}>写入文件权限</Text>
        </View>
        <View style={styles.permissionRow}>
          <Ionicons
            name={agent.permissions.canRunCommands ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={agent.permissions.canRunCommands ? '#4caf50' : '#f44336'}
          />
          <Text style={styles.permissionText}>运行终端命令</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.chatButton} onPress={handleStartChat} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
            <Text style={styles.chatButtonText}>开始对话</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6f7',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#8f959e',
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2329',
    marginBottom: 4,
  },
  category: {
    fontSize: 14,
    color: '#646a73',
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#deebff',
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#3370ff',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2329',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#646a73',
    lineHeight: 22,
  },
  codeBlock: {
    backgroundColor: '#f5f6f7',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  codeText: {
    fontSize: 13,
    color: '#1f2329',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  permissionText: {
    fontSize: 14,
    color: '#1f2329',
  },
  chatButton: {
    backgroundColor: '#3370ff',
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
