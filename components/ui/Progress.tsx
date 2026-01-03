'use client';

import React from 'react';
import { clsx } from 'clsx';

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  size = 'md',
  showLabel = false,
  label,
  animated = true,
  className,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={clsx('w-full', className)}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-content-secondary">{label || 'Progress'}</span>
          <span className="text-sm font-semibold text-content-primary tabular-nums">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      
      <div className={clsx(
        'progress-bar',
        {
          'h-1': size === 'sm',
          'h-1.5': size === 'md',
          'h-2': size === 'lg',
        }
      )}>
        <div
          className={clsx(
            'progress-bar-fill',
            animated && 'animate'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// Circular Progress
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
  size = 40,
  strokeWidth = 3,
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
          className="text-bg-overlay"
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
          className="text-brand transition-all duration-slower ease-out"
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-bold text-content-primary tabular-nums">
          {Math.round(percentage)}
        </span>
      )}
    </div>
  );
};

// Health Score (combined display)
interface HealthScoreProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const HealthScore: React.FC<HealthScoreProps> = ({ 
  score, 
  label = 'Release Health',
  size = 'md' 
}) => {
  const getColor = () => {
    if (score >= 80) return 'text-brand';
    if (score >= 50) return 'text-status-warning';
    return 'text-status-error';
  };

  return (
    <div className="flex items-center gap-4">
      <CircularProgress 
        value={score} 
        size={size === 'sm' ? 36 : size === 'lg' ? 56 : 44}
        strokeWidth={size === 'sm' ? 2 : size === 'lg' ? 4 : 3}
      />
      <div>
        <div className={clsx('text-2xl font-bold tabular-nums', getColor())}>
          {score}%
        </div>
        <div className="text-sm text-content-tertiary">{label}</div>
      </div>
    </div>
  );
};
