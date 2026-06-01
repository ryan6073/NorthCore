import React, { useState } from 'react';
import { Agent } from '@/types';
import { Edit2, ArrowLeft, Trash2, Cpu, Wrench, ShieldAlert, Sparkles, CheckCircle2, Key, Globe, Eye } from 'lucide-react';
import AgentConfigForm from './AgentConfigForm';
import ConfirmModal from '../modal/ConfirmModal';

interface AgentDetailPanelProps {
  agent: Agent;
  globalAgent?: Agent;
  onSave: (updated: Agent) => void;
  onBack: () => void;
  isNew?: boolean;
  onDelete?: (id: string) => void;
  isSessionLevel?: boolean;
  onSyncToGlobal?: (updated: Agent) => void;
}

const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({ agent, globalAgent, onSave, onBack, isNew = false, onDelete, isSessionLevel = false, onSyncToGlobal }) => {
  const [isEditing, setIsEditing] = useState(isNew);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getStatusBadge = () => {
    const baseClass = "px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase flex items-center gap-1.5 border";
    switch (agent.status) {
      case 'online':
        return (
          <span className={`${baseClass} bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-250/20`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        );
      case 'thinking':
        return (
          <span className={`${baseClass} bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-250/20`}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Thinking
          </span>
        );
      case 'offline':
      default:
        return (
          <span className={`${baseClass} bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent`}>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Offline
          </span>
        );
    }
  };

  if (isEditing) {
    return (
      <AgentConfigForm
        agent={agent}
        globalAgent={globalAgent}
        isSessionLevel={isSessionLevel}
        onSyncToGlobal={onSyncToGlobal}
        onSave={(updated) => {
          onSave(updated);
          setIsEditing(false);
        }}
        onClose={() => {
          if (isNew) {
            onBack();
          } else {
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="h-full w-full bg-slate-50/50 dark:bg-slate-950 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 font-sans transition-colors">

      {/* Header bar with controls */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-900 flex-shrink-0 transition-colors shadow-sm z-10 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200/40 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all active:scale-95 flex-shrink-0"
            title="返回上一级"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {isSessionLevel ? '智能体会话专属配置' : '智能体详情面板'}
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-0.5 truncate">
              {isSessionLevel ? '修改此配置仅在当前聊天会话中生效，不会影响全局默认配置。' : '查看基本信息、模型配置、工具集以及授权的安全权限。'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isNew && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-955/20 text-slate-400 hover:text-red-500 dark:hover:text-red-400 border border-slate-200/45 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all active:scale-95"
              title="注销此智能体"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsEditing(true)}
            className="px-3.5 py-2 bg-violet-600 hover:bg-violet-550 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-violet-600/10 active:scale-95"
            title="重新配置参数"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>编辑配置</span>
          </button>
        </div>
      </div>

      {/* Main Details View Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Profile Card Banner */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-250/50 dark:border-slate-850 p-4 sm:p-6 shadow-sm relative overflow-hidden flex flex-col lg:flex-row gap-5 items-start lg:items-center">
          {/* Subtle design gradient dot background */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md bg-slate-50 dark:bg-slate-950 flex-shrink-0 relative">
            <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
          </div>

          <div className="flex-grow space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{agent.name}</h2>
              {getStatusBadge()}
              {isSessionLevel && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm animate-fade-in">
                  会话专属配置
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-850 text-slate-500 rounded font-mono font-semibold uppercase">{agent.category}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium max-w-2xl">{agent.description}</p>
          </div>
        </div>

        {/* Core details layout grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Column 1: Model Config Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-850 p-4 sm:p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-650 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-2">
              <Cpu className="w-4 h-4 text-violet-500" />
              <span>底层模型底座配置</span>
            </h4>

            {(() => {
              const config = agent.modelConfig || { provider: 'custom', modelName: 'gpt-4o', temperature: 0.7, maxTokens: 4096 };
              return (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-950/60 transition-colors">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      供应商 (Provider)
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono font-bold capitalize">{config.provider}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-950/60 transition-colors">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      模型名 (Model Name)
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono font-bold">{config.modelName}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-950/60 transition-colors">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                      Temperature (多样性)
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono font-bold">{config.temperature.toFixed(1)}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-950/60 transition-colors">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      回答上限 (Max Tokens)
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono font-bold">{config.maxTokens}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Column 2: Security & Permissions Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-850 p-4 sm:p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-650 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-2">
              <ShieldAlert className="w-4 h-4 text-violet-500" />
              <span>系统运行安全控制权限</span>
            </h4>

            <div className="space-y-2">
              {[
                { key: 'canReadFiles', label: '读取本地文件与代码' },
                { key: 'canWriteFiles', label: '写入与修改文件系统' },
                { key: 'canRunCommands', label: '运行终端 Shell 命令行' },
                { key: 'canGenerateArtifacts', label: '生成独立前端 Web 产物' },
                { key: 'canDeploy', label: '直接进行项目上线与部署' }
              ].map(p => {
                const hasPerm = !!agent.permissions?.[p.key as keyof typeof agent.permissions];
                return (
                  <div key={p.key} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-950/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <span className="text-xs text-slate-600 dark:text-slate-350 font-medium">{p.label}</span>
                    <div className="flex items-center gap-1">
                      {hasPerm ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-450 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          已授权
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                          禁用
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Tools Config Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-850 p-4 sm:p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-650 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-2">
            <Wrench className="w-4 h-4 text-violet-500" />
            <span>智能体绑定工具箱集</span>
          </h4>

          {!agent.tools || agent.tools.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">当前智能体未绑定任何工具箱</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {agent.tools.map(tool => (
                <div key={tool.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-950/20 hover:border-slate-200 dark:hover:border-slate-750 transition-all">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${tool.enabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                    }`}>
                    {tool.enabled ? <CheckCircle2 className="w-4 h-4" /> : <Wrench className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">{tool.name}</span>
                    <span className="text-[10px] text-slate-450 dark:text-slate-500 leading-relaxed block mt-0.5">{tool.description}</span>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ml-auto flex-shrink-0 font-bold ${tool.enabled
                      ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-450'
                    }`}>
                    {tool.enabled ? '启用中' : '未开启'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="确认删除智能体吗？"
        content={`确定要删除智能体 "${agent.name}" 吗？该操作将从系统联系人中永久移除，且不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        type="danger"
        onConfirm={() => onDelete?.(agent.id)}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default AgentDetailPanel;
