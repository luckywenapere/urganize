'use client';

import { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-[24px] border border-dashed border-stroke-default bg-bg-elevated/70 px-5 py-8 text-sm text-content-secondary">
      <p className="font-medium text-content-primary">{title}</p>
      <p className="mt-2">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
