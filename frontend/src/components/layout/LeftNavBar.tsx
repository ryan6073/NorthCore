import React from 'react';
import { MessageSquare, Users, Folder, Cloud, Bell, Settings } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

export const LeftNavBar: React.FC = () => {
  const currentTab = useAgentHubStore(state => state.leftSidebarViewMode);
  const setTab = useAgentHubStore(state => state.setLeftSidebarViewMode);
  const notifications = useAgentHubStore(state => state.desktopNotifications);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  interface TabItem {
    id: 'conversations' | 'agents' | 'files' | 'workspace' | 'notifications' | 'settings';
    label: string;
    icon: React.ComponentType<any>;
    badge?: number;
  }

  const tabs: TabItem[] = [
    { id: 'conversations', label: '会话', icon: MessageSquare },
    { id: 'agents', label: '智能体', icon: Users },
    { id: 'files', label: '文件', icon: Folder },
    { id: 'workspace', label: '沙箱工作区', icon: Cloud },
    { id: 'notifications', label: '通知', icon: Bell, badge: unreadCount },
    { id: 'settings', label: '设置', icon: Settings },
  ];

  return (
    <div className="w-[56px] h-full bg-[#f0f2f4] dark:bg-[#07080f] flex flex-col items-center py-4 gap-4 border-r border-lark-border dark:border-[#161828] flex-shrink-0 transition-colors select-none">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id || (tab.id === 'agents' && currentTab === 'agent-detail');
        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center relative group transition-all duration-200 ${
              isActive
                ? 'bg-lark-primary dark:bg-violet-650 text-white shadow-md scale-105'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={tab.label}
          >
            <Icon className="w-5 h-5" />
            {tab.badge && tab.badge > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center shadow-sm animate-pulse">
                {tab.badge}
              </span>
            ) : null}
            {/* Tooltip */}
            <div className="absolute left-[64px] scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 origin-left transition-all duration-150 z-[9999] px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-medium shadow-xl border border-slate-850 pointer-events-none whitespace-nowrap">
              {tab.label}
            </div>
          </button>
        );
      })}
    </div>
  );
};
