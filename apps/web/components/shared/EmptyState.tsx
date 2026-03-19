'use client';

import { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary ${className}`}
    >
      <p className="font-semibold text-content-primary">{title}</p>
      <p className="mt-2 max-w-[38rem] leading-6">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
