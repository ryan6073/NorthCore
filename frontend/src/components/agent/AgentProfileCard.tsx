import React, { useState } from 'react';
import { X, MessageSquarePlus, Edit2, Trash2, Circle, CircleDot, CircleDotDashed, ChevronDown, ChevronUp, Wrench, Settings as SettingsIcon } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import type { Agent } from '@/types';
import ConfirmModal from '../modal/ConfirmModal';

interface AgentProfileCardProps {
  agent: Agent;
  onClose: () => void;
  onGoChat?: () => void;
}

const AgentProfileCard: React.FC<AgentProfileCardProps> = ({ agent, onClose, onGoChat }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Agent>>({
    name: agent.name,
    avatar: agent.avatar,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    modelConfig: { ...agent.modelConfig },
    tags: agent.tags ? [...agent.tags] : [],
    tools: (agent.tools || []).map(t => ({ ...t })),
    permissions: agent.permissions ? { ...agent.permissions } : {
      canReadFiles: false,
      canWriteFiles: false,
      canRunCommands: false,
      canGenerateArtifacts: false,
      canDeploy: false
    },
    enabled: agent.enabled,
  });

  const saveAgent = useAgentHubStore(state => state.saveAgent);
  const deleteAgent = useAgentHubStore(state => state.deleteAgent);
  const currentUser = useAgentHubStore(state => state.currentUser);
  const useMockMode = useAgentHubStore(state => state.useMockMode);
  const setConfiguringAgentId = useAgentHubStore(state => state.setConfiguringAgentId);

  const isEditable = useMockMode || (
    currentUser && (
      agent.ownerUserId === currentUser.id ||
      agent.owner_user_id === currentUser.id
    )
  );

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'thinking': return 'bg-amber-500 animate-pulse';
      case 'offline': return 'bg-slate-400';
      case 'mock': return 'bg-sky-500';
      case 'disabled': return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };

  const renderStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'online':
        return <CircleDot className="w-3.5 h-3.5 text-green-500 fill-green-500" />;
      case 'offline':
        return <Circle className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return <CircleDotDashed className="w-3.5 h-3.5 text-yellow-500" />;
    }
  };

  const handleSave = async () => {
    await saveAgent({ ...agent, ...editForm } as Agent);
    setIsEditing(false);
  };

  const handleGoChat = async () => {
    onClose();
    onGoChat?.();
  };

  const toggleTool = (toolId: string) => {
    setEditForm(p => ({
      ...p,
      tools: (p.tools || []).map(t =>
        t.id === toolId ? { ...t, enabled: !t.enabled } : t
      ),
    }));
  };

  const handleDelete = async () => {
    await deleteAgent(agent.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-scale-in">
        {/* Header 区域 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-8" />
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                {isEditable && (
                  <>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-955/20 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-all border border-transparent"
                      title="删除 Agent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setConfiguringAgentId(agent.id);
                        onClose();
                      }}
                      className="p-1.5 rounded-lg hover:bg-lark-bg-hover dark:hover:bg-slate-800 text-slate-400 hover:text-lark-primary dark:hover:text-violet-400 transition-all border border-transparent"
                      title="编辑配置"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-lark-primary hover:bg-lark-primary-hover rounded-lg transition-all shadow-sm"
                >
                  保存
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {!isEditing ? (
          /* ========== 展示模式 ========== */
          <div className="px-6 py-5 max-h-[520px] overflow-y-auto">
            {/* 大头像 + 状态 */}
            <div className="flex flex-col items-center mb-5">
              <div className="relative">
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="w-24 h-24 rounded-full object-cover shadow-lg border-4 border-white dark:border-slate-900"
                />
                <div className={`absolute bottom-1 right-1 w-4.5 h-4.5 rounded-full border-2 border-white dark:border-slate-900 ${getStatusColor(agent.status)}`} />
              </div>
              <h2 className="mt-3 text-xl font-bold text-slate-800 dark:text-slate-100">
                {agent.name}
              </h2>
              <div className="flex items-center gap-1.5 mt-2 bg-slate-100 dark:bg-slate-800/60 px-2 py-1 rounded-full">
                {renderStatusIcon(agent.status)}
                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 uppercase">{agent.status}</span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[10px] capitalize text-slate-500 dark:text-slate-400 font-mono">{agent.category}</span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[10px] capitalize text-slate-500 dark:text-slate-400">{agent.provider}</span>
              </div>
            </div>

            {/* 描述卡片 */}
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3.5 mb-5 border border-slate-100 dark:border-slate-800/60">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {agent.description}
              </p>
            </div>

            {/* 能力标签 */}
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 bg-lark-primary dark:bg-violet-500 rounded-full" />
                能力标签
              </h4>
              <div className="flex flex-wrap gap-2">
                {(agent.tags || []).map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-lark-primary-light dark:bg-violet-950/40 text-lark-primary dark:text-violet-300 text-[10px] font-semibold rounded-full border border-lark-primary/10 dark:border-violet-900/30"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* 模型配置 */}
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-350 mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 bg-indigo-500 rounded-full" />
                运行框架 & 模型配置
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs shadow-sm bg-slate-50/20 dark:bg-slate-950/20">
                <div className="grid grid-cols-2 border-b border-slate-200/50 dark:border-slate-800/50 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">执行模式 (Runtime)</span>
                  <span className="text-slate-700 dark:text-slate-200 font-mono text-right font-bold uppercase">{agent.runtime || 'native'}</span>
                </div>
                {agent.modelConfigId ? (() => {
                  const cfg = useAgentHubStore.getState().modelConfigs.find(c => c.id === agent.modelConfigId);
                  return (
                    <>
                      <div className="grid grid-cols-2 border-b border-slate-200/50 dark:border-slate-800/50 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">绑定模型配置</span>
                        <span className="text-slate-700 dark:text-slate-200 font-mono text-right font-semibold">{cfg ? cfg.name : '未知配置'}</span>
                      </div>
                      {cfg && (
                        <>
                          <div className="grid grid-cols-2 border-b border-slate-200/50 dark:border-slate-800/50 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">服务商 / 协议</span>
                            <span className="text-slate-700 dark:text-slate-200 font-mono text-right truncate font-medium">{cfg.provider} / {cfg.protocol}</span>
                          </div>
                          <div className="grid grid-cols-2 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">底座模型</span>
                            <span className="text-slate-700 dark:text-slate-200 font-mono text-right truncate font-semibold">{cfg.modelName}</span>
                          </div>
                        </>
                      )}
                    </>
                  );
                })() : (() => {
                  const config = agent.modelConfig || { provider: 'custom', modelName: 'gpt-4o', temperature: 0.7, maxTokens: 4096 };
                  return (
                    <>
                      <div className="grid grid-cols-2 border-b border-slate-200/50 dark:border-slate-800/50 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">供应商</span>
                        <span className="text-slate-700 dark:text-slate-200 font-mono text-right font-semibold">{config.provider}</span>
                      </div>
                      <div className="grid grid-cols-2 border-b border-slate-200/50 dark:border-slate-800/50 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">模型名称</span>
                        <span className="text-slate-700 dark:text-slate-200 font-mono text-right truncate font-semibold" title={config.modelName}>{config.modelName}</span>
                      </div>
                      <div className="grid grid-cols-2 border-b border-slate-200/50 dark:border-slate-800/50 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Temperature</span>
                        <span className="text-slate-700 dark:text-slate-200 text-right font-semibold">{(config.temperature ?? 0.7).toFixed(1)}</span>
                      </div>
                      <div className="grid grid-cols-2 p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">最大 Tokens</span>
                        <span className="text-slate-700 dark:text-slate-200 text-right font-semibold">{config.maxTokens ?? 4096}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>


            {/* 底部操作按钮 */}
            <div className="flex items-stretch gap-3 pt-2">
              <button
                onClick={handleGoChat}
                className="w-full flex items-center justify-center gap-1.5 py-3 bg-lark-primary text-white rounded-xl hover:bg-lark-primary-hover transition-all shadow-sm active:scale-[0.985] font-semibold text-sm"
              >
                <MessageSquarePlus className="w-4 h-4" />
                发消息
              </button>
            </div>
          </div>
        ) : (
          /* ========== 编辑模式 - 完整设置界面 ========== */
          <div className="px-6 py-5 space-y-4 max-h-[580px] overflow-y-auto">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Agent 名称</label>
              <input
                type="text"
                value={editForm.name || ''}
                onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lark-primary/15 dark:focus:ring-violet-500/20 transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">头像 URL</label>
              <input
                type="text"
                value={editForm.avatar || ''}
                onChange={(e) => setEditForm(p => ({ ...p, avatar: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lark-primary/15 dark:focus:ring-violet-500/20 transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">能力描述</label>
              <textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lark-primary/15 dark:focus:ring-violet-500/20 transition-all resize-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">系统提示词</label>
              <textarea
                value={editForm.systemPrompt || ''}
                onChange={(e) => setEditForm(p => ({ ...p, systemPrompt: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lark-primary/15 dark:focus:ring-violet-500/20 transition-all resize-none font-mono"
              />
            </div>

            {/* 高级设置折叠面板 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all"
              >
                <div className="flex items-center gap-2">
                  <SettingsIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">模型配置 & 工具</span>
                </div>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showAdvanced && (
                <div className="p-4 space-y-4 bg-white dark:bg-slate-950">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Temperature</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={editForm.modelConfig?.temperature ?? 0.7}
                        onChange={(e) => setEditForm(p => ({ ...p, modelConfig: { ...p.modelConfig!, temperature: parseFloat(e.target.value) || 0 } }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lark-primary/15 dark:focus:ring-violet-500/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">MaxTokens</label>
                      <input
                        type="number"
                        step="1024"
                        min="512"
                        value={editForm.modelConfig?.maxTokens ?? 4096}
                        onChange={(e) => setEditForm(p => ({ ...p, modelConfig: { ...p.modelConfig!, maxTokens: parseInt(e.target.value) || 4096 } }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lark-primary/15 dark:focus:ring-violet-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* 可用工具开关 */}
                  {editForm.tools && editForm.tools.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Wrench className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">可用工具开关</span>
                      </div>
                      <div className="space-y-2">
                        {editForm.tools.map((tool) => (
                          <div
                            key={tool.id}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/50"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{tool.name}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{tool.description}</p>
                            </div>
                            <button
                              onClick={() => toggleTool(tool.id)}
                              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${tool.enabled
                                  ? 'bg-lark-primary'
                                  : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${tool.enabled ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <ConfirmModal
          open={showDeleteConfirm}
          title="确认删除智能体吗？"
          content={`确定要删除智能体 "${agent.name}" 吗？该操作将从系统联系人中永久移除，且不可恢复。`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={handleDelete}
          onClose={() => setShowDeleteConfirm(false)}
        />
      </div>
    </div>
  );
};

export default AgentProfileCard;
