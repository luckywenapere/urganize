'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Menu, Search } from '@/components/icons';
import { ArtistFace } from '@/components/shared/ArtistFace';
import { rolloutMetaLine } from '@/lib/release-timeline';
import { useRolloutPhoneChrome } from '@/stores/useRolloutPhoneChrome';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';
import { RolloutCoverTile } from './RolloutCoverTile';

/**
 * The phone rollout header (rollout declutter, founder approved Oct 18, 2026:
 * "Do what's best for our users").
 *
 * Before it, an open rollout stacked the Artists / Rollouts tabs, a round back
 * button, a MOTION bar with one count, a phase line with a second count, the
 * distribution card, an always-on search row, and a floating Rollout menu pill
 * over the list. Now it is: a bare back chevron, the artist eyebrow and the
 * serif title, a search icon and a menu icon, and one meta line with the one
 * count left on the page. Scrolled past, a compact bar keeps the way back, the
 * title, the count and the same two icons in reach.
 *
 * Below lg only. The computer's header is WorkspaceDesktopFocused, unchanged.
 */
export function RolloutPhoneHeader({
  releaseId,
  coverUrl,
  onToast,
  artistId,
  artistName,
  title,
  releaseDate,
  done,
  total,
  backLabel,
  onBack,
  showMeta,
  showSearch,
  below,
  cover,
}: {
  releaseId: string;
  /** The cover, for the tile beside the title (Oct 24, 2026). */
  coverUrl: string | null | undefined;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  artistId: string | null | undefined;
  artistName: string | null | undefined;
  title: string;
  releaseDate: string | null | undefined;
  done: number;
  total: number;
  backLabel: string;
  onBack: () => void;
  /** The meta line describes the plan, so it waits while a scene is open. */
  showMeta: boolean;
  /** Only where the plan's search lives behind this icon (the timeline). */
  showSearch: boolean;
  /** The readiness row and banners, which hide with the header in search. */
  below?: ReactNode;
  /** The cover tile left of the title (RolloutCoverTile, Oct 24, 2026). */
  cover?: ReactNode;
}) {
  const searchOpen = useRolloutPhoneChrome((state) => state.searchOpen);
  const setSearchOpen = useRolloutPhoneChrome((state) => state.setSearchOpen);
  const setMenuOpen = useRolloutPhoneChrome((state) => state.setMenuOpen);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const node = headerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [searchOpen]);

  // Search takes the header's place (the approved mock's search state); the
  // timeline draws the field, Filter, Done and the colour key.
  if (searchOpen && showSearch) return null;

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const icons = (tour: boolean) => (
    <div className="flex shrink-0 items-center">
      {showSearch ? (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search activities"
          className="motion-focus motion-press grid h-11 w-11 touch-manipulation place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Rollout menu"
        aria-haspopup="dialog"
        data-tour={tour ? 'rollout-menu' : undefined}
        className="motion-focus motion-press -mr-2 grid h-11 w-11 touch-manipulation place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      <div ref={headerRef} data-rollout-phone-header className="mb-4 flex items-center gap-1">
        {/* Same handler as the desktop arrow, deliberately (see WorkspaceView):
            every complaint about this button so far arrived as a phone
            screenshot, and letting the two diverge is how it drifted before. */}
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="motion-focus motion-press -ml-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
        {/* Cover art is edited here, on the tile, not from the menu (founder
            approved mock, Oct 24, 2026). */}
        <div className="mr-2">
          <RolloutCoverTile releaseId={releaseId} title={title} coverUrl={coverUrl} onToast={onToast} />
        </div>
        {cover ? <div className="mr-2 shrink-0">{cover}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-content-tertiary">
            <ArtistFace artistId={artistId} name={artistName} size={16} />
            <span className="truncate">{artistName || 'Unassigned artist'}</span>
          </p>
          <h2 className="truncate font-display text-[28px] font-semibold leading-tight text-content-primary">{title}</h2>
        </div>
        {icons(true)}
      </div>

      {showMeta ? (
        <div className="mb-4" data-rollout-meta>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-content-secondary">{rolloutMetaLine(releaseDate)}</p>
            {total > 0 ? (
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-content-secondary">
                  {done}/{total}
                  <span className="ml-1 text-content-tertiary">done</span>
                </span>
                <ReleaseDeliveredMark total={total} done={done} />
              </span>
            ) : null}
          </div>
          {/* Not at 0 done (Oct 17, 2026): an empty bar says nothing; it comes
              back with the first tick. Neutral, so Start here stays the one
              accent on screen. */}
          {done > 0 ? (
            <div className="mt-2 h-[3px] rounded-full bg-stroke-strong" aria-hidden="true">
              <div className="h-full rounded-full bg-content-secondary transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {below}

      {scrolledPast ? (
        <div
          data-rollout-phone-compact-header
          className="fixed inset-x-0 top-0 z-30 border-b border-stroke-subtle bg-bg-base/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur lg:hidden"
        >
          <div className="mx-auto flex h-14 w-full items-center gap-1 px-4 sm:px-5 md:px-6">
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="motion-focus motion-press -ml-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <p className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-display text-xl font-semibold text-content-primary">{title}</span>
              {total > 0 ? (
                <span className="shrink-0 font-mono text-xs tabular-nums text-content-tertiary">
                  {done}/{total}
                </span>
              ) : null}
            </p>
            {icons(false)}
          </div>
        </div>
      ) : null}
    </>
  );
}
