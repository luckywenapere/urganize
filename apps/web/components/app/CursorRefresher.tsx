'use client';

import { useEffect } from 'react';

/**
 * URG-208: Chromium doesn't re-resolve the OS cursor after a text selection
 * ends until the pointer crosses an element boundary — so after selecting
 * text and moving the mouse away, the cursor stays stuck on the native
 * default arrow instead of returning to the Chappi mark. This nudges Blink
 * into re-resolving it: one frame of `cursor: none` forces a fresh cursor
 * push once the selection settles. Debounced past the drag-selection burst
 * so the mark doesn't blink hidden while the user is still selecting.
 *
 * Known limitation this does NOT fix: hovering directly over an
 * already-selected run still shows the native arrow as Chromium's built-in
 * drag affordance, regardless of any `cursor` CSS. That behavior lives in
 * the browser's selection-handling code, not in page styles.
 */
export function CursorRefresher() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    let debounceTimer = 0;
    let frameHandle = 0;

    const nudge = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        document.body.style.cursor = 'none';
        frameHandle = requestAnimationFrame(() => {
          document.body.style.cursor = '';
        });
      }, 100);
    };

    document.addEventListener('selectionchange', nudge);
    return () => {
      document.removeEventListener('selectionchange', nudge);
      window.clearTimeout(debounceTimer);
      cancelAnimationFrame(frameHandle);
    };
  }, []);

  return null;
}
