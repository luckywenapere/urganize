'use client';

import { type ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-shell relative text-sm text-content-secondary ${className}`}>
      {/* Kuba glyph (NEXT_PUBLIC_FEATURE_TEXTILE) — concentric hand-drawn
          squares behind the copy, so a panel with nothing in it still reads as
          a made surface rather than a gap. Inert with the flag off. */}
      <div className="urg-glyph-kuba" aria-hidden="true" />
      <p className="urg-above text-lg font-semibold text-content-primary">{title}</p>
      {description ? (
        <p className="urg-above mx-auto mt-3 max-w-[34rem] text-sm leading-6 sm:leading-7">
          {description}
        </p>
      ) : null}
      {action ? <div className="urg-above mt-5">{action}</div> : null}
    </div>
  );
}
