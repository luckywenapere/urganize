'use client';

type ProgressBarProps = {
  value: number;
};

export function ProgressBar({ value }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="h-3 overflow-hidden rounded-full bg-bg-overlay">
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${clamped}%` }} />
    </div>
  );
}
