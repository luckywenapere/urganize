'use client';

export function ReadinessBar({ value, label }: { value: number; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value || 0)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-content-secondary">
        <span>{label || 'Readiness'}</span>
        <span className="font-semibold text-content-primary">{safeValue}%</span>
      </div>
      <div className="h-2 rounded-full bg-bg-overlay">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
