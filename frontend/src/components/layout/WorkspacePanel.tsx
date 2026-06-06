import React, { useState, useEffect } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { 
  FolderOpen, X, RefreshCw, AlertTriangle, CheckCircle, 
  Clock, Trash2, Edit2, RotateCcw, Plus, Check, ChevronRight, Archive, Cloud, Laptop, ExternalLink
} from 'lucide-react';
import { platform } from '@/utils/platform';

export const WorkspacePanel: React.FC = () => {
  const {
    serverWorkspaces,
    serverDeletedWorkspaces,
    serverCurrentWorkspace,
    activeConversationId,
    conversations,
    fetchServerWorkspaces,
    createServerWorkspace,
    renameServerWorkspace,
    deleteServerWorkspace,
    restoreServerWorkspace,
    purgeServerWorkspace,
    bindConversationWorkspace,
    loadServerWorkspaceTree,
    isDesktop,
    currentWorkspace,
    selectWorkspace,
    clearWorkspace
  } = useAgentHubStore();

  const [activeTab, setActiveTab] = useState<'active' | 'deleted'>('active');
  const [newWsName, setNewWsName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  useEffect(() => {
    fetchWorkspaces();
  }, [activeTab]);

  const fetchWorkspaces = async () => {
    setLoading(true);
    try {
      await fetchServerWorkspaces(activeTab);
    } finally {
      setLoading(false);
    }
  };

  const handleError = (err: any) => {
    console.error('[WorkspacePanel] Error:', err);
    if (err && err.response && err.response.data) {
      const { message, data } = err.response.data;
      if (data?.error === 'workspace_busy') {
        setErrorMessage('该工作区正有任务在运行，请等任务完成后再试！');
      } else if (data?.error === 'workspace_name_conflict') {
        setErrorMessage('工作区名称已存在，请换个名字。');
      } else {
        setErrorMessage(message || '操作失败，请重试');
      }
    } else if (err && err.message) {
      setErrorMessage(err.message);
    } else {
      setErrorMessage('未知错误，操作失败');
    }
    setTimeout(() => {
      setErrorMessage(null);
    }, 5000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setLoading(true);
    try {
      await createServerWorkspace(newWsName.trim());
      setNewWsName('');
      setIsCreating(false);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    setLoading(true);
    try {
      await renameServerWorkspace(id, editingName.trim());
      setEditingWsId(null);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确认将工作区 "${name}" 移到回收区吗？\n删除后相关的会话将被解除绑定。`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteServerWorkspace(id);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    setLoading(true);
    try {
      await restoreServerWorkspace(id);
      alert('已成功恢复工作区。提示：如需在会话中使用，请重新选择绑定该工作区。');
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurge = async (id: string, name: string) => {
    if (!window.confirm(`⚠️ 警告: 彻底删除工作区 "${name}" 将清除服务器上的所有物理文件，此操作不可撤销！\n确认彻底删除吗？`)) {
      return;
    }
    setLoading(true);
    try {
      await purgeServerWorkspace(id);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = async (ws: any) => {
    if (activeTab === 'deleted') return;
    setLoading(true);
    try {
      // Set current workspace (for global files view/editing)
      useAgentHubStore.setState({ serverCurrentWorkspace: ws });
      // Load file tree
      await loadServerWorkspaceTree(ws.id);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-lark-sidebar-bg dark:bg-[#090a12] text-lark-text-primary dark:text-slate-250 select-none">
      {/* Header */}
      <div className="p-4 border-b border-lark-border dark:border-[#161828] flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-wide font-sans flex items-center gap-1.5">
            <Cloud className="w-4 h-4 text-violet-500" />
            沙箱工作区管理
          </h2>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-lark-primary dark:hover:text-violet-400 active:scale-95 transition-all"
            title="新建沙箱工作区"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-slate-550 dark:text-slate-400">
          管理服务器上的沙箱工作空间，让云端智能体能够存取和修改文件。
        </p>
      </div>

      {/* Tabs */}
      <div className="flex px-3 pt-2 pb-1 border-b border-lark-border/50 dark:border-slate-900/60 bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'active'
              ? 'border-lark-primary dark:border-indigo-500 text-lark-primary dark:text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>活动沙箱</span>
        </button>
        <button
          onClick={() => setActiveTab('deleted')}
          className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'deleted'
              ? 'border-lark-primary dark:border-indigo-500 text-lark-primary dark:text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>回收站沙箱</span>
        </button>
      </div>

      {/* Error Message banner */}
      {errorMessage && (
        <div className="p-3 mx-4 mt-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-xs text-red-650 dark:text-red-400 animate-slide-up">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Creation form */}
      {isCreating && activeTab === 'active' && (
        <form onSubmit={handleCreate} className="p-4 bg-white dark:bg-slate-900/40 border-b border-lark-border/50 dark:border-slate-800/60 space-y-3 animate-scale-in">
          <div>
            <label className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block mb-1">工作区名称</label>
            <input
              type="text"
              placeholder="例如: 智能问答项目..."
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#eff0f1] dark:bg-slate-950 border border-transparent rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-450 focus:bg-white dark:focus:bg-slate-950 focus:border-lark-primary dark:focus:border-violet-650 outline-none transition-all"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-1.5 bg-lark-primary hover:bg-lark-primary-hover dark:bg-violet-650 dark:hover:bg-violet-600 text-white font-medium text-xs rounded-lg shadow-sm hover:shadow active:scale-95 transition-all flex items-center justify-center gap-1"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              <span>创建</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-750 text-slate-700 dark:text-slate-200 text-xs rounded-lg active:scale-95 transition-all"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Local Development Workspace Section for Desktop App */}
      {isDesktop && (
        <div className="mx-4 mt-3 p-3.5 bg-slate-100/40 dark:bg-slate-950/20 border border-lark-border/50 dark:border-slate-800/80 rounded-xl flex-shrink-0 animate-scale-in">
          <h3 className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
            <Laptop className="w-3.5 h-3.5 text-violet-500" />
            本地开发工作区
          </h3>
          {currentWorkspace ? (
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 flex-1 select-text">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{currentWorkspace.name}</div>
                  <div className="text-[10px] text-slate-450 dark:text-slate-550 truncate mt-0.5 font-mono" title={currentWorkspace.path}>{currentWorkspace.path}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await platform.file.revealInFolder(currentWorkspace.path);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  title="在系统文件管理器中打开"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectWorkspace}
                  className="flex-1 py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg active:scale-95 transition-all text-center"
                >
                  更改本地目录
                </button>
                <button
                  type="button"
                  onClick={clearWorkspace}
                  className="py-1.5 px-3 border border-slate-205 hover:bg-red-50 hover:text-red-650 dark:border-slate-800 dark:hover:bg-red-950/20 text-slate-450 hover:border-red-200 text-xs rounded-lg active:scale-95 transition-all"
                  title="清除本地工作区绑定"
                >
                  清除
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-slate-250 dark:border-slate-800 text-center bg-white/40 dark:bg-slate-900/10">
              <p className="text-[11px] text-slate-400 dark:text-slate-600 mb-2.5">未关联本地开发工作区</p>
              <button
                type="button"
                onClick={selectWorkspace}
                className="w-full py-1.5 bg-violet-650 hover:bg-violet-600 text-white font-semibold text-xs rounded-lg transition-all active:scale-95 shadow-sm hover:shadow"
              >
                关联本地目录
              </button>
            </div>
          )}
        </div>
      )}

      {/* List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="py-8 flex flex-col items-center justify-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-lark-primary" />
            <span className="text-xs mt-2">载入中...</span>
          </div>
        )}

        {!loading && (activeTab === 'active' ? serverWorkspaces : serverDeletedWorkspaces).length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-650">
            <FolderOpen className="w-10 h-10 stroke-[1.5] mb-2 text-slate-350 dark:text-slate-750" />
            <p className="text-xs">暂无工作区记录</p>
            {activeTab === 'active' && (
              <button
                onClick={() => setIsCreating(true)}
                className="mt-3 px-4 py-1.5 bg-lark-primary/10 hover:bg-lark-primary/20 dark:bg-violet-650/10 dark:hover:bg-violet-650/20 text-lark-primary dark:text-violet-400 font-semibold text-xs rounded-xl transition-all"
              >
                新建第一个工作区
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {(activeTab === 'active' ? serverWorkspaces : serverDeletedWorkspaces).map((w) => {
              const isSelected = serverCurrentWorkspace?.id === w.id;
              const isBound = activeConversation?.workspaceId === w.id;
              const isEditing = editingWsId === w.id;

              return (
                <div
                  key={w.id}
                  className={`p-3 rounded-xl border transition-all relative group flex flex-col ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 border-lark-primary dark:border-violet-650 shadow-sm'
                      : 'bg-white/55 dark:bg-slate-900/25 border-lark-border/40 hover:border-lark-border/80 dark:border-slate-800/40 dark:hover:border-slate-850 hover:bg-white dark:hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleSelectWorkspace(w)}>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 px-2.5 py-1 bg-[#eff0f1] dark:bg-slate-950 border border-transparent rounded-md text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-450 focus:bg-white dark:focus:bg-slate-950 outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRename(w.id)}
                            className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingWsId(null)}
                            className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-150 truncate leading-snug">
                              {w.name}
                            </span>
                            {isSelected && (
                              <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-900/30 px-1.5 py-0.2 rounded-full flex-shrink-0">
                                <CheckCircle className="w-2.5 h-2.5" />
                                管理中
                              </span>
                            )}
                            {isBound && (
                              <span className="flex items-center gap-0.5 text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30 px-1.5 py-0.2 rounded-full flex-shrink-0">
                                <CheckCircle className="w-2.5 h-2.5" />
                                会话已绑定
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-450 font-sans">
                            <span className="flex items-center gap-1">
                              <Archive className="w-3 h-3" />
                              {w.conversationCount} 会话
                            </span>
                            {w.lastUsedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {w.lastUsedAt.split(' ').pop()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    {!isEditing && (
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 touch-actions-visible transition-opacity">
                        {activeTab === 'active' ? (
                          <>
                            <button
                              onClick={() => {
                                setEditingWsId(w.id);
                                setEditingName(w.name);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-450 hover:text-slate-750 dark:hover:text-slate-200 active:scale-95 transition-all"
                              title="重命名"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(w.id, w.name)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-450 hover:text-red-650 dark:hover:text-red-400 active:scale-95 transition-all"
                              title="软删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleRestore(w.id)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-450 hover:text-emerald-600 dark:hover:text-emerald-450 active:scale-95 transition-all"
                              title="恢复"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handlePurge(w.id, w.name)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-450 hover:text-red-650 dark:hover:text-red-400 active:scale-95 transition-all"
                              title="彻底删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
