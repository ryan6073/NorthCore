import React, { useState, useEffect } from 'react';
import { Agent } from '@/types';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { Save, Settings2, ShieldCheck, CheckSquare, Square } from 'lucide-react';

interface AgentMiniConfigPanelProps {
  agent: Agent;
}

export const AgentMiniConfigPanel: React.FC<AgentMiniConfigPanelProps> = ({ agent }) => {
  const saveAgent = useAgentHubStore(state => state.saveAgent);
  const currentUser = useAgentHubStore(state => state.currentUser);
  const useMockMode = useAgentHubStore(state => state.useMockMode);

  const isEditable = useMockMode || (
    currentUser && (
      agent.ownerUserId === currentUser.id ||
      agent.owner_user_id === currentUser.id
    )
  );
  
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [isPromptSaved, setIsPromptSaved] = useState(true);
  const [loading, setLoading] = useState(false);

  // Keep state sync with agent prop changes (e.g. conversation switches)
  useEffect(() => {
    setSystemPrompt(agent.systemPrompt);
    setIsPromptSaved(true);
  }, [agent.id, agent.systemPrompt]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isEditable) return;
    setSystemPrompt(e.target.value);
    setIsPromptSaved(false);
  };

  const handleSavePrompt = async () => {
    if (!isEditable) return;
    setLoading(true);
    const updatedAgent: Agent = {
      ...agent,
      systemPrompt: systemPrompt
    };
    await saveAgent(updatedAgent);
    setIsPromptSaved(true);
    setLoading(false);
  };

  const toggleTool = async (toolId: string) => {
    if (!isEditable) return;
    const updatedAgent: Agent = {
      ...agent,
      tools: agent.tools.map(tool => 
        tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool
      )
    };
    await saveAgent(updatedAgent);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white dark:bg-slate-900 font-sans">
      {/* Header */}
      <div className="p-4 pb-2 flex-shrink-0 border-b border-lark-border/40 dark:border-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-violet-500" />
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">智能体配置</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
            <img src={agent.avatar} alt="" className="w-full h-full object-cover" />
          </div>
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-350">{agent.name}</span>
        </div>
      </div>

      {/* Content Form */}
      <div className="flex-grow overflow-y-auto p-4 space-y-5 min-h-0">
        
        {/* System Prompt section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">System Prompt</label>
              {!isEditable && (
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-medium">系统预置</span>
              )}
            </div>
            {!isPromptSaved && isEditable && (
              <button
                type="button"
                onClick={handleSavePrompt}
                disabled={loading}
                className="text-[10px] px-2 py-0.5 bg-violet-600 hover:bg-violet-550 text-white rounded font-medium flex items-center gap-1 shadow-sm transition-all active:scale-95"
              >
                <Save className="w-2.5 h-2.5" />
                <span>保存</span>
              </button>
            )}
          </div>
          <textarea
            value={systemPrompt}
            onChange={handlePromptChange}
            disabled={!isEditable}
            rows={4}
            className={`w-full border rounded-lg p-2.5 text-xs font-mono leading-relaxed resize-none outline-none transition-all ${
              isEditable
                ? 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20'
                : 'bg-slate-100/50 dark:bg-slate-950/40 border-slate-100 dark:border-slate-850 text-slate-500 dark:text-slate-400 cursor-not-allowed'
            }`}
            placeholder={isEditable ? "设定智能体的系统提示词，以改变其行为和回复偏好..." : "系统预置智能体的提示词不可更改。"}
          />
        </div>

        {/* Tools Section */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>可用工具集</span>
          </label>
          <div className="space-y-1.5">
            {!agent.tools || agent.tools.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-550 italic text-center py-2">无可用工具</p>
            ) : (
              (agent.tools || []).map((tool) => (
                <div 
                  key={tool.id}
                  onClick={() => isEditable && toggleTool(tool.id)}
                  className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all duration-150 ${
                    tool.enabled 
                      ? 'border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10'
                      : 'border-lark-border dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  } ${isEditable ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}`}
                >
                  <button 
                    type="button" 
                    disabled={!isEditable}
                    className={`flex-shrink-0 mt-0.5 text-slate-400 ${isEditable ? 'hover:text-slate-600 dark:hover:text-slate-300' : 'cursor-not-allowed'}`}
                  >
                    {tool.enabled ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 dark:text-slate-700" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <span className={`text-xs font-semibold block ${tool.enabled ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-450'}`}>
                      {tool.name}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-0.5">
                      {tool.description}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

