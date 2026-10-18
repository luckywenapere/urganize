'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { fadeIn } from '@/lib/morph';

/**
 * The page under the shell's chrome settles in instead of cutting (lib/morph.ts):
 * when the screen changes (another page, or a rollout opening from the list),
 * the new content fades in over 180ms, opacity only. The top bar, the tab row
 * and the bottom bar sit outside it and never move.
 *
 * Keyed by the path alone: reading search params here would make every page
 * under the shell bail out of static rendering to the Suspense fallback. A
 * rollout opening from the Rollouts list (same path, new `?release=`) is
 * WorkspaceView's to fade, with `fadeInScreen()`.
 *
 * Not for a scene switch inside a rollout (the scene's own view transition
 * carries that, useSceneOverlay), not between the Artists and Rollouts tabs
 * (their lists already fade in, 120ms, URG-377), and never after Back/Forward
 * or with reduced motion (fadeIn checks both).
 */
export function morphScreenKey(pathname: string): string {
  // The two catalogue tabs share one key: their own list fade runs there.
  if (pathname === '/dashboard/artists' || pathname === '/dashboard') return 'catalogue';
  return pathname;
}

/** Fade the page under the chrome in (a same-path screen change). */
export function fadeInScreen(): void {
  if (typeof document === 'undefined') return;
  fadeIn(document.querySelector<HTMLElement>('[data-morph-root]'));
}

export function MainMorph({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const key = morphScreenKey(pathname);
  const ref = useRef<HTMLDivElement>(null);
  const previousKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    const previous = previousKey.current;
    previousKey.current = key;
    if (previous === null || previous === key) return;
    fadeIn(ref.current);
  }, [key]);

  return (
    <div ref={ref} data-morph-root="">
      {children}
    </div>
  );
}
