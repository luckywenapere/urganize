'use client';

import { useEffect } from 'react';
import {
  INITIAL_WHEEL,
  touchEnd,
  touchMove,
  touchStart,
  wheelStep,
  type FoldAction,
  type TouchState,
  type WheelState,
} from '@/lib/plan-menu-fold';
import { usePlanMenuFold } from '@/stores/usePlanMenuFold';

/** The page bar's tool slots hide by this attribute (globals.css). */
const FOLDED_ATTR = 'data-plan-menu';

/** Typing, a sheet or a dialog: the gesture is not about the plan. */
function ignored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]'));
}

function scrollTop(): number {
  return document.scrollingElement?.scrollTop ?? window.scrollY;
}

/**
 * Feeds the page's wheel and touch moves to the fold rule (lib/plan-menu-fold)
 * while the plan is showing. Listeners are passive: the page scrolls exactly
 * as before, the menu only reacts to it. Turning off opens the menu again, so
 * a scene, another rollout (`scopeKey`) or leaving never inherits a folded
 * page.
 */
export function usePlanMenuFoldGestures(enabled: boolean, scopeKey: string | null) {
  const folded = usePlanMenuFold((state) => state.folded);

  useEffect(() => {
    const root = document.documentElement;
    if (enabled && folded) root.setAttribute(FOLDED_ATTR, 'folded');
    else root.removeAttribute(FOLDED_ATTR);
    return () => root.removeAttribute(FOLDED_ATTR);
  }, [enabled, folded]);

  useEffect(() => {
    const { setFolded, setPull } = usePlanMenuFold.getState();
    if (!enabled) {
      setFolded(false);
      return;
    }
    const apply = (action: FoldAction) => {
      if (action === 'fold') setFolded(true);
      else if (action === 'open') setFolded(false);
    };
    const isFolded = () => usePlanMenuFold.getState().folded;

    let wheel: WheelState = INITIAL_WHEEL;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || ignored(event.target)) return;
      const step = wheelStep(wheel, {
        deltaY: event.deltaY,
        deltaX: event.deltaX,
        now: event.timeStamp,
        scrollTop: scrollTop(),
        folded: isFolded(),
      });
      wheel = step.state;
      if (isFolded()) setPull(step.pull);
      apply(step.action);
    };

    let touch: TouchState = null;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || ignored(event.target)) {
        touch = null;
        return;
      }
      const point = event.touches[0];
      touch = touchStart({ x: point.clientX, y: point.clientY, now: event.timeStamp, scrollTop: scrollTop() });
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) return;
      const point = event.touches[0];
      const step = touchMove(touch, {
        x: point.clientX,
        y: point.clientY,
        now: event.timeStamp,
        scrollTop: scrollTop(),
        folded: isFolded(),
      });
      touch = step.state;
      if (isFolded()) setPull(step.pull);
      apply(step.action);
    };
    const onTouchEnd = () => {
      apply(touchEnd(touch, { folded: isFolded() }));
      if (isFolded()) setPull(0);
      touch = null;
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      setFolded(false);
    };
  }, [enabled, scopeKey]);
}
