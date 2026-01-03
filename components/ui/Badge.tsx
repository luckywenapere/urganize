'use client';

import React from 'react';
import { clsx } from 'clsx';
import type { ReleaseStatus, TaskStatus } from '@/types';

// Status Badge for releases and tasks
interface StatusBadgeProps {
  status: ReleaseStatus | TaskStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = {
    draft: { label: 'Draft', class: 'badge-draft' },
    'in-progress': { label: 'In Progress', class: 'badge-progress' },
    ready: { label: 'Ready', class: 'badge-ready' },
    released: { label: 'Released', class: 'bg-status-info/15 text-blue-400 border border-blue-500/20' },
    pending: { label: 'Pending', class: 'badge-draft' },
    completed: { label: 'Done', class: 'badge-ready' },
  }[status] || { label: status, class: 'badge-draft' };

  return (
    <span className={clsx(
      'badge',
      config.class,
      size === 'sm' && 'text-[10px] px-2 py-0.5'
    )}>
      <span className={clsx(
        'w-1.5 h-1.5 rounded-full',
        {
          'bg-content-tertiary': status === 'draft' || status === 'pending',
          'bg-status-warning': status === 'in-progress',
          'bg-brand': status === 'ready' || status === 'completed',
          'bg-status-info': status === 'released',
        }
      )} />
      {config.label}
    </span>
  );
};

// Role Badge
interface RoleBadgeProps {
  role: 'manager' | 'artist' | 'artist-manager';
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'md' }) => {
  const isManager = role === 'manager' || role === 'artist-manager';
  
  return (
    <span className={clsx(
      'badge',
      isManager ? 'badge-manager' : 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
      size === 'sm' && 'text-[10px] px-2 py-0.5'
    )}>
      {isManager ? 'Manager' : 'Artist'}
    </span>
  );
};

// Phase Badge
interface PhaseBadgeProps {
  phase: 'pre-production' | 'production' | 'promotion' | 'distribution';
  size?: 'sm' | 'md';
}

export const PhaseBadge: React.FC<PhaseBadgeProps> = ({ phase, size = 'md' }) => {
  const config = {
    'pre-production': { label: 'Pre-Production', class: 'bg-phase-preproduction/15 text-purple-400 border-purple-500/20' },
    'production': { label: 'Production', class: 'bg-phase-production/15 text-blue-400 border-blue-500/20' },
    'promotion': { label: 'Promotion', class: 'bg-phase-promotion/15 text-amber-400 border-amber-500/20' },
    'distribution': { label: 'Distribution', class: 'bg-phase-distribution/15 text-emerald-400 border-emerald-500/20' },
  }[phase];

  return (
    <span className={clsx(
      'badge border',
      config.class,
      size === 'sm' && 'text-[10px] px-2 py-0.5'
    )}>
      {config.label}
    </span>
  );
};

// Notification/Count Badge
interface CountBadgeProps {
  count: number;
  variant?: 'default' | 'warning' | 'error';
  className?: string;
}

export const CountBadge: React.FC<CountBadgeProps> = ({ count, variant = 'default', className }) => {
  if (count <= 0) return null;
  
  return (
    <span className={clsx(
      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full',
      {
        'bg-brand text-content-inverse': variant === 'default',
        'bg-status-warning text-content-inverse': variant === 'warning',
        'bg-status-error text-content-primary': variant === 'error',
      },
      className
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
};
