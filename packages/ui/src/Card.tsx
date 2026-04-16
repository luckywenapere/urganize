'use client';

import React from 'react';
import { clsx } from 'clsx';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: CardPadding;
  interactive?: boolean;
  glass?: boolean;
  accent?: boolean;
  as?: 'div' | 'section' | 'article';
}

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  children,
  padding = 'md',
  interactive = false,
  glass = false,
  accent = false,
  as = 'div',
  className,
  ...props
}: CardProps) {
  const Component = as;

  return (
    <Component
      className={clsx(
        'card relative overflow-hidden',
        paddingClasses[padding],
        interactive && 'card-interactive hover-lift',
        glass && 'glass',
        accent && 'gradient-border',
        className
      )}
      {...props}
    >
      {accent && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.16),transparent_70%)]"
        />
      )}
      <div className="relative z-[1]">{children}</div>
    </Component>
  );
}

export default Card;
