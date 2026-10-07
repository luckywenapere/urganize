'use client';

import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { HelpTipPanel } from '@/components/shared/HelpTip';
import type { HelpKey } from '@/lib/help-copy';
import { navTipDelay } from '@/lib/nav-tip-timing';

/**
 * The tip for each item in the top bar and the tab row (founder call,
 * 2026-10-07: the info icon beside each page's title is gone, and what it said
 * now appears when a pointer rests on the menu item itself).
 *
 * One panel per menu, not one per item, because only one tip is ever visible
 * and the items are built inside a `.map`. Timing is lib/nav-tip-timing.ts.
 *
 * Hover only opens on a pointer that can hover: a tap on a phone is a tap to go
 * there, and a tip flashing up on the way would only get in the way.
 */

/** Menu item key (lib/shell-nav.ts) to its words in lib/help-copy.ts. */
export const NAV_TIP_KEYS: Record<string, HelpKey> = {
  home: 'nav.home',
  catalogue: 'nav.catalogue',
  relationships: 'nav.relationships',
  opportunities: 'nav.opportunities',
  audience: 'nav.audience',
  shows: 'nav.shows',
  releases: 'nav.rollouts',
  artists: 'nav.artists',
  'press-kits': 'nav.pressKits',
  notes: 'nav.notes',
  people: 'nav.people',
  directory: 'nav.directory',
  pitching: 'nav.pitching',
};

// Shared by every menu, so moving from a top-bar pill down to a tab under it
// keeps the tips warm.
let lastClosedAt: number | null = null;

type Shown = { key: string; anchor: HTMLElement };

export function useNavTip({ prefer = 'bottom' }: { prefer?: 'bottom' | 'right' } = {}) {
  const panelId = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);

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

  const show = useCallback((key: string, anchor: HTMLElement, viaKeyboard: boolean) => {
    if (!NAV_TIP_KEYS[key]) return;
    clearTimer();
    const delay = navTipDelay({ now: Date.now(), lastClosedAt, tipOpen: openRef.current, viaKeyboard });
    const open = () => {
      openRef.current = true;
      setShown({ key, anchor });
    };
    if (delay === 0) open();
    else timer.current = setTimeout(open, delay);
  }, []);

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
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      let keyboard = false;
      try {
        keyboard = event.currentTarget.matches(':focus-visible');
      } catch {
        keyboard = false;
      }
      if (keyboard) show(key, event.currentTarget, true);
    },
    onBlur: hide,
  });

  const tipKey = shown ? NAV_TIP_KEYS[shown.key] : null;
  const panel = tipKey ? (
    <HelpTipPanel helpKey={tipKey} anchor={shown?.anchor ?? null} prefer={prefer} id={panelId} onDismiss={hide} />
  ) : null;

  return { bind, panel };
}
