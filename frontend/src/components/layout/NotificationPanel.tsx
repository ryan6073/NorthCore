import React from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { Bell, Check, Trash2, ShieldAlert, CheckCircle, Info } from 'lucide-react';

export const NotificationPanel: React.FC = () => {
  const notifications = useAgentHubStore(state => state.desktopNotifications);
  const markAsRead = useAgentHubStore(state => state.markNotificationAsRead);
  const clearAll = useAgentHubStore(state => state.clearNotifications);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
      case 'error':
        return <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    }
  };

  const handleMarkAllRead = () => {
    notifications.forEach(n => {
      if (!n.isRead) markAsRead(n.id);
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-lark-sidebar-bg dark:bg-[#090a12] text-lark-text-primary dark:text-slate-250 select-none">
      <div className="p-4 border-b border-lark-border dark:border-[#161828] flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-wide font-sans mb-0.5">
            通知中心
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            本地及系统级任务状态通知日志。
          </p>
        </div>
        {notifications.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleMarkAllRead}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-750 dark:text-slate-400 dark:hover:text-slate-200 active:scale-95 transition-all"
              title="全部标记为已读"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={clearAll}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-450 hover:text-red-550 active:scale-95 transition-all"
              title="清除所有通知"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-grow overflow-y-auto p-4">
        {notifications.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-slate-400 dark:text-slate-600">
            <Bell className="w-8 h-8 stroke-[1.2] mb-2 text-slate-350 dark:text-slate-750" />
            <p className="text-xs">暂无新通知</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => markAsRead(notif.id)}
                className={`p-3 rounded-xl border transition-all duration-200 flex gap-3 cursor-pointer ${
                  notif.isRead
                    ? 'bg-white/40 dark:bg-slate-900/10 border-lark-border/30 dark:border-slate-800/40 opacity-70'
                    : 'bg-white dark:bg-slate-900 border-lark-border dark:border-slate-800 shadow-sm relative pl-4 hover:shadow-md'
                }`}
              >
                {!notif.isRead && (
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-lark-primary dark:bg-violet-500 rounded-full" />
                )}
                {getIcon(notif.type)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {notif.title}
                    </h4>
                    <span className="text-[9px] text-slate-450 dark:text-slate-500 whitespace-nowrap">
                      {notif.timestamp.split(' ').pop()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words leading-relaxed">
                    {notif.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
