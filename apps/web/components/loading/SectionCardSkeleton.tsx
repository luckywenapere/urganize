'use client';

import type { ReactNode } from 'react';

type SectionCardSkeletonProps = {
  children: ReactNode;
  className?: string;
};

export function SectionCardSkeleton({ children, className = '' }: SectionCardSkeletonProps) {
  return (
    <div
      className={`rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
