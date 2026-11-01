'use client';

import { useEffect, useState } from 'react';

/**
 * True once mounted when the viewer has not asked for reduced motion, and it
 * follows the setting live. False on the server and the first render, so a
 * Stageshow loop's poster always paints first and the kit is never even
 * downloaded under reduced motion (docs/notes/2026-11-01-stageshow-kit.md).
 */
export function usePrefersMotion(): boolean {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(!mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return motion;
}
