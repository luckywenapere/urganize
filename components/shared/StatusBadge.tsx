'use client';

type StatusBadgeProps = {
  label: string;
  tone?: 'neutral' | 'warning' | 'success';
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const toneClass =
    tone === 'success'
      ? 'border-brand/25 bg-brand-muted text-content-primary'
      : tone === 'warning'
        ? 'border-status-warning/30 bg-status-warning/10 text-content-primary'
        : 'border-stroke-default bg-bg-elevated text-content-secondary';

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneClass}`}>
      {label}
    </span>
  );
}
