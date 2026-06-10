import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useAgentStore } from '@/stores/useAgentStore';
import { Agent } from '@/types';
import { Ionicons } from '@expo/vector-icons';

export default function CreateAgentScreen() {
  const { agentId } = useLocalSearchParams<{ agentId?: string }>();
  const { agents, createAgent, updateAgent } = useAgentStore();

  const isEdit = !!agentId;
  const existingAgent = isEdit ? agents.find((a) => a.id === agentId) : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('coding');
  const [tagsStr, setTagsStr] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  
  // Permissions
  const [canReadFiles, setCanReadFiles] = useState(false);
  const [canWriteFiles, setCanWriteFiles] = useState(false);
  const [canRunCommands, setCanRunCommands] = useState(false);
  const [canGenerateArtifacts, setCanGenerateArtifacts] = useState(true);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit && existingAgent) {
      setName(existingAgent.name);
      setDescription(existingAgent.description);
      setCategory(existingAgent.category);
      setTagsStr(existingAgent.tags.join(', '));
      setSystemPrompt(existingAgent.systemPrompt);
      setCanReadFiles(existingAgent.permissions.canReadFiles);
      setCanWriteFiles(existingAgent.permissions.canWriteFiles);
      setCanRunCommands(existingAgent.permissions.canRunCommands);
      setCanGenerateArtifacts(existingAgent.permissions.canGenerateArtifacts);
    }
  }, [isEdit, existingAgent]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入智能体名称');
      return;
    }

    setLoading(true);

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const agentData = {
      name: name.trim(),
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
      description: description.trim(),
      category,
      tags,
      systemPrompt: systemPrompt.trim(),
      status: (existingAgent?.status || 'online') as any,
      provider: existingAgent?.provider || 'openai',
      enabled: existingAgent?.enabled !== undefined ? existingAgent.enabled : true,
      modelConfig: existingAgent?.modelConfig || {
        provider: 'openai',
        modelName: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
      },
      tools: existingAgent?.tools || [],
      permissions: {
        canReadFiles,
        canWriteFiles,
        canRunCommands,
        canGenerateArtifacts,
        canDeploy: false,
      },
    };

    try {
      if (isEdit && agentId) {
        await updateAgent(agentId, agentData);
        Alert.alert('提示', '更新智能体成功');
        router.back();
      } else {
        const created = await createAgent(agentData);
        Alert.alert('提示', '创建智能体成功');
        router.replace(`/agents/${created.id}`);
      }
    } catch (e) {
      Alert.alert('提示', '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: isEdit ? '编辑智能体' : '新建智能体' }} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>基本信息</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>名称</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：开发助手..."
            placeholderTextColor="#8f959e"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>描述</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="请简短描述该智能体的主要功能..."
            placeholderTextColor="#8f959e"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>分类</Text>
          <View style={styles.selectorRow}>
            <TouchableOpacity
              style={[styles.selectorTab, category === 'coding' && styles.selectorTabActive]}
              onPress={() => setCategory('coding')}
            >
              <Text style={[styles.selectorText, category === 'coding' && styles.selectorTextActive]}>
                开发工具
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectorTab, category === 'collaboration' && styles.selectorTabActive]}
              onPress={() => setCategory('collaboration')}
            >
              <Text style={[styles.selectorText, category === 'collaboration' && styles.selectorTextActive]}>
                效率协作
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>标签 (逗号分隔)</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：代码, 调试, README..."
            placeholderTextColor="#8f959e"
            value={tagsStr}
            onChangeText={setTagsStr}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>行为配置</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>系统提示词 (System Prompt)</Text>
          <TextInput
            style={[styles.input, styles.codeArea]}
            placeholder="例如：你是一个专业的协作助手..."
            placeholderTextColor="#8f959e"
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            multiline
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>权限配置</Text>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>读取文件权限</Text>
          <Switch
            value={canReadFiles}
            onValueChange={setCanReadFiles}
            trackColor={{ true: '#3370ff' }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>写入文件权限</Text>
          <Switch
            value={canWriteFiles}
            onValueChange={setCanWriteFiles}
            trackColor={{ true: '#3370ff' }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>运行终端命令</Text>
          <Switch
            value={canRunCommands}
            onValueChange={setCanRunCommands}
            trackColor={{ true: '#3370ff' }}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>{isEdit ? '保存修改' : '确认创建'}</Text>
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
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2329',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f5f6f7',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: '#1f2329',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingVertical: 10,
  },
  codeArea: {
    height: 120,
    textAlignVertical: 'top',
    paddingVertical: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  selectorRow: {
    flexDirection: 'row',
    backgroundColor: '#eff0f1',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  selectorTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  selectorTabActive: {
    backgroundColor: '#ffffff',
  },
  selectorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#646a73',
  },
  selectorTextActive: {
    color: '#3370ff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f6f7',
  },
  switchLabel: {
    fontSize: 13,
    color: '#1f2329',
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
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
