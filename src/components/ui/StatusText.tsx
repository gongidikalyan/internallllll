interface StatusTextProps {
  tone: 'nominal' | 'warning' | 'critical' | 'neutral';
  label: string;
}

const TONE_CLASSES: Record<StatusTextProps['tone'], string> = {
  nominal: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-red-700 dark:text-red-400',
  neutral: 'text-slate-600 dark:text-slate-400',
};

export function StatusText({ tone, label }: StatusTextProps) {
  return (
    <span className={`inline-block text-xs font-medium tracking-tight whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
