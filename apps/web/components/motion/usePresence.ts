'use client';

import { useEffect, useState } from 'react';
import { MORPH_EXIT_MS, prefersReducedMotion } from '@/lib/morph';

/**
 * Keeps a sheet or pop-over mounted for its exit (lib/morph.ts). `open` is the
 * caller's state; `mounted` says whether to render; `closing` is true for the
 * last `exitMs` while the exit animation plays (render `data-state="closed"`
 * then, which the morph classes in globals.css animate out and make
 * click-through). With reduced motion there is no exit: it unmounts at once.
 */
export function usePresence(open: boolean, exitMs: number = MORPH_EXIT_MS): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, mounted, exitMs]);

  // Rendered in the same pass `open` turns true, so an opening sheet's first
  // frame is already its enter animation's first frame.
  const isMounted = open || mounted;
  return { mounted: isMounted, closing: isMounted && !open };
}
