import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useAgentStore } from '@/stores/useAgentStore';
import { useConversationStore } from '@/stores/useConversationStore';
import { workspaceApi, Workspace } from '@/api/workspaceApi';
import { conversationApi } from '@/api/conversationApi';
import { Ionicons } from '@expo/vector-icons';

export default function CreateConversationScreen() {
  const { agents } = useAgentStore();
  const { fetchConversations } = useConversationStore();

  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const list = await workspaceApi.getWorkspaces();
      setWorkspaces(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setWorkspaces([]);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setWorkspaceLoading(true);
    try {
      const ws = await workspaceApi.createWorkspace(newWorkspaceName.trim());
      setWorkspaces((prev) => [ws, ...prev]);
      setSelectedWorkspaceId(ws.id);
      setNewWorkspaceName('');
      setShowNewWorkspace(false);
    } catch (e) {
      Alert.alert('提示', '新建工作区失败');
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const handleToggleAgent = (id: string) => {
    if (mode === 'single') {
      setSelectedAgentIds([id]);
    } else {
      setSelectedAgentIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    }
  };

  const handleSubmit = async () => {
    if (selectedAgentIds.length === 0) {
      Alert.alert('提示', '请选择智能体成员');
      return;
    }
    if (!selectedWorkspaceId) {
      Alert.alert('提示', '请选择绑定的工作区');
      return;
    }

    setSubmitLoading(false);
    let finalAgentIds = [...selectedAgentIds];
    if (mode === 'group') {
      const orchestratorId = 'agent-orchestrator';
      if (!finalAgentIds.includes(orchestratorId) && agents.some(a => a.id === orchestratorId)) {
        finalAgentIds = [orchestratorId, ...finalAgentIds];
      }
    }

    const title = mode === 'single'
      ? (agents.find(a => a.id === selectedAgentIds[0])?.name || '新会话')
      : `${finalAgentIds.filter(id => id !== 'agent-orchestrator').length + 1}人会话`;

    try {
      const newConv = await conversationApi.createConversation({
        title,
        mode,
        agentIds: finalAgentIds,
        // @ts-ignore
        workspaceId: selectedWorkspaceId,
      });
      await fetchConversations();
      router.replace(`/chats/${newConv.id}`);
    } catch (e) {
      // Fallback
      Alert.alert('提示', '创建会话失败，已自动开启模拟会话');
      router.replace(`/chats/temp_${Date.now()}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '新建会话' }} />

      {/* Mode Switcher */}
      <View style={styles.modeContainer}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'single' && styles.modeTabActive]}
          onPress={() => {
            setMode('single');
            setSelectedAgentIds([]);
          }}
        >
          <Ionicons
            name="person-outline"
            size={16}
            color={mode === 'single' ? '#3370ff' : '#646a73'}
          />
          <Text style={[styles.modeTabText, mode === 'single' && styles.modeTabTextActive]}>
            单聊 (1v1)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'group' && styles.modeTabActive]}
          onPress={() => {
            setMode('group');
            setSelectedAgentIds([]);
          }}
        >
          <Ionicons
            name="people-outline"
            size={16}
            color={mode === 'group' ? '#3370ff' : '#646a73'}
          />
          <Text style={[styles.modeTabText, mode === 'group' && styles.modeTabTextActive]}>
            群聊 (多Agent)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Agent Selector Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {mode === 'single' ? '选择智能体成员' : '多选智能体成员'}
        </Text>
        <View style={styles.agentList}>
          {agents
            .filter((a) => a.id !== 'agent-orchestrator')
            .map((agent) => {
              const isSelected = selectedAgentIds.includes(agent.id);
              return (
                <TouchableOpacity
                  key={agent.id}
                  style={[styles.agentItem, isSelected && styles.agentItemActive]}
                  onPress={() => handleToggleAgent(agent.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.agentLeft}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{agent.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.agentInfo}>
                      <Text style={styles.agentName}>{agent.name}</Text>
                      <Text style={styles.agentDesc} numberOfLines={1}>
                        {agent.description}
                      </Text>
                    </View>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color="#3370ff" />
                  )}
                </TouchableOpacity>
              );
            })}
        </View>
      </View>

      {/* Workspace Selection Section */}
      <View style={styles.section}>
        <View style={styles.workspaceHeader}>
          <Text style={styles.sectionTitle}>绑定工作区</Text>
          {!showNewWorkspace && (
            <TouchableOpacity
              onPress={() => setShowNewWorkspace(true)}
              style={styles.newWsButton}
            >
              <Ionicons name="add" size={14} color="#3370ff" />
              <Text style={styles.newWsButtonText}>新建工作区</Text>
            </TouchableOpacity>
          )}
        </View>

        {showNewWorkspace ? (
          <View style={styles.newWsCard}>
            <TextInput
              style={styles.wsInput}
              placeholder="请输入工作区名称..."
              placeholderTextColor="#8f959e"
              value={newWorkspaceName}
              onChangeText={setNewWorkspaceName}
            />
            <View style={styles.newWsActions}>
              <TouchableOpacity
                style={styles.newWsConfirm}
                onPress={handleCreateWorkspace}
                disabled={workspaceLoading || !newWorkspaceName.trim()}
              >
                {workspaceLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.newWsConfirmText}>确认</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.newWsCancel}
                onPress={() => {
                  setShowNewWorkspace(false);
                  setNewWorkspaceName('');
                }}
              >
                <Text style={styles.newWsCancelText}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.workspaceList}>
            {(workspaces || []).map((ws) => {
              const isSelected = selectedWorkspaceId === ws.id;
              return (
                <TouchableOpacity
                  key={ws.id}
                  style={[styles.wsItem, isSelected && styles.wsItemActive]}
                  onPress={() => setSelectedWorkspaceId(ws.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.wsLeft}>
                    <Ionicons
                      name="folder-open-outline"
                      size={20}
                      color={isSelected ? '#3370ff' : '#646a73'}
                    />
                    <Text style={[styles.wsName, isSelected && styles.wsNameActive]}>
                      {ws.name}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color="#3370ff" />
                  )}
                </TouchableOpacity>
              );
            })}
            {workspaces.length === 0 && (
              <Text style={styles.emptyText}>暂无工作区，请先点击新建工作区</Text>
            )}
          </View>
        )}
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          (selectedAgentIds.length === 0 || !selectedWorkspaceId) && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={selectedAgentIds.length === 0 || !selectedWorkspaceId || submitLoading}
      >
        {submitLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>
            创建并开启{mode === 'single' ? '单聊' : '群聊'}
          </Text>
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
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: '#eff0f1',
    borderRadius: 12,
    padding: 2,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#1f2329',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#646a73',
  },
  modeTabTextActive: {
    color: '#3370ff',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2329',
    marginBottom: 14,
  },
  agentList: {
    gap: 8,
  },
  agentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f5f6f7',
  },
  agentItemActive: {
    backgroundColor: '#deebff',
    borderColor: '#3370ff',
  },
  agentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  agentInfo: {
    marginLeft: 12,
    flex: 1,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2329',
    marginBottom: 2,
  },
  agentDesc: {
    fontSize: 11,
    color: '#646a73',
  },
  workspaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  newWsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  newWsButtonText: {
    fontSize: 12,
    color: '#3370ff',
    fontWeight: '700',
  },
  newWsCard: {
    backgroundColor: '#f5f6f7',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderStyle: 'dashed',
  },
  wsInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 36,
    fontSize: 13,
    color: '#1f2329',
    marginBottom: 10,
  },
  newWsActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  newWsConfirm: {
    backgroundColor: '#3370ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newWsConfirmText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '650',
  },
  newWsCancel: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newWsCancelText: {
    color: '#646a73',
    fontSize: 12,
  },
  workspaceList: {
    gap: 8,
  },
  wsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f5f6f7',
  },
  wsItemActive: {
    backgroundColor: '#deebff',
    borderColor: '#3370ff',
  },
  wsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wsName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2329',
  },
  wsNameActive: {
    color: '#3370ff',
  },
  emptyText: {
    fontSize: 12,
    color: '#8f959e',
    textAlign: 'center',
    paddingVertical: 12,
  },
  submitButton: {
    backgroundColor: '#3370ff',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#dee0e3',
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
