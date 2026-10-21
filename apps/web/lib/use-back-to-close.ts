'use client';

import { useEffect, useRef } from 'react';
import { browserBackEnv, createBackManager } from '@/lib/back-to-close';

let manager: ReturnType<typeof createBackManager> | null = null;
function getManager() {
  if (!manager) manager = createBackManager(browserBackEnv());
  return manager;
}

/**
 * Let the OS back-swipe / browser Back close an overlay while it is open, and
 * give the history entry back when it closes another way. Overlays stack, so
 * Back closes the newest one first. Rules and reasons: lib/back-to-close.ts.
 *
 * Pass the overlay's own close function (the one that guards unsaved work, if
 * it has one): when that refuses, the entry is put back and Back is swallowed.
 * Nothing happens while `onClose` is undefined.
 */
export function useBackToClose(
  open: boolean,
  onClose: (() => void) | undefined,
  /** Still showing after the close ran? Defaults to the latest `open`. */
  isStillOpen?: () => boolean
): void {
  const openRef = useRef(open);
  const closeRef = useRef(onClose);
  const stillRef = useRef(isStillOpen);
  useEffect(() => {
    openRef.current = open;
    closeRef.current = onClose;
    stillRef.current = isStillOpen;
  });

  const active = open && Boolean(onClose);
  useEffect(() => {
    if (!active) return;
    const handle = getManager().register(
      () => closeRef.current?.(),
      () => (stillRef.current ? stillRef.current() : openRef.current)
    );
    return () => handle.release();
  }, [active]);
}
