'use client';

import { type ReactNode } from 'react';

/** The one action on a preview card: dark pill, bigger tap target on the phone. */
export const EMPTY_STATE_ACTION_CLASS =
  'motion-focus motion-press inline-flex h-11 items-center gap-[7px] rounded-full bg-content-primary px-5 text-[14.5px] font-semibold text-content-inverse hover:opacity-90 sm:h-[38px] sm:px-4 sm:text-[13.5px]';

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /**
   * A static sample of the page when full (#969). Drawn faded behind a raised
   * card that holds the title, the line and the one action, so a first-run
   * page shows where it is going. Fixed example content only, never the
   * team's data; it is hidden from screen readers and takes no clicks. Leave
   * it out for search and filter misses: there the real list is what to fix.
   */
  preview?: ReactNode;
};

export function EmptyState({
  title,
  description,
  action,
  className = '',
  preview,
}: EmptyStateProps) {
  if (preview) {
    return (
      <div className={`relative min-h-[430px] overflow-hidden ${className}`}>
        <div className="empty-preview" aria-hidden="true" inert>
          {preview}
        </div>
        <div className="relative mx-1 mt-16 rounded-[18px] border border-stroke-strong bg-bg-surface px-[18px] pb-[18px] pt-5 text-center shadow-[0_18px_40px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] sm:mx-auto sm:mt-24 sm:max-w-[380px] sm:px-[22px] sm:pb-5 sm:pt-[22px]">
          <h2 className="text-balance font-display text-[21px] font-normal leading-[1.25] text-content-primary">{title}</h2>
          {description ? (
            <p className="mt-2 text-pretty text-[13.5px] leading-normal text-content-secondary">{description}</p>
          ) : null}
          {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
        </div>
      </div>
    );
  }

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
