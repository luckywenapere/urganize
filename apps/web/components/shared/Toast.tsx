'use client';

type ToastProps = {
  message: string;
  tone?: 'success' | 'error' | 'warning';
};

export function Toast({ message, tone = 'success' }: ToastProps) {
  const toneClass =
    tone === 'error'
      ? 'border-status-error/35 bg-status-error/10 text-status-error'
      : tone === 'warning'
        ? 'border-status-warning/35 bg-status-warning/10 text-status-warning'
        : 'border-brand/35 bg-brand-muted text-brand';

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>{message}</div>;
}
