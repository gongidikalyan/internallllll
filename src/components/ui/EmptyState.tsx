import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-12 text-center dark:border-[#1E3252] dark:bg-[#0C1729]">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-[#1E3252] dark:bg-[#13233C] dark:text-slate-300">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
