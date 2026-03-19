'use client';

import { ReactNode } from 'react';

type SectionCardProps = {
  children: ReactNode;
  className?: string;
};

export function SectionCard({ children, className = '' }: SectionCardProps) {
  return (
    <section
      className={`overflow-hidden rounded-[30px] border border-stroke-default/90 bg-bg-surface/95 p-5 shadow-[0_22px_56px_-34px_rgba(0,0,0,0.34)] backdrop-blur-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
