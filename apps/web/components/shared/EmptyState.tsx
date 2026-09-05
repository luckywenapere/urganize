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
    <div className={`empty-shell relative text-sm text-content-secondary ${className}`}>
      {/* Kuba glyph (NEXT_PUBLIC_FEATURE_TEXTILE) — concentric hand-drawn
          squares behind the copy, so a panel with nothing in it still reads as
          a made surface rather than a gap. Only when the mascot is absent: he
          already fills that space, and stacking a woven mark behind him would
          be two focal points in one small panel. Inert with the flag off. */}
      {mascot ? null : <div className="urg-glyph-kuba" aria-hidden="true" />}
      {mascot ? (
        <div className="mb-4 flex justify-center">
          <Chappi pose={mascot} size={96} />
        </div>
      ) : null}
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
