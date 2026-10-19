'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  SWIPE_TABS,
  clampDrag,
  lockDirection,
  settleIndex,
  springAtRest,
  springStep,
  swipeTabForPath,
  swipeTabIndex,
  type GestureAxis,
  type SwipeTabKey,
} from '@/lib/swipe-nav';
import { prefersReducedMotion } from '@/lib/home-chat-glide';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { setSwipeProgress } from './progress';

const COUNT = SWIPE_TABS.length;
/** Long-press before moving: a text selection or a held message, never a page turn. */
const LONG_PRESS_MS = 450;

/** Anything open that should freeze paging: our sheets, any modal dialog, the keyboard. */
function pagingFrozen(target: EventTarget | null): boolean {
  if (useSwipeNavStore.getState().locks > 0) return true;
  const root = document.documentElement;
  if (root.dataset.keyboardOpen === 'true') return true;
  if (document.querySelector('[role="dialog"][aria-modal="true"], [data-swipe-sheet]')) return true;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.toString().length > 0) return true;
  if (target instanceof Element && target.closest('[data-no-pager], input[type="range"]')) return true;
  return false;
}

/**
 * The swipe pager (URG-380): Home, UrgAns and Artists side by side, one finger
 * or one tab tap moving between them on the approved spring.
 *
 * Rules (notes.md, "Swipe-gesture conflicts"):
 *  - The pager owns horizontal swipes; nothing inside a page scrolls sideways.
 *  - After 10px pick the axis (|dx| > 1.2·|dy| is ours), held until touch-up.
 *  - Release past half the width or faster than 500px/s turns the page; past
 *    Home or Artists it gives 24px and springs back.
 *  - Sheets, dialogs, the keyboard, a text selection and a long press freeze it.
 *  - Each page scrolls on its own, so a page keeps its place when you come back.
 *
 * Each tab is its own URL. A settled page writes it with history.pushState (no
 * route fetch, the URG-362 pattern), and Back moves the pager the other way.
 */
