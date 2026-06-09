import React from 'react';
import { Agent } from '@/types';
import { Laptop, Gamepad2, Dumbbell, BedDouble, Monitor, X, ChevronRight, ChevronDown, Music, Siren } from 'lucide-react';
import { useAgentHubStore } from '@/store/useAgentHubStore';

interface AgentOfficePlaygroundProps {
  agents: Agent[];
  agentIds?: string[]; // Allowed agent IDs for the current conversation
  onClose?: () => void;
  onToggle?: (mode: 'expanded' | 'collapsed') => void;
  mode?: 'expanded' | 'collapsed';
}

// Shout messages
const GYM_SHOUTS = [
  '老大，我们真的能变成健身高手吗',
  '没给没给',
  '谁往我蛋白粉里加优乐美了',
];
const GAME_SHOUTS = [
  '抽牢二抽牢二',
  '大残！一滴一滴',
  '对面是桂！',
  '我怎么老被炸啊',
  '翻开回忆角落~',
  '金图纸一个宝贝',
];

// Horse-headed Man (马头人) character component
const HorseAgent: React.FC<{
  agent: Agent;
  activityType: 'work' | 'game' | 'gym' | 'sleep';
  showNameBadge?: boolean;
  toolCallStatus?: 'success' | 'failed' | null;
  shout?: string | null;
}> = ({ agent, activityType, showNameBadge = true, toolCallStatus, shout }) => {
  const getBodyEmoji = () => {
    switch (activityType) {
      case 'work': return '👔';
      case 'gym': return '🎽';
      case 'game': return '🎮';
      case 'sleep': return '🛌';
      default: return '👔';
    }
  };

  return (
    <div className="flex flex-col items-center relative group select-none">
      {/* Name Badge */}
      {showNameBadge && (
        <span className="text-[8px] font-bold bg-slate-900/80 dark:bg-slate-950/80 text-white px-1.5 py-0.2 rounded-sm mb-1 max-w-[65px] truncate shadow-sm">
          {agent.name}
        </span>
      )}

      {/* Shout bubble */}
      {shout && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 animate-shout-in whitespace-nowrap">
          <div className="bg-yellow-100 dark:bg-yellow-900/80 border border-yellow-300 dark:border-yellow-700 text-[7px] font-bold text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded-lg shadow-lg">
            💬 {shout}
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-yellow-100 dark:bg-yellow-900/80 border-r border-b border-yellow-300 dark:border-yellow-700 rotate-45" />
        </div>
      )}

      {/* Horse-headed Character Container */}
      <div className={`relative flex flex-col items-center transition-transform ${
        activityType === 'work' ? 'animate-office-typing' :
        activityType === 'gym' ? 'animate-office-jog' :
        activityType === 'game' ? 'animate-office-game' : 'opacity-85'
      }`}>
        {/* Head: Horse Head */}
        <span className="text-2xl z-10 leading-none select-none filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">🐴</span>

        {/* Body Emoji, offset slightly to join head */}
        <span className="text-xl -mt-1.5 leading-none select-none filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]">{getBodyEmoji()}</span>

        {/* Action Specific Floating Indicators */}
        {activityType === 'sleep' && (
          <span className="absolute -top-2.5 -right-2 text-[8px] font-extrabold text-indigo-500 dark:text-indigo-400 animate-office-zzz select-none font-mono">
            Zzz
          </span>
        )}
        {activityType === 'work' && (
          <span className="absolute -top-2.5 -right-2 text-[8px] animate-pulse select-none">
            💻
          </span>
        )}

        {/* Tool call status icon for working agents */}
        {activityType === 'work' && toolCallStatus === 'success' && (
          <span className="absolute -top-3 -left-3 text-xs animate-office-bounce select-none z-20">
            🎵
          </span>
        )}
        {activityType === 'work' && toolCallStatus === 'failed' && (
          <span className="absolute -top-3 -left-3 text-xs animate-office-shake select-none z-20">
            😡
          </span>
        )}
      </div>
    </div>
  );
};

