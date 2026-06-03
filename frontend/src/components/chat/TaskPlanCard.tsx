import React from 'react';
import { ListTodo, Check, Loader2 } from 'lucide-react';

export interface TaskPlanStep {
  agentId: string;
  agentName: string;
  task: string;
  status?: 'pending' | 'running' | 'completed';
}

interface TaskPlanCardProps {
  content: string;
  stepsData?: TaskPlanStep[];
}

const TaskPlanCard: React.FC<TaskPlanCardProps> = ({ content, stepsData }) => {
  const lines = content.split('\n');
  const title = lines[0] && lines[0].includes('任务拆解') ? lines[0] : '任务协同拆解计划';
  const hasStepsData = stepsData && stepsData.length > 0;
  const parsedSteps = lines.filter(line => /^\d+\./.test(line.trim()));

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#e2e8f0] dark:border-slate-800 rounded-xl p-4 my-2.5 w-full shadow-sm max-w-lg transition-colors">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800/80 flex-shrink-0">
        <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <ListTodo className="w-3.5 h-3.5" />
        </div>
        <span className="text-sm font-semibold text-lark-text-primary dark:text-slate-100">{title}</span>
      </div>
      <div className="space-y-3 pl-1">
        {hasStepsData ? (
          stepsData.map((step, idx) => {
            const name = step.agentName || 'Agent';
            const desc = step.task || '';
            const status = step.status || 'pending';

            return (
              <div key={idx} className="flex items-start gap-3 relative group">
                {idx < stepsData.length - 1 && (
                  <div className="absolute left-2.5 top-5 bottom-[-16px] w-[1px] bg-slate-200 dark:bg-slate-800" />
                )}
                <div className="flex-shrink-0 z-10">
                  {status === 'completed' ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : status === 'running' ? (
                    <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-400 dark:border-indigo-600 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0 z-10 font-mono shadow-sm">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="flex-grow pt-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                      status === 'completed'
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-100/10 dark:border-emerald-900/20'
                        : status === 'running'
                          ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-200/30 dark:border-indigo-900/40'
                          : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-100/10 dark:border-indigo-900/20'
                    }`}>
                      {name}
                    </span>
                    {status === 'running' && (
                      <span className="text-[10px] text-indigo-500 dark:text-indigo-400 animate-pulse font-medium">执行中...</span>
                    )}
                  </div>
                  {desc && <p className="text-xs text-lark-text-secondary dark:text-slate-400 leading-relaxed">{desc}</p>}
                </div>
              </div>
            );
          })
        ) : parsedSteps.length > 0 ? (
          parsedSteps.map((step, idx) => {
            const cleanStep = step.replace(/^\d+\.\s*/, '');
            const parts = cleanStep.split(' - ');
            const name = parts[0] || '';
            const desc = parts[1] || '';

            return (
              <div key={idx} className="flex items-start gap-3 relative group">
                {idx < parsedSteps.length - 1 && (
                  <div className="absolute left-2.5 top-5 bottom-[-16px] w-[1px] bg-slate-200 dark:bg-slate-800" />
                )}
                <div className="w-5 h-5 rounded-full border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0 z-10 font-mono shadow-sm">
                  {idx + 1}
                </div>
                <div className="flex-grow pt-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-100/10 dark:border-indigo-900/20">
                      {name}
                    </span>
                  </div>
                  {desc && <p className="text-xs text-lark-text-secondary dark:text-slate-400 leading-relaxed">{desc}</p>}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-lark-text-secondary dark:text-slate-400 whitespace-pre-line">
            {content}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskPlanCard;
