'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type SectionCardProps = ComponentPropsWithoutRef<'section'> & {
  children: ReactNode;
};

export function SectionCard({ children, className = '', ...props }: SectionCardProps) {
  return (
    <section
      {...props}
      className={`panel-shell overflow-hidden p-5 sm:p-6 lg:p-7 ${className}`}
    >
      {children}
    </section>
  );
}
