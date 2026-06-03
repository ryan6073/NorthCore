import React, { useState } from 'react';
import { Server, ExternalLink, AlertTriangle, Terminal, CheckCircle2, Loader2, Copy, Check, RefreshCw, Square } from 'lucide-react';
import { useDeploymentStore } from '@/store/useDeploymentStore';

interface ServiceUrls {
  [key: string]: string;
}

interface Ports {
  [key: string]: number;
}

interface DeploymentMetadata {
  source: string;
  deploymentId: string;
  workspaceId: string;
  status: 'queued' | 'running' | 'retrying' | 'requires_config' | 'deployed' | 'failed';
  attempt?: number;
  maxRetryAttempts?: number;
  projectType?: string;
  serviceUrls?: ServiceUrls;
  ports?: Ports;
  errorSummary?: string;
}

interface DeploymentCardProps {
  metadata: DeploymentMetadata;
}

const DeploymentCard: React.FC<DeploymentCardProps> = ({ metadata }) => {
  const {
    status,
    deploymentId,
    workspaceId,
    attempt = 1,
    maxRetryAttempts = 3,
    projectType = 'web_app',
    serviceUrls = {},
    ports = {},
    errorSummary = ''
  } = metadata;

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'queued':
        return {
          label: '排队中',
          bg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
          icon: <Loader2 className="w-3.5 h-3.5 animate-pulse text-slate-400" />
        };
      case 'running':
        return {
          label: '部署中',
          bg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30',
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
        };
      case 'retrying':
        return {
          label: `重试中 (${attempt}/${maxRetryAttempts})`,
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/30 dark:border-amber-900/40',
          icon: <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
        };
      case 'requires_config':
        return {
          label: '需要配置',
          bg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200/30 dark:border-orange-900/40',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
        };
      case 'deployed':
        return {
          label: '运行中',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        };
      case 'failed':
        return {
          label: '部署失败',
          bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/30',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
        };
      default:
        return {
          label: status,
          bg: 'bg-slate-100 text-slate-600 border-slate-200',
          icon: null
        };
    }
  };

  const statusConfig = getStatusConfig();
  const urlsList = Object.entries(serviceUrls);
  const hasUrls = urlsList.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#e2e8f0] dark:border-slate-800 rounded-xl p-4 my-2.5 w-full shadow-sm max-w-md transition-colors relative overflow-hidden">
      {/* Background glowing effects for deployed state */}
      {status === 'deployed' && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
      )}
      {status === 'running' && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            status === 'deployed'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              : status === 'failed'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
          }`}>
            <Server className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-lark-text-primary dark:text-slate-100 truncate">
            服务部署
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${statusConfig.bg}`}>
          {statusConfig.icon}
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {/* Content based on status */}
      <div className="space-y-3.5">
        {(status === 'queued' || status === 'running' || status === 'retrying') && (
          <div className="space-y-2">
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${
                status === 'retrying' ? 'bg-amber-500 animate-pulse' : 'bg-indigo-600 dark:bg-indigo-500'
              } ${status === 'running' ? 'w-2/3 animate-pulse' : 'w-1/4'}`} />
            </div>
            <p className="text-xs text-lark-text-secondary dark:text-slate-400 flex items-center gap-1.5">
              {status === 'queued' && '排队等待分配部署容器...'}
              {status === 'running' && '拉取代码并准备容器环境...'}
              {status === 'retrying' && `第 ${attempt} 次尝试部署中...`}
            </p>
            <button
              onClick={async () => {
                try {
                  setIsStopping(true);
                  await useDeploymentStore.getState().stopDeploy(deploymentId, workspaceId);
                } catch (e) {
                  console.error('Failed to stop deployment', e);
                } finally {
                  setIsStopping(false);
                }
              }}
              disabled={isStopping}
              className="mt-2 w-full py-1.5 bg-slate-50 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/25 text-slate-600 dark:text-slate-450 hover:text-rose-500 border border-slate-200 dark:border-slate-700 hover:border-rose-250 dark:hover:border-rose-900/40 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
              停止部署
            </button>
          </div>
        )}

        {status === 'deployed' && (
          <div className="space-y-3">
            {hasUrls ? (
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
                  服务访问地址
                </span>
                <div className="space-y-1.5">
                  {urlsList.map(([key, url]) => (
                    <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700/80 transition-all group">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[9px] text-slate-400 capitalize font-medium">{key} 地址</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate flex items-center gap-1"
                        >
                          {url}
                          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => copyToClipboard(url)}
                          className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 transition-all shadow-sm"
                          title="复制链接"
                        >
                          {copiedUrl === url ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm text-xs font-semibold flex items-center justify-center"
                          title="打开页面"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-lark-text-secondary dark:text-slate-400">
                部署成功，但未返回可用的预览链接。
              </p>
            )}

            {Object.keys(ports).length > 0 && (
              <div className="flex gap-4 pt-1 text-[11px] border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                  <span>端口映射:</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300 font-semibold">
                    {Object.entries(ports).map(([name, port]) => `${name}:${port}`).join(', ')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {(status === 'failed' || status === 'requires_config') && (
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-400 dark:text-rose-500 flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              错误日志
            </span>
            <div className="p-3 bg-slate-950 dark:bg-black rounded-lg border border-slate-900/60 font-mono text-[10px] text-rose-400 dark:text-rose-400/90 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
              {errorSummary || '部署中发生了未知的脚本或编译错误。'}
            </div>
            {status === 'requires_config' && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ 请修改部署配置（如端口或启动脚本）后重新发起部署。
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[9px] text-slate-400 font-mono">
        <span>ID: {deploymentId.substring(0, 12)}...</span>
        <span>类型: {projectType}</span>
      </div>
    </div>
  );
};

export default DeploymentCard;