// V2: Realistic Dynamic Horse Agent component with realistic joint transitions
const HorseAgentV2: React.FC<{
  agent: Agent;
  activityType: 'work' | 'game' | 'gym' | 'sleep';
  toolCallStatus?: 'success' | 'failed' | null;
  shout?: string | null;
}> = ({ agent, activityType, toolCallStatus, shout }) => {
  return (
    <div className="flex flex-col items-center relative group select-none">
      {/* Name Badge */}
      <span className="text-[8px] font-bold bg-slate-900/80 dark:bg-slate-950/80 text-white px-1.5 py-0.2 rounded-sm mb-1 max-w-[65px] truncate shadow-sm">
        {agent.name}
      </span>

      {/* Shout bubble */}
      {shout && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 animate-shout-in whitespace-nowrap">
          <div className="bg-yellow-100 dark:bg-yellow-900/80 border border-yellow-300 dark:border-yellow-700 text-[7px] font-bold text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded-lg shadow-lg">
            💬 {shout}
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-yellow-100 dark:bg-yellow-900/80 border-r border-b border-yellow-300 dark:border-yellow-700 rotate-45" />
        </div>
      )}

      {/* Dynamic Joint Character Body Wrapper */}
      <div className="w-16 h-20 relative flex items-center justify-center">
        {/* State Scenery Background elements */}
        {activityType === 'work' && (
          <div className="absolute bottom-0 inset-x-0 flex flex-col items-center z-0 transition-opacity duration-300">
            {/* Coding Desk */}
            <div className="w-12 h-5 bg-slate-350 dark:bg-slate-700 rounded-md border-t border-slate-400 dark:border-slate-600 flex items-start justify-center shadow-xs">
              {/* Glowing Monitor screen */}
              <div className="w-7 h-3.5 bg-cyan-400/20 dark:bg-cyan-500/10 border border-cyan-400/40 dark:border-cyan-500/35 rounded-xs mt-0.5 animate-pulse relative shadow-[0_0_6px_rgba(34,211,238,0.25)]">
                <div className="w-1 h-1 bg-cyan-400 rounded-full absolute top-0.5 left-0.5 animate-ping"></div>
              </div>
            </div>
            <div className="w-1.5 h-3.5 bg-slate-400 dark:bg-slate-600"></div>
            <div className="w-5 h-0.5 bg-slate-400 dark:bg-slate-600"></div>
          </div>
        )}

        {activityType === 'gym' && (
          <div className="absolute bottom-0 w-14 h-8 flex flex-col items-center z-0 transition-opacity duration-300">
            {/* Treadmill */}
            <div className="w-14 h-2.5 bg-slate-700 dark:bg-slate-800 rounded-sm relative overflow-hidden border border-slate-600/80 shadow-xs">
              {/* Belt motion simulation lines */}
              <div className="absolute inset-0 flex gap-2 animate-treadmill-belt opacity-60">
                <span className="w-1.5 h-full bg-slate-500 flex-shrink-0"></span>
                <span className="w-1.5 h-full bg-slate-500 flex-shrink-0"></span>
                <span className="w-1.5 h-full bg-slate-500 flex-shrink-0"></span>
                <span className="w-1.5 h-full bg-slate-500 flex-shrink-0"></span>
              </div>
            </div>
            {/* Treadmill Handlebars */}
            <div className="w-8 h-6 border-l-2 border-t-2 border-r-2 border-slate-500 dark:border-slate-600 -mt-8 rounded-t-sm z-0"></div>
          </div>
        )}

        {activityType === 'game' && (
          <div className="absolute bottom-0 flex flex-col items-center z-0 transition-opacity duration-300">
            {/* Arcade Cabinet */}
            <div className="w-9 h-9 bg-gradient-to-b from-pink-500/85 to-purple-600/90 rounded-md border border-pink-400/30 dark:border-pink-500/20 flex flex-col items-center p-0.5 shadow-md">
              <div className="w-7 h-3.5 bg-slate-900 border border-purple-500/40 rounded-xs flex items-center justify-center overflow-hidden">
                <span className="text-[5px] text-pink-400 font-black animate-pulse tracking-tighter">PLAY</span>
              </div>
              <div className="flex gap-1 mt-1">
                <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
              </div>
            </div>
          </div>
        )}

        {activityType === 'sleep' && (
          <div className="absolute bottom-0 w-14 h-7 bg-indigo-100/90 dark:bg-indigo-950/40 rounded-lg border border-indigo-200/50 dark:border-indigo-900/30 flex items-center p-0.5 z-0 transition-opacity duration-300">
            {/* Pillow */}
            <div className="w-2.5 h-4 bg-white dark:bg-slate-800 rounded-sm shadow-xs border border-slate-200/50 dark:border-slate-900/50 flex-shrink-0"></div>
            {/* Sleeping sheet lines */}
            <div className="flex-1 h-full border-l border-indigo-200/40 border-dashed ml-1"></div>
          </div>
        )}

        {/* Dynamic Joint Character Body Wrapper */}
        <div className={`v2-character ${activityType}`}>

          {/* Head & Neck joint (SVG Vector horse head) */}
          <div className="head-joint">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.2)]">
              {/* Mane */}
              <path d="M 40,20 C 35,30 35,50 45,60 C 45,55 42,40 45,30 Z" fill="#475569" />
              {/* Face */}
              <path d="M 45,25 C 50,15 65,15 70,25 C 75,35 70,60 55,65 C 50,67 40,60 42,50 Z" fill="#D97706" />
              {/* Snout */}
              <path d="M 68,45 C 73,48 75,55 70,60 C 65,65 58,62 55,57 Z" fill="#F59E0B" />
              {/* Ear */}
              <path d="M 46,18 L 52,5 L 56,12 Z" fill="#78350F" />
              {/* Eye */}
              <circle cx="58" cy="32" r="3.5" fill="#000" />
              {/* Snout Dot */}
              <circle cx="67" cy="53" r="1.5" fill="#78350F" />
            </svg>
          </div>

          {/* Torso */}
          <div className="torso-joint bg-slate-750 dark:bg-slate-650 rounded-md border border-slate-650 dark:border-slate-550 flex items-center justify-center">
            {activityType === 'work' && <div className="w-1 h-4 bg-blue-500 rounded-sm mt-0.5 border-t border-blue-400"></div>}
            {activityType === 'gym' && <div className="w-3 h-5 bg-rose-500/80 rounded-sm border border-rose-400 flex items-center justify-center text-[5px] font-bold text-white font-mono scale-90">🏃</div>}
            {activityType === 'game' && <div className="w-2.5 h-4.5 bg-emerald-500/80 rounded-sm flex items-center justify-center text-[5px] text-emerald-100 font-bold border border-emerald-400">🎮</div>}
          </div>

          {/* Left Arm */}
          <div className="arm-left bg-slate-550 dark:bg-slate-450 rounded-full"></div>

          {/* Right Arm */}
          <div className="arm-right bg-slate-550 dark:bg-slate-450 rounded-full"></div>

          {/* Left Leg */}
          <div className="leg-left bg-slate-800 dark:bg-slate-700 rounded-full"></div>

          {/* Right Leg */}
          <div className="leg-right bg-slate-800 dark:bg-slate-700 rounded-full"></div>
        </div>

        {/* Tool call status icon for working agents */}
        {activityType === 'work' && toolCallStatus === 'success' && (
          <span className="absolute -top-1 -left-1 text-xs animate-office-bounce select-none z-20">
            🎵
          </span>
        )}
        {activityType === 'work' && toolCallStatus === 'failed' && (
          <span className="absolute -top-1 -left-1 text-xs animate-office-shake select-none z-20">
            😡
          </span>
        )}

        {/* Sleeping Bubbles */}
        {activityType === 'sleep' && (
          <span className="absolute top-1.5 right-1.5 text-[8px] font-extrabold text-violet-500 dark:text-violet-400 animate-office-zzz select-none font-mono">
            Zzz
          </span>
        )}
      </div>
    </div>
  );
};

