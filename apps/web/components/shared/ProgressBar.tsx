'use client';

type ProgressBarProps = {
  value: number;
  className?: string;
  fillClassName?: string;
};

export function ProgressBar({ value, className = '', fillClassName = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={`h-3 overflow-hidden rounded-full bg-bg-overlay ${className}`}>
      <div
        className={`h-full rounded-full bg-brand transition-[width] duration-300 ${fillClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
