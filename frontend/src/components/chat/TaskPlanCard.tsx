import React from 'react';
import { ListTodo } from 'lucide-react';

interface TaskPlanCardProps {
  content: string;
}

const TaskPlanCard: React.FC<TaskPlanCardProps> = ({ content }) => {
  const lines = content.split('\n');
  const title = lines[0] && lines[0].includes('任务拆解') ? lines[0] : '任务协同拆解计划';
  const steps = lines.filter(line => /^\d+\./.test(line.trim()));

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#e2e8f0] dark:border-slate-800 rounded-xl p-4 my-2.5 w-full shadow-sm max-w-lg transition-colors">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800/80 flex-shrink-0">
        <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <ListTodo className="w-3.5 h-3.5" />
        </div>
        <span className="text-sm font-semibold text-lark-text-primary dark:text-slate-100">{title}</span>
      </div>
      <div className="space-y-3 pl-1">
        {steps.length > 0 ? (
          steps.map((step, idx) => {
            const cleanStep = step.replace(/^\d+\.\s*/, '');
            const parts = cleanStep.split(' - ');
            const name = parts[0] || '';
            const desc = parts[1] || '';

            return (
              <div key={idx} className="flex items-start gap-3 relative group">
                {idx < steps.length - 1 && (
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
