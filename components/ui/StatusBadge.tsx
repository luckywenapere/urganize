import React from 'react';
import { clsx } from 'clsx';
import type { ReleaseStatus, TaskStatus } from '@/types';

interface StatusBadgeProps {
  status: ReleaseStatus | TaskStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'completed':
      case 'released':
      case 'ready':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'in-progress':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'pending':
      case 'draft':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusLabel = () => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium',
        getStatusColor(),
        {
          'text-xs': size === 'sm',
          'text-sm': size === 'md',
        }
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {getStatusLabel()}
    </span>
  );
};
