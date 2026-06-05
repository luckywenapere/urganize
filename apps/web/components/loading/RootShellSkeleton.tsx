'use client';

import { Loader2 } from 'lucide-react';

/**
 * Root-segment Suspense fallback (mounted by `app/loading.tsx`). Catches any
 * route that doesn't ship its own `loading.tsx`. Routes that DO ship one
 * (workspace, settings, release detail, auth) render their tailored skeletons
 * instead; this is a neutral fallback only.
 *
 * Frame-reservation doesn't apply at this level — the eventual content shape
 * is unknown — so the render is a small centered spinner. Spinner respects
 * `prefers-reduced-motion` via the global animation-duration clamp in
 * `globals.css`.
 */
export function RootShellSkeleton() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-bg-base text-content-primary"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </main>
  );
}
