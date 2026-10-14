'use client';

import { useEffect, useState } from 'react';
import { isNavPending, subscribeNavPending } from '@/lib/nav-stall-watch';

/**
 * A thin bar along the top while a tapped link is still loading (2026-10-14).
 * Without it a slow navigation looks like a dead link, people tap again, and
 * the second tap is what used to load the page twice. The bar waits a beat
 * before showing so a fast navigation never flashes it. No words, no layout:
 * fixed above everything, pointer-events off.
 */
const SHOW_AFTER_MS = 150;

export function NavPendingBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: number | null = null;
    const apply = (isPending: boolean) => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (isPending) {
        timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      } else {
        setVisible(false);
      }
    };
    apply(isNavPending());
    const unsubscribe = subscribeNavPending(apply);
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;
  return <div className="nav-pending-bar" aria-hidden="true" />;
}