export function SwipePager({ panes }: { panes: Record<SwipeTabKey, ReactNode> }) {
  const pathname = usePathname();
  const routeTab = swipeTabForPath(pathname) ?? 'home';
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const position = useRef(swipeTabIndex(routeTab));
  const committed = useRef(swipeTabIndex(routeTab));
  const frame = useRef<number | null>(null);
  const [active, setActive] = useState(swipeTabIndex(routeTab));
  // Pages mount on first need: the one on screen at once, the others when idle
  // or the moment a finger starts to move.
  const [mounted, setMounted] = useState<ReadonlySet<number>>(() => new Set([swipeTabIndex(routeTab)]));
  const setGo = useSwipeNavStore((state) => state.setGo);
  // Written once: after the first render only the pager's own paint() moves the
  // track, so a re-render can never snap it to the end of a glide in progress.
  const [initialTransform] = useState(() => `translate3d(${(-swipeTabIndex(routeTab) * 100) / COUNT}%, 0, 0)`);

  const mountAll = useCallback(() => {
    setMounted((current) => (current.size === COUNT ? current : new Set(SWIPE_TABS.map((_, i) => i))));
  }, []);

  const paint = useCallback((pos: number) => {
    position.current = pos;
    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(${(-pos * 100) / COUNT}%, 0, 0)`;
    setSwipeProgress(pos);
  }, []);

  const commit = useCallback((index: number, push: boolean) => {
    const previous = committed.current;
    committed.current = index;
    setActive(index);
    if (push && index !== previous) {
      const href = SWIPE_TABS[index].href;
      if (window.location.pathname !== href) window.history.pushState(null, '', href);
    }
  }, []);

  const animateTo = useCallback(
    (index: number, options: { velocity?: number; push?: boolean; instant?: boolean } = {}) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      const push = options.push ?? true;
      const track = trackRef.current;
      if (options.instant || prefersReducedMotion()) {
        // Reduced motion: no slide. The new page crossfades in over 200ms.
        paint(index);
        commit(index, push);
        if (track && !options.instant) {
          track.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
        }
        return;
      }
      let state = { position: position.current, velocity: options.velocity ?? 0 };
      let last = performance.now();
      const tick = (now: number) => {
        // Small fixed steps keep the spring stable on a slow frame.
        let elapsed = Math.min(0.064, (now - last) / 1000);
        last = now;
        while (elapsed > 0) {
          const dt = Math.min(1 / 120, elapsed);
          state = springStep(state, index, dt);
          elapsed -= dt;
        }
        if (springAtRest(state, index)) {
          paint(index);
          frame.current = null;
          return;
        }
        paint(state.position);
        frame.current = requestAnimationFrame(tick);
      };
      // The URL and the active page change as the glide starts, so the tab and
      // the page's own effects are not a beat late.
      commit(index, push);
      frame.current = requestAnimationFrame(tick);
    },
    [commit, paint]
  );

  // The tab row (and anything else, like a Home card) moves the pager through here.
  useEffect(() => {
    const go = (key: SwipeTabKey, options?: { instant?: boolean }) => {
      mountAll();
      animateTo(swipeTabIndex(key), { instant: options?.instant });
    };
    setGo(go);
    return () => setGo(null);
  }, [animateTo, mountAll, setGo]);

  // Back, Forward, a link or a keyboard shortcut changed the route: follow it.
  useEffect(() => {
    const index = swipeTabIndex(routeTab);
    if (index === committed.current) return;
    setMounted((current) => (current.has(index) ? current : new Set([...current, index])));
    animateTo(index, { push: false });
  }, [routeTab, animateTo]);

  // First paint at the right page, then the other pages when the browser is idle.
  useEffect(() => {
    paint(position.current);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const handle = idle ? idle(mountAll) : window.setTimeout(mountAll, 600);
    return () => {
      if (!idle) window.clearTimeout(handle);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [mountAll, paint]);

  // Pinned to the committed page (URG-380 hotfix). The track moves only by
  // transform, so the viewport and each pane must never scroll sideways. A
  // browser can still scroll an overflow:hidden box (scrollIntoView, focus, a
  // find-in-page); any sideways scroll is undone at once, and a resize or
  // rotation snaps instantly back onto the active page.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target === viewport || (target instanceof HTMLElement && target.dataset.swipePane)) {
        const box = target as HTMLElement;
        if (box.scrollLeft !== 0) box.scrollLeft = 0;
      }
    };
    const resettle = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
      paint(committed.current);
    };
    viewport.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', resettle);
    window.addEventListener('orientationchange', resettle);
    window.addEventListener('pageshow', resettle);
    resettle();
    return () => {
      viewport.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', resettle);
      window.removeEventListener('orientationchange', resettle);
      window.removeEventListener('pageshow', resettle);
    };
  }, [paint]);

  // Touch: direction lock, drag, settle. Non-passive move so a horizontal drag
  // can stop the page from scrolling under it.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let axis: GestureAxis = 'undecided';
    let tracking = false;
    let samples: { x: number; t: number }[] = [];

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || pagingFrozen(event.target)) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startAt = performance.now();
      axis = 'undecided';
      tracking = true;
      samples = [{ x: touch.clientX, t: startAt }];
      mountAll();
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (axis === 'undecided') {
        axis = lockDirection(dx, dy);
        if (axis === 'undecided') return;
        if (axis === 'horizontal' && (performance.now() - startAt > LONG_PRESS_MS || pagingFrozen(event.target))) {
          axis = 'vertical';
        }
        if (axis === 'vertical') {
          tracking = false;
          return;
        }
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      event.preventDefault();
      const width = viewport.clientWidth || 1;
      const drag = clampDrag(dx, committed.current, COUNT);
      paint(committed.current - drag / width);
      const now = performance.now();
      samples.push({ x: touch.clientX, t: now });
      samples = samples.filter((sample) => now - sample.t < 100);
    };

    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (axis !== 'horizontal') return;
      const touch = event.changedTouches[0];
      const width = viewport.clientWidth || 1;
      const dx = touch.clientX - startX;
      const first = samples[0];
      const now = performance.now();
      const velocity = first && now - first.t > 0 ? ((touch.clientX - first.x) / (now - first.t)) * 1000 : 0;
      const target = settleIndex({ index: committed.current, count: COUNT, dx, width, velocity });
      // The spring starts from the finger's speed, in pages per second.
      animateTo(target, { velocity: -velocity / width });
    };

    viewport.addEventListener('touchstart', onStart, { passive: true });
    viewport.addEventListener('touchmove', onMove, { passive: false });
    viewport.addEventListener('touchend', onEnd, { passive: true });
    viewport.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      viewport.removeEventListener('touchstart', onStart);
      viewport.removeEventListener('touchmove', onMove);
      viewport.removeEventListener('touchend', onEnd);
      viewport.removeEventListener('touchcancel', onEnd);
    };
  }, [animateTo, mountAll, paint]);

  return (
    <div
      ref={viewportRef}
      className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden"
      style={{ overflow: 'clip' }}
      data-swipe-pager
    >
      <div
        ref={trackRef}
        className="flex h-full flex-nowrap will-change-transform"
        style={{ width: `${COUNT * 100}%`, transform: initialTransform }}
      >
        {SWIPE_TABS.map((tab, i) => (
          <section
            key={tab.key}
            aria-label={tab.label}
            aria-hidden={i !== active || undefined}
            inert={i !== active || undefined}
            data-swipe-pane={tab.key}
            className="swipe-pane h-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain"
            // Exactly one viewport wide: never grows for a wide child (the composer).
            style={{ flex: `0 0 ${100 / COUNT}%`, width: `${100 / COUNT}%`, maxWidth: `${100 / COUNT}%` }}
          >
            {mounted.has(i) ? panes[tab.key] : null}
          </section>
        ))}
      </div>
    </div>
  );
}
