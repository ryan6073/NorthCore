import React, { useState } from 'react';
import { Agent } from '@/types';
import { Edit2, ArrowLeft, Circle, CircleDot, CircleDotDashed, Trash2 } from 'lucide-react';
import AgentConfigForm from './AgentConfigForm';
import ConfirmModal from '../modal/ConfirmModal';

interface AgentDetailPanelProps {
  agent: Agent;
  onSave: (updated: Agent) => void;
  onBack: () => void;
  isNew?: boolean;
  onDelete?: (id: string) => void;
}

const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({ agent, onSave, onBack, isNew = false, onDelete }) => {
  const [isEditing, setIsEditing] = useState(isNew);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const renderStatusIcon = () => {
    if (agent.status === 'online') {
      return <CircleDot className="w-4 h-4 text-green-500 fill-green-500" />;
    }
    if (agent.status === 'offline') {
      return <Circle className="w-4 h-4 text-slate-400" />;
    }
    return <CircleDotDashed className="w-4 h-4 text-yellow-500" />;
  };

  if (isEditing) {
    return <AgentConfigForm agent={agent} onSave={(updated) => { onSave(updated); setIsEditing(false); }} onClose={() => { if (isNew) { onBack(); } else { setIsEditing(false); } }} />;
  }

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden text-lark-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-lark-border bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={onBack} 
            className="p-1 rounded-lg hover:bg-lark-bg-hover text-lark-text-secondary hover:text-lark-text-primary transition-all active:scale-95"
            title="返回列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold text-lark-text-primary">
            {isNew ? '新建智能体' : 'Agent 详情'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all active:scale-95 border border-lark-border bg-white shadow-sm"
              title="删除 Agent"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button 
            onClick={() => setIsEditing(true)} 
            className="p-1.5 rounded-lg hover:bg-lark-bg-hover text-lark-text-secondary hover:text-lark-primary transition-all active:scale-95 border border-lark-border bg-white shadow-sm"
            title="编辑配置"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Profile */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
        <div className="flex items-start gap-4 pb-4 border-b border-lark-border/50">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-lark-border shadow-sm flex-shrink-0 bg-slate-50">
            <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-base font-semibold text-lark-text-primary">{agent.name}</h2>
              <div className="flex items-center gap-1.5 bg-slate-100 px-1.5 py-0.5 rounded">
                {renderStatusIcon()}
                <span className="text-[10px] text-lark-text-secondary font-medium uppercase">{agent.status}</span>
              </div>
            </div>
            <p className="text-xs text-lark-text-secondary leading-relaxed">{agent.description}</p>
          </div>
        </div>

        {/* Tags */}
        <div>
          <h4 className="text-xs font-semibold text-lark-text-primary mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 bg-lark-primary rounded-full" />
            能力标签
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {agent.tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-lark-primary-light text-lark-primary font-medium border border-lark-primary/10">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Model Config */}
        <div>
          <h4 className="text-xs font-semibold text-lark-text-primary mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3 bg-indigo-500 rounded-full" />
            模型配置
          </h4>
          <div className="border border-lark-border rounded-xl overflow-hidden text-xs shadow-sm bg-slate-50/20">
            <div className="grid grid-cols-2 border-b border-lark-border/50 p-2.5 hover:bg-slate-50/50">
              <span className="text-lark-text-secondary font-medium">供应商</span>
              <span className="text-lark-text-primary font-mono text-right font-semibold">{agent.modelConfig.provider}</span>
            </div>
            <div className="grid grid-cols-2 border-b border-lark-border/50 p-2.5 hover:bg-slate-50/50">
              <span className="text-lark-text-secondary font-medium">模型名称</span>
              <span className="text-lark-text-primary font-mono text-right truncate font-semibold" title={agent.modelConfig.modelName}>{agent.modelConfig.modelName}</span>
            </div>
            <div className="grid grid-cols-2 border-b border-lark-border/50 p-2.5 hover:bg-slate-50/50">
              <span className="text-lark-text-secondary font-medium">Temperature</span>
              <span className="text-lark-text-primary text-right font-semibold">{agent.modelConfig.temperature.toFixed(1)}</span>
            </div>
            <div className="grid grid-cols-2 p-2.5 hover:bg-slate-50/50">
              <span className="text-lark-text-secondary font-medium">最大 Tokens</span>
              <span className="text-lark-text-primary text-right font-semibold">{agent.modelConfig.maxTokens}</span>
            </div>
          </div>
        </div>

        {/* Tools */}
        {agent.tools.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-lark-text-primary mb-2.5 flex items-center gap-1.5">
              <span className="w-1 h-3 bg-green-500 rounded-full" />
              可用工具
            </h4>
            <div className="space-y-1.5">
              {agent.tools.filter(t => t.enabled).map(tool => (
                <div key={tool.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-lark-border/30 hover:border-lark-border/80 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-lark-text-primary block">{tool.name}</span>
                    <span className="text-[10px] text-lark-text-secondary leading-relaxed block mt-0.5">{tool.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
