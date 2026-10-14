'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { HelpTipPanel } from '@/components/shared/HelpTip';
import type { HelpKey } from '@/lib/help-copy';
import {
  NAV_TIP_LONG_PRESS_MS,
  NAV_TIP_TOUCH_LINGER_MS,
  navTipDelay,
  touchMovedTooFar,
} from '@/lib/nav-tip-timing';

/**
 * The tip for each menu item (founder calls, 2026-10-07: the info icon beside
 * each page's title is gone, and what it said now appears on the menu item
 * itself; then "add tips on phone too").
 *
 * Two ways in, timed in lib/nav-tip-timing.ts:
 *  - a pointer resting on the item (computer), after half a second;
 *  - a finger pressing and holding it (phone), after Android's long-press time.
 *    A quick tap still just goes to the page. When a hold has shown the tip,
 *    the tap that would follow is swallowed, so reading a tip never navigates,
 *    and the tip stays a moment after the finger lifts so it can be read.
 *
 * One panel per menu, not one per item, because only one tip is ever visible
 * and the items are built inside a `.map`.
 */

/** Menu item key (lib/shell-nav.ts and the bottom bar) to its words in
 *  lib/help-copy.ts. */
export const NAV_TIP_KEYS: Record<string, HelpKey> = {
  home: 'nav.home',
  catalogue: 'nav.catalogue',
  relationships: 'nav.relationships',
  opportunities: 'nav.opportunities',
  audience: 'nav.audience',
  shows: 'nav.shows',
  urgans: 'nav.urgans',
  more: 'nav.more',
  releases: 'nav.rollouts',
  artists: 'nav.artists',
  'press-kits': 'nav.pressKits',
  notes: 'nav.notes',
  people: 'nav.people',
  directory: 'nav.directory',
};

/** Stops a long press opening the phone's own link menu or text selection. */
export const NAV_TIP_TOUCH_CLASS = '[-webkit-touch-callout:none] select-none';

// Shared by every menu, so moving from a top-bar pill down to a tab under it
// keeps the tips warm.
let lastClosedAt: number | null = null;

type Shown = { key: string; anchor: HTMLElement };

export function useNavTip({
  prefer = 'bottom',
  overSheet = false,
}: { prefer?: 'bottom' | 'right'; overSheet?: boolean } = {}) {
  const panelId = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const press = useRef<{ x: number; y: number } | null>(null);
  // Set when a hold opened the tip; the click that the lift produces is eaten.
  const swallowClick = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const hide = useCallback(() => {
    clearTimer();
    if (openRef.current) lastClosedAt = Date.now();
    openRef.current = false;
    setShown(null);
  }, []);

  const open = useCallback((key: string, anchor: HTMLElement) => {
    openRef.current = true;
    setShown({ key, anchor });
  }, []);

  const show = useCallback(
    (key: string, anchor: HTMLElement, viaKeyboard: boolean) => {
      if (!NAV_TIP_KEYS[key]) return;
      clearTimer();
      const delay = navTipDelay({ now: Date.now(), lastClosedAt, tipOpen: openRef.current, viaKeyboard });
      if (delay === 0) open(key, anchor);
      else timer.current = setTimeout(() => open(key, anchor), delay);
    },
    [open]
  );

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (!shown) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [shown, hide]);

  const bind = (key: string) => ({
    'aria-describedby': shown?.key === key ? panelId : undefined,
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') return;
      show(key, event.currentTarget, false);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      // A finger "leaves" when it lifts; the lift handles touch itself.
      if (event.pointerType === 'touch') return;
      hide();
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') {
        hide();
        return;
      }
      hide();
      swallowClick.current = false;
      if (!NAV_TIP_KEYS[key]) return;
      press.current = { x: event.clientX, y: event.clientY };
      const anchor = event.currentTarget;
      timer.current = setTimeout(() => {
        swallowClick.current = true;
        open(key, anchor);
      }, NAV_TIP_LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' || !press.current || openRef.current) return;
      if (touchMovedTooFar(event.clientX - press.current.x, event.clientY - press.current.y)) {
        press.current = null;
        clearTimer();
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      press.current = null;
      if (openRef.current) {
        clearTimer();
        timer.current = setTimeout(hide, NAV_TIP_TOUCH_LINGER_MS);
      } else {
        clearTimer();
      }
    },
    onPointerCancel: () => {
      press.current = null;
      hide();
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      // A long press on a link opens the phone's own menu; the tip replaces it.
      if (press.current || swallowClick.current) event.preventDefault();
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      let keyboard = false;
      try {
        keyboard = event.currentTarget.matches(':focus-visible');
      } catch {
        keyboard = false;
      }
      if (keyboard) show(key, event.currentTarget, true);
    },
    onBlur: () => {
      if (!swallowClick.current) hide();
    },
  });

  const tipKey = shown ? NAV_TIP_KEYS[shown.key] : null;
  const panel = tipKey ? (
    <HelpTipPanel
      helpKey={tipKey}
      anchor={shown?.anchor ?? null}
      prefer={prefer}
      id={panelId}
      onDismiss={hide}
      overSheet={overSheet}
    />
  ) : null;

  return { bind, panel };
}
