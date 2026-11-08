'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, Menu, Search } from '@/components/icons';
import { rolloutMetaLine } from '@/lib/release-timeline';
import { useRolloutPhoneChrome } from '@/stores/useRolloutPhoneChrome';
import { usePlanMenuFold } from '@/stores/usePlanMenuFold';
import { PlanMenuPillDock } from './PlanMenuPill';
import type { PlanView } from '@/lib/plan-view';
import { PlanViewToggle } from './PlanViewToggle';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';

/**
 * The phone rollout header, slim (founder approved mock, Oct 31, 2026: "I
 * prefer the second way of showing it, minimalist").
 *
 * Row 1 sticks under the top bar: back, the title, the one count, then the
 * search (timeline only) and menu icons. Row 2 scrolls away: the artist and
 * the release line, with the List / Timeline switch. The big cover tile, the
 * artist eyebrow, the progress bar and the scrolled compact bar are gone; the
 * cover is edited on the Brief card's cover now, and Add idea, Select and
 * Group by live in the Rollout menu. Folded (#898), row 2 and `below` hide
 * and the Menu pill floats at the bottom (#926).
 *
 * Below lg only. The computer's header is WorkspaceDesktopFocused, unchanged.
 */
export function RolloutPhoneHeader({
  artistName,
  title,
  releaseDate,
  onEditDate,
  done,
  total,
  backLabel,
  onBack,
  showMeta,
  showSearch,
  planView,
  releaseId,
  below,
}: {
  /** Which plan view is showing, for the List / Timeline switch. Null hides it. */
  planView?: PlanView | null;
  releaseId: string;
  artistName: string | null | undefined;
  title: string;
  releaseDate: string | null | undefined;
  /** Opens Change release date (#1128). Passed only for the owner of a dated
   *  rollout; without it the line stays plain text. */
  onEditDate?: () => void;
  done: number;
  total: number;
  backLabel: string;
  onBack: () => void;
  /** The release line describes the plan, so it waits while a scene is open. */
  showMeta: boolean;
  /** Only where the plan's search lives behind this icon (the timeline). */
  showSearch: boolean;
  /** The brief card, readiness row and banners, which hide with the header in search. */
  below?: ReactNode;
}) {
  const searchOpen = useRolloutPhoneChrome((state) => state.searchOpen);
  const setSearchOpen = useRolloutPhoneChrome((state) => state.setSearchOpen);
  const setMenuOpen = useRolloutPhoneChrome((state) => state.setMenuOpen);
  const folded = usePlanMenuFold((state) => state.folded);
  // Where the top bar ends on screen right now, not its height: on a phone the
  // top bar scrolls away with a rollout, and a header held its height down
  // left a strip the plan showed through (founder screenshot, Oct 31, 2026).
  // It sets where the line sticks (`top`), never padding: padding pushed the
  // line a whole top bar down at rest (founder screenshot, Oct 31, 2026).
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [topBarBottom, setTopBarBottom] = useState(0);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-swipe-topbar]');
    const measure = () => {
      setTopBarBottom(bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0);
      const node = headerRef.current;
      if (node) {
        const stickAt = parseFloat(getComputedStyle(node).top) || 0;
        setStuck(node.getBoundingClientRect().top <= stickAt + 1 && window.scrollY > 0);
      }
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Search takes the header's place (the approved mock's search state); the
  // timeline draws the field, Filter, Done and the colour key.
  if (searchOpen && showSearch) return null;

  const meta = [artistName, rolloutMetaLine(releaseDate)].filter(Boolean).join(' · ');

  return (
    <>
      <div
        ref={headerRef}
        data-rollout-phone-header
        // Sticks under the top bar, or under the status bar once the top bar
        // has scrolled away. Stuck, a strip of page ground fills the space
        // above it, so nothing scrolls past there.
        style={{ top: `max(${topBarBottom}px, env(safe-area-inset-top, 0px))` }}
        className="sticky z-20 -mx-4 bg-bg-base px-4"
      >
        {stuck ? (
          <div
            aria-hidden="true"
            style={{ height: `max(${topBarBottom}px, env(safe-area-inset-top, 0px))` }}
            className="pointer-events-none absolute inset-x-0 bottom-full bg-bg-base"
          />
        ) : null}
        <div className="flex h-11 items-center gap-1">
          <SlimTitle title={title} done={done} total={total} backLabel={backLabel} onBack={onBack} />
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
              data-tour="rollout-menu"
              className="motion-focus motion-press -mr-2 grid h-11 w-11 touch-manipulation place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {folded ? (
        // The pill floats at the bottom of the screen (#926).
        <PlanMenuPillDock toTop />
      ) : (
        <>
          {showMeta ? (
            <div data-rollout-meta className="mb-[13px] flex h-[34px] items-center justify-between gap-3">
              {onEditDate && releaseDate ? (
                // The date line is the door to changing it (#1128, founder
                // approved mock, Nov 8, 2026): tap "drops 12 Dec".
                <button
                  type="button"
                  onClick={onEditDate}
                  aria-label={`${meta}. Change release date`}
                  className="motion-focus motion-press -ml-2 inline-flex min-h-[34px] min-w-0 items-center gap-1.5 rounded-lg px-2 text-left text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
                >
                  <span className="truncate">{meta}</span>
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <p className="min-w-0 truncate text-sm text-content-secondary">{meta}</p>
              )}
              {planView ? <PlanViewToggle releaseId={releaseId} view={planView} /> : null}
            </div>
          ) : (
            <div className="mb-[13px]" />
          )}
          {below}
        </>
      )}
    </>
  );
}

/** The way back, the title and the count on one slim line. */
function SlimTitle({
  title,
  done,
  total,
  backLabel,
  onBack,
}: {
  title: string;
  done: number;
  total: number;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <>
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
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-content-tertiary">
            {done}/{total}
            <ReleaseDeliveredMark total={total} done={done} />
          </span>
        ) : null}
      </p>
    </>
  );
}
