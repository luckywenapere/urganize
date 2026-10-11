'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AT_TOP_PX,
  FOLD_BELOW_PX,
  REVEAL_EVENT,
  isPanelShown,
  shouldHideOnScroll,
  shouldRevealOnPull,
} from '@/lib/pull-reveal';

// How many PullReveal panels are on screen. More's Search row (and the desktop search button) asks
// this to decide whether to reveal a list's own search or open the command bar.
let mountedCount = 0;

/** True while a page has a pull-to-reveal panel the search button can open. */
export function hasPullReveal(): boolean {
  return mountedCount > 0 && typeof window !== 'undefined' && window.innerWidth < FOLD_BELOW_PX;
}

/** Asks the panel on this page to open and take focus. */
export function revealListSearch() {
  window.dispatchEvent(new Event(REVEAL_EVENT));
}

/**
 * Folds a list's search and filters away on a phone until the person pulls the
 * page down from the very top (or taps Search in the bottom bar's More sheet). Folds
 * again when they scroll down. While a search or filter is doing something it
 * stays open, so the list never looks mysteriously short. From `sm` up it is
 * simply always there.
 *
 * The panel stays in the page (folded to zero height, hidden from assistive
 * technology) so a typed search keeps its text.
 */
export function PullReveal({ filtering, children }: { filtering: boolean; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const [wide, setWide] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedCount += 1;
    return () => {
      mountedCount -= 1;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${FOLD_BELOW_PX}px)`);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const focusSearch = useCallback(() => {
    // After the panel has opened, so the keyboard does not fight the animation.
    window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }, 220);
  }, []);

  useEffect(() => {
    if (wide) return;
    let startY = 0;
    let startedAtTop = false;
    const scrollTop = () => (document.scrollingElement ?? document.documentElement).scrollTop;
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
      startedAtTop = scrollTop() <= AT_TOP_PX;
    };
    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? 0;
      if (shouldRevealOnPull({ startedAtTop, startY, currentY })) {
        startedAtTop = false;
        setRevealed(true);
      }
    };
    const onScroll = () => {
      const focused = Boolean(panelRef.current?.contains(document.activeElement));
      if (shouldHideOnScroll({ scrollTop: scrollTop(), focused })) setRevealed(false);
    };
    const onReveal = () => {
      window.scrollTo({ top: 0 });
      setRevealed(true);
      focusSearch();
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener(REVEAL_EVENT, onReveal);
    };
  }, [wide, focusSearch]);

  const shown = isPanelShown({ revealed, filtering, wide });

  return (
    <div
      ref={panelRef}
      aria-hidden={!shown}
      // `inert` keeps folded-away controls out of the tab order.
      {...(shown ? {} : { inert: true })}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-standard motion-reduce:transition-none ${
        shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
