import React, { useState, useEffect, useRef } from 'react';
import { useAgentHubStore } from '../../store/useAgentHubStore';
import {
  CheckCircle2, AlertTriangle, Loader2, Terminal,
  FileText, GitMerge, ArrowLeft, Ban, ShieldAlert,
  ChevronRight, FileCode, Check, Edit2, Undo, Globe,
  Sparkles, Network, RotateCw, Clock
} from 'lucide-react';
import { AgentRunStep, SandboxFile, SandboxConflict } from '../../types';
import { DeploymentView } from './DeploymentView';

interface SandboxPanelProps {
  customConversationId?: string;
}

export const SandboxPanel: React.FC<SandboxPanelProps> = ({ customConversationId }) => {
  const {
    activeConversationId: storeActiveId,
    getActiveRunId,
    getActiveRun,
    runFilesByRunId,
    runConflictsByRunId,
    selectedSandboxFilePathByRunId,
    runFileContentsByRunId,
    loadSandboxFiles,
    loadSandboxFileContent,
    loadSandboxConflicts,
    resolveSandboxConflict,
    cancelSandboxRun,
    rollbackSandboxRun,
    retrySandboxRun,
    runRetryProgress,
    setSelectedSandboxFilePath,
    getSelectedSandboxFilePath,
    conversations,
    planningPhaseByRunId,
    sandboxDebugLogs,
    clearSandboxDebugLogs,
  } = useAgentHubStore();

  const activeConversationId = customConversationId || storeActiveId;

  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const activeRunId = getActiveRunId(activeConversationId);
  const activeRun = getActiveRun(activeConversationId);
  const runFiles = activeRunId ? (runFilesByRunId[activeRunId] || []) : [];
  const runConflicts = activeRunId ? (runConflictsByRunId[activeRunId] || []) : [];
  const selectedSandboxFilePath = getSelectedSandboxFilePath(activeRunId);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const workspaceId = activeRun?.workspaceId || activeConversation?.workspaceId;

  const [activeTab, setActiveTab] = useState<'workflow' | 'files' | 'conflicts' | 'deployment' | 'debug'>('workflow');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const [editingConflict, setEditingConflict] = useState<SandboxConflict | null>(null);
  const [manualContent, setManualContent] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);

  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [isFileLoading, setIsFileLoading] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeRunId || !activeRun) return;

    loadSandboxFiles(activeRunId);
    loadSandboxConflicts(activeRunId);

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
  }, [activeRunId, activeRun?.id]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeRun?.steps, selectedStepId]);

  useEffect(() => {
    if (!activeRunId || !selectedSandboxFilePath) {
      setSelectedFileContent('');
      return;
    }

    const fetchContent = async () => {
      setIsFileLoading(true);
      try {
        const content = await loadSandboxFileContent(activeRunId, selectedSandboxFilePath);
        setSelectedFileContent(content || '');
      } catch (err) {
        console.error('Failed to load file content:', err);
      } finally {
        setIsFileLoading(false);
      }
    };
    fetchContent();
  }, [selectedSandboxFilePath, activeRunId]);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5 mr-1" />
            排队中
          </span>
        );
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
    if (!editingConflict || !activeRunId) return;
    setIsResolving(true);
    try {
      await resolveSandboxConflict(
        activeRunId,
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

  const handleRollback = async () => {
    if (!activeRunId) return;
    setIsRollingBack(true);
    try {
      await rollbackSandboxRun(activeRunId);
    } catch (e) {
      alert('撤销更改失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleRetry = async () => {
    if (!activeRunId) return;
    setIsRetrying(true);
    try {
      await retrySandboxRun(activeRunId);
    } catch (e) {
      alert('重试沙箱运行失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-200 overflow-hidden font-sans">
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur-md">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">Docker Sandbox V1</span>
              {activeRun.runMode && (
                <span className="text-[10px] font-semibold text-slate-350 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                  {activeRun.runMode === 'write' ? '写入模式' : activeRun.runMode === 'deploy' ? '部署模式' : '只读模式'}
                </span>
              )}
              {activeRun.status === 'queued' && activeRun.queuePosition !== undefined && activeRun.queuePosition !== null && (
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
                  队列第 {activeRun.queuePosition} 位
                </span>
              )}
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
            {activeRunId && runRetryProgress[activeRunId] && (
              <div className="flex items-center space-x-2 mt-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 flex-shrink-0" />
                <span className="font-medium">
                  {runRetryProgress[activeRunId].message || `系统正在自动重试 (${runRetryProgress[activeRunId].attempt}/${runRetryProgress[activeRunId].maxAttempts})...`}
                </span>
              </div>
            )}
          </div>
          {(activeRun.status === 'running' || activeRun.status === 'pending' || activeRun.status === 'conflict' || activeRun.status === 'queued') && (
            <button
              onClick={() => activeRunId && cancelSandboxRun(activeRunId)}
              className="text-xs flex items-center space-x-1 px-2.5 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all font-medium"
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              终止
            </button>
          )}
          {(activeRun.status === 'completed' || activeRun.status === 'failed') && (
            <button
              onClick={handleRollback}
              disabled={isRollingBack}
              className="text-xs flex items-center space-x-1 px-2.5 py-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 disabled:bg-slate-800 disabled:text-slate-500 text-indigo-400 border border-indigo-500/20 transition-all font-medium"
            >
              {isRollingBack ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Undo className="w-3.5 h-3.5 mr-1" />
              )}
              撤销更改
            </button>
          )}
          {(activeRun.status === 'failed' || activeRun.status === 'conflict' || activeRun.status === 'cancelled') && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="text-xs flex items-center space-x-1 px-2.5 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-500 text-emerald-400 border border-emerald-500/20 transition-all font-medium shadow-lg hover:shadow-emerald-500/10"
            >
              {isRetrying ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5 mr-1" />
              )}
              重试
            </button>
          )}
        </div>

        <div className="flex space-x-1 mt-4 p-0.5 bg-slate-900/80 rounded-lg border border-slate-800/80">
          <button
            onClick={() => setActiveTab('workflow')}
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'workflow'
                ? 'bg-slate-800 text-indigo-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Terminal className="w-3.5 h-3.5 mr-1" />
            步骤 & 日志
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'files'
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
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all relative ${activeTab === 'conflicts'
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
          {workspaceId && (
            <button
              onClick={() => setActiveTab('deployment')}
              className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'deployment'
                  ? 'bg-slate-800 text-indigo-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Globe className="w-3.5 h-3.5 mr-1" />
              一键部署
            </button>
          )}
          <button
            onClick={() => setActiveTab('debug')}
            className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'debug'
                ? 'bg-slate-800 text-indigo-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Network className="w-3.5 h-3.5 mr-1" />
            通信调试
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900/40">

        {activeTab === 'workflow' && (
          <div className="flex flex-col h-full">
            {activeRun.status === 'queued' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 space-y-4">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center animate-pulse">
                  <Clock className="w-8 h-8 text-amber-400" />
                </div>
                <h4 className="text-sm font-semibold text-slate-200">排队等待锁定工作区...</h4>
                <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                  当前工作区存在正在执行的写入或部署任务。本任务已进入队列，等待锁释放后将自动开始执行。
                </p>
                {activeRun.queuePosition !== undefined && activeRun.queuePosition !== null && (
                  <div className="px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700 text-xs font-mono text-amber-300">
                    当前队列位置: <span className="font-bold">{activeRun.queuePosition}</span> 位
                  </div>
                )}
                {activeRun.queuedReason && (
                  <div className="text-[10px] text-slate-500 bg-slate-950 p-2 rounded border border-slate-850 font-mono">
                    原因: {activeRun.queuedReason === 'workspace_mutation_lock_held' ? '工作区修改锁被占用' : activeRun.queuedReason}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-slate-800/60 bg-slate-950/20">
              <div className="text-[11px] uppercase text-slate-500 font-bold tracking-wider mb-2">
                {activeRun.dag?.strategy === 'platform_single_step'
                  ? '平台任务执行 (单步)'
                  : activeRun.dag?.strategy === 'group_orchestrator_dag'
                    ? 'Orchestrator 任务分派流程'
                    : '沙箱执行流程 (DAG)'}
              </div>

              {/* ====== Orchestrator Planning Timeline ====== */}
              {(() => {
                const phases = activeRunId ? (planningPhaseByRunId[activeRunId] || []) : [];
                const isGroupOrchestrator = activeRun.dag?.strategy === 'group_orchestrator_dag';
                if (phases.length === 0 && !isGroupOrchestrator) return null;

                const PHASE_LABELS: Record<string, string> = {
                  started: 'Orchestrator 开始分析',
                  context_ready: '已读取工作区上下文',
                  agents_selected: '已确认可调度成员 Agent',
                  model_started: '正在生成计划',
                  model_completed: '初步计划生成',
                  normalized: '计划规范化',
                  completed: '规划完成 → 开始执行',
                  failed: '规划失败',
                };

                const isRunning = activeRun.status === 'running' || activeRun.status === 'pending';
                const planningComplete = phases.includes('completed') || phases.includes('failed');
                const planningFailed = phases.includes('failed');

                return (
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 select-none">
                      <Sparkles className="w-3 h-3" />
                      <span>Orchestrator 规划阶段</span>
                      {!planningComplete && isRunning && (
                        <span className="ml-auto flex items-center gap-1 text-blue-400 font-medium normal-case tracking-normal">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                          规划中
                        </span>
                      )}
                      {planningFailed && (
                        <span className="ml-auto text-rose-400 font-medium normal-case tracking-normal">规划失败</span>
                      )}
                    </div>

                    <div className="relative pl-4">
                      {/* Vertical connector line */}
                      {phases.length > 1 && (
                        <div className="absolute left-[7px] top-3 bottom-3 w-px bg-slate-700/60" />
                      )}

                      <div className="space-y-1.5">
                        {phases.map((phase, idx) => {
                          const isLast = idx === phases.length - 1;
                          const isFailed = phase === 'failed';
                          const isCompleted = phase === 'completed';
                          const isActive = isLast && !planningComplete;

                          return (
                            <div key={phase} className="flex items-center gap-2.5">
                              {/* Phase dot/icon */}
                              <div className="relative z-10 flex-shrink-0">
                                {isFailed ? (
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                ) : isCompleted ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : isActive ? (
                                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400/70" />
                                )}
                              </div>

                              {/* Phase label */}
                              <span className={`text-[11px] font-medium ${
                                isFailed
                                  ? 'text-rose-400'
                                  : isCompleted
                                    ? 'text-emerald-400'
                                    : isActive
                                      ? 'text-blue-300'
                                      : 'text-slate-400'
                              }`}>
                                {PHASE_LABELS[phase] || phase}
                              </span>
                            </div>
                          );
                        })}

                        {/* Placeholder when no phases yet but is a group orchestrator run and is still active */}
                        {phases.length === 0 && isGroupOrchestrator && (activeRun.status === 'running' || activeRun.status === 'pending') && (
                          <div className="flex items-center gap-2.5">
                            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
                            <span className="text-[11px] text-blue-300 font-medium">Orchestrator 规划中...</span>
                          </div>
                        )}
                        {/* Placeholder when no phases yet but is a group orchestrator run and is completed/inactive */}
                        {phases.length === 0 && isGroupOrchestrator && !(activeRun.status === 'running' || activeRun.status === 'pending') && (
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="text-[11px] text-emerald-400 font-medium">Orchestrator 规划完毕</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Separator before steps */}
                    {(activeRun.steps?.length ?? 0) > 0 && (
                      <div className="flex items-center gap-2 mt-3 mb-1">
                        <div className="flex-1 h-px bg-slate-800/80" />
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                          <Network className="w-3 h-3" />
                          <span>执行步骤</span>
                        </div>
                        <div className="flex-1 h-px bg-slate-800/80" />
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-2">
                {activeRun.steps?.map((step: AgentRunStep, idx: number) => {
                  const isSelected = step.id === selectedStepId;
                  
                  const isRunTerminated = activeRun.status === 'cancelled' || activeRun.status === 'failed';
                  const effectiveStatus = (isRunTerminated && (step.status === 'running' || step.status === 'pending'))
                    ? 'failed'
                    : step.status;

                  let statusColor = 'text-slate-500 bg-slate-800/30';
                  let icon = <div className="w-2 h-2 rounded-full bg-slate-600" />;

                  if (effectiveStatus === 'completed') {
                    statusColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
                    icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
                  } else if (effectiveStatus === 'running') {
                    statusColor = 'text-blue-400 border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/20';
                    icon = <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
                  } else if (effectiveStatus === 'failed') {
                    statusColor = 'text-rose-400 border-rose-500/30 bg-rose-500/5';
                    icon = <AlertTriangle className="w-4 h-4 text-rose-400" />;
                  } else if (effectiveStatus === 'conflict') {
                    statusColor = 'text-amber-400 border-amber-500/30 bg-amber-500/5';
                    icon = <GitMerge className="w-4 h-4 text-amber-400" />;
                  } else if (effectiveStatus === 'blocked') {
                    statusColor = 'text-slate-500 border-slate-800 bg-slate-900/20 opacity-60';
                    icon = <Ban className="w-4 h-4 text-slate-500" />;
                  }

                  return (
                    <div
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`flex items-start space-x-3 p-2.5 rounded-lg border transition-all cursor-pointer ${isSelected
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-200'
                          : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-300'
                        }`}
                    >
                      <div className="mt-0.5">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-200 flex flex-wrap items-center gap-1.5">
                            <span>{idx + 1}. {step.agentName}</span>
                            {step.runtime && step.runtime !== 'native' && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-400 font-mono font-semibold uppercase border border-violet-500/20">
                                platform: {step.runtime}
                              </span>
                            )}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${statusColor}`}>
                            {effectiveStatus}
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

            <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-850 bg-slate-900/40">
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>step-log: {selectedStep ? `${selectedStep.agentName}` : 'none'}</span>
                </div>
                {selectedStep && (() => {
                  const isRunTerminated = activeRun.status === 'cancelled' || activeRun.status === 'failed';
                  const effectiveSelectedStatus = (isRunTerminated && (selectedStep.status === 'running' || selectedStep.status === 'pending'))
                    ? 'failed'
                    : selectedStep.status;

                  return effectiveSelectedStatus === 'running' && (
                    <span className="flex items-center text-[10px] text-blue-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping mr-1.5" />
                      流式日志输出中
                    </span>
                  );
                })()}
              </div>
              <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300 space-y-1 select-text selection:bg-indigo-500/30">
                {selectedStep && (() => {
                  const errorText = selectedStep.error || '';
                  const status = selectedStep.status;
                  
                  const isLockLost = status === 'mutation_lock_lost' || errorText.includes('workspace mutation lock 已失效');
                  const isOutsidePaths = status === 'outside_declared_target_paths' || (selectedStep.output?.outsideDeclaredTargetPaths && selectedStep.output.outsideDeclaredTargetPaths.length > 0) || (selectedStep.output?.extraChangedFiles && selectedStep.output.extraChangedFiles.length > 0);
                  const isToolBlocked = status === 'dynamic_workspace_tool_blocked' || errorText.includes('dynamic_workspace_tool_blocked');

                  if (isLockLost) {
                    return (
                      <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
                        <div className="font-semibold flex items-center gap-1.5 mb-1 text-rose-400">
                          <Ban className="w-4 h-4" /> 写入锁失效
                        </div>
                        任务失去工作区写入锁，已停止继续写入。请重新发起任务。
                      </div>
                    );
                  }

                  if (isOutsidePaths) {
                    return (
                      <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                        <div className="font-semibold flex items-center gap-1.5 mb-1 text-amber-400">
                          <GitMerge className="w-4 h-4" /> 写入未声明路径被阻止
                        </div>
                        步骤尝试写入未声明的路径，后端已阻止提交以避免覆盖其他变更。
                        {selectedStep.output?.extraChangedFiles && selectedStep.output.extraChangedFiles.length > 0 && (
                          <div className="mt-2 p-2 bg-slate-950/60 rounded border border-slate-800 font-mono text-[10px] space-y-1">
                            <div className="text-slate-400 font-semibold uppercase tracking-wider">调试路径信息:</div>
                            {selectedStep.output.extraChangedFiles.map((file: any, fIdx: number) => (
                              <div key={fIdx} className="text-slate-350">
                                <div>• 路径: <span className="text-amber-400">{file.path}</span></div>
                                {file.reason && <div className="pl-3 text-slate-500">原因: {file.reason}</div>}
                                {file.targetPaths && file.targetPaths.length > 0 && (
                                  <div className="pl-3 text-slate-500">声明路径: {file.targetPaths.join(', ')}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (isToolBlocked) {
                    return (
                      <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
                        <div className="font-semibold flex items-center gap-1.5 mb-1 text-rose-400">
                          <Ban className="w-4 h-4" /> 动态命令执行被阻止
                        </div>
                        该步骤被限制为纯文件写入，不能执行命令或环境安装。
                      </div>
                    );
                  }

                  if (errorText) {
                    return (
                      <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
                        <div className="font-semibold flex items-center gap-1.5 mb-1 text-rose-400">
                          <AlertTriangle className="w-4 h-4" /> 步骤执行失败
                        </div>
                        {errorText}
                      </div>
                    );
                  }

                  return null;
                })()}

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
              </>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex flex-col h-full min-h-0">
            {selectedSandboxFilePath ? (
              <div className="flex flex-col h-full min-h-0 bg-slate-950">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/60">
                  <button
                    onClick={() => activeRunId && setSelectedSandboxFilePath(activeRunId, null)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>返回文件列表</span>
                  </button>
                  <span className="text-xs font-mono text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded">
                    {selectedSandboxFilePath}
                  </span>
                </div>

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
                        onClick={() => activeRunId && setSelectedSandboxFilePath(activeRunId, file.path)}
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

        {activeTab === 'conflicts' && (
          <div className="flex flex-col h-full min-h-0">
            {editingConflict ? (
              <div className="flex flex-col h-full min-h-0 bg-slate-950">
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
                        className={`flex flex-col p-3 rounded-lg border transition-all ${conflict.status === 'resolved'
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
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${conflict.status === 'resolved'
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

        {activeTab === 'deployment' && workspaceId && (
          <DeploymentView
            workspaceId={workspaceId}
            conversationId={activeConversationId || undefined}
            runId={activeRunId || undefined}
          />
        )}

        {activeTab === 'debug' && (
          <SandboxDebugView
            logs={sandboxDebugLogs}
            onClear={clearSandboxDebugLogs}
          />
        )}

      </div>
    </div>
  );
};

interface SandboxDebugViewProps {
  logs: any[];
  onClear: () => void;
}

const SandboxDebugView: React.FC<SandboxDebugViewProps> = ({ logs, onClear }) => {
  const [filter, setFilter] = useState<'all' | 'ws' | 'http'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter(log => {
    if (filter === 'ws') return log.type === 'ws_in' || log.type === 'ws_out';
    if (filter === 'http') return log.type.startsWith('http_');
    return true;
  });

  const getLogTypeBadge = (type: string) => {
    switch (type) {
      case 'ws_in':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
            WS IN
          </span>
        );
      case 'ws_out':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-mono">
            WS OUT
          </span>
        );
      case 'http_req':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            HTTP REQ
          </span>
        );
      case 'http_res':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
            HTTP RES
          </span>
        );
      case 'http_err':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
            HTTP ERR
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 flex flex-col h-full min-h-0 text-xs">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="text-[11px] uppercase text-slate-500 font-bold tracking-wider">
          沙箱通信监控 (WS / HTTP 捕获)
        </div>
        <button
          onClick={onClear}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-750 transition-colors"
        >
          清空面板
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 mb-3 flex-shrink-0">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-md border font-medium ${
            filter === 'all'
              ? 'bg-slate-850 border-indigo-500/40 text-indigo-400 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          全部 ({logs.length})
        </button>
        <button
          onClick={() => setFilter('ws')}
          className={`px-3 py-1 rounded-md border font-medium ${
            filter === 'ws'
              ? 'bg-slate-850 border-indigo-500/40 text-indigo-400 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          WebSocket ({logs.filter(l => l.type.startsWith('ws_')).length})
        </button>
        <button
          onClick={() => setFilter('http')}
          className={`px-3 py-1 rounded-md border font-medium ${
            filter === 'http'
              ? 'bg-slate-850 border-indigo-500/40 text-indigo-400 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          HTTP 请求 ({logs.filter(l => l.type.startsWith('http_')).length})
        </button>
      </div>

      {/* Logs list */}
      <div className="flex-grow overflow-y-auto min-h-0 space-y-2 select-text">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-600 italic">
            暂无被捕获的沙箱通信数据
          </div>
        ) : (
          filteredLogs.map(log => {
            const isExpanded = expandedLogId === log.id;
            const isError = log.type === 'http_err' || (log.type === 'ws_in' && log.payload?.type?.includes('failed'));
            
            return (
              <div
                key={log.id}
                className={`border rounded-lg bg-slate-950/40 overflow-hidden transition-all ${
                  isExpanded ? 'border-indigo-500/50 shadow-md shadow-indigo-500/5' : 'border-slate-850 hover:border-slate-750'
                }`}
              >
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-900/20"
                >
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    {getLogTypeBadge(log.type)}
                    <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                    {log.method && (
                      <span className={`px-1 py-0.2 rounded text-[9px] font-bold font-mono ${
                        log.method === 'GET' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {log.method}
                      </span>
                    )}
                    <span className={`font-mono text-xs truncate font-medium ${isError ? 'text-rose-400' : 'text-slate-300'}`} title={log.name}>
                      {log.name}
                    </span>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-500 transform transition-transform ${isExpanded ? 'rotate-90 text-indigo-400' : ''}`} />
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-900 bg-slate-950/80 p-3 font-mono text-[11px] overflow-x-auto max-h-96">
                    <pre className="text-slate-300 leading-relaxed max-w-full">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
