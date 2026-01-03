import React from 'react';
import { clsx } from 'clsx';

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  variant?: 'default' | 'gradient' | 'segmented';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  size = 'md',
  showLabel = false,
  label,
  variant = 'default',
  className,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const getColorByProgress = () => {
    if (percentage >= 80) return 'bg-accent';
    if (percentage >= 50) return 'bg-amber-500';
    return 'bg-accent';
  };

  return (
    <div className={clsx('w-full', className)}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-content-secondary">
            {label || 'Release Health'}
          </span>
          <span className="text-sm font-semibold text-content-primary">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      
      <div
        className={clsx(
          'w-full bg-bg-tertiary rounded-full overflow-hidden',
          {
            'h-1': size === 'sm',
            'h-2': size === 'md',
            'h-3': size === 'lg',
          }
        )}
      >
        {variant === 'gradient' ? (
          <div
            className="h-full rounded-full transition-all duration-700 ease-out progress-bar"
            style={{ width: `${percentage}%` }}
          />
        ) : variant === 'segmented' ? (
          <div className="flex h-full gap-0.5">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className={clsx(
                  'flex-1 rounded-sm transition-all duration-300',
                  i < Math.floor(percentage / 10)
                    ? 'bg-accent'
                    : 'bg-bg-card'
                )}
                style={{ transitionDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        ) : (
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-700 ease-out',
              getColorByProgress()
            )}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
};

// Circular progress for compact displays
interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  max = 100,
  size = 48,
  strokeWidth = 4,
  showLabel = true,
  className,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={clsx('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-bg-tertiary"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-accent transition-all duration-700 ease-out"
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-bold text-content-primary">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
};
