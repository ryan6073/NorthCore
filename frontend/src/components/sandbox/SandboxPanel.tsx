import React, { useState, useEffect, useRef } from 'react';
import { useAgentHubStore } from '../../store/useAgentHubStore';
import { 
  CheckCircle2, AlertTriangle, Loader2, Terminal, 
  FileText, GitMerge, ArrowLeft, Ban, ShieldAlert,
  ChevronRight, FileCode, Check, Edit2, Undo
} from 'lucide-react';
import { AgentRunStep, SandboxFile, SandboxConflict } from '../../types';

export const SandboxPanel: React.FC = () => {
  const {
    activeRun,
    runFiles,
    runConflicts,
    selectedSandboxFilePath,
    loadSandboxFiles,
    loadSandboxFileContent,
    loadSandboxConflicts,
    resolveSandboxConflict,
    cancelSandboxRun,
    setSelectedSandboxFilePath
  } = useAgentHubStore();

  const [activeTab, setActiveTab] = useState<'workflow' | 'files' | 'conflicts'>('workflow');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  
  // Conflict editing state
  const [editingConflict, setEditingConflict] = useState<SandboxConflict | null>(null);
  const [manualContent, setManualContent] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);

  // File viewing state
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Refresh data periodically if running
  useEffect(() => {
    if (!activeRun) return;

    // Load initial files & conflicts
    loadSandboxFiles(activeRun.id);
    loadSandboxConflicts(activeRun.id);

    // Auto-select step 2 if running, step 1 is completed
    if (activeRun.steps && activeRun.steps.length > 0) {
      const runningStep = activeRun.steps.find((s: AgentRunStep) => s.status === 'running');
      const failedStep = activeRun.steps.find((s: AgentRunStep) => s.status === 'failed' || s.status === 'conflict');
      if (runningStep) {
        setSelectedStepId(runningStep.id);
      } else if (failedStep) {
        setSelectedStepId(failedStep.id);
      } else if (!selectedStepId) {
        setSelectedStepId(activeRun.steps[0].id);
      }
    }
  }, [activeRun?.id]);

  // Handle auto-scroll for terminal log updates
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeRun?.steps, selectedStepId]);

  // Load file content when selected file path changes
  useEffect(() => {
    if (!activeRun || !selectedSandboxFilePath) {
      setSelectedFileContent('');
      return;
    }
    
    const fetchContent = async () => {
      setIsFileLoading(true);
      try {
        const content = await loadSandboxFileContent(activeRun.id, selectedSandboxFilePath);
        setSelectedFileContent(content || '');
      } catch (err) {
        console.error('Failed to load file content:', err);
      } finally {
        setIsFileLoading(false);
      }
    };
    fetchContent();
  }, [selectedSandboxFilePath, activeRun?.id]);

  if (!activeRun) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 space-y-4">
        <ShieldAlert className="w-12 h-12 text-slate-500 animate-pulse" />
        <p className="text-center font-medium">当前无正在执行的沙箱任务</p>
        <p className="text-xs text-slate-500 text-center max-w-[240px]">
          在聊天界面点击 “沙箱执行” 按钮即可开启安全隔离的 Docker 运行沙箱。
        </p>
      </div>
    );
  }

  // Get status color / badge style
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            运行中
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            已完成
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            失败
          </span>
        );
      case 'conflict':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <GitMerge className="w-3.5 h-3.5 mr-1" />
            检测到冲突
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <Ban className="w-3.5 h-3.5 mr-1" />
            已取消
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-600/10 text-slate-400 border border-slate-600/20">
            等待中
          </span>
        );
    }
  };

  const selectedStep = activeRun.steps?.find((s: AgentRunStep) => s.id === selectedStepId);
  const openConflictsCount = runConflicts?.filter(c => c.status === 'open').length || 0;

  const handleResolve = async (resolution: 'current' | 'incoming' | 'manual') => {
    if (!editingConflict) return;
    setIsResolving(true);
    try {
      await resolveSandboxConflict(
        activeRun.id, 
        editingConflict.id, 
        resolution, 
        resolution === 'manual' ? manualContent : undefined
      );
      setEditingConflict(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsResolving(false);
    }
  };

  const handleStartManualEdit = (conflict: SandboxConflict) => {
    setEditingConflict(conflict);
    setManualContent(conflict.incomingContent || '');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-200 overflow-hidden font-sans">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur-md">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">Docker Sandbox V1</span>
              {getStatusBadge(activeRun.status)}
            </div>
            <h3 className="text-sm font-semibold mt-2 line-clamp-1 text-slate-100" title={activeRun.prompt}>
              任务: {activeRun.prompt}
            </h3>
            {activeRun.error && (
              <p className="text-xs text-rose-400 mt-1 line-clamp-2 bg-rose-500/5 p-1.5 rounded border border-rose-500/10">
                错误: {activeRun.error}
              </p>
            )}
          </div>
          {(activeRun.status === 'running' || activeRun.status === 'pending' || activeRun.status === 'conflict') && (
            <button
              onClick={() => cancelSandboxRun(activeRun.id)}
              className="text-xs flex items-center space-x-1 px-2.5 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all font-medium"
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              终止
            </button>
          )}
        </div>

        {/* Local Navigation Tabs */}
        <div className="flex space-x-1 mt-4 p-0.5 bg-slate-900/80 rounded-lg border border-slate-800/80">
          <button
            onClick={() => setActiveTab('workflow')}
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'workflow'
                ? 'bg-slate-800 text-indigo-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 mr-1" />
            步骤 & 日志
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'files'
                ? 'bg-slate-800 text-indigo-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 mr-1" />
            生成文件
            {runFiles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300 text-[10px]">
                {runFiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all relative ${
              activeTab === 'conflicts'
                ? 'bg-slate-800 text-indigo-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5 mr-1" />
            冲突合并
            {openConflictsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] animate-pulse">
                {openConflictsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900/40">
        
        {/* Tab 1: Workflow & Logs */}
        {activeTab === 'workflow' && (
          <div className="flex flex-col h-full">
            {/* Step DAG Progress Grid */}
            <div className="p-4 border-b border-slate-800/60 bg-slate-950/20">
              <div className="text-[11px] uppercase text-slate-500 font-bold tracking-wider mb-2">沙箱执行流程 (DAG)</div>
              <div className="space-y-2">
                {activeRun.steps?.map((step: AgentRunStep, idx: number) => {
                  const isSelected = step.id === selectedStepId;
                  let statusColor = 'text-slate-500 bg-slate-800/30';
                  let icon = <div className="w-2 h-2 rounded-full bg-slate-600" />;
                  
                  if (step.status === 'completed') {
                    statusColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
                    icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
                  } else if (step.status === 'running') {
                    statusColor = 'text-blue-400 border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/20';
                    icon = <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
                  } else if (step.status === 'failed') {
                    statusColor = 'text-rose-400 border-rose-500/30 bg-rose-500/5';
                    icon = <AlertTriangle className="w-4 h-4 text-rose-400" />;
                  } else if (step.status === 'conflict') {
                    statusColor = 'text-amber-400 border-amber-500/30 bg-amber-500/5';
                    icon = <GitMerge className="w-4 h-4 text-amber-400" />;
                  } else if (step.status === 'blocked') {
                    statusColor = 'text-slate-500 border-slate-800 bg-slate-900/20 opacity-60';
                    icon = <Ban className="w-4 h-4 text-slate-500" />;
                  }

                  return (
                    <div
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`flex items-start space-x-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-200' 
                          : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <div className="mt-0.5">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-200">
                            {idx + 1}. {step.agentName}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${statusColor}`}>
                            {step.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Terminal logs for selected step */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-850 bg-slate-900/40">
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>step-log: {selectedStep ? `${selectedStep.agentName}` : 'none'}</span>
                </div>
                {selectedStep?.status === 'running' && (
                  <span className="flex items-center text-[10px] text-blue-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping mr-1.5" />
                    流式日志输出中
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300 space-y-1 select-text selection:bg-indigo-500/30">
                {selectedStep?.log ? (
                  selectedStep.log.split('\n').map((line: string, i: number) => (
                    <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-600 italic">没有获取到当前步骤的日志记录</div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Generated Files */}
        {activeTab === 'files' && (
          <div className="flex flex-col h-full min-h-0">
            {selectedSandboxFilePath ? (
              <div className="flex flex-col h-full min-h-0 bg-slate-950">
                {/* File preview header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/60">
                  <button
                    onClick={() => setSelectedSandboxFilePath(null)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>返回文件列表</span>
                  </button>
                  <span className="text-xs font-mono text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded">
                    {selectedSandboxFilePath}
                  </span>
                </div>
                
                {/* File content preview */}
                <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300">
                  {isFileLoading ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-2 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                      <span>正在读取文件内容...</span>
                    </div>
                  ) : selectedFileContent ? (
                    <pre className="whitespace-pre-wrap break-all">{selectedFileContent}</pre>
                  ) : (
                    <div className="text-slate-600 italic">此文件内容为空</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <div className="text-[11px] uppercase text-slate-500 font-bold tracking-wider mb-2">沙箱环境生成的文件</div>
                {runFiles.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    当前尚未生成任何文件
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {runFiles.map((file: SandboxFile) => (
                      <div
                        key={file.id}
                        onClick={() => setSelectedSandboxFilePath(file.path)}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <FileCode className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-300 transition-colors">
                              {file.path}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              版本: V{file.currentVersion} • Hash: {file.contentHash.substring(0, 8)}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Conflicts Panel */}
        {activeTab === 'conflicts' && (
          <div className="flex flex-col h-full min-h-0">
            {editingConflict ? (
              <div className="flex flex-col h-full min-h-0 bg-slate-950">
                {/* Conflict editing header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/60">
                  <button
                    onClick={() => setEditingConflict(null)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>返回冲突列表</span>
                  </button>
                  <span className="text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                    冲突处理: {editingConflict.filePath}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Side by side view */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/20">
                      <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 text-[11px] font-bold text-slate-400 flex items-center justify-between">
                        <span>当前工作区版本 (V{editingConflict.baseVersion})</span>
                        <button
                          onClick={() => handleResolve('current')}
                          disabled={isResolving}
                          className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                        >
                          使用当前
                        </button>
                      </div>
                      <pre className="p-3 text-[10px] font-mono text-slate-500 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {/* We don't have base file content in the conflict object direct field in mock, we can show placeholder or incoming */}
                        [当前文件内容]
                      </pre>
                    </div>

                    <div className="border border-amber-500/20 rounded-lg overflow-hidden bg-amber-500/5">
                      <div className="bg-amber-500/10 px-3 py-1.5 border-b border-amber-500/20 text-[11px] font-bold text-amber-400 flex items-center justify-between">
                        <span>沙箱生成传入版本</span>
                        <button
                          onClick={() => handleResolve('incoming')}
                          disabled={isResolving}
                          className="px-2 py-0.5 text-[10px] bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 rounded border border-amber-500/40"
                        >
                          采用传入
                        </button>
                      </div>
                      <pre className="p-3 text-[10px] font-mono text-amber-200/90 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {editingConflict.incomingContent}
                      </pre>
                    </div>
                  </div>

                  {/* Manual editing area */}
                  <div className="flex flex-col border border-slate-800 rounded-lg bg-slate-900/30">
                    <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-300 flex items-center">
                        <Edit2 className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
                        手动解决冲突 (编辑最终合并内容)
                      </span>
                      <button
                        onClick={() => setManualContent(editingConflict.incomingContent || '')}
                        className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center"
                      >
                        <Undo className="w-3 h-3 mr-0.5" />
                        重置为传入内容
                      </button>
                    </div>
                    <textarea
                      value={manualContent}
                      onChange={(e) => setManualContent(e.target.value)}
                      className="w-full h-44 p-3 bg-slate-950 text-slate-200 text-xs font-mono border-0 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none rounded-b-lg"
                      placeholder="请在此输入解决冲突后的完整内容..."
                    />
                  </div>

                  <button
                    onClick={() => handleResolve('manual')}
                    disabled={isResolving || !manualContent.trim()}
                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/40 disabled:text-slate-500 text-xs font-bold text-white transition-all shadow-md flex items-center justify-center space-x-1.5"
                  >
                    {isResolving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>提交手动合并内容</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <div className="text-[11px] uppercase text-slate-500 font-bold tracking-wider mb-2">待解决的冲突文件 ({openConflictsCount})</div>
                {runConflicts.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    当前没有冲突文件，一切正常
                  </div>
                ) : (
                  <div className="space-y-2">
                    {runConflicts.map((conflict: SandboxConflict) => (
                      <div
                        key={conflict.id}
                        className={`flex flex-col p-3 rounded-lg border transition-all ${
                          conflict.status === 'resolved'
                            ? 'border-slate-800 bg-slate-900/20 opacity-60'
                            : 'border-amber-500/20 bg-amber-500/5'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <GitMerge className={`w-4 h-4 flex-shrink-0 ${conflict.status === 'resolved' ? 'text-slate-500' : 'text-amber-400'}`} />
                            <div className="min-w-0">
                              <p className={`text-xs font-bold truncate ${conflict.status === 'resolved' ? 'text-slate-400' : 'text-slate-200'}`}>
                                {conflict.filePath}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                冲突版本: V{conflict.currentVersion} • 创建步骤ID: {conflict.createdByStepId || '未知'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            conflict.status === 'resolved'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {conflict.status === 'resolved' ? '已解决' : '未解决'}
                          </span>
                        </div>

                        {conflict.status !== 'resolved' && (
                          <div className="mt-3 flex space-x-2">
                            <button
                              onClick={() => {
                                setEditingConflict(conflict);
                                handleResolve('current');
                              }}
                              className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-slate-300 transition-colors"
                            >
                              保留当前
                            </button>
                            <button
                              onClick={() => {
                                setEditingConflict(conflict);
                                handleResolve('incoming');
                              }}
                              className="flex-1 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-[10px] font-bold text-amber-300 transition-colors"
                            >
                              采用传入
                            </button>
                            <button
                              onClick={() => handleStartManualEdit(conflict)}
                              className="flex-1 py-1 rounded bg-indigo-600/35 hover:bg-indigo-600/50 border border-indigo-500/35 text-[10px] font-bold text-indigo-300 transition-colors"
                            >
                              手动编辑
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
