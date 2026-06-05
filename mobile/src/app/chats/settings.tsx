import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useConversationStore } from '@/stores/useConversationStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { conversationApi } from '@/api/conversationApi';
import { Ionicons } from '@expo/vector-icons';

export default function ChatSettingsScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const { conversations, fetchConversations } = useConversationStore();
  const { agents, fetchAgents } = useAgentStore();

  const conversation = conversations.find((c) => c.id === conversationId);

  const [title, setTitle] = useState(conversation?.title || '');
  const [loading, setLoading] = useState(false);
  const [showInviteSection, setShowInviteSection] = useState(false);

  useEffect(() => {
    fetchConversations();
    fetchAgents();
  }, []);

  useEffect(() => {
    if (conversation?.title) {
      setTitle(conversation.title);
    }
  }, [conversation?.title]);

  if (!conversation) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>找不到此会话信息</Text>
      </View>
    );
  }

  // Frontend-aligned design check:
  // - mode is 'agent': Single agent setup, title modification and inviting/kicking is restricted.
  // - mode is 'single': 1v1 user-agent setup, title can be changed.
  // - mode is 'group': Multi-agent workspace, full support for inviting and removing agents.
  const isAgentDirectMode = conversation.mode === 'agent';
  const isSingleChat = conversation.mode === 'single';
  const isGroupChat = conversation.mode === 'group';

  const handleUpdateTitle = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await conversationApi.updateConversation(conversation.id, {
        title: title.trim(),
      });
      await fetchConversations();
      Alert.alert('提示', '会话名称修改成功');
    } catch (e) {
      Alert.alert('提示', '修改会话名称失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgent = async (agentId: string) => {
    setLoading(true);
    try {
      await conversationApi.addAgentToConversation(conversation.id, agentId);
      await fetchConversations();
      Alert.alert('提示', '添加智能体成功');
    } catch (e) {
      Alert.alert('提示', '添加智能体失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    const performRemove = async () => {
      setLoading(true);
      try {
        await conversationApi.removeAgentFromConversation(conversation.id, agentId);
        await fetchConversations();
        Alert.alert('提示', '已移出该智能体');
      } catch (e) {
        Alert.alert('提示', '移除智能体失败');
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('确认将此智能体从会话中移除吗？')) {
        performRemove();
      }
    } else {
      Alert.alert('提示', '确认将此智能体从会话中移除吗？', [
        { text: '取消', style: 'cancel' },
        { text: '确认', style: 'destructive', onPress: performRemove }
      ]);
    }
  };

  const handleDeleteConversation = async () => {
    const performDelete = async () => {
      setLoading(true);
      try {
        await conversationApi.deleteConversation(conversation.id);
        await fetchConversations();
        if (router.canGoBack()) {
          router.dismissAll();
        }
        router.replace('/(tabs)/chats');
      } catch (e) {
        Alert.alert('提示', '删除会话失败');
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('确认删除当前会话吗？所有聊天记录将被清空，此操作不可撤销。')) {
        performDelete();
      }
    } else {
      Alert.alert('警示', '确认删除当前会话吗？所有聊天记录将被清空，此操作不可撤销。', [
        { text: '取消', style: 'cancel' },
        { text: '确认', style: 'destructive', onPress: performDelete }
      ]);
    }
  };

  const activeAgents = agents.filter(a => conversation.agentIds?.includes(a.id));
  const inviteCandidates = agents.filter(a => a.id !== 'agent-orchestrator' && !conversation.agentIds?.includes(a.id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '会话设置', headerShadowVisible: false }} />

      {/* Title Modification Card - Restricted in AgentDirectMode */}
      {!isAgentDirectMode && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>会话名称</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="会话名称..."
              value={title}
              onChangeText={setTitle}
            />
            <TouchableOpacity
              style={[styles.saveBtn, (!title.trim() || loading) && styles.saveBtnDisabled]}
              onPress={handleUpdateTitle}
              disabled={!title.trim() || loading}
            >
              <Text style={styles.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Participating Agents List Card */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {isAgentDirectMode ? '智能体信息' : `智能体成员 (${activeAgents.length})`}
          </Text>
          {isGroupChat && inviteCandidates.length > 0 && (
            <TouchableOpacity onPress={() => setShowInviteSection(!showInviteSection)} style={styles.headerAction}>
              <Ionicons name={showInviteSection ? 'chevron-up' : 'person-add'} size={16} color="#3370ff" />
              <Text style={styles.headerActionText}>{showInviteSection ? '收起' : '邀请'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invite Candidates Section (Only for group chat) */}
        {isGroupChat && showInviteSection && inviteCandidates.length > 0 && (
          <View style={styles.inviteContainer}>
            <Text style={styles.inviteLabel}>可邀请的智能体</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inviteList}>
              {inviteCandidates.map(agent => (
                <TouchableOpacity
                  key={agent.id}
                  style={styles.inviteCard}
                  onPress={() => handleAddAgent(agent.id)}
                  disabled={loading}
                >
                  <Image source={{ uri: agent.avatar }} style={styles.inviteAvatar} />
                  <Text style={styles.inviteName} numberOfLines={1}>{agent.name}</Text>
                  <Ionicons name="add-circle" size={16} color="#3370ff" style={styles.inviteAddIcon} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Active Agents list */}
        <View style={styles.agentList}>
          {activeAgents.map(agent => (
            <View key={agent.id} style={styles.agentItem}>
              <Image source={{ uri: agent.avatar }} style={styles.agentAvatar} />
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentDesc} numberOfLines={1}>{agent.description}</Text>
              </View>
              {isGroupChat && agent.id !== 'agent-orchestrator' && (
                <TouchableOpacity
                  onPress={() => handleRemoveAgent(agent.id)}
                  disabled={loading}
                  style={styles.removeBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#ff3b30" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {activeAgents.length === 0 && (
            <Text style={styles.emptyText}>当前没有加入的智能体</Text>
          )}
        </View>

        {isAgentDirectMode && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f5f6f7', paddingTop: 10 }}>
            <Text style={{ fontSize: 11, color: '#8f959e', lineHeight: 15 }}>
              提示：此会话为您与 {activeAgents[0]?.name || '智能体'} 的专属直连聊天。无法修改名称或添加其它智能体。
            </Text>
          </View>
        )}
      </View>

      {/* Dangerous Action Section */}
      <TouchableOpacity
        style={[styles.deleteButton, loading && styles.deleteButtonDisabled]}
        onPress={handleDeleteConversation}
        disabled={loading}
      >
        <Ionicons name="trash-sharp" size={18} color="#ffffff" style={{ marginRight: 6 }} />
        <Text style={styles.deleteButtonText}>
          {isAgentDirectMode ? '关闭并清除对话记录' : '删除并清空此会话'}
        </Text>
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
    backgroundColor: '#ffffff',
  },
  errorText: {
    fontSize: 14,
    color: '#8f959e',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2329',
    marginBottom: 10,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionText: {
    fontSize: 12,
    color: '#3370ff',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f6f7',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: '#1f2329',
    marginRight: 10,
  },
  saveBtn: {
    backgroundColor: '#3370ff',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#deebff',
    opacity: 0.8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  agentList: {
    gap: 12,
  },
  agentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f6f7',
  },
  agentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#eff0f1',
  },
  agentInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  agentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2329',
    marginBottom: 2,
  },
  agentDesc: {
    fontSize: 11,
    color: '#8f959e',
  },
  removeBtn: {
    padding: 6,
  },
  inviteContainer: {
    backgroundColor: '#f5f6f7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eff0f1',
  },
  inviteLabel: {
    fontSize: 11,
    color: '#8f959e',
    fontWeight: '700',
    marginBottom: 10,
  },
  inviteList: {
    gap: 10,
    paddingRight: 12,
  },
  inviteCard: {
    width: 72,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#dee0e3',
    position: 'relative',
  },
  inviteAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginBottom: 6,
  },
  inviteName: {
    fontSize: 10,
    color: '#1f2329',
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  inviteAddIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 12,
    color: '#8f959e',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
