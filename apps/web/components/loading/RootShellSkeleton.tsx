'use client';

// Deep import (URG-314): see app/error.tsx.
import { LoadingMark } from '@urganize/ui/LoadingScreen';

/**
 * Root-segment Suspense fallback (mounted by `app/loading.tsx`). Catches any
 * route that doesn't ship its own `loading.tsx`. Routes that DO ship one
 * (dashboard, settings, admin, auth, and the public token pages) render their
 * tailored skeletons instead; this is a neutral fallback only.
 *
 * Frame-reservation doesn't apply at this level — the eventual content shape
 * is unknown — so the render is the small centered brand mark (2026-08-05:
 * replaces the generic spinner, matching `LoadingScreen`). It respects
 * `prefers-reduced-motion` via the global animation-duration clamp in
 * `globals.css`.
 */
export function RootShellSkeleton() {
  return (
    <main
      className="flex min-h-screen items-center justify-center text-content-primary"
      role="status"
      aria-live="polite"
    >
      <LoadingMark />
      <span className="sr-only">Loading</span>
    </main>
  );
}
