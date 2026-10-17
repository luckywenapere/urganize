'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';

/** The house "scoped reflow" timing (globals.css --motion-slow and
 *  --motion-standard), so the glide matches the app's other layout moves. */
export const GLIDE_DURATION_MS = 280;
export const GLIDE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** How far an element has to travel for a glide to be worth drawing. */
export function glideDelta(
  before: { left: number; top: number },
  after: { left: number; top: number }
): { dx: number; dy: number } | null {
  const dx = Math.round(before.left - after.left);
  const dy = Math.round(before.top - after.top);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
  return { dx, dy };
}

/**
 * Glide an element from where it was to where it is now whenever `key`
 * changes (a FLIP: the layout jumps, the element is drawn back at its old spot
 * and eased into the new one with a transform, so nothing re-lays-out per
 * frame). Used by the side menu (2026-10-17, founder: when the menu folds,
 * the profile icon "just goes above the collapse button in a smooth
 * animation"): the menu itself snaps between its widths as it always has, and
 * the profile icon and the fold button glide to their new corner.
 *
 * Nothing moves under prefers-reduced-motion. The last position is re-read on
 * every render and on resize, so a glide always starts from where the element
 * was actually drawn.
 */
export function useGlide(ref: RefObject<HTMLElement | null>, key: unknown) {
  const last = useRef<{ left: number; top: number } | null>(null);
  const lastKey = useRef(key);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = last.current;
    const changed = !Object.is(lastKey.current, key);
    lastKey.current = key;
    // A glide still running would skew the new spot by its transform.
    if (changed) el.getAnimations?.().forEach((animation) => animation.cancel());
    const rect = el.getBoundingClientRect();
    last.current = { left: rect.left, top: rect.top };
    if (!changed || !before) return;
    if (typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const delta = glideDelta(before, rect);
    if (!delta) return;
    el.animate(
      [{ transform: `translate(${delta.dx}px, ${delta.dy}px)` }, { transform: 'translate(0px, 0px)' }],
      { duration: GLIDE_DURATION_MS, easing: GLIDE_EASING }
    );
  });

  useEffect(() => {
    const refresh = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      last.current = { left: rect.left, top: rect.top };
    };
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, [ref]);
}
