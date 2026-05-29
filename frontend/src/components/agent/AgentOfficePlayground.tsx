import React from 'react';
import { Agent } from '@/types';
import { Laptop, Gamepad2, Dumbbell, BedDouble, Monitor, X } from 'lucide-react';

interface AgentOfficePlaygroundProps {
  agents: Agent[];
  agentIds?: string[]; // Allowed agent IDs for the current conversation
  onClose?: () => void;
}

// Horse-headed Man (马头人) character component
const HorseAgent: React.FC<{ agent: Agent; activityType: 'work' | 'game' | 'gym' | 'sleep' }> = ({ agent, activityType }) => {
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
      <span className="text-[8px] font-bold bg-slate-900/80 dark:bg-slate-950/80 text-white px-1.5 py-0.2 rounded-sm mb-1 max-w-[65px] truncate shadow-sm">
        {agent.name}
      </span>

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
      </div>
    </div>
  );
};

// V2: Realistic Dynamic Horse Agent component with realistic joint transitions
const HorseAgentV2: React.FC<{ agent: Agent; activityType: 'work' | 'game' | 'gym' | 'sleep' }> = ({ agent, activityType }) => {
  return (
    <div className="flex flex-col items-center relative group select-none">
      {/* Name Badge */}
      <span className="text-[8px] font-bold bg-slate-900/80 dark:bg-slate-950/80 text-white px-1.5 py-0.2 rounded-sm mb-1 max-w-[65px] truncate shadow-sm">
        {agent.name}
      </span>

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
            {/* Outfits details depending on activity */}
            {activityType === 'work' && <div className="w-1 h-4 bg-blue-500 rounded-sm mt-0.5 border-t border-blue-400"></div>}
            {activityType === 'gym' && <div className="w-3 h-5 bg-rose-500/80 rounded-sm border border-rose-400 flex items-center justify-center text-[5px] font-bold text-white font-mono scale-90">🏃</div>}
            {activityType === 'game' && <div className="w-2.5 h-4.5 bg-emerald-500/80 rounded-sm flex items-center justify-center text-[5px] text-emerald-100 font-bold border border-emerald-400">🎮</div>}
          </div>

          {/* Left Arm (arm-left) */}
          <div className="arm-left bg-slate-550 dark:bg-slate-450 rounded-full"></div>

          {/* Right Arm (arm-right) */}
          <div className="arm-right bg-slate-550 dark:bg-slate-450 rounded-full"></div>

          {/* Left Leg (leg-left) */}
          <div className="leg-left bg-slate-800 dark:bg-slate-700 rounded-full"></div>

          {/* Right Leg (leg-right) */}
          <div className="leg-right bg-slate-800 dark:bg-slate-700 rounded-full"></div>
        </div>

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

export const AgentOfficePlayground: React.FC<AgentOfficePlaygroundProps> = ({ agents, agentIds, onClose }) => {
  // Toggle between classic emoji and realistic dynamic styles
  const [styleMode, setStyleMode] = React.useState<'emoji' | 'dynamic'>('dynamic');

  // Filter agents by the active conversation's assigned agents
  const displayAgents = agentIds && agentIds.length > 0
    ? agents.filter(a => agentIds.includes(a.id))
    : agents.filter(a => a.enabled); // Fallback to all enabled agents if none provided

  if (displayAgents.length === 0) return null;

  // Determine who is working and who is at leisure
  const workingAgents = displayAgents.filter(a => a.status === 'thinking');
  const leisureAgents = displayAgents.filter(a => a.status !== 'thinking');

  // Set up workstation slots matching the active agent count
  const totalDesks = displayAgents.length;
  const deskAssignments: (Agent | null)[] = Array(totalDesks).fill(null);

  // Assign working agents to desks
  workingAgents.forEach((agent, index) => {
    if (index < totalDesks) {
      deskAssignments[index] = agent;
    }
  });

  // Assign leisure activity to idle agents based on their index
  const getLeisureActivity = (index: number) => {
    const activities = [
      { type: 'game' as const, label: '打游戏', icon: Gamepad2, color: 'text-pink-500 bg-pink-50 dark:bg-pink-950/20' },
      { type: 'gym' as const, label: '在健身', icon: Dumbbell, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20' },
      { type: 'sleep' as const, label: '睡觉中', icon: BedDouble, color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/20' },
    ];
    return activities[index % activities.length];
  };

  return (
    <div className="w-full p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm mb-4 select-none animate-slide-down">
      {/* Self-contained CSS Keyframes for Animations */}
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
        .animate-office-typing {
          animation: office-typing 0.28s infinite ease-in-out;
        }
        .animate-office-glow {
          animation: office-glow 2.5s infinite ease-in-out;
        }
        .animate-office-jog {
          animation: office-jog 0.38s infinite ease-in-out;
        }
        .animate-office-game {
          animation: office-game 0.55s infinite ease-in-out;
        }
        .animate-office-zzz {
          animation: office-zzz 1.8s infinite ease-in-out;
        }

        /* V2 Realistic Character Posturing styles */
        .v2-character {
          width: 64px;
          height: 80px;
          position: relative;
        }
        .v2-character * {
          transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* State Positions Default (Constant Attachments) */
        .v2-character .head-joint {
          left: 18px;
          top: 6px;
          width: 28px;
          height: 28px;
          transform-origin: center bottom;
          position: absolute;
          z-index: 15;
        }
        .v2-character .torso-joint {
          left: 24px;
          top: 32px;
          width: 16px;
          height: 28px;
          transform-origin: center top;
          position: absolute;
          z-index: 10;
        }
        .v2-character .arm-left {
          left: 22px;
          top: 34px;
          width: 4px;
          height: 22px;
          transform-origin: center 2px;
          position: absolute;
          z-index: 5;
        }
        .v2-character .arm-right {
          left: 38px;
          top: 34px;
          width: 4px;
          height: 22px;
          transform-origin: center 2px;
          position: absolute;
          z-index: 12;
        }
        .v2-character .leg-left {
          left: 25px;
          top: 56px;
          width: 4px;
          height: 24px;
          transform-origin: center 2px;
          position: absolute;
          z-index: 8;
        }
        .v2-character .leg-right {
          left: 35px;
          top: 56px;
          width: 4px;
          height: 24px;
          transform-origin: center 2px;
          position: absolute;
          z-index: 8;
        }

        /* 1. Work State Posture */
        .v2-character.work {
          transform: translate(-2px, 2px);
        }
        .v2-character.work .head-joint {
          transform: rotate(6deg) translate(0.5px, 0.5px);
        }
        .v2-character.work .torso-joint {
          transform: rotate(8deg);
          background-color: #3b82f6; /* Corporate suit blue */
        }
        .v2-character.work .arm-left {
          transform: rotate(-60deg);
          animation: v2-typing 0.12s infinite alternate ease-in-out;
        }
        .v2-character.work .arm-right {
          transform: rotate(-75deg);
          animation: v2-typing-alt 0.12s infinite alternate ease-in-out;
        }
        .v2-character.work .leg-left {
          transform: rotate(75deg) translate(2px, -3px);
        }
        .v2-character.work .leg-right {
          transform: rotate(80deg) translate(2px, -3px);
        }

        /* 2. Gym State Posture */
        .v2-character.gym {
          transform: translate(-4px, -1px);
        }
        .v2-character.gym .head-joint {
          transform: rotate(8deg);
        }
        .v2-character.gym .torso-joint {
          transform: rotate(12deg);
        }
        .v2-character.gym .arm-left {
          animation: v2-running-arm 0.38s infinite linear;
        }
        .v2-character.gym .arm-right {
          animation: v2-running-arm-alt 0.38s infinite linear;
        }
        .v2-character.gym .leg-left {
          animation: v2-running-leg 0.38s infinite linear;
        }
        .v2-character.gym .leg-right {
          animation: v2-running-leg-alt 0.38s infinite linear;
        }

        /* 3. Game State Posture */
        .v2-character.game {
          transform: translate(0px, 2px);
        }
        .v2-character.game .head-joint {
          transform: rotate(3deg);
        }
        .v2-character.game .torso-joint {
          transform: rotate(-4deg);
        }
        .v2-character.game .arm-left {
          transform: rotate(-45deg);
          animation: v2-gaming 0.2s infinite alternate ease-in-out;
        }
        .v2-character.game .arm-right {
          transform: rotate(-50deg);
          animation: v2-gaming-alt 0.2s infinite alternate ease-in-out;
        }
        .v2-character.game .leg-left {
          transform: rotate(75deg) translate(1px, -2px);
        }
        .v2-character.game .leg-right {
          transform: rotate(75deg) translate(1px, -2px);
        }

        /* 4. Sleep State Posture */
        .v2-character.sleep {
          transform: translate(4px, 10px) rotate(-90deg);
          animation: v2-breathing 2s infinite ease-in-out;
        }
        .v2-character.sleep .head-joint {
          transform: rotate(-4deg);
        }
        .v2-character.sleep .torso-joint {
          background-color: #6366f1;
        }
        .v2-character.sleep .arm-left {
          transform: rotate(5deg);
        }
        .v2-character.sleep .arm-right {
          transform: rotate(-5deg);
        }
        .v2-character.sleep .leg-left {
          transform: rotate(2deg);
        }
        .v2-character.sleep .leg-right {
          transform: rotate(-2deg);
        }

        /* V2 keyframes animations */
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
        @keyframes treadmill-belt {
          0% { transform: translateX(0); }
          100% { transform: translateX(-16px); }
        }
        .animate-treadmill-belt {
          animation: treadmill-belt 0.4s infinite linear;
          width: 200%;
        }
      `}</style>

      {/* Header Info */}
      <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 font-sans">
          <Monitor className="w-3.5 h-3.5 text-indigo-500" />
          会话智能体办公室 (Horse-head Office)
        </h3>
        <div className="flex items-center gap-2">
          {/* Style Mode Selector Switch */}
          <div className="flex bg-slate-200 dark:bg-slate-800 p-0.5 rounded-lg text-[9px] font-bold select-none border border-slate-300/40 dark:border-slate-700/40 mr-1 shadow-xs">
            <button
              onClick={() => setStyleMode('emoji')}
              className={`px-1.5 py-0.5 rounded-md transition-all ${
                styleMode === 'emoji' 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
              }`}
            >
              经典Emoji
            </button>
            <button
              onClick={() => setStyleMode('dynamic')}
              className={`px-1.5 py-0.5 rounded-md transition-all ${
                styleMode === 'dynamic' 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
              }`}
            >
              拟真动态
            </button>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-550 mr-1">
            工作中: {workingAgents.length} | 休息中: {leisureAgents.length}
          </span>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
              title="隐藏办公室"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Working & Leisure Panels */}
      <div className="flex flex-col gap-4">
        {/* 1. Working Area (Desks) */}
        <div>
          <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-2 select-none flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
            开发工作区 (Horse-head Workstations)
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {deskAssignments.map((assignedAgent, deskIndex) => (
              <div 
                key={deskIndex}
                className={`relative flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                  assignedAgent 
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/10 border-indigo-200 dark:border-indigo-900/40 animate-office-glow' 
                    : 'bg-slate-100/30 dark:bg-slate-950/20 border-slate-200/50 dark:border-slate-800/30 border-dashed'
                }`}
              >
                {/* Desk Label */}
                <span className="absolute top-1.5 left-2 text-[8px] font-semibold text-slate-400 select-none">
                  #{deskIndex + 1}
                </span>

                {assignedAgent ? (
                  <div className="flex flex-col items-center gap-1.5 mt-2">
                    {/* Horse-headed Man with Dynamic/Emoji postures */}
                    <div className="relative group">
                      {styleMode === 'emoji' ? (
                        <HorseAgent agent={assignedAgent} activityType="work" />
                      ) : (
                        <HorseAgentV2 agent={assignedAgent} activityType="work" />
                      )}
                      
                      {/* Interactive hover tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                        {assignedAgent.name}: 正在疯狂敲键盘开发中...
                      </div>
                    </div>
                    {/* Laptop Screen Indicator */}
                    <div className="flex items-center gap-1 text-[8px] font-medium text-indigo-600 dark:text-indigo-400 font-sans">
                      <Laptop className="w-2.5 h-2.5 text-indigo-500 animate-pulse" />
                      Coding...
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
            员工休闲区 (Horse-head Lounge)
          </div>
          
          {leisureAgents.length === 0 ? (
            <p className="text-[9px] text-slate-400 dark:text-slate-550 text-center py-2 italic font-medium">
              所有的 Agent 马头人都在工位上勤劳工作呢！
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {leisureAgents.map((agent, index) => {
                const activity = getLeisureActivity(index);
                const ActivityIcon = activity.icon;

                return (
                  <div 
                    key={agent.id}
                    className="flex items-center gap-2 p-2 bg-white dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-850 rounded-xl shadow-xs group relative"
                  >
                    {/* Horse-headed Man with specific leisure activity */}
                    <div className="relative">
                      {styleMode === 'emoji' ? (
                        <HorseAgent agent={agent} activityType={activity.type} />
                      ) : (
                        <HorseAgentV2 agent={agent} activityType={activity.type} />
                      )}
                    </div>

                    <div className="flex flex-col pr-1 justify-center">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${activity.color}`}>
                        <ActivityIcon className="w-2.5 h-2.5" />
                        {activity.label}
                      </span>
                    </div>

                    {/* Interactive hover status balloon */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                      {agent.name} {activity.label === '睡觉中' ? '正在呼呼大睡 💤' : activity.label === '在健身' ? '在跑跑步机锻炼 🏃‍♂️' : '正在玩复古街机 🎮'}
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