export const AgentOfficePlayground: React.FC<AgentOfficePlaygroundProps> = ({ agents, agentIds, onClose, onToggle, mode = 'expanded' }) => {
  const styleMode: 'emoji' = 'emoji';
  const isCollapsed = mode === 'collapsed';

  const agentToolCallStatus = useAgentHubStore(state => state.agentToolCallStatus);

  // Filter agents by the active conversation's assigned agents
  const displayAgents = agentIds && agentIds.length > 0
    ? agents.filter(a => agentIds.includes(a.id))
    : agents.filter(a => a.enabled);

  if (displayAgents.length === 0) return null;

  const workingAgents = displayAgents.filter(a => a.status === 'thinking');
  const leisureAgents = displayAgents.filter(a => a.status !== 'thinking');

  // Dynamic Leisure States
  const [leisureStates, setLeisureStates] = React.useState<Record<string, {
    type: 'game' | 'gym' | 'sleep';
    seconds: number;
  }>>({});

  // Shout system: track active shout per agent
  const [shouts, setShouts] = React.useState<Record<string, string | null>>({});

  // Initialize and synchronize leisure states
  React.useEffect(() => {
    setLeisureStates(prev => {
      const next = { ...prev };
      let changed = false;
      const activities: ('game' | 'gym' | 'sleep')[] = ['game', 'gym', 'sleep'];

      leisureAgents.forEach((agent, index) => {
        if (!next[agent.id]) {
          next[agent.id] = {
            type: activities[index % activities.length],
            seconds: 0
          };
          changed = true;
        }
      });

      Object.keys(next).forEach(id => {
        if (!leisureAgents.some(a => a.id === id)) {
          delete next[id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [leisureAgents]);

  // Interval to increment timer, switch activities, and trigger shouts
  React.useEffect(() => {
    const timer = setInterval(() => {
      setLeisureStates(prev => {
        const next = { ...prev };
        let changed = false;
        const activities: ('game' | 'gym' | 'sleep')[] = ['game', 'gym', 'sleep'];

        Object.keys(next).forEach(id => {
          const state = next[id];
          const newSeconds = state.seconds + 1;

          const threshold = 12;

          if (newSeconds >= threshold) {
            const remaining = activities.filter(t => t !== state.type);
            const newType = remaining[Math.floor(Math.random() * remaining.length)];
            next[id] = {
              type: newType,
              seconds: 0
            };
          } else {
            next[id] = {
              ...state,
              seconds: newSeconds
            };
          }
          changed = true;
        });

        return changed ? next : prev;
      });

      // Random shouts for leisure agents
      setShouts(prev => {
        const next = { ...prev };
        let changed = false;

        leisureAgents.forEach(agent => {
          const state = leisureStates[agent.id];
          if (!state) return;

          // 8% chance per second to shout (~12s interval)
          if (Math.random() < 0.08) {
            const shoutsList = state.type === 'gym' ? GYM_SHOUTS : GAME_SHOUTS;
            const shout = shoutsList[Math.floor(Math.random() * shoutsList.length)];
            if (next[agent.id] !== shout) {
              next[agent.id] = shout;
              changed = true;
            }
          }
        });

        // Clear shouts after 3 seconds
        Object.keys(next).forEach(id => {
          if (next[id]) {
            // Existing shout - clear it after timeout
            // We handle this with a separate interval below
          }
        });

        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [leisureAgents, leisureStates]);

  // Separate interval to clear shouts after 5 seconds
  React.useEffect(() => {
    const timer = setInterval(() => {
      setShouts(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(id => {
          if (next[id] !== null && Math.random() < 0.20) {
            // ~20% chance per second to clear (average 5s duration)
            next[id] = null;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Set up workstation slots matching the active agent count
  const totalDesks = displayAgents.length;
  const deskAssignments: (Agent | null)[] = Array(totalDesks).fill(null);

  workingAgents.forEach((agent, index) => {
    if (index < totalDesks) {
      deskAssignments[index] = agent;
    }
  });

  /** 共享的 CSS keyframes */
  const officeStyles = (
    <style>{`
      @keyframes office-typing {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        25% { transform: translateY(-2px) rotate(-5deg); }
        75% { transform: translateY(-1.5px) rotate(5deg); }
      }
      @keyframes office-glow {
        0%, 100% { box-shadow: 0 0 4px rgba(99, 102, 241, 0.15); }
        50% { box-shadow: 0 0 10px rgba(99, 102, 241, 0.5); }
      }
      @keyframes office-jog {
        0%, 100% { transform: translateY(0) scaleY(1); }
        40% { transform: translateY(-4px) scaleY(0.92); }
        80% { transform: translateY(0.5px) scaleY(1.02); }
      }
      @keyframes office-game {
        0%, 100% { transform: rotate(-8deg) translateY(0); }
        50% { transform: rotate(8deg) translateY(-2px) scale(1.04); }
      }
      @keyframes office-zzz {
        0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
        40% { opacity: 0.85; }
        100% { transform: translate(8px, -18px) scale(1.3); opacity: 0; }
      }
      @keyframes office-shake {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-15deg) scale(1.2); }
        50% { transform: rotate(15deg) scale(1.3); }
        75% { transform: rotate(-10deg) scale(1.1); }
      }
      @keyframes office-bounce {
        0%, 100% { transform: translateY(0) scale(1); }
        25% { transform: translateY(-3px) scale(1.2) rotate(-10deg); }
        50% { transform: translateY(0) scale(1.3) rotate(10deg); }
        75% { transform: translateY(-2px) scale(1.1) rotate(-5deg); }
      }
      @keyframes shout-in {
        0% { opacity: 0; transform: translate(-50%, 4px) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, 0) scale(1.05); }
        40% { transform: translate(-50%, 0) scale(1); }
      }
      .animate-office-typing { animation: office-typing 0.28s infinite ease-in-out; }
      .animate-office-glow { animation: office-glow 2.5s infinite ease-in-out; }
      .animate-office-jog { animation: office-jog 0.38s infinite ease-in-out; }
      .animate-office-game { animation: office-game 0.55s infinite ease-in-out; }
      .animate-office-zzz { animation: office-zzz 1.8s infinite ease-in-out; }
      .animate-office-shake { animation: office-shake 0.5s infinite ease-in-out; }
      .animate-office-bounce { animation: office-bounce 0.6s infinite ease-in-out; }
      .animate-shout-in { animation: shout-in 0.3s ease-out forwards; }

      @keyframes treadmill-belt {
        0% { transform: translateX(0); }
        100% { transform: translateX(-16px); }
      }
      .animate-treadmill-belt { animation: treadmill-belt 0.4s infinite linear; width: 200%; }

      /* V2 keyframes */
      @keyframes v2-typing {
        0% { transform: rotate(-55deg) translateY(-0.5px); }
        100% { transform: rotate(-65deg) translateY(0.5px); }
      }
      @keyframes v2-typing-alt {
        0% { transform: rotate(-80deg) translateY(0.5px); }
        100% { transform: rotate(-70deg) translateY(-0.5px); }
      }
      @keyframes v2-gaming {
        0% { transform: rotate(-40deg); }
        100% { transform: rotate(-50deg); }
      }
      @keyframes v2-gaming-alt {
        0% { transform: rotate(-50deg); }
        100% { transform: rotate(-40deg); }
      }
      @keyframes v2-running-arm {
        0%, 100% { transform: rotate(-50deg); }
        50% { transform: rotate(40deg); }
      }
      @keyframes v2-running-arm-alt {
        0%, 100% { transform: rotate(40deg); }
        50% { transform: rotate(-50deg); }
      }
      @keyframes v2-running-leg {
        0%, 100% { transform: rotate(-45deg); }
        50% { transform: rotate(35deg); }
      }
      @keyframes v2-running-leg-alt {
        0%, 100% { transform: rotate(35deg); }
        50% { transform: rotate(-45deg); }
      }
      @keyframes v2-breathing {
        0%, 100% { transform: translate(4px, 10px) rotate(-90deg) scaleX(1); }
        50% { transform: translate(4px, 10px) rotate(-90deg) scaleX(1.05); }
      }
    `}</style>
  );

  const handleToggle = () => {
    const next = isCollapsed ? 'expanded' : 'collapsed';
    onToggle?.(next);
  };

  if (isCollapsed) {
    const workingCollapsed = displayAgents.filter(a => a.status === 'thinking');
    const leisureCollapsed = displayAgents.filter(a => a.status !== 'thinking');
    const renderAgentCard = (agent: Agent) => {
      const isWorking = agent.status === 'thinking';
      const leisureState = leisureStates[agent.id];
      const activityType = isWorking ? 'work' : (leisureState?.type || 'game');
      const activityLabel = isWorking
        ? '处理中'
        : leisureState?.type === 'gym'
          ? '状态热身'
          : leisureState?.type === 'sleep'
            ? '低功耗待机'
            : '待命巡检';
      const seconds = isWorking ? 0 : (leisureState?.seconds || 0);
      return (
        <div key={agent.id} className="inline-flex items-center gap-1 pl-1 pr-2 py-1 rounded-lg bg-white/85 dark:bg-slate-950/45 border border-slate-200/80 dark:border-slate-800/80 group relative" style={{ overflow: 'visible' }}>
          <div className="flex-shrink-0">
            {styleMode === 'emoji' ? (
              <HorseAgent agent={agent} activityType={activityType} showNameBadge={false} toolCallStatus={agentToolCallStatus[agent.id]} shout={shouts[agent.id]} />
            ) : (
              <HorseAgentV2 agent={agent} activityType={activityType} toolCallStatus={agentToolCallStatus[agent.id]} shout={shouts[agent.id]} />
            )}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-300">{agent.name}</span>
            <div className="flex items-center gap-1">
              <span className={`text-[7px] font-medium ${isWorking ? 'text-indigo-500' : 'text-emerald-500'}`}>{activityLabel}</span>
              {isWorking ? (
                <span className="text-[7px] text-indigo-400/70 font-mono">—</span>
              ) : (
                <span className="text-[7px] text-slate-400 font-mono">{seconds}s</span>
              )}
            </div>
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mt-[-4px] hidden group-hover:flex z-[9999] bg-slate-900 text-white text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
            {agent.name}: {isWorking ? '正在处理当前任务' : `当前${activityLabel}`}
          </div>
        </div>
      );
    };
    return (
      <div className="w-full px-4 py-3 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200/70 dark:border-slate-800/70 select-none">
        {officeStyles}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handleToggle}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
            title="展开办公室"
          >
            <Monitor className="w-3.5 h-3.5" />
            智能体办公室
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-stretch gap-3">
          <div className="flex-1 min-w-0">
            {workingCollapsed.length > 0 && (
              <div className="text-[8px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                工作中
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {workingCollapsed.map(renderAgentCard)}
            </div>
          </div>
          {workingCollapsed.length > 0 && leisureCollapsed.length > 0 && (
            <div className="w-px bg-slate-200 dark:bg-slate-700/50 self-stretch flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {leisureCollapsed.length > 0 && (
              <div className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                待命中
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {leisureCollapsed.map(renderAgentCard)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-white/90 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.22)] mb-3 select-none animate-slide-down overflow-hidden relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-indigo-50/80 via-cyan-50/30 to-transparent dark:from-indigo-950/30 dark:via-cyan-950/10" />
      {officeStyles}

      {/* Header Info */}
      <div className="relative flex items-center justify-between mb-4 pb-3 border-b border-slate-200/70 dark:border-slate-800/70">
        <div className="min-w-0 flex items-center gap-3">
          <button
            onClick={handleToggle}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
            title="收起办公室"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div>
            <h3 className="text-sm font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-2 font-sans tracking-tight">
              <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Monitor className="w-3.5 h-3.5" />
              </span>
              智能体办公室
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-450 mt-1">
              实时查看当前会话成员的工作、等待和休息状态
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-semibold">
            <span className="px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/35 text-indigo-650 dark:text-indigo-350 border border-indigo-100 dark:border-indigo-900/45">
              工作 {workingAgents.length}
            </span>
            <span className="px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-650 dark:text-emerald-350 border border-emerald-100 dark:border-emerald-900/45">
              待命 {leisureAgents.length}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
              title="隐藏办公室"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Working & Leisure Panels */}
      <div className="relative flex flex-col gap-4">
        {/* 1. Working Area (Desks) */}
        <div>
          <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-2 select-none flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
            开发工作区
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
            {deskAssignments.map((assignedAgent, deskIndex) => (
              <div
                key={deskIndex}
                className={`relative flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  assignedAgent
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/10 border-indigo-200 dark:border-indigo-900/40 animate-office-glow'
                    : 'bg-slate-100/30 dark:bg-slate-950/20 border-slate-200/50 dark:border-slate-800/30 border-dashed'
                }`}
              >
                <span className="absolute top-1.5 left-2 text-[8px] font-semibold text-slate-400 select-none">
                  #{deskIndex + 1}
                </span>

                {assignedAgent ? (
                  <div className="flex flex-col items-center gap-1.5 mt-2">
                    <div className="relative group">
                      {styleMode === 'emoji' ? (
                        <HorseAgent agent={assignedAgent} activityType="work" toolCallStatus={agentToolCallStatus[assignedAgent.id]} shout={shouts[assignedAgent.id]} />
                      ) : (
                        <HorseAgentV2 agent={assignedAgent} activityType="work" toolCallStatus={agentToolCallStatus[assignedAgent.id]} shout={shouts[assignedAgent.id]} />
                      )}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                        {assignedAgent.name}: 正在处理当前任务
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[8px] font-semibold text-indigo-600 dark:text-indigo-400 font-sans px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                      <Laptop className="w-2.5 h-2.5 text-indigo-500 animate-pulse" />
                      处理中
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-2 text-slate-400">
                    <Laptop className="w-5 h-5 opacity-20" />
                    <span className="text-[7.5px] mt-1 text-slate-400/60 dark:text-slate-500/60 font-medium">空闲工位</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 2. Leisure Area (Lounge) */}
        <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-3">
          <div className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            待命与休息区
          </div>

          {leisureAgents.length === 0 ? (
            <p className="text-[9px] text-slate-400 dark:text-slate-550 text-center py-2 italic font-medium">
              所有智能体都在工作区处理任务
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {leisureAgents.map((agent) => {
                const state = leisureStates[agent.id] || { type: 'game', seconds: 0 };
                const activityMap = {
                  game: { type: 'game' as const, label: '待命巡检', icon: Gamepad2, color: 'text-pink-500 bg-pink-50 dark:bg-pink-950/20' },
                  gym: { type: 'gym' as const, label: '状态热身', icon: Dumbbell, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20' },
                  sleep: { type: 'sleep' as const, label: '低功耗待机', icon: BedDouble, color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/20' },
                };
                const activity = activityMap[state.type];
                const ActivityIcon = activity.icon;

                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 p-2 bg-white/85 dark:bg-slate-950/45 border border-slate-200/80 dark:border-slate-850 rounded-xl shadow-sm group relative hover:-translate-y-0.5 hover:shadow-md transition-all"
                  >
                    <div className="relative">
                      {styleMode === 'emoji' ? (
                        <HorseAgent agent={agent} activityType={activity.type} shout={shouts[agent.id]} />
                      ) : (
                        <HorseAgentV2 agent={agent} activityType={activity.type} shout={shouts[agent.id]} />
                      )}
                    </div>

                    <div className="flex flex-col pr-1 justify-center">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1.5 ${activity.color}`}>
                        <ActivityIcon className="w-2.5 h-2.5" />
                        <span>{activity.label}</span>
                        <span className="text-[7px] opacity-75 font-mono bg-white/50 dark:bg-black/25 px-1 rounded-sm">{state.seconds}s</span>
                      </span>
                    </div>

                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                      {agent.name} 当前{activity.label}，已持续 {state.seconds} 秒
                      {shouts[agent.id] && <> — 💬 {shouts[agent.id]}</>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
