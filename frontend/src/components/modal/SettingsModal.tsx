import React, { useState, useEffect } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { X, User, Sliders, Settings, Eye, EyeOff, Check, Moon, Sun, Trash2 } from 'lucide-react';

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

  const [activeTab, setActiveTab] = useState<'profile' | 'model' | 'system'>('profile');
  
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
    }
  }, [isOpen, currentUser, settings]);

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

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl h-[520px] flex shadow-2xl overflow-hidden animate-scale-in relative">
        
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
            className="w-full border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 bg-white dark:bg-slate-900"
          >
            返回工作区
          </button>
        </div>

        {/* Right Side Settings View */}
        <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-slate-900 relative">
          {/* Header Close button */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-6 right-6 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">个人资料</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">修改您的个人姓名、邮箱并配置 Preset 个性头像。</p>
              </div>

              {/* Preset avatar list */}
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

              {/* Text URL avatar */}
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

              {/* Name & Email inputs */}
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
            <form onSubmit={handleSaveModelSettings} className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">模型参数设置</h2>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">配置您的智能体调用大模型时的全局请求配置与授权密钥。</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">API 供应商 (Provider)</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-violet-600 dark:focus:border-violet-500 transition-colors cursor-pointer"
                  >
                    <option value="custom" className="dark:bg-slate-900 dark:text-slate-300">定制网关 / Local</option>
                    <option value="openai" className="dark:bg-slate-900 dark:text-slate-300">OpenAI (GPT)</option>
                    <option value="anthropic" className="dark:bg-slate-900 dark:text-slate-300">Anthropic (Claude)</option>
                    <option value="deepseek" className="dark:bg-slate-900 dark:text-slate-300">DeepSeek AI</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">默认调用模型 (Model Name)</label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-violet-600 dark:focus:border-violet-500 transition-colors"
                    placeholder="gpt-4o"
                  />
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">身份密钥 (API Key)</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-4 pr-10 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-650 outline-none focus:border-violet-600 transition-colors"
                    placeholder="sk-................................"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Sliders: Temp & Tokens */}
              <div className="grid grid-cols-2 gap-6 pt-1">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-slate-700 dark:text-slate-300">采样温度 (Temperature)</label>
                    <span className="text-violet-600 dark:text-violet-400 font-mono font-semibold">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="2.0"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-600"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>精确 (0.0)</span>
                    <span>均衡 (1.0)</span>
                    <span>创造力 (2.0)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">单次最大 Token (Max Tokens)</label>
                  <select
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-violet-600 dark:focus:border-violet-500 cursor-pointer"
                  >
                    <option value={1024} className="dark:bg-slate-900 dark:text-slate-300">1024 (更短响应)</option>
                    <option value={2048} className="dark:bg-slate-900 dark:text-slate-300">2048 (中等输出)</option>
                    <option value={4096} className="dark:bg-slate-900 dark:text-slate-300">4096 (标准推荐)</option>
                    <option value={8192} className="dark:bg-slate-900 dark:text-slate-300">8192 (长上下文)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-violet-500/10 active:scale-95"
                >
                  保存参数
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: SYSTEM PREFERENCE */}
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
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">启用 Mock 数据演示模式</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">开启后将使用纯前端本地 Mock 数据响应，适合在没有后端服务时进行体验。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUseMockMode(!useMockMode)}
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
