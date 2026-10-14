'use client';

import { useEffect, type RefObject } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';
import { MENU_VIEWPORT_MARGIN, menuMaxHeight, menuShift } from './menu-position';

/**
 * Nudge an open menu back inside the screen (menu audit, 2026-10-14).
 *
 * The menu keeps its own CSS placement (`absolute right-0 top-full`, say); this
 * measures it once it is drawn and, only when it runs past an edge, moves it
 * sideways with the `translate` property (which composes with the open
 * animation's `transform` rather than replacing it), caps its width on a
 * screen narrower than the menu, and caps its height with its own scroll when
 * its bottom would be off screen. A menu that already fits is untouched.
 *
 * Measured before paint, again when its open animation ends (a scaled frame
 * measures a few pixels small) and on every resize. The decisions are pure and
 * tested in lib/menu-position.ts.
 */
export function useKeepInViewport(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  { margin = MENU_VIEWPORT_MARGIN }: { margin?: number } = {}
) {
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    fit(el, margin);
  }, [open, ref, margin]);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const refit = () => fit(el, margin);
    window.addEventListener('resize', refit);
    el.addEventListener('animationend', refit);
    return () => {
      window.removeEventListener('resize', refit);
      el.removeEventListener('animationend', refit);
    };
  }, [open, ref, margin]);
}

function fit(el: HTMLElement, margin: number) {
  el.style.translate = '';
  el.style.maxWidth = '';
  el.style.maxHeight = '';
  el.style.overflowY = '';
  const rect = el.getBoundingClientRect();
  const width = el.offsetWidth || rect.width;
  const height = el.offsetHeight || rect.height;
  const { shift, maxWidth } = menuShift({ left: rect.left, width }, window.innerWidth, margin);
  if (maxWidth !== null) el.style.maxWidth = `${maxWidth}px`;
  if (shift !== 0) el.style.translate = `${shift}px 0`;
  const maxHeight = menuMaxHeight({ top: rect.top, height }, window.innerHeight, margin);
  if (maxHeight !== null) {
    el.style.maxHeight = `${maxHeight}px`;
    el.style.overflowY = 'auto';
  }
}
