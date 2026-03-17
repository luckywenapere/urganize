'use client';

import { ReactNode } from 'react';

type SectionCardProps = {
  children: ReactNode;
  className?: string;
};

export function SectionCard({ children, className = '' }: SectionCardProps) {
  return (
    <section
      className={`rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
