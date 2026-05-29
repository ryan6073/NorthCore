import React, { useState } from 'react';
import { Agent, AgentProvider, AgentPermission } from '@/types';
import { Save, X, Bot, FileText, Settings, Wrench, Shield, Check, Image, HelpCircle, AlertCircle, Globe } from 'lucide-react';

interface AgentConfigFormProps {
  agent: Agent;
  onSave: (updated: Agent) => void;
  onClose: () => void;
  isSessionLevel?: boolean;
  onSyncToGlobal?: (updated: Agent) => void;
}

const AgentConfigForm: React.FC<AgentConfigFormProps> = ({ agent, onSave, onClose, isSessionLevel = false, onSyncToGlobal }) => {
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const handleSyncToGlobal = async () => {
    if (!onSyncToGlobal) return;
    setSyncing(true);
    try {
      await onSyncToGlobal(form);
      setSynced(true);
      setTimeout(() => setSynced(false), 2000);
    } catch (e) {
      console.error('Failed to sync config to global', e);
    } finally {
      setSyncing(false);
    }
  };

  const [form, setForm] = useState<Agent>(() => ({
    ...agent,
    modelConfig: agent.modelConfig ? { ...agent.modelConfig } : {
      provider: 'custom' as any,
      modelName: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096
    },
    tools: (agent.tools || []).map(t => ({ ...t })),
    permissions: agent.permissions ? { ...agent.permissions } : {
      canReadFiles: false,
      canWriteFiles: false,
      canRunCommands: false,
      canGenerateArtifacts: false,
      canDeploy: false
    }
  }));

  const [activeTab, setActiveTab] = useState<'basic' | 'prompt' | 'model' | 'tools' | 'permissions'>('basic');

  const providers: AgentProvider[] = ['mock', 'claude-code', 'codex', 'opencode', 'local-qwen', 'custom'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const toggleTool = (toolId: string) => {
    setForm(prev => ({
      ...prev,
      tools: prev.tools.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t)
    }));
  };

  const handlePermissionChange = (key: keyof AgentPermission, value: boolean) => {
    setForm(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value }
    }));
  };

  const tabs = [
    { id: 'basic' as const, label: '基础信息', icon: Bot },
    { id: 'prompt' as const, label: '系统 Prompt', icon: FileText },
    { id: 'model' as const, label: '模型参数', icon: Settings },
    { id: 'tools' as const, label: '可用工具', icon: Wrench },
    { id: 'permissions' as const, label: '安全权限', icon: Shield },
  ];

  return (
    <div className="h-full w-full bg-slate-50/50 dark:bg-slate-950 flex flex-col overflow-hidden font-sans">
      {/* Premium header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 transition-colors shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>{isSessionLevel ? '配置会话专属智能体' : '配置智能体'}</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-mono font-medium">{form.name}</span>
              {isSessionLevel && (
                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded font-medium">会话专属</span>
              )}
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isSessionLevel ? '当前修改仅在此会话生效。您可以同步此配置到全局。' : '设定行为模式、运行模型、权限授权和可操作工具集。'}
            </p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 border border-slate-200/50 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Side Tab Navigation */}
        <div className="w-48 border-r border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-900 p-3.5 space-y-1 flex-shrink-0 select-none hidden md:block">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile quick tabs */}
        <div className="md:hidden flex overflow-x-auto border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 gap-1.5 flex-shrink-0">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/20">
          
          {/* TAB 1: BASIC INFORMATION */}
          {activeTab === 'basic' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">智能体基本属性</span>
                </div>
                
                <div className="flex gap-5 items-start">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">智能体名称</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all font-medium"
                        placeholder="给智能体起个响亮的名字..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">能力描述</label>
                      <textarea
                        value={form.description}
                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                        rows={2}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all resize-none font-medium"
                        placeholder="描述该智能体的主要功能，如：专业前端重构、代码调试..."
                      />
                    </div>
                  </div>

                  {/* Realtime Avatar Preview */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 select-none uppercase">头像预览</span>
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-950">
                      {form.avatar ? (
                        <img src={form.avatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Image className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">头像图片 URL</label>
                  <input
                    type="text"
                    value={form.avatar}
                    onChange={e => setForm(prev => ({ ...prev, avatar: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-150 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 placeholder:text-slate-400 dark:placeholder:text-slate-650 transition-all font-mono"
                    placeholder="https://example.com/avatar.png"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350 block">启用智能体状态</span>
                    <span className="text-[10px] text-slate-550 dark:text-slate-500 block mt-0.5">关闭后，该智能体将无法在聊天室被使用或 @ 提及。</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      form.enabled ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-850'
                    }`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                      form.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SYSTEM PROMPT */}
          {activeTab === 'prompt' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-violet-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">系统指示词 (System Prompt)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-450 rounded font-mono">System Role</span>
                </div>

                <div className="space-y-1.5">
                  <textarea
                    rows={12}
                    value={form.systemPrompt}
                    onChange={e => setForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-850 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 placeholder:text-slate-400 dark:placeholder:text-slate-650 transition-all font-mono leading-relaxed"
                    placeholder="设定智能体的系统角色与提示词，指导它扮演特定的专家或表现出特定的态度和回复偏好..."
                  />
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 leading-normal bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900/60">
                    <AlertCircle className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                    <span>系统指示词代表了智能体的指令核心。合理的系统词能够极大提升回答的质量和稳定性。</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MODEL CONFIG */}
          {activeTab === 'model' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Settings className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">大模型底座参数</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">服务供应商 (Provider)</label>
                    <select
                      value={form.modelConfig.provider}
                      onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, provider: e.target.value as AgentProvider } }))}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all cursor-pointer font-semibold"
                    >
                      {providers.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">调用模型名称 (Model Name)</label>
                    <input
                      type="text"
                      required
                      value={form.modelConfig.modelName}
                      onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, modelName: e.target.value } }))}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono font-medium"
                      placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">API 代理端点 (API Base URL - 可选)</label>
                  <input
                    type="text"
                    value={form.modelConfig.apiBaseUrl || ''}
                    onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, apiBaseUrl: e.target.value } }))}
                    placeholder="https://api.openai-proxy.com/v1"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-350">多样性倾向 (Temperature)</span>
                    <span className="font-mono bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded font-bold">{form.modelConfig.temperature.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={form.modelConfig.temperature}
                    onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, temperature: parseFloat(e.target.value) } }))}
                    className="w-full h-1.5 bg-slate-100 dark:bg-slate-850 rounded-lg appearance-none cursor-pointer accent-violet-650"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 select-none">
                    <span>严格/精确 (0.0)</span>
                    <span>均衡 (1.0)</span>
                    <span>创意/发散 (2.0)</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-350">单次回答最大上限 (Max Tokens)</label>
                    <span title="限制模型单词单次回复的 Token 数量上限。" className="cursor-help flex items-center">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  </div>
                  <input
                    type="number"
                    value={form.modelConfig.maxTokens}
                    onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, maxTokens: parseInt(e.target.value) || 4096 } }))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-semibold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TOOLS CONFIG */}
          {activeTab === 'tools' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">可用功能工具集 (Tools)</span>
                </div>

                {!form.tools || form.tools.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-6 text-center">暂无可配置的工具</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {form.tools.map(tool => (
                      <div 
                        key={tool.id}
                        onClick={() => toggleTool(tool.id)}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
                          tool.enabled 
                            ? 'border-emerald-500 bg-emerald-50/15 dark:bg-emerald-500/5 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all mt-0.5 ${
                          tool.enabled
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                        }`}>
                          {tool.enabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <span className={`text-xs font-bold block transition-colors ${
                            tool.enabled ? 'text-emerald-700 dark:text-emerald-450' : 'text-slate-700 dark:text-slate-350'
                          }`}>
                            {tool.name}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block leading-normal">
                            {tool.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: PERMISSIONS CONFIG */}
          {activeTab === 'permissions' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-violet-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">运行与操作系统权限授权</span>
                </div>

                <div className="space-y-3">
                  {[
                    { key: 'canReadFiles', label: '允许读取本地文件/工作区 (canReadFiles)', desc: '智能体可执行目录扫描与特定源码文件只读查看' },
                    { key: 'canWriteFiles', label: '允许写入与修改本地代码 (canWriteFiles)', desc: '智能体可直接对工作区内文件进行写入或编辑覆写' },
                    { key: 'canRunCommands', label: '允许在系统终端运行命令行指令 (canRunCommands)', desc: '允许运行脚本和任意终端操作，需要谨慎授权' },
                    { key: 'canGenerateArtifacts', label: '允许生成前端产物/Artifact (canGenerateArtifacts)', desc: '智能体拥有生成独立 HTML 产物和交互预览面板的权限' },
                    { key: 'canDeploy', label: '允许执行一键应用部署与上线 (canDeploy)', desc: '允许在生产或沙箱环境中直接执行应用部署操作' }
                  ].map(p => {
                    const isPermOn = form.permissions[p.key as keyof AgentPermission];
                    return (
                      <div 
                        key={p.key} 
                        onClick={() => handlePermissionChange(p.key as keyof AgentPermission, !isPermOn)}
                        className={`flex items-start gap-4 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
                          isPermOn
                            ? 'border-violet-500 bg-violet-500/5'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all mt-0.5 ${
                          isPermOn
                            ? 'bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-500/20'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                        }`}>
                          {isPermOn && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <span className={`text-xs font-bold block transition-colors ${
                            isPermOn ? 'text-violet-750 dark:text-violet-400' : 'text-slate-700 dark:text-slate-350'
                          }`}>
                            {p.label}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 block leading-normal">
                            {p.desc}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Persistent Floating Save action footer */}
          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-end gap-3 flex-shrink-0 bg-transparent">
            {isSessionLevel && onSyncToGlobal && (
              <button
                type="button"
                onClick={handleSyncToGlobal}
                disabled={syncing}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/10 active:scale-95 disabled:opacity-50"
              >
                {synced ? <Check className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                <span>{synced ? '已同步到全局' : '同步为全局配置'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-sm active:scale-95"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-550 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-violet-600/10 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存修改</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default AgentConfigForm;
