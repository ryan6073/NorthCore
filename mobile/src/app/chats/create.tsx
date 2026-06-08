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
  Modal,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useAgentStore } from '@/stores/useAgentStore';
import { useConversationStore } from '@/stores/useConversationStore';
import { getWorkspaces, createWorkspace } from '@/services/workspaceService';
import { conversationApi } from '@/api/conversationApi';
import { Ionicons } from '@expo/vector-icons';
import AuthImage from '@/components/AuthImage';
import type { WorkspaceItem } from '@/types';

const getAgentAvatarFromObject = (agent: any) => {
  const avatarUrl = 
    agent?.avatar ||
    agent?.avatarUrl ||
    agent?.avatar_url ||
    agent?.icon ||
    agent?.metadata?.avatar ||
    '';
  
  console.log('[CreateConversation] getAgentAvatarFromObject - agent:', JSON.stringify(agent, null, 2));
  console.log('[CreateConversation] extracted avatarUrl:', avatarUrl);
  
  return avatarUrl;
};

export default function CreateConversationScreen() {
  const { agents } = useAgentStore();
  const { fetchConversations } = useConversationStore();

  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  
  // Workspace states
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    console.log('[CreateConversation] agents from useAgentStore:', JSON.stringify(agents, null, 2));
    if (agents.length === 0) {
      console.log('[CreateConversation] agents is empty, calling fetchAgents()...');
      useAgentStore.getState().fetchAgents().then(() => {
        console.log('[CreateConversation] fetchAgents() completed! New agents:', JSON.stringify(useAgentStore.getState().agents, null, 2));
      });
    }
  }, [agents.length === 0]);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      setWorkspaceLoading(true);
      const res = await getWorkspaces();
      if (Array.isArray(res)) {
        setWorkspaces(res);
      }
    } catch (e) {
      console.error(e);
      setWorkspaces([]);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const filteredWorkspaces = workspaces.filter(w => 
    w.name.toLowerCase().includes(workspaceSearch.toLowerCase())
  );

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    try {
      const newWs = await createWorkspace(newWorkspaceName.trim());
      setWorkspaces(prev => [newWs, ...prev]);
      setSelectedWorkspaceId(newWs.id);
      setIsCreatingWorkspace(false);
      setNewWorkspaceName('');
    } catch (e) {
      Alert.alert('提示', '创建工作区失败');
    } finally {
      setCreatingWorkspace(false);
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

    setSubmitLoading(true);
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
      Alert.alert('提示', '创建会话失败，已自动开启模拟会话');
      router.replace(`/chats/temp_${Date.now()}`);
    } finally {
      setSubmitLoading(false);
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
              const name = String((agent as any).name || (agent as any).displayName || '未命名智能体');
              const avatarUrl = getAgentAvatarFromObject(agent);
              
              return (
                <TouchableOpacity
                  key={agent.id}
                  style={[styles.agentItem, isSelected && styles.agentItemActive]}
                  onPress={() => handleToggleAgent(agent.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.agentLeft}>
                    <View style={styles.avatar}>
                      {avatarUrl ? (
                        <AuthImage
                          uri={avatarUrl}
                          style={{ flex: 1, borderRadius: 10 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.avatarText}>{name.charAt(0)}</Text>
                      )}
                    </View>
                    <View style={styles.agentInfo}>
                      <Text style={styles.agentName}>{name}</Text>
                      <Text style={styles.agentDesc} numberOfLines={1}>
                        {String((agent as any).description || (agent as any).summary || '暂无智能体说明')}
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

      {/* Workspace Selection Section - Button that opens Modal */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>绑定工作区</Text>
        <TouchableOpacity
          style={styles.workspaceSelectBtn}
          onPress={() => {
            setShowWorkspaceModal(true);
            setWorkspaceSearch('');
            setIsCreatingWorkspace(false);
          }}
        >
          <View style={styles.workspaceSelectBtnContent}>
            <Ionicons name="folder-open-outline" size={20} color="#646a73" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              {selectedWorkspaceId ? (
                <Text style={styles.selectedWorkspaceName}>
                  {workspaces.find(w => w.id === selectedWorkspaceId)?.name || '选择工作区'}
                </Text>
              ) : (
                <Text style={styles.workspacePlaceholderText}>点击选择工作区</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8f959e" />
          </View>
        </TouchableOpacity>
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

      {/* Workspace Selection Modal */}
      <Modal
        visible={showWorkspaceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWorkspaceModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowWorkspaceModal(false);
            setIsCreatingWorkspace(false);
            setWorkspaceSearch('');
          }}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择工作区</Text>
              <TouchableOpacity onPress={() => {
                setShowWorkspaceModal(false);
                setIsCreatingWorkspace(false);
                setWorkspaceSearch('');
              }}>
                <Ionicons name="close" size={22} color="#8f959e" />
              </TouchableOpacity>
            </View>

            {/* Search Box */}
            <View style={styles.workspaceSearchBox}>
              <Ionicons name="search-outline" size={16} color="#8f959e" />
              <TextInput
                style={styles.workspaceSearchInput}
                value={workspaceSearch}
                onChangeText={setWorkspaceSearch}
                placeholder="搜索工作区..."
                placeholderTextColor="#8f959e"
              />
              {workspaceSearch.length > 0 && (
                <TouchableOpacity onPress={() => setWorkspaceSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#8f959e" />
                </TouchableOpacity>
              )}
            </View>

            {/* Workspace List with Scroll */}
            {workspaceLoading ? (
              <View style={styles.loadingWrapper}>
                <ActivityIndicator size="small" color="#3370ff" />
              </View>
            ) : (
              <ScrollView style={styles.workspaceListScroll} showsVerticalScrollIndicator={false}>
                {filteredWorkspaces.length === 0 && workspaceSearch ? (
                  <Text style={styles.noMatchText}>无匹配工作区</Text>
                ) : filteredWorkspaces.length === 0 && !workspaceSearch ? (
                  <Text style={styles.noMatchText}>暂无工作区，请新建</Text>
                ) : (
                  filteredWorkspaces.map((w) => {
                    const isSelected = selectedWorkspaceId === w.id;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.wsItem, isSelected && styles.wsItemActive]}
                        onPress={() => {
                          setSelectedWorkspaceId(w.id);
                          setShowWorkspaceModal(false);
                        }}
                      >
                        <View style={styles.wsItemLeft}>
                          <Ionicons
                            name="folder-open-outline"
                            size={18}
                            color={isSelected ? '#3370ff' : '#646a73'}
                          />
                          <Text
                            style={[styles.wsItemName, isSelected && styles.wsItemNameActive]}
                            numberOfLines={1}
                          >
                            {w.name}
                          </Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={18} color="#3370ff" />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Separator */}
            <View style={styles.wsSeparator} />

            {/* Create New Workspace Area */}
            {isCreatingWorkspace ? (
              <View style={styles.createWsCard}>
                <TextInput
                  style={styles.newWsInput}
                  placeholder="工作区名称..."
                  placeholderTextColor="#8f959e"
                  value={newWorkspaceName}
                  onChangeText={setNewWorkspaceName}
                  autoFocus
                />
                <View style={styles.newWsActions}>
                  <TouchableOpacity
                    style={styles.newWsCancelBtn}
                    onPress={() => {
                      setIsCreatingWorkspace(false);
                      setNewWorkspaceName('');
                    }}
                  >
                    <Text style={styles.newWsCancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.newWsConfirmBtn}
                    onPress={handleCreateWorkspace}
                    disabled={creatingWorkspace || !newWorkspaceName.trim()}
                  >
                    {creatingWorkspace ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.newWsConfirmBtnText}>确定</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.createNewWsBtn}
                onPress={() => setIsCreatingWorkspace(true)}
              >
                <Ionicons name="add" size={16} color="#3370ff" />
                <Text style={styles.createNewWsBtnText}>新建工作区</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );

  function handleToggleAgent(id: string) {
    if (mode === 'single') {
      setSelectedAgentIds([id]);
    } else {
      setSelectedAgentIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    }
  }
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
    overflow: 'hidden',
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
  workspaceSelectBtn: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  workspaceSelectBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  workspacePlaceholderText: {
    fontSize: 14,
    color: '#8f959e',
  },
  selectedWorkspaceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2329',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2329',
  },
  workspaceSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  workspaceSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    paddingHorizontal: 8,
    color: '#1f2329',
  },
  loadingWrapper: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  workspaceListScroll: {
    maxHeight: 250,
  },
  wsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  wsItemActive: {
    backgroundColor: '#deebff',
  },
  wsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  wsItemName: {
    fontSize: 13,
    color: '#1f2329',
    flex: 1,
  },
  wsItemNameActive: {
    fontWeight: '700',
    color: '#3370ff',
  },
  noMatchText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 12,
    color: '#8f959e',
  },
  wsSeparator: {
    height: 1,
    backgroundColor: '#eff0f1',
    marginVertical: 12,
  },
  createNewWsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#3370ff',
    borderStyle: 'dashed',
    borderRadius: 10,
    gap: 6,
  },
  createNewWsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3370ff',
  },
  createWsCard: {
    padding: 12,
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  newWsInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: '#1f2329',
    marginBottom: 10,
  },
  newWsActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  newWsCancelBtn: {
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f5f6f7',
  },
  newWsCancelBtnText: {
    fontSize: 12,
    color: '#646a73',
    fontWeight: '600',
  },
  newWsConfirmBtn: {
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#3370ff',
  },
  newWsConfirmBtnText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
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
