'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { useKeyboardViewport } from '@/lib/keyboard-viewport';

/** Air between the composer and whatever owns the bottom edge. */
const GAP_PX = 12;
/** Never shrink the chat below this, even on a very short screen. */
const MIN_HEIGHT_PX = 260;

function scrollParentBottom(el: HTMLElement): number | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node.getBoundingClientRect().bottom;
    node = node.parentElement;
  }
  return null;
}

/**
 * The height that makes a chat box end just above the bottom of what can be
 * seen (2026-10-11, founder fix for the rollout Chat scene). The box holds a
 * scrolling message list and a composer pinned under it, so the composer sits:
 *
 *  - on a phone, just above the floating bottom tab bar (measured from the bar
 *    itself, `.mobile-nav-bar`, so it already includes the safe-area inset);
 *  - while the on-screen keyboard is up, just above the keyboard: the bar hides
 *    itself then, and the visible region comes from visualViewport through
 *    useKeyboardViewport, which is what makes iOS work (100dvh does not shrink
 *    for the keyboard there);
 *  - on a desktop, at the bottom of the column that scrolls the scene.
 *
 * Re-measured on resize, on any scroll (the box's top moves when the page
 * does) and whenever the keyboard state changes. Null until measured, so the
 * first paint falls back to the caller's CSS.
 *
 * `frozen` (2026-10-11): while true the last measurement is kept and nothing
 * is re-measured. The rollout chat passes it while a phone's keyboard is up,
 * because the box is pinned to the visual viewport then (lib/release-chat-layout.ts)
 * and this height only holds its place in the page.
 */
export function usePinnedChatHeight(
  ref: RefObject<HTMLElement | null>,
  frozen = false
): number | null {
  const keyboard = useKeyboardViewport();
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined' || frozen) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top;
      let bottom =
        keyboard.open && keyboard.viewportHeightPx > 0
          ? keyboard.offsetTopPx + keyboard.viewportHeightPx
          : (window.visualViewport?.height ?? window.innerHeight);

      const bar = document.querySelector<HTMLElement>('.mobile-nav-bar');
      if (bar && !keyboard.open) {
        const rect = bar.getBoundingClientRect();
        // display:none (desktop, or the keyboard) measures as 0 by 0.
        if (rect.height > 0) bottom = Math.min(bottom, rect.top);
      }
      const parentBottom = scrollParentBottom(el);
      if (parentBottom !== null) bottom = Math.min(bottom, parentBottom);

      const next = Math.max(MIN_HEIGHT_PX, Math.round(bottom - top - GAP_PX));
      setHeight((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, { capture: true });
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [ref, frozen, keyboard.open, keyboard.viewportHeightPx, keyboard.offsetTopPx]);

  return height;
}
