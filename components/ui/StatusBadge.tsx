import React from 'react';
import { clsx } from 'clsx';
import type { ReleaseStatus, TaskStatus } from '@/types';

interface StatusBadgeProps {
  status: ReleaseStatus | TaskStatus;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  size = 'md',
  showDot = true 
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
      case 'released':
        return {
          label: status === 'completed' ? 'Completed' : 'Released',
          className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          dotColor: 'bg-cyan-400',
        };
      case 'ready':
        return {
          label: 'Ready',
          className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotColor: 'bg-emerald-400',
        };
      case 'in-progress':
        return {
          label: 'In Progress',
          className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          dotColor: 'bg-amber-400',
        };
      case 'pending':
      case 'draft':
      default:
        return {
          label: status === 'pending' ? 'Pending' : 'Draft',
          className: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
          dotColor: 'bg-slate-400',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        config.className,
        {
          'px-2 py-0.5 text-[10px]': size === 'sm',
          'px-2.5 py-1 text-xs': size === 'md',
          'px-3 py-1.5 text-sm': size === 'lg',
        }
      )}
    >
      {showDot && (
        <span className={clsx('rounded-full', config.dotColor, {
          'w-1 h-1': size === 'sm',
          'w-1.5 h-1.5': size === 'md',
          'w-2 h-2': size === 'lg',
        })} />
      )}
      {config.label}
    </span>
  );
};

// Role Badge (Manager, Artist, etc.)
interface RoleBadgeProps {
  role: 'manager' | 'artist' | 'artist-manager';
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'md' }) => {
  const getConfig = () => {
    switch (role) {
      case 'manager':
      case 'artist-manager':
        return {
          label: 'Manager',
          className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        };
      case 'artist':
        return {
          label: 'Artist',
          className: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        };
    }
  };

  const config = getConfig();

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-semibold',
        config.className,
        {
          'px-2 py-0.5 text-[10px]': size === 'sm',
          'px-2.5 py-1 text-xs': size === 'md',
        }
      )}
    >
      {config.label}
    </span>
  );
};
