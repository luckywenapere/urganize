'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordNavigation } from '@/lib/nav-history';
import { recordInstallPromptView } from '@/lib/install-prompt';

// Whether the install prompt counts "tabs of the app" at all. Gated here as
// well as at the card so a flag-off build performs no extra storage writes on
// every route change — this effect is the hottest one in the shell.
const INSTALL_PROMPT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_INSTALL_PROMPT === 'true';

function TrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    recordNavigation(url);
    // Piggy-backed rather than given its own effect: this component already
    // owns the one Suspense boundary that can read searchParams from
    // layout-level chrome, and the install prompt needs the same URL. It
    // records DISTINCT app surfaces only — see lib/install-prompt.ts.
    if (INSTALL_PROMPT_ENABLED) recordInstallPromptView(url);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Invisible route-change recorder mounted once by AppShell — feeds
 * lib/nav-history so surfaces like the Settings back button can return the
 * user to the exact page they came from (including query params like the
 * workspace's ?release= scope). Own Suspense boundary because
 * useSearchParams requires one when rendered from layout-level chrome
 * (same pattern as AppTopbar's ContextTitle).
 */
export function NavigationTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}
