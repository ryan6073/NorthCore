import React, { useState, useEffect, useRef } from 'react';
import { useDeploymentStore } from '@/store/useDeploymentStore';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { 
  Globe, Server, Play, Square, Settings, RefreshCw, 
  ExternalLink, Terminal, ChevronRight, AlertTriangle, 
  CheckCircle2, Loader2, Copy, Check, ChevronDown, ChevronUp, History
} from 'lucide-react';
import { CreateDeploymentPayload, DeploymentConfig, WorkspaceDeployment } from '@/services/http/deploymentService';

interface DeploymentViewProps {
  workspaceId: string;
  conversationId?: string;
  runId?: string;
}

export const DeploymentView: React.FC<DeploymentViewProps> = ({ workspaceId, conversationId, runId }) => {
  const {
    deploymentsByWorkspaceId,
    activeDeploymentByWorkspaceId,
    deploymentLogs,
    isLoading,
    isLogsLoading,
    fetchHistory,
    startDeploy,
    stopDeploy,
    fetchLogs,
    startPolling,
    stopPolling
  } = useDeploymentStore();

  const runDetailsById = useAgentHubStore(state => state.runDetailsById);
  const conversations = useAgentHubStore(state => state.conversations);

  const activeRun = runId ? runDetailsById[runId] : null;
  const activeConv = conversationId ? conversations.find(c => c.id === conversationId) : null;

  const history = deploymentsByWorkspaceId[workspaceId] || [];
  const activeDeployment = activeDeploymentByWorkspaceId[workspaceId] || null;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Configuration states
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [projectDir, setProjectDir] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [containerPort, setContainerPort] = useState<number | ''>('');

  const [frontendDir, setFrontendDir] = useState('');
  const [backendDir, setBackendDir] = useState('');
  const [frontendStartCommand, setFrontendStartCommand] = useState('');
  const [backendStartCommand, setBackendStartCommand] = useState('');
  const [frontendPort, setFrontendPort] = useState<number | ''>('');
  const [backendPort, setBackendPort] = useState<number | ''>('');

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize config form from active deployment or auto detection if available
  useEffect(() => {
    fetchHistory(workspaceId);
    return () => {
      stopPolling();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (activeDeployment && ['queued', 'running'].includes(activeDeployment.status)) {
      startPolling(activeDeployment.id, workspaceId);
    }
  }, [activeDeployment?.id, activeDeployment?.status]);

  useEffect(() => {
    if (showLogsPanel && activeDeployment) {
      fetchLogs(activeDeployment.id);
      const interval = setInterval(() => {
        if (['queued', 'running', 'deployed'].includes(activeDeployment.status)) {
          fetchLogs(activeDeployment.id);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [showLogsPanel, activeDeployment?.id]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [deploymentLogs[activeDeployment?.id || '']]);

  const handleCopy = (key: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDeploy = async (overrideConfig?: DeploymentConfig) => {
    const config: DeploymentConfig = overrideConfig || {};

    if (!overrideConfig) {
      if (projectDir) config.projectDir = projectDir;
      if (startCommand) config.startCommand = startCommand;
      if (containerPort) config.containerPort = Number(containerPort);
      
      if (frontendDir) config.frontendDir = frontendDir;
      if (backendDir) config.backendDir = backendDir;
      if (frontendStartCommand) config.frontendStartCommand = frontendStartCommand;
      if (backendStartCommand) config.backendStartCommand = backendStartCommand;
      if (frontendPort) config.frontendPort = Number(frontendPort);
      if (backendPort) config.backendPort = Number(backendPort);
    }

    const inferredAgentId = (() => {
      if (activeRun && activeRun.steps && activeRun.steps.length > 0) {
        const lastStep = activeRun.steps[activeRun.steps.length - 1];
        if (lastStep && lastStep.agentId) {
          return lastStep.agentId;
        }
      }
      if (activeConv && activeConv.agentIds && activeConv.agentIds.length > 0) {
        return activeConv.agentIds[0];
      }
      return undefined;
    })();

    const payload: CreateDeploymentPayload = {
      conversationId,
      runId,
      publicBaseUrl: publicBaseUrl || undefined,
      config: Object.keys(config).length > 0 ? config : undefined,
      agentId: inferredAgentId,
      targetAgentId: inferredAgentId
    };

    await startDeploy(workspaceId, payload);
    setShowConfigForm(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-pulse mr-1" />
            排队中
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            部署中
          </span>
        );
      case 'deployed':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            已部署
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            部署失败
          </span>
        );
      case 'stopped':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-550/10 text-slate-400 border border-slate-500/20">
            <Square className="w-3.5 h-3.5 mr-1" />
            已停止
          </span>
        );
      case 'requires_config':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Settings className="w-3.5 h-3.5 mr-1" />
            需配置
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-600/10 text-slate-450 border border-slate-600/20">
            未知
          </span>
        );
    }
  };

  const currentLogs = activeDeployment ? deploymentLogs[activeDeployment.id] : null;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-y-auto select-text">
      {/* Active Deployment Display */}
      {activeDeployment ? (
        <div className="p-4 space-y-4">
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold font-mono">部署实例 {activeDeployment.id.substring(0, 8)}</span>
              </div>
              {getStatusBadge(activeDeployment.status)}
            </div>

            {/* Requires Config UI Form */}
            {activeDeployment.status === 'requires_config' && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3.5 space-y-3.5">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-amber-400">自动识别失败，请补充配置：</h4>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      {activeDeployment.error || activeDeployment.config?.requiredReason || '未识别项目入口或类型。'}
                    </p>
                  </div>
                </div>

                <div className="border-t border-amber-500/10 pt-3 space-y-3">
                  {/* Select simple or split frontend/backend based on hint */}
                  {activeDeployment.projectType === 'fullstack_split' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">前端目录</label>
                        <input
                          type="text"
                          value={frontendDir}
                          onChange={e => setFrontendDir(e.target.value)}
                          placeholder="e.g. frontend"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">后端目录</label>
                        <input
                          type="text"
                          value={backendDir}
                          onChange={e => setBackendDir(e.target.value)}
                          placeholder="e.g. backend"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">前端启动命令</label>
                        <input
                          type="text"
                          value={frontendStartCommand}
                          onChange={e => setFrontendStartCommand(e.target.value)}
                          placeholder="e.g. npm run build"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">后端启动命令</label>
                        <input
                          type="text"
                          value={backendStartCommand}
                          onChange={e => setBackendStartCommand(e.target.value)}
                          placeholder="e.g. uvicorn main:app"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">前端端口</label>
                        <input
                          type="number"
                          value={frontendPort}
                          onChange={e => setFrontendPort(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 4173"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">后端端口</label>
                        <input
                          type="number"
                          value={backendPort}
                          onChange={e => setBackendPort(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 8000"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">项目子目录 (子应用路径)</label>
                        <input
                          type="text"
                          value={projectDir}
                          onChange={e => setProjectDir(e.target.value)}
                          placeholder="根目录可留空，或填 e.g. frontend"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">项目启动命令</label>
                        <input
                          type="text"
                          value={startCommand}
                          onChange={e => setStartCommand(e.target.value)}
                          placeholder="e.g. npm run build && npm run preview -- --host 0.0.0.0 --port 4173"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-medium">容器内部端口</label>
                        <input
                          type="number"
                          value={containerPort}
                          onChange={e => setContainerPort(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 4173"
                          className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleDeploy()}
                    disabled={isLoading}
                    className="w-full py-2 bg-amber-550 hover:bg-amber-600 active:scale-95 transition-all text-xs font-bold text-slate-950 rounded-lg flex items-center justify-center gap-1.5 mt-2"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    提交配置并重新部署
                  </button>
                </div>
              </div>
            )}

            {/* Deployed/Running State Details */}
            {activeDeployment.status === 'deployed' && (
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-slate-400">服务可访问链接：</div>
                <div className="space-y-2">
                  {Object.entries(activeDeployment.serviceUrls || {}).map(([key, url]) => (
                    <div key={key} className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-[9px] uppercase tracking-wider bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold">{key}</span>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-300 font-medium block truncate hover:underline hover:text-indigo-400 mt-1 flex items-center gap-1">
                          {url}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                      <button
                        onClick={() => handleCopy(key, url)}
                        className="p-1.5 hover:bg-slate-850 text-slate-400 hover:text-slate-200 rounded transition-colors"
                        title="复制链接"
                      >
                        {copiedKey === key ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                  {Object.keys(activeDeployment.serviceUrls || {}).length === 0 && (
                    <div className="text-xs text-slate-500 italic py-1">未查询到可用端点，端口映射仍在容器内。</div>
                  )}
                </div>
              </div>
            )}

            {/* Running/Queued Loading Display */}
            {['queued', 'running'].includes(activeDeployment.status) && (
              <div className="space-y-2.5 pt-2">
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: activeDeployment.status === 'running' ? '70%' : '15%' }} />
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  {activeDeployment.status === 'running' 
                    ? '正在执行 Docker 镜像构建及容器拉起，请稍候...' 
                    : (activeDeployment.queuedReason === 'workspace_mutation_lock_held' 
                      ? `等待工作区写入任务完成 (队列位置: 第 ${activeDeployment.queuePosition || 1} 位)...` 
                      : '正在排队分配部署节点...')}
                </p>
              </div>
            )}

            {/* Error display if failed */}
            {activeDeployment.status === 'failed' && activeDeployment.error && (
              <div className="bg-rose-500/5 border border-rose-500/20 text-rose-400 text-[10px] p-3 rounded-lg leading-relaxed whitespace-pre-wrap select-text selection:bg-rose-500/30">
                <h5 className="font-bold flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 部署异常中断：
                </h5>
                {activeDeployment.error}
              </div>
            )}

            {/* Action Buttons Panel */}
            <div className="flex flex-wrap gap-2 border-t border-slate-850 pt-3">
              {['queued', 'running', 'deployed'].includes(activeDeployment.status) && (
                <button
                  onClick={() => stopDeploy(activeDeployment.id, workspaceId)}
                  disabled={isLoading}
                  className="flex-1 py-1.5 bg-slate-900 hover:bg-rose-950/20 hover:text-rose-400 hover:border-rose-900/50 border border-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 text-rose-500" />
                  停止部署
                </button>
              )}

              {['failed', 'stopped', 'requires_config'].includes(activeDeployment.status) && (
                <button
                  onClick={() => handleDeploy()}
                  disabled={isLoading}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  重新部署
                </button>
              )}

              <button
                onClick={() => setShowLogsPanel(!showLogsPanel)}
                className={`py-1.5 px-3 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                  showLogsPanel 
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                    : 'bg-slate-900 hover:bg-slate-850 border-slate-850 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                查看日志
              </button>
            </div>
          </div>

          {/* Logs terminal drawer */}
          {showLogsPanel && (
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-850 flex flex-col h-72">
              <div className="px-4 py-2 border-b border-slate-850 bg-slate-900/60 flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono text-indigo-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  部署流式容器日志 (liveLogs)
                </span>
                {isLogsLoading && <Loader2 className="w-3 h-3 text-indigo-450 animate-spin" />}
              </div>
              <div className="flex-1 overflow-auto p-3.5 font-mono text-[10px] text-slate-350 bg-slate-950/80 leading-relaxed space-y-1 select-text select-all">
                {currentLogs?.logs && (
                  <div className="opacity-60 border-b border-slate-900 pb-2 mb-2">
                    <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-1">[构建日志]</div>
                    {currentLogs.logs}
                  </div>
                )}
                {currentLogs?.liveLogs ? (
                  <div>
                    <div className="text-[9px] uppercase font-bold text-indigo-400 tracking-wider mb-1">[容器输出]</div>
                    {currentLogs.liveLogs.split('\n').map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap break-all leading-normal">{line}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-600 italic py-2">暂无可用实时输出</div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Create Deployment Main Entry */
        <div className="p-6 flex flex-col items-center justify-center text-center space-y-5 h-full max-w-sm mx-auto select-none">
          <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-sm">
            <Globe className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-100">一键部署此 Workspace</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              后端会自动扫描和判断该项目的架构模式（Static / Node / Python / Fullstack），并一键生成 Docker 镜像发布至开发服务器。
            </p>
          </div>

          <div className="w-full pt-2">
            <button
              onClick={() => handleDeploy()}
              disabled={isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              开始一键部署
            </button>
          </div>

          <button
            onClick={() => setShowConfigForm(!showConfigForm)}
            className="text-xs text-slate-500 hover:text-indigo-400 font-medium flex items-center gap-1 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>配置自定义部署参数</span>
            {showConfigForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Optional pre-deployment config overrides */}
          {showConfigForm && (
            <div className="w-full bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 text-left space-y-3.5 animate-fade-in select-text">
              <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider border-b border-slate-850 pb-2">自定义部署参数 (可选)</h4>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-medium">公网暴露前缀地址 (publicBaseUrl)</label>
                  <input
                    type="text"
                    value={publicBaseUrl}
                    onChange={e => setPublicBaseUrl(e.target.value)}
                    placeholder="e.g. http://your-server"
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-medium">启动子目录 (projectDir)</label>
                  <input
                    type="text"
                    value={projectDir}
                    onChange={e => setProjectDir(e.target.value)}
                    placeholder="默认根目录"
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-450 font-medium">指定容器内部启动端口</label>
                  <input
                    type="number"
                    value={containerPort}
                    onChange={e => setContainerPort(e.target.value ? Number(e.target.value) : '')}
                    placeholder="如自动识别失败可填此项"
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Timeline */}
      {history.length > 0 && (
        <div className="border-t border-slate-850 mt-4 p-4 space-y-3 select-none">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-slate-450 hover:text-slate-250 font-semibold"
          >
            <History className="w-3.5 h-3.5" />
            <span>部署运行历史 ({history.length})</span>
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHistory && (
            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {history.map((h) => (
                <div 
                  key={h.id}
                  onClick={async () => {
                    await useDeploymentStore.getState().fetchDetail(h.id, workspaceId);
                  }}
                  className={`flex items-center justify-between p-2.5 border rounded-lg cursor-pointer transition-all ${
                    activeDeployment?.id === h.id
                      ? 'border-indigo-500/40 bg-indigo-500/5'
                      : 'border-slate-850 bg-slate-950/20 hover:bg-slate-850/40'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold font-mono text-slate-350 truncate block">run-{h.id.substring(0, 8)}</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">{new Date(h.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {getStatusBadge(h.status)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
