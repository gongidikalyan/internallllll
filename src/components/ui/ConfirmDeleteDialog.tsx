import { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  isPending = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isPending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-[#1E3252] dark:bg-[#0C1729]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="confirm-delete-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-white"
              >
                {title}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-[#13233C] dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#1E3252]">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="h-9 rounded-md border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-[#1E3252] dark:bg-[#0C1729] dark:text-slate-200 dark:hover:bg-[#13233C]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isPending ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
