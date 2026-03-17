'use client';

type StatusBadgeProps = {
  label: string;
  tone?: 'neutral' | 'warning' | 'success';
  size?: 'sm' | 'md';
  className?: string;
};

export function StatusBadge({ label, tone = 'neutral', size = 'md', className = '' }: StatusBadgeProps) {
  const toneClass =
    tone === 'success'
      ? 'border-status-success/30 bg-status-success/10 text-status-success'
      : tone === 'warning'
        ? 'border-status-warning/30 bg-status-warning/10 text-status-warning'
        : 'border-stroke-default bg-bg-elevated text-content-secondary';
  const sizeClass =
    size === 'sm'
      ? 'px-2.5 py-1 text-[11px] tracking-[0.1em]'
      : 'px-3 py-1.5 text-xs tracking-[0.12em]';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase ${sizeClass} ${toneClass} ${className}`}
    >
      {label}
    </span>
  );
}
