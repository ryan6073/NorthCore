// SettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { X, User, Sliders, Settings, Eye, EyeOff, Check, Moon, Sun, Trash2, Folder, Bell, Terminal, Play, Square, RotateCw, ScrollText, Cpu, Key, Database, Activity, Sparkles, Plus, Edit3, Save, Globe } from 'lucide-react';
import { testModelConfig } from '@/services/http/modelService';
import type { ModelCredential, ModelConfig } from '@/types';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80',
];

export const SettingsModal: React.FC = () => {
  const isOpen = useAgentHubStore(state => state.isSettingsOpen);
  const setIsOpen = useAgentHubStore(state => state.setIsSettingsOpen);
  const currentUser = useAgentHubStore(state => state.currentUser);
  const settings = useAgentHubStore(state => state.settings);
  const updateProfile = useAgentHubStore(state => state.updateProfile);
  const updateSettings = useAgentHubStore(state => state.updateSettings);
  const useMockMode = useAgentHubStore(state => state.useMockMode);
  const setUseMockMode = useAgentHubStore(state => state.setUseMockMode);

  // Model Config & Credential states & actions
  const modelProviders = useAgentHubStore(state => state.modelProviders);
  const modelCredentials = useAgentHubStore(state => state.modelCredentials);
  const modelConfigs = useAgentHubStore(state => state.modelConfigs);
  const loadModelProviders = useAgentHubStore(state => state.loadModelProviders);
  const loadModelCredentials = useAgentHubStore(state => state.loadModelCredentials);
  const loadModelConfigs = useAgentHubStore(state => state.loadModelConfigs);
  const createModelCredential = useAgentHubStore(state => state.createModelCredential);
  const updateModelCredential = useAgentHubStore(state => state.updateModelCredential);
  const deleteModelCredential = useAgentHubStore(state => state.deleteModelCredential);
  const createModelConfig = useAgentHubStore(state => state.createModelConfig);
  const updateModelConfig = useAgentHubStore(state => state.updateModelConfig);
  const deleteModelConfig = useAgentHubStore(state => state.deleteModelConfig);

  // Local agent process store states & actions
  const localAgentProcesses = useAgentHubStore(state => state.localAgentProcesses);
  const startLocalAgent = useAgentHubStore(state => state.startLocalAgent);
  const stopLocalAgent = useAgentHubStore(state => state.stopLocalAgent);
  const restartLocalAgent = useAgentHubStore(state => state.restartLocalAgent);
  const localAgentLogs = useAgentHubStore(state => state.localAgentLogs);
  const loadLocalAgentLogs = useAgentHubStore(state => state.loadLocalAgentLogs);
  const localAgentLoading = useAgentHubStore(state => state.localAgentLoading);

  const [activeTab, setActiveTab] = useState<'profile' | 'model' | 'permissions' | 'notifications' | 'agents' | 'system'>('profile');
  
  // Model sub-tab state
  const [modelSubTab, setModelSubTab] = useState<'configs' | 'credentials' | 'providers'>('configs');

  // Credential Form State
  const [isCreatingCred, setIsCreatingCred] = useState(false);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [credName, setCredName] = useState('');
  const [credProvider, setCredProvider] = useState('openai');
  const [credSecret, setCredSecret] = useState('');

  // Config Form State
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('');
  const [configProvider, setConfigProvider] = useState('openai');
  const [configProtocol, setConfigProtocol] = useState('openai_chat_completions');
  const [configModelName, setConfigModelName] = useState('gpt-4o');
  const [configBaseUrl, setConfigBaseUrl] = useState('');
  const [configCredentialRef, setConfigCredentialRef] = useState('');
  const [configExtraConfig, setConfigExtraConfig] = useState('{}');

  // Test Connection States
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string | null }>>({});
  
  // Profile form state
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  
  // Model settings state
  const [provider, setProvider] = useState('custom');
  const [modelName, setModelName] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // File Permissions form state
  const [allowRead, setAllowRead] = useState(true);
  const [allowWrite, setAllowWrite] = useState(true);
  const [confirmBeforeWrite, setConfirmBeforeWrite] = useState(true);
  const [defaultSaveDir, setDefaultSaveDir] = useState('');
  const [autoOverwrite, setAutoOverwrite] = useState(false);

  // Notification Settings form state
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [notifyOnTaskCompleted, setNotifyOnTaskCompleted] = useState(true);
  const [notifyOnArtifactCreated, setNotifyOnArtifactCreated] = useState(true);
  const [notifyOnAgentError, setNotifyOnAgentError] = useState(true);

  // Agent Process settings state
  const [selectedAgentId, setSelectedAgentId] = useState<string>('local-qwen');
  const [agentCommand, setAgentCommand] = useState('');
  const [agentWorkDir, setAgentWorkDir] = useState('');
  const [agentPort, setAgentPort] = useState(8000);
  const [agentLogPath, setAgentLogPath] = useState('');
  
  // Notice / save state
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Sync state from store when modal opens
  useEffect(() => {
    if (isOpen && currentUser) {
      setProfileName(currentUser.name);
      setProfileEmail(currentUser.email);
      setProfileAvatar(currentUser.avatar);
      
      setProvider(settings.activeProvider);
      setModelName(settings.modelName);
      setApiKey(settings.apiKey);
      setTemperature(settings.temperature);
      setMaxTokens(settings.maxTokens);

      setAllowRead(settings.allowRead ?? true);
      setAllowWrite(settings.allowWrite ?? true);
      setConfirmBeforeWrite(settings.confirmBeforeWrite ?? true);
      setDefaultSaveDir(settings.defaultSaveDir ?? '');
      setAutoOverwrite(settings.autoOverwrite ?? false);

      setEnableNotifications(settings.enableNotifications ?? true);
      setNotifyOnTaskCompleted(settings.notifyOnTaskCompleted ?? true);
      setNotifyOnArtifactCreated(settings.notifyOnArtifactCreated ?? true);
      setNotifyOnAgentError(settings.notifyOnAgentError ?? true);
    }
  }, [isOpen, currentUser, settings]);

  // Load model providers, credentials and configs when modal opens
  useEffect(() => {
    if (isOpen) {
      loadModelProviders();
      loadModelCredentials();
      loadModelConfigs();
    }
  }, [isOpen]);

  // Sync selected agent configs
  useEffect(() => {
    if (isOpen) {
      const agent = localAgentProcesses.find(a => a.id === selectedAgentId);
      if (agent) {
        setAgentCommand(agent.command || '');
        setAgentWorkDir(agent.workDir || '');
        setAgentPort(agent.port || 8000);
        setAgentLogPath(agent.workDir ? `${agent.workDir}/agent.log` : '');
        loadLocalAgentLogs(agent.id);
      }
    }
  }, [selectedAgentId, localAgentProcesses, isOpen]);

  // Auto poll logs for selected agent process if running
  useEffect(() => {
    let timer: any;
    const activeAgent = localAgentProcesses.find(a => a.id === selectedAgentId);
    if (isOpen && activeAgent && activeAgent.status === 'running') {
      timer = setInterval(() => {
        loadLocalAgentLogs(selectedAgentId);
      }, 3000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [selectedAgentId, isOpen, localAgentProcesses]);

  if (!isOpen || !currentUser) return null;

  const triggerNotice = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 2000);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !profileEmail.trim()) return;
    updateProfile(profileName.trim(), profileEmail.trim(), profileAvatar);
    triggerNotice('个人资料已更新');
  };

  const handleSaveModelSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      activeProvider: provider,
      modelName,
      apiKey,
      temperature,
      maxTokens,
    });
    triggerNotice('模型参数已保存');
  };

  const handleSaveCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credName.trim()) return;
    try {
      if (editingCredId) {
        await updateModelCredential(editingCredId, {
          name: credName.trim(),
          provider: credProvider,
          secret: credSecret.trim() || undefined
        });
        triggerNotice('模型凭证已更新');
      } else {
        await createModelCredential({
          name: credName.trim(),
          provider: credProvider,
          credentialType: 'api_key',
          secret: credSecret.trim()
        });
        triggerNotice('模型凭证已新建');
      }
      setIsCreatingCred(false);
      setEditingCredId(null);
      setCredName('');
      setCredSecret('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditCredential = (cred: ModelCredential) => {
    setEditingCredId(cred.id);
    setCredName(cred.name);
    setCredProvider(cred.provider);
    setCredSecret('');
    setIsCreatingCred(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configName.trim() || !configModelName.trim()) return;
    let extra = {};
    try {
      extra = JSON.parse(configExtraConfig || '{}');
    } catch (err) {
      alert('附加参数 JSON 格式不合法，请检查！');
      return;
    }
    try {
      const payload = {
        name: configName.trim(),
        provider: configProvider,
        protocol: configProtocol,
        modelName: configModelName.trim(),
        baseUrl: configBaseUrl.trim() || null,
        credentialRef: configCredentialRef || null,
        extraConfig: extra
      };
      if (editingConfigId) {
        await updateModelConfig(editingConfigId, payload);
        triggerNotice('模型配置已更新');
      } else {
        await createModelConfig(payload);
        triggerNotice('模型配置已新建');
      }
      setIsCreatingConfig(false);
      setEditingConfigId(null);
      setConfigName('');
      setConfigModelName('gpt-4o');
      setConfigBaseUrl('');
      setConfigCredentialRef('');
      setConfigExtraConfig('{}');
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditConfig = (conf: ModelConfig) => {
    setEditingConfigId(conf.id);
    setConfigName(conf.name);
    setConfigProvider(conf.provider);
    setConfigProtocol(conf.protocol);
    setConfigModelName(conf.modelName);
    setConfigBaseUrl(conf.baseUrl || '');
    setConfigCredentialRef(conf.credentialRef || '');
    setConfigExtraConfig(JSON.stringify(conf.extraConfig || {}, null, 2));
    setIsCreatingConfig(true);
  };

  const handleTestConfig = async (configId: string) => {
    setTestingConfigId(configId);
    try {
      const res = await testModelConfig(configId);
      if (res.code === 0 && res.data) {
        setTestResults(prev => ({
          ...prev,
          [configId]: {
            success: res.data.ok,
            latencyMs: res.data.latencyMs,
            error: res.data.error
          }
        }));
      } else {
        setTestResults(prev => ({
          ...prev,
          [configId]: { success: false, error: res.message || '网络测试失败' }
        }));
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [configId]: { success: false, error: err.message || '网络连接超时' }
      }));
    } finally {
      setTestingConfigId(null);
    }
  };

  const handleSavePermissions = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      allowRead,
      allowWrite,
      confirmBeforeWrite,
      defaultSaveDir,
      autoOverwrite,
    });
    triggerNotice('文件访问权限设置已更新');
  };

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      enableNotifications,
      notifyOnTaskCompleted,
      notifyOnArtifactCreated,
      notifyOnAgentError,
    });
    triggerNotice('系统通知偏好已更新');
  };

  const handleSaveAgentProcessSettings = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate updating command/working directory of local process config
    const targetAgent = localAgentProcesses.find(a => a.id === selectedAgentId);
    if (targetAgent) {
      targetAgent.command = agentCommand;
      targetAgent.workDir = agentWorkDir;
      targetAgent.port = agentPort;
      triggerNotice(`${targetAgent.name} 进程配置已保存`);
    }
  };

  const handleThemeToggle = (newTheme: 'light' | 'dark') => {
    updateSettings({ theme: newTheme });
    triggerNotice(`主题已切换为 ${newTheme === 'dark' ? '深色' : '浅色'}`);
  };

  const handleResetData = () => {
    if (window.confirm('您确定要重置平台数据吗？这将清空本地所有聊天记录、自定义智能体配置并恢复默认设置，操作后页面将重新加载。')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const selectedAgent = localAgentProcesses.find(a => a.id === selectedAgentId);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl h-[600px] flex shadow-2xl overflow-hidden animate-scale-in relative">
        
        {/* Header Close button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-6 right-6 p-1.5 rounded-lg border border-slate-250 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 dark:hover:text-slate-250 transition-colors z-50 bg-white dark:bg-slate-900 shadow-sm active:scale-95"
        >
          <X className="w-4.5 h-4.5" />
        </button>
        
        {/* Save/Success Notification Overlay */}
        {savedNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg flex items-center gap-1.5 z-50 animate-bounce-subtle">
            <Check className="w-4 h-4" />
            <span>{savedNotice}</span>
          </div>
        )}

        {/* Left Side Tabs Sidebar */}
        <div className="w-1/4 bg-slate-50 dark:bg-slate-950 border-r border-slate-100 dark:border-slate-800 p-5 flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest pl-2">设置中心</h3>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <User className="w-4 h-4" />
                <span>个人资料</span>
              </button>
              <button
                onClick={() => setActiveTab('model')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'model'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>模型参数</span>
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'permissions'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Folder className="w-4 h-4" />
                <span>文件权限</span>
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'notifications'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>系统通知</span>
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'agents'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>本地 Agent 进程</span>
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'system'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>系统偏好</span>
              </button>
            </nav>
          </div>
          
          <button
            onClick={() => setIsOpen(false)}
            className="w-full border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 bg-white dark:bg-slate-900"
          >
            返回工作区
          </button>
        </div>

        {/* Right Side Settings View */}
        <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-slate-900 relative">

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">个人资料</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">修改您的个人姓名、邮箱并配置 Preset 个性头像。</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Preset 个性头像</label>
                <div className="flex items-center gap-3">
                  {PRESET_AVATARS.map((avatar, idx) => {
                    const isSelected = profileAvatar === avatar;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setProfileAvatar(avatar)}
                        className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-all relative ${
                          isSelected
                            ? 'border-violet-600 scale-105 shadow-md shadow-violet-500/20'
                            : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600 hover:scale-105'
                        }`}
                      >
                        <img src={avatar} alt="avatar option" className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-violet-600/10 flex items-center justify-center" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">自定义头像地址 (URL)</label>
                <input
                  type="text"
                  value={profileAvatar}
                  onChange={(e) => setProfileAvatar(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-violet-600 dark:focus:border-violet-500 outline-none transition-colors"
                  placeholder="https://example.com/avatar.png"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">名称 / 昵称</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-violet-600 dark:focus:border-violet-500 transition-colors"
                    placeholder="Ryan"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">电子邮箱</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-violet-600 dark:focus:border-violet-500 transition-colors"
                    placeholder="yourname@northcore.ai"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-violet-500/10 active:scale-95"
                >
                  保存修改
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: MODEL SETTINGS */}
          {activeTab === 'model' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-violet-650" />
                  模型及运行配置
                </h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">配置开发模型凭证、可复用配置服务商以及平台的 Runtime 执行路由参数。</p>
              </div>

              {/* Sub-tab selection */}
              <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 p-1.5 rounded-2xl gap-2 select-none flex-shrink-0">
                <button
                  onClick={() => {
                    setModelSubTab('configs');
                    setIsCreatingConfig(false);
                    setEditingConfigId(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all ${
                    modelSubTab === 'configs'
                      ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm border border-slate-200/50 dark:border-slate-800/50'
                      : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-350'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>模型配置 ({modelConfigs.length})</span>
                </button>
                <button
                  onClick={() => {
                    setModelSubTab('credentials');
                    setIsCreatingCred(false);
                    setEditingCredId(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all ${
                    modelSubTab === 'credentials'
                      ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm border border-slate-200/50 dark:border-slate-800/50'
                      : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-350'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>模型凭证 ({modelCredentials.length})</span>
                </button>
                <button
                  onClick={() => setModelSubTab('providers')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all ${
                    modelSubTab === 'providers'
                      ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm border border-slate-200/50 dark:border-slate-800/50'
                      : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-350'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>服务商清单 ({modelProviders.length})</span>
                </button>
              </div>

              {/* Sub-tab 1: Model Configs */}
              {modelSubTab === 'configs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wide">可复用大模型配置</h3>
                    {!isCreatingConfig && (
                      <button
                        onClick={() => {
                          setIsCreatingConfig(true);
                          setEditingConfigId(null);
                          setConfigName('');
                          setConfigModelName('gpt-4o');
                          setConfigBaseUrl('');
                          setConfigCredentialRef('');
                          setConfigExtraConfig('{}');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        新建模型配置
                      </button>
                    )}
                  </div>

                  {isCreatingConfig && (
                    <form onSubmit={handleSaveConfig} className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4 animate-scale-in relative">
                      <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200">{editingConfigId ? '编辑模型配置' : '新建模型配置'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">配置名称</label>
                          <input
                            type="text"
                            value={configName}
                            onChange={(e) => setConfigName(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-violet-600"
                            placeholder="e.g. DeepSeek V3"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">调用模型名 (Model Name)</label>
                          <input
                            type="text"
                            value={configModelName}
                            onChange={(e) => setConfigModelName(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-100 outline-none focus:border-violet-600"
                            placeholder="e.g. deepseek-chat"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">供应商 (Provider)</label>
                          <select
                            value={configProvider}
                            onChange={(e) => {
                              setConfigProvider(e.target.value);
                              const selected = modelProviders.find(p => p.id === e.target.value);
                              if (selected) {
                                setConfigProtocol(selected.protocol);
                                setConfigBaseUrl(selected.defaultBaseUrl || '');
                              }
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs cursor-pointer outline-none text-slate-850 dark:text-slate-100"
                          >
                            {modelProviders.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">关联凭证 (Credential)</label>
                          <select
                            value={configCredentialRef || ''}
                            onChange={(e) => setConfigCredentialRef(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs cursor-pointer outline-none text-slate-850 dark:text-slate-100"
                          >
                            <option value="">(不使用凭证/无授权)</option>
                            {modelCredentials.filter(c => 
                              c.provider === configProvider || 
                              configProvider === 'openai_compatible' ||
                              (configProvider.includes('chatanywhere') && c.provider.includes('chatanywhere'))
                            ).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">API 终点网址 (Base URL)</label>
                        <input
                          type="text"
                          value={configBaseUrl}
                          onChange={(e) => setConfigBaseUrl(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-100 outline-none focus:border-violet-600"
                          placeholder="例如 https://api.deepseek.com/v1 (留空则默认内置地址)"
                        />
                        {configProvider === 'anthropic_compatible' && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-1">
                            请确保 Router / 网关已在该 baseUrl 运行。
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">附加参数 JSON 配置 (Extra Config)</label>
                        <textarea
                          value={configExtraConfig}
                          onChange={(e) => setConfigExtraConfig(e.target.value)}
                          rows={3}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-100 outline-none font-mono focus:border-violet-600"
                          placeholder="{}"
                        />
                      </div>

                      <div className="flex gap-2.5 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingConfig(false);
                            setEditingConfigId(null);
                          }}
                          className="px-3.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 font-semibold"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold shadow-sm"
                        >
                          {editingConfigId ? '保存配置' : '创建配置'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Config List */}
                  {modelConfigs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl select-none">
                      暂无配置，请点击右上角新建大模型配置。
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {modelConfigs.map(c => {
                        const isTesting = testingConfigId === c.id;
                        const result = testResults[c.id];
                        const providerName = modelProviders.find(p => p.id === c.provider)?.name || c.provider;
                        const credName = modelCredentials.find(cred => cred.id === c.credentialRef)?.name;

                        return (
                          <div key={c.id} className="p-4 border border-slate-200 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-950/20 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:border-violet-600/35 transition-all relative group">
                            <div className="flex justify-between items-start gap-1.5">
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-150 flex items-center gap-1.5 truncate">
                                  <Sliders className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                                  <span className="truncate">{c.name}</span>
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 truncate">
                                  <Database className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                                  <span className="truncate">{providerName} / {c.modelName}</span>
                                </p>
                                {c.baseUrl && (
                                  <p className="text-[8px] font-mono text-slate-400 dark:text-slate-550 truncate mt-0.5 max-w-full" title={c.baseUrl}>{c.baseUrl}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleEditConfig(c)}
                                  className="p-1 hover:bg-slate-150 dark:hover:bg-slate-850 hover:text-violet-600 text-slate-400 rounded"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteModelConfig(c.id)}
                                  className="p-1 hover:bg-red-50 dark:hover:bg-red-955/20 hover:text-red-500 text-slate-400 rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-200/40 dark:border-slate-800/40 pt-2 flex-wrap gap-1.5 select-none">
                              {credName ? (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-55/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/30 rounded-md font-medium truncate max-w-[100px]" title={credName}>{credName}</span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-md">未绑定凭证</span>
                              )}

                              <div className="flex items-center gap-1.5 ml-auto">
                                {result && (
                                  <span className={`text-[9px] font-semibold ${result.success ? 'text-emerald-600 dark:text-emerald-450' : 'text-red-500 dark:text-red-400'}`}>
                                    {result.success ? `成功 ${result.latencyMs}ms` : '失败'}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleTestConfig(c.id)}
                                  disabled={isTesting}
                                  className={`px-2 py-0.5 border text-[9px] rounded-md transition-colors font-bold ${
                                    isTesting 
                                      ? 'bg-slate-100 border-slate-200 text-slate-400 animate-pulse' 
                                      : 'bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-emerald-500 text-slate-500'
                                  }`}
                                >
                                  {isTesting ? '测试中...' : '测试连接'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 2: Model Credentials */}
              {modelSubTab === 'credentials' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wide">服务商身份凭证 (API Keys)</h3>
                    {!isCreatingCred && (
                      <button
                        onClick={() => {
                          setIsCreatingCred(true);
                          setEditingCredId(null);
                          setCredName('');
                          setCredSecret('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        新建授权凭证
                      </button>
                    )}
                  </div>

                  {isCreatingCred && (
                    <form onSubmit={handleSaveCredential} className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4 animate-scale-in relative">
                      <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200">{editingCredId ? '编辑授权凭证' : '新建授权凭证'}</h4>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">凭证名称</label>
                        <input
                          type="text"
                          value={credName}
                          onChange={(e) => setCredName(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-violet-600"
                          placeholder="例如 OpenAI 个人 Key / DeepSeek 开发凭证"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">适用服务商 (Provider)</label>
                          <select
                            value={credProvider}
                            onChange={(e) => setCredProvider(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs cursor-pointer outline-none text-slate-850 dark:text-slate-100"
                          >
                            {modelProviders.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">凭证类别</label>
                          <select
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs cursor-not-allowed outline-none text-slate-850 dark:text-slate-100"
                            disabled
                          >
                            <option value="api_key">API Key (令牌密钥)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">身份凭证密钥 (Secret Key)</label>
                        <input
                          type="password"
                          value={credSecret}
                          onChange={(e) => setCredSecret(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-100 outline-none font-mono focus:border-violet-600"
                          placeholder={editingCredId ? "(留空不修改，输入以替换旧 Secret Key)" : "sk-................................"}
                          required={!editingCredId}
                        />
                        <p className="text-[9px] text-slate-400 mt-1 select-none flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded bg-slate-400" />
                          安全提示：平台不回显密钥明文，一次性安全传递并在服务器加密暂存。
                        </p>
                      </div>

                      <div className="flex gap-2.5 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingCred(false);
                            setEditingCredId(null);
                          }}
                          className="px-3.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 font-semibold"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold shadow-sm"
                        >
                          {editingCredId ? '保存修改' : '创建凭证'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Credentials List */}
                  {modelCredentials.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl select-none">
                      暂无模型凭证，请点击右上角新建 API 授权凭证。
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {modelCredentials.map(c => {
                        const providerName = modelProviders.find(p => p.id === c.provider)?.name || c.provider;
                        return (
                          <div key={c.id} className="p-4 border border-slate-200 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-950/20 rounded-2xl flex items-center justify-between shadow-sm hover:border-violet-600/35 transition-all relative group">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-955/35 text-amber-500 border border-amber-100/50 dark:border-amber-900/30 flex items-center justify-center flex-shrink-0">
                                <Key className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{c.name}</h4>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <span className="text-[9px] text-slate-400">{providerName}</span>
                                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                  <span className="text-[9px] text-slate-400 font-mono">****</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditCredential(c)}
                                className="p-1 hover:bg-slate-150 dark:hover:bg-slate-850 hover:text-violet-600 text-slate-400 rounded"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteModelCredential(c.id)}
                                className="p-1 hover:bg-red-50 dark:hover:bg-red-955/20 hover:text-red-500 text-slate-400 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 3: Registry Providers */}
              {modelSubTab === 'providers' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wide">支持的模型服务商与协议</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {modelProviders.map(p => (
                      <div key={p.id} className="p-4 border border-slate-200 dark:border-slate-800/80 bg-slate-50/10 dark:bg-slate-950/10 rounded-2xl flex flex-col gap-1.5 relative shadow-sm">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-emerald-500" />
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{p.name}</h4>
                          <span className="text-[8px] font-mono font-bold bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/50 px-1.5 py-0.5 rounded ml-auto uppercase tracking-wider">{p.id}</span>
                        </div>
                        <p className="text-[10px] text-slate-405 mt-1 flex items-center gap-1 font-mono">
                          <Activity className="w-3 h-3 text-slate-450" />
                          协议: {p.protocol}
                        </p>
                        {p.requiresBaseUrl && (
                          <div className="text-[9px] text-amber-600 dark:text-amber-500 bg-amber-500/10 border border-amber-500/15 rounded-md px-1.5 py-0.5 self-start mt-1 font-semibold">
                            需指定 Base URL API 终点地址
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FILE PERMISSIONS */}
          {activeTab === 'permissions' && (
            <form onSubmit={handleSavePermissions} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">本地文件权限与限制</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">控制智能体能够对关联项目目录进行哪些本地读写操作。</p>
              </div>

              {/* Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">允许智能体读取本地项目文件</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">启用后，智能体将具有只读访问权限来分析工作区中的代码和文档。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllowRead(!allowRead)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      allowRead ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${allowRead ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">允许智能体写入本地文件</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">启用后，您可以一键将智能体生成的 Artifact 覆盖或保存到本地项目。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllowWrite(!allowWrite)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      allowWrite ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${allowWrite ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">写入本地文件前进行二次确认</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">当覆盖已有文件或新建文件时，需要用户在 UI 弹窗进行手动授权。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmBeforeWrite(!confirmBeforeWrite)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      confirmBeforeWrite ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${confirmBeforeWrite ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">默认自动覆盖冲突文件</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">当写入路径存在重名文件时，自动进行代码覆盖，跳过冲突弹窗提示（不建议开启）。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoOverwrite(!autoOverwrite)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      autoOverwrite ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${autoOverwrite ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {/* Default save directory */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">默认 Artifact 保存子目录</label>
                <input
                  type="text"
                  value={defaultSaveDir}
                  onChange={(e) => setDefaultSaveDir(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-violet-600 dark:focus:border-violet-500 transition-colors font-mono"
                  placeholder="e.g. src/components"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-violet-500/10 active:scale-95"
                >
                  保存权限设置
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: SYSTEM NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSaveNotifications} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">系统级通知偏好</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">配置当您处于非当前窗口或后台时，系统发出原生桌面消息通知的场景。</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">启用原生桌面通知</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">启用后，应用会通过操作系统通知栏发送相关的任务状态通知。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableNotifications(!enableNotifications)} // always editable, togglable in mock/real
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      enableNotifications ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${enableNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">多智能体任务运行完成时通知</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">当一连串后台多智能体计划或者长脚本分析执行结束时发送通知。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifyOnTaskCompleted(!notifyOnTaskCompleted)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      notifyOnTaskCompleted ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${notifyOnTaskCompleted ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">生成新的 Artifact 产物时通知</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">当智能体成功生成代码、文档等产物并呈现在详情面板时发送通知。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifyOnArtifactCreated(!notifyOnArtifactCreated)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      notifyOnArtifactCreated ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${notifyOnArtifactCreated ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">智能体进程异常退出或运行出错时通知</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">当本地的 Qwen/OpenCode 进程出现网络断开或崩溃报错时紧急发出通知。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifyOnAgentError(!notifyOnAgentError)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors outline-none flex items-center ${
                      notifyOnAgentError ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-200 ${notifyOnAgentError ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-violet-500/10 active:scale-95"
                >
                  保存通知设置
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: LOCAL AGENT PROCESSES CONTROL */}
          {activeTab === 'agents' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">本地 Agent 进程管理</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">管理运行在您本地系统的 AI 模型及文件工具后台服务进程。</p>
              </div>

              {/* Selector */}
              <div className="flex gap-2">
                {localAgentProcesses.map(a => {
                  const isSelected = selectedAgentId === a.id;
                  const getStatusColor = (status: string) => {
                    if (status === 'running') return 'bg-emerald-500';
                    if (status === 'starting' || status === 'restarting') return 'bg-amber-500 animate-pulse';
                    if (status === 'error') return 'bg-red-500';
                    return 'bg-slate-400';
                  };
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAgentId(a.id)}
                      className={`flex-1 py-3 px-4 rounded-xl border text-xs font-semibold text-left transition-all relative flex items-center justify-between ${
                        isSelected
                          ? 'border-violet-600 bg-violet-50/15 dark:bg-violet-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-slate-500" />
                        <span className={isSelected ? 'text-violet-600 dark:text-violet-400 font-bold' : 'text-slate-700 dark:text-slate-300'}>{a.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(a.status)}`} />
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal lowercase">{a.status}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedAgent ? (
                <div className="grid grid-cols-3 gap-6 pt-1">
                  {/* Form fields */}
                  <form onSubmit={handleSaveAgentProcessSettings} className="col-span-2 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350">启动命令</label>
                      <input
                        type="text"
                        value={agentCommand}
                        onChange={(e) => setAgentCommand(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-200 outline-none focus:border-violet-600 font-mono"
                        placeholder="e.g. npm run start"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350">工作目录</label>
                      <input
                        type="text"
                        value={agentWorkDir}
                        onChange={(e) => setAgentWorkDir(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-200 outline-none focus:border-violet-600 font-mono"
                        placeholder="Leave blank for project root"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-350">运行端口 (Port)</label>
                        <input
                          type="number"
                          value={agentPort}
                          onChange={(e) => setAgentPort(parseInt(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-200 outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-350">日志输出路径</label>
                        <input
                          type="text"
                          value={agentLogPath}
                          onChange={(e) => setAgentLogPath(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-850 dark:text-slate-200 outline-none font-mono"
                          placeholder="agent.log"
                          disabled
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                      <button
                        type="submit"
                        className="bg-slate-800 hover:bg-slate-750 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow active:scale-95"
                      >
                        保存进程配置
                      </button>
                    </div>
                  </form>

                  {/* Process Status Box */}
                  <div className="col-span-1 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-150 mb-3 uppercase tracking-wider">控制面板</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">当前状态:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono capitalize">{selectedAgent.status}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">PID 编号:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{selectedAgent.pid || '无'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">绑定端口:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{selectedAgent.port}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      {selectedAgent.status === 'running' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => stopLocalAgent(selectedAgent.id)}
                            disabled={localAgentLoading[selectedAgent.id]}
                            className="w-full py-2 bg-red-650 hover:bg-red-550 disabled:bg-slate-400 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            停止进程
                          </button>
                          <button
                            type="button"
                            onClick={() => restartLocalAgent(selectedAgent.id)}
                            disabled={localAgentLoading[selectedAgent.id]}
                            className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-400 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            重启进程
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startLocalAgent(selectedAgent.id)}
                          disabled={localAgentLoading[selectedAgent.id]}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          启动进程
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Logs terminal box */}
                  <div className="col-span-3 space-y-2 mt-2">
                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <ScrollText className="w-4 h-4" />
                      <span className="text-xs font-bold">运行日志 (Log Terminal)</span>
                    </div>
                    <div className="w-full h-32 bg-slate-950 text-slate-300 font-mono text-[10px] p-3 rounded-xl overflow-y-auto leading-relaxed border border-slate-850">
                      {localAgentLogs[selectedAgent.id] && localAgentLogs[selectedAgent.id].length > 0 ? (
                        localAgentLogs[selectedAgent.id].map((log, idx) => (
                          <div key={idx} className="whitespace-pre-wrap">{log}</div>
                        ))
                      ) : (
                        <div className="text-slate-600 italic">No output logs. Start the agent process to see live log output.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 6: SYSTEM PREFERENCE */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">系统偏好设置</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">控制平台的开发偏好、UI 样式与核心数据重置选项。</p>
              </div>

              {/* Theme Settings */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">系统外观主题</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => handleThemeToggle('light')}
                    className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                      settings.theme !== 'dark'
                        ? 'border-violet-600 bg-violet-50/20 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Sun className="w-4 h-4" />
                    <span>浅色模式</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeToggle('dark')}
                    className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                      settings.theme === 'dark'
                        ? 'border-violet-600 bg-violet-950/20 text-violet-400'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Moon className="w-4 h-4" />
                    <span>深色模式</span>
                  </button>
                </div>
              </div>

              {/* Mock Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-xs font-bold text-slate-850 dark:text-slate-150">启用 Mock 数据演示模式</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">开启后将使用纯前端本地 Mock 数据响应，适合在没有后端服务时进行体验。</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await setUseMockMode(!useMockMode);
                    triggerNotice(useMockMode ? '已切换到真实 API 模式' : '已切换到 Mock 演示模式');
                  }}
                  className={`w-12 h-6.5 rounded-full p-1 transition-colors outline-none flex items-center ${
                    useMockMode ? 'bg-violet-600' : 'bg-slate-350 dark:bg-slate-800'
                  }`}
                >
                  <div
                    className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ${
                      useMockMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-3">
                <h4 className="text-xs font-bold text-red-500 flex items-center gap-1">
                  <span>数据管理与维护</span>
                </h4>
                <p className="text-[10px] text-slate-400 leading-normal">
                  点击“重置数据”将销毁您的全局应用状态和在 LocalStorage 缓存的所有对话，将 platform 环境初始化还原至默认状态。
                </p>
                <button
                  type="button"
                  onClick={handleResetData}
                  className="bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>重置所有应用数据</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
