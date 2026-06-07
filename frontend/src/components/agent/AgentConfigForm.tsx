import React, { useState, useEffect, useMemo } from 'react';
import { Agent, AgentProvider, AgentPermission } from '@/types';
import { Save, X, Bot, FileText, Settings, Wrench, Shield, Check, Image, HelpCircle, AlertCircle, Globe, Cpu, Terminal, Plus, Loader2 } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import agentService from '@/services/http/agentService';

interface AgentConfigFormProps {
  agent: Agent;
  globalAgent?: Agent;
  onSave: (updated: Agent) => void;
  onClose: () => void;
  isSessionLevel?: boolean;
  onSyncToGlobal?: (updated: Agent) => void;
}

const AgentConfigForm: React.FC<AgentConfigFormProps> = ({ agent, globalAgent, onSave, onClose, isSessionLevel = false, onSyncToGlobal }) => {
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const modelConfigs = useAgentHubStore(state => state.modelConfigs);
  const activeConversationId = useAgentHubStore(state => state.activeConversationId);
  const toolCatalogRaw = useAgentHubStore(state => state.toolCatalog);
  const toolCatalog = Array.isArray(toolCatalogRaw) ? toolCatalogRaw : [];
  const loadToolCatalog = useAgentHubStore(state => state.loadToolCatalog);

  useEffect(() => {
    if (toolCatalog.length === 0) {
      loadToolCatalog();
    }
  }, [toolCatalog.length, loadToolCatalog]);

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
    runtime: agent.runtime || 'native',
    modelConfigId: agent.modelConfigId || '',
    runtimeConfig: agent.runtimeConfig ? { ...agent.runtimeConfig } : {
      opencode_bin: 'opencode',
      approval_mode: 'manual',
      session_id: ''
    },
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

  // Sync form.tools with toolCatalog when catalog is loaded
  useEffect(() => {
    if (toolCatalog.length > 0) {
      setForm(prev => {
        const existingToolIds = new Set(prev.tools.map(t => t.id));
        const missingTools = toolCatalog
          .filter(catItem => !existingToolIds.has(catItem.id))
          .map(catItem => ({
            id: catItem.id,
            enabled: false,
            name: catItem.name,
            description: catItem.description,
            displayGroup: catItem.displayGroup,
            riskGroup: catItem.riskGroup,
            riskLevel: catItem.riskLevel
          }));

        if (missingTools.length > 0) {
          return {
            ...prev,
            tools: [...prev.tools, ...missingTools]
          };
        }
        return prev;
      });
    }
  }, [toolCatalog]);


  const providers: AgentProvider[] = ['mock', 'claude-code', 'codex', 'opencode', 'local-qwen', 'custom'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (form.runtime !== 'native' && !form.modelConfigId) {
      alert('建议您为当前运行模式选择一个模型配置（Model Config）。');
    }

    if (form.runtime === 'claude_code') {
      const selectedConfig = modelConfigs.find(c => c.id === form.modelConfigId);
      if (!selectedConfig || (selectedConfig.provider !== 'anthropic' && selectedConfig.provider !== 'anthropic_compatible')) {
        const confirmSave = window.confirm('检测到您选择的模型配置不是 Anthropic 或 Anthropic-compatible，Claude Code 可能无法在此配置下正常运行。是否确认保存？');
        if (!confirmSave) {
          return;
        }
      }
    }

    const cleanRuntimeConfig = { ...(form.runtimeConfig || {}) };
    delete (cleanRuntimeConfig as any).apiKey;
    delete (cleanRuntimeConfig as any).baseUrl;
    delete (cleanRuntimeConfig as any).modelName;
    delete (cleanRuntimeConfig as any).provider;
    delete (cleanRuntimeConfig as any).opencode_bin;
    delete (cleanRuntimeConfig as any).codex_bin;
    delete (cleanRuntimeConfig as any).claude_code_bin;

    onSave({
      ...form,
      runtimeConfig: cleanRuntimeConfig
    });
  };

  const toggleTool = (toolId: string) => {
    setForm(prev => ({
      ...prev,
      tools: prev.tools.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t)
    }));
  };

  const handleRuntimeChange = (runtime: Agent['runtime']) => {
    setForm(prev => {
      const updatedTools = prev.tools.map(tool => {
        const catItem = toolCatalog.find(c => c.id === tool.id);
        const isCompatible = catItem ? catItem.runtimes.includes(runtime as any) : true;
        if (!isCompatible && tool.enabled) {
          return { ...tool, enabled: false };
        }
        return tool;
      });
      return {
        ...prev,
        runtime,
        tools: updatedTools
      };
    });
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
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 transition-colors shadow-sm gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
              <span>{isSessionLevel ? '配置会话专属智能体' : '配置智能体'}</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-mono font-medium">{form.name}</span>
              {isSessionLevel && (
                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded font-medium">会话专属</span>
              )}
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-0.5">
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

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Side Tab Navigation */}
        <div className="w-48 border-r border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-900 p-3.5 space-y-1 flex-shrink-0 select-none hidden lg:block">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-semibold transition-all ${isActive
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
        <div className="lg:hidden flex overflow-x-auto border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 gap-1.5 flex-shrink-0">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
          {/* Spacer to fix Flexbox right scroll padding bug on mobile */}
          <div className="w-6 flex-shrink-0" />
        </div>

        {/* Right Side Scrollable Form Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <form id="agent-config-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-slate-50/50 dark:bg-slate-950/20">

            {/* TAB 1: BASIC INFORMATION */}
            {activeTab === 'basic' && (
              <div className="space-y-5 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Bot className="w-4 h-4 text-violet-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">智能体基本属性</span>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-5 items-stretch sm:items-start">
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
                        {isSessionLevel && globalAgent && globalAgent.name !== form.name && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 block">全局默认值: <span className="font-semibold">{globalAgent.name}</span></span>
                        )}
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
                        {isSessionLevel && globalAgent && globalAgent.description !== form.description && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 block">全局默认值: <span className="font-semibold">{globalAgent.description}</span></span>
                        )}
                      </div>
                    </div>

                    {/* Realtime Avatar Preview */}
                    <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-start gap-4 p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 rounded-2xl sm:bg-transparent sm:dark:bg-transparent sm:border-0 sm:p-0 flex-shrink-0">
                      <div className="flex flex-col sm:items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400 select-none uppercase">头像预览</span>
                        <span className="text-[9px] text-slate-450 dark:text-slate-500 sm:hidden">根据下方 URL 实时渲染</span>
                      </div>
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-950 flex-shrink-0">
                        {form.avatar ? (
                          <img src={form.avatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Image className="w-5 h-5" />
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

                  {/* Tags Editing Section */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">能力标签 (Tags)</label>
                    <div className="flex flex-wrap gap-2 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl min-h-[44px] items-center">
                      {(form.tags || []).map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-violet-100/50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[10px] font-semibold rounded-full border border-violet-200/50 dark:border-violet-900/30 flex items-center gap-1 group"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setForm(prev => ({
                                ...prev,
                                tags: (prev.tags || []).filter((_, i) => i !== idx)
                              }));
                            }}
                            className="text-violet-400 hover:text-red-500 rounded-full transition-colors"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}

                      <input
                        type="text"
                        placeholder="输入标签并按回车..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val && !(form.tags || []).includes(val)) {
                              setForm(prev => ({
                                ...prev,
                                tags: [...(prev.tags || []), val]
                              }));
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                        className="flex-grow bg-transparent text-xs text-slate-800 dark:text-slate-150 outline-none min-w-[120px] py-0.5 px-1 placeholder-slate-400 dark:placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-350 block">启用智能体状态</span>
                      <span className="text-[10px] text-slate-550 dark:text-slate-500 block mt-0.5">关闭后，该智能体将无法在聊天室被使用或 @ 提及。</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${form.enabled ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-850'
                        }`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${form.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SYSTEM PROMPT */}
            {activeTab === 'prompt' && (
              <div className="space-y-5 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
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
                    {isSessionLevel && globalAgent && (
                      <div className="mt-2.5 p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl">
                        <details className="outline-none cursor-pointer">
                          <summary className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-white select-none">
                            查看全局默认 Prompt 提示词参考
                          </summary>
                          <pre className="mt-2 p-3 bg-slate-50 dark:bg-slate-950/70 rounded-lg text-[10.5px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto text-slate-500 border border-slate-200/50 dark:border-slate-900 leading-relaxed cursor-text select-text select-all">
                            {globalAgent.systemPrompt}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: MODEL CONFIG */}
            {activeTab === 'model' && (
              <div className="space-y-5 animate-fade-in">
                {/* Segmented control for execution mode */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-855 shadow-sm space-y-4">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-350">智能体运行模式 (Execution Mode)</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleRuntimeChange('native')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        form.runtime === 'native'
                          ? 'bg-violet-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-850 dark:hover:white'
                      }`}
                    >
                      自定义 Prompt (Native)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRuntimeChange('opencode')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        form.runtime !== 'native'
                          ? 'bg-violet-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-850 dark:hover:white'
                      }`}
                    >
                      平台 Agent (Platform)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-550">
                    {form.runtime === 'native'
                      ? '自定义 Prompt 模式下，智能体基于您设置 the System Prompt 和可用工具独立自主运行。'
                      : '平台模式下，智能体将绑定特定的开发运行框架（如 OpenCode），以执行更高级的终端级协作任务。'}
                  </p>
                </div>

                {/* Model Configuration Selector */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-855 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-violet-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">大模型底座参数</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">选择模型配置 (Model Config)</label>
                    <select
                      value={form.modelConfigId || ''}
                      onChange={e => setForm(prev => ({ ...prev, modelConfigId: e.target.value || null }))}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all cursor-pointer font-semibold"
                    >
                      <option value="">-- 请选择统一的模型配置 --</option>
                      {modelConfigs.map(cfg => (
                        <option key={cfg.id} value={cfg.id}>
                          {cfg.name} ({cfg.provider} / {cfg.modelName})
                        </option>
                      ))}
                    </select>
                    {form.modelConfigId && (() => {
                      const selectedConfig = modelConfigs.find(c => c.id === form.modelConfigId);
                      if (!selectedConfig) return null;
                      const isClaudeCode = form.runtime === 'claude_code';
                      const isCompatibleProvider = selectedConfig.provider === 'anthropic' || selectedConfig.provider === 'anthropic_compatible';

                      return (
                        <div className="space-y-2">
                          <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                            <div>服务商: <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedConfig.provider}</span></div>
                            <div>协议: <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedConfig.protocol}</span></div>
                            <div>模型: <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedConfig.modelName}</span></div>
                            {selectedConfig.baseUrl && <div>端点: <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedConfig.baseUrl}</span></div>}
                          </div>
                          {isClaudeCode && !isCompatibleProvider && (
                            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] rounded-xl flex items-start gap-1.5 mt-2">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                              <span>Claude Code 需要 Anthropic 官方 API 或 Anthropic-compatible Router，不能直接使用 OpenAI-compatible 配置。</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Legacy Compatibility Collapsible Panel (Only for Native) */}
                  {form.runtime === 'native' && (
                    <details className="border-t border-slate-100 dark:border-slate-800/80 pt-4 outline-none cursor-pointer group">
                      <summary className="text-[11px] font-semibold text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 select-none">
                        使用历史遗留模型配置作为 Fallback (兼容用)
                      </summary>
                      <div className="mt-4 space-y-4 cursor-default animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">服务供应商 (Provider)</label>
                            <select
                              value={form.modelConfig.provider}
                              onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, provider: e.target.value as AgentProvider } }))}
                              className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all cursor-pointer font-semibold"
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
                              className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono font-medium"
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
                            className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono"
                          />
                        </div>

                        <div className="space-y-2 pt-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-700 dark:text-slate-350">多样性倾向 (Temperature)</span>
                            <span className="font-mono bg-violet-50 dark:bg-violet-955/40 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded font-bold">{form.modelConfig.temperature.toFixed(1)}</span>
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
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-350">单次回答最大上限 (Max Tokens)</label>
                          </div>
                          <input
                            type="number"
                            value={form.modelConfig.maxTokens}
                            onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, maxTokens: parseInt(e.target.value) || 4096 } }))}
                            className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-semibold"
                          />
                        </div>
                      </div>
                    </details>
                  )}
                </div>

                {/* Platform Runtime Config Panel */}
                {form.runtime !== 'native' && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-855 shadow-sm space-y-5 animate-fade-in">
                    <div className="flex items-center gap-2 mb-1">
                      <Cpu className="w-4 h-4 text-violet-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">平台运行配置 (Platform Runtime Config)</span>
                    </div>

                    {/* Runtime Selection Card Grid */}
                    <div className="space-y-2.5">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-350">选择运行框架 (Framework)</label>
                      <div className="grid grid-cols-3 gap-3">
                        <div
                          onClick={() => handleRuntimeChange('opencode')}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 select-none ${
                            form.runtime === 'opencode'
                              ? 'border-violet-500 bg-violet-50/15 dark:bg-violet-955/10 shadow-sm'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 hover:bg-slate-100/40 dark:hover:bg-slate-800/20'
                          }`}
                        >
                          <Terminal className="w-5 h-5 text-violet-500 mb-1" />
                          <span className="text-xs font-bold block">OpenCode</span>
                          <span className="text-[9px] text-violet-655 bg-violet-100/60 dark:bg-violet-950/40 px-1.5 py-0.5 rounded scale-90 mt-1 font-semibold">推荐</span>
                        </div>

                        <div
                          onClick={() => handleRuntimeChange('codex')}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 select-none ${
                            form.runtime === 'codex'
                              ? 'border-violet-500 bg-violet-50/15 dark:bg-violet-955/10 shadow-sm'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 hover:bg-slate-100/40 dark:hover:bg-slate-800/20'
                          }`}
                        >
                          <Cpu className="w-5 h-5 text-violet-500 mb-1" />
                          <span className="text-xs font-bold block">Codex</span>
                          <span className="text-[8px] text-slate-500 mt-1 leading-normal max-w-full">支持 OpenAI-compatible provider</span>
                        </div>

                        <div
                          onClick={() => handleRuntimeChange('claude_code')}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 select-none ${
                            form.runtime === 'claude_code'
                              ? 'border-violet-500 bg-violet-50/15 dark:bg-violet-955/10 shadow-sm'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 hover:bg-slate-100/40 dark:hover:bg-slate-800/20'
                          }`}
                        >
                          <Cpu className="w-5 h-5 text-violet-500 mb-1" />
                          <span className="text-xs font-bold block">Claude Code</span>
                          <span className="text-[8px] text-slate-500 mt-1 leading-normal max-w-full">需要 Anthropic-compatible 网关</span>
                        </div>
                      </div>
                    </div>

                    {/* Runtime Config Form Fields */}
                    <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      {form.runtime === 'opencode' && (
                        <>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">审批模式 (Approval Mode)</label>
                              <select
                                value={(form.runtimeConfig as any)?.approval_mode || 'manual'}
                                onChange={e => setForm(prev => ({
                                  ...prev,
                                  runtimeConfig: {
                                    ...(prev.runtimeConfig || {}),
                                    approval_mode: e.target.value
                                  }
                                }))}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-semibold"
                              >
                                <option value="manual">手动审核 (manual)</option>
                                <option value="auto">自动运行 (auto)</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">会话 ID (session_id - 可选)</label>
                              <input
                                type="text"
                                value={(form.runtimeConfig as any)?.session_id || ''}
                                onChange={e => setForm(prev => ({
                                  ...prev,
                                  runtimeConfig: {
                                    ...(prev.runtimeConfig || {}),
                                    session_id: e.target.value
                                  }
                                }))}
                                placeholder="自动生成的会话或自定义唯一标识"
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {form.runtime === 'codex' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">超时秒数 (timeout_seconds - 可选)</label>
                            <input
                              type="number"
                              placeholder="不填使用默认配置 (例如 300)"
                              value={(form.runtimeConfig as any)?.timeout_seconds || ''}
                              onChange={e => setForm(prev => ({
                                ...prev,
                                runtimeConfig: {
                                  ...(prev.runtimeConfig || {}),
                                  timeout_seconds: e.target.value ? parseInt(e.target.value) : undefined
                                }
                              }))}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {form.runtime === 'claude_code' && (
                        <div className="space-y-4 animate-fade-in">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">超时秒数 (timeout_seconds - 可选)</label>
                              <input
                                type="number"
                                placeholder="不填使用默认配置 (例如 300)"
                                value={(form.runtimeConfig as any)?.timeout_seconds || ''}
                                onChange={e => setForm(prev => ({
                                  ...prev,
                                  runtimeConfig: {
                                    ...(prev.runtimeConfig || {}),
                                    timeout_seconds: e.target.value ? parseInt(e.target.value) : undefined
                                  }
                                }))}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5">权限模式 (permission_mode - 可选)</label>
                              <input
                                type="text"
                                placeholder="例如 manual"
                                value={(form.runtimeConfig as any)?.permission_mode || ''}
                                onChange={e => setForm(prev => ({
                                  ...prev,
                                  runtimeConfig: {
                                    ...(prev.runtimeConfig || {}),
                                    permission_mode: e.target.value
                                  }
                                }))}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 transition-all font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: TOOLS CONFIG */}
            {activeTab === 'tools' && (
              <div className="space-y-6 animate-fade-in">
                {['context', 'workspace', 'sandbox', 'artifact'].map(groupKey => {
                  const groupTitle = {
                    context: '上下文与辅助功能 (Context)',
                    workspace: '工作区修改与写入 (Workspace)',
                    sandbox: '沙箱终端与命令 (Sandbox)',
                    artifact: '前端产物与部署 (Artifact)'
                  }[groupKey] || groupKey;

                  const groupTools = form.tools.filter(tool => {
                    const catItem = toolCatalog.find(c => c.id === tool.id);
                    const group = catItem?.displayGroup || tool.displayGroup || 'context';
                    return group === groupKey;
                  });

                  if (groupTools.length === 0) return null;

                  return (
                    <div key={groupKey} className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Wrench className="w-4 h-4 text-violet-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{groupTitle}</span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                        {groupTools.map(tool => {
                          const catItem = toolCatalog.find(c => c.id === tool.id);
                          const isCompatible = catItem ? catItem.runtimes.includes(form.runtime as any) : true;
                          const riskLevel = catItem?.riskLevel || tool.riskLevel || 'low';
                          
                          let riskBadge = null;
                          if (riskLevel === 'high') {
                            riskBadge = <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20 ml-2">高风险</span>;
                          } else if (riskLevel === 'critical') {
                            riskBadge = <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/10 text-red-500 font-semibold border border-red-500/20 ml-2">高风险</span>;
                          }

                          const isHighRisk = riskLevel === 'high' || riskLevel === 'critical';

                          return (
                            <div
                              key={tool.id}
                              onClick={() => isCompatible && toggleTool(tool.id)}
                              className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 select-none ${
                                !isCompatible
                                  ? 'border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-955/10 opacity-50 cursor-not-allowed'
                                  : tool.enabled
                                    ? isHighRisk
                                      ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/5 shadow-sm cursor-pointer'
                                      : 'border-emerald-500 bg-emerald-50/15 dark:bg-emerald-500/5 shadow-sm cursor-pointer'
                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-955/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 cursor-pointer'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all mt-0.5 ${
                                !isCompatible
                                  ? 'border-slate-200 dark:border-slate-800 bg-slate-105 dark:bg-slate-900'
                                  : tool.enabled
                                    ? isHighRisk
                                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-500/20'
                                      : 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                              }`}>
                                {tool.enabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`text-xs font-bold flex items-center transition-colors ${
                                  !isCompatible
                                    ? 'text-slate-450 dark:text-slate-600'
                                    : tool.enabled
                                      ? isHighRisk
                                        ? 'text-amber-700 dark:text-amber-450'
                                        : 'text-emerald-700 dark:text-emerald-450'
                                      : 'text-slate-700 dark:text-slate-350'
                                }`}>
                                  {tool.name || catItem?.name || tool.id}
                                  {riskBadge}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-555 mt-1 block leading-normal">
                                  {tool.description || catItem?.description}
                                </span>
                                {isCompatible && tool.enabled && isHighRisk && (
                                  <span className="text-[9px] text-amber-600 dark:text-amber-400 mt-1.5 font-semibold flex items-center gap-1 bg-amber-500/10 dark:bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/20 w-fit">
                                    <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                    高风险工具：请谨慎授予，确保智能体来源可信。
                                  </span>
                                )}
                                {!isCompatible && (
                                  <span className="text-[9px] text-red-500/80 dark:text-red-400/80 mt-1 block font-medium">
                                    当前模式 ({form.runtime}) 不支持该工具
                                  </span>
                                )}
                                {isCompatible && isSessionLevel && globalAgent && (() => {
                                  const globalTool = globalAgent.tools?.find(t => t.id === tool.id);
                                  const isGlobalEnabled = globalTool ? globalTool.enabled : false;
                                  return (
                                    <span className="text-[9px] text-slate-400 dark:text-slate-600 mt-1 block font-medium">
                                      全局默认: {isGlobalEnabled ? '开启' : '关闭'}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 5: PERMISSIONS CONFIG */}
            {activeTab === 'permissions' && (
              <div className="space-y-5 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-850 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-violet-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">运行与操作系统权限授权</span>
                  </div>

                  {/* Read-only disclaimer banner */}
                  <div className="bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold">安全权限管理说明</p>
                      <p className="mt-1 opacity-90 leading-relaxed">
                        当前运行安全权限已完全由智能体下启用的「可用工具」推导得出。此处为只读展示，不可手动修改。若要调整权限，请前往「可用工具」标签页启用或禁用相应工具。
                      </p>
                    </div>
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
                          className={`flex items-start gap-4 p-3.5 rounded-xl border transition-all duration-200 select-none ${isPermOn
                              ? 'border-violet-500 bg-violet-500/5'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20'
                            } opacity-90`}
                        >
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all mt-0.5 ${isPermOn
                              ? 'bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-500/20'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                            }`}>
                            {isPermOn && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-xs font-bold block transition-colors ${isPermOn ? 'text-violet-700 dark:text-violet-400' : 'text-slate-700 dark:text-slate-350'
                              }`}>
                              {p.label}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 block leading-normal">
                              {p.desc}
                            </span>
                            {isSessionLevel && globalAgent && (() => {
                              const isGlobalPermOn = globalAgent.permissions?.[p.key as keyof AgentPermission];
                              return (
                                <span className="text-[9px] text-slate-400 dark:text-slate-650 mt-1 block font-medium">
                                  全局默认: {isGlobalPermOn ? '已授权' : '禁用'}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </form>

          {/* Persistent Floating Save action footer */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 flex-shrink-0 bg-white dark:bg-slate-900 shadow-md">
            {isSessionLevel && onSyncToGlobal && (
              <button
                type="button"
                onClick={handleSyncToGlobal}
                disabled={syncing}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 active:scale-95 disabled:opacity-50 w-full sm:w-auto animate-fade-in"
              >
                {synced ? <Check className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                <span>{synced ? '已同步到全局' : '同步为全局配置'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-sm active:scale-95 w-full sm:w-auto text-center flex items-center justify-center"
            >
              取消
            </button>
            <button
              type="submit"
              form="agent-config-form"
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-550 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/10 active:scale-95 w-full sm:w-auto"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存修改</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentConfigForm;
