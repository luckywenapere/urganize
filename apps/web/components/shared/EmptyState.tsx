'use client';

import { type ReactNode } from 'react';
import { Chappi, type ChappiPose } from '@urganize/ui';

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * Show the mascot above the copy. Opt-in per call site, deliberately: this
   * component backs eight empty states and two of them can be on screen at
   * once (an account with no releases has an empty releases column AND an
   * empty activity list), so rendering him here unconditionally would put two
   * Chappis on one screen. Pass this only where he is the one.
   */
  mascot?: ChappiPose;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  mascot,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-shell text-sm text-content-secondary ${className}`}>
      {mascot ? (
        <div className="mb-4 flex justify-center">
          <Chappi pose={mascot} size={96} />
        </div>
      ) : null}
      <p className="text-lg font-semibold text-content-primary">{title}</p>
      {description ? (
        <p className="mx-auto mt-3 max-w-[34rem] text-sm leading-6 sm:leading-7">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
