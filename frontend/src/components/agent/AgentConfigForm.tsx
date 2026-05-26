import React, { useState } from 'react';
import { Agent, AgentProvider, AgentPermission } from '@/types';
import { Save, X } from 'lucide-react';

interface AgentConfigFormProps {
  agent: Agent;
  onSave: (updated: Agent) => void;
  onClose: () => void;
}

const AgentConfigForm: React.FC<AgentConfigFormProps> = ({ agent, onSave, onClose }) => {
  const [form, setForm] = useState<Agent>(() => ({
    ...agent,
    modelConfig: { ...agent.modelConfig },
    tools: agent.tools.map(t => ({ ...t })),
    permissions: { ...agent.permissions }
  }));

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

  return (
    <div className="h-full w-full bg-white dark:bg-slate-900 flex flex-col overflow-hidden transition-colors">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">配置 {agent.name}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-1 border-slate-100 dark:border-slate-800">基础信息</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Agent名称</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">描述</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">头像URL</label>
            <input
              type="text"
              value={form.avatar}
              onChange={e => setForm(prev => ({ ...prev, avatar: e.target.value }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
              className="w-4 h-4 rounded text-blue-600 dark:text-violet-600 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950"
            />
            <label htmlFor="enabled" className="text-sm text-slate-700 dark:text-slate-300">启用Agent</label>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-1 border-slate-100 dark:border-slate-800">Prompt配置</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">System Prompt</label>
            <textarea
              rows={3}
              value={form.systemPrompt}
              onChange={e => setForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all font-mono"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-1 border-slate-100 dark:border-slate-800">模型配置</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Provider</label>
            <select
              value={form.modelConfig.provider}
              onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, provider: e.target.value as AgentProvider } }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 transition-all cursor-pointer"
            >
              {providers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Model Name</label>
            <input
              type="text"
              value={form.modelConfig.modelName}
              onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, modelName: e.target.value } }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">API Base URL</label>
            <input
              type="text"
              value={form.modelConfig.apiBaseUrl || ''}
              onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, apiBaseUrl: e.target.value } }))}
              placeholder="https://api.example.com/v1"
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Temperature: {form.modelConfig.temperature.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={form.modelConfig.temperature}
              onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, temperature: parseFloat(e.target.value) } }))}
              className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Max Tokens</label>
            <input
              type="number"
              value={form.modelConfig.maxTokens}
              onChange={e => setForm(prev => ({ ...prev, modelConfig: { ...prev.modelConfig, maxTokens: parseInt(e.target.value) || 4096 } }))}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-violet-650/20 focus:border-blue-500 dark:focus:border-violet-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
            />
          </div>
        </div>

        {form.tools.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-1 border-slate-100 dark:border-slate-800">工具配置</h4>
            <div className="space-y-2">
              {form.tools.map(tool => (
                <div key={tool.id} className="flex items-center gap-2">
                  <input
                    id={`tool-${tool.id}`}
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={() => toggleTool(tool.id)}
                    className="w-4 h-4 rounded text-blue-600 dark:text-violet-650 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950"
                  />
                  <label htmlFor={`tool-${tool.id}`} className="text-sm text-slate-700 dark:text-slate-300">
                    {tool.name}
                    <span className="text-xs text-slate-500 dark:text-slate-450 ml-1">({tool.description})</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-1 border-slate-100 dark:border-slate-800">权限配置</h4>
          <div className="space-y-2">
            {[
              { key: 'canReadFiles', label: '允许读文件' },
              { key: 'canWriteFiles', label: '允许写文件' },
              { key: 'canRunCommands', label: '允许运行命令' },
              { key: 'canGenerateArtifacts', label: '允许生成产物' },
              { key: 'canDeploy', label: '允许部署' }
            ].map(p => (
              <div key={p.key} className="flex items-center gap-2">
                <input
                  id={`perm-${p.key}`}
                  type="checkbox"
                  checked={form.permissions[p.key as keyof AgentPermission]}
                  onChange={e => handlePermissionChange(p.key as keyof AgentPermission, e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 dark:text-violet-650 focus:ring-blue-500/20 dark:focus:ring-violet-500/20 border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950"
                />
                <label htmlFor={`perm-${p.key}`} className="text-sm text-slate-700 dark:text-slate-300">{p.label}</label>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-500/10 dark:shadow-violet-600/10 active:scale-[0.98] transition-all"
        >
          <Save className="w-4 h-4" />
          保存配置
        </button>
      </form>
    </div>
  );

};

export default AgentConfigForm;
