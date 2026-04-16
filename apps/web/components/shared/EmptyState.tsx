'use client';

import { type ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-shell text-sm text-content-secondary ${className}`}>
      <p className="text-lg font-semibold text-content-primary">{title}</p>
      <p className="mx-auto mt-3 max-w-[34rem] text-sm leading-6 sm:leading-7">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
