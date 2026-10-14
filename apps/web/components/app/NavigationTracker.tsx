'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordNavigation } from '@/lib/nav-history';

// Whether to listen for the browser's install offer at all. Gated here as
// well as at the card so a flag-off build attaches no listeners.

function TrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    recordNavigation(url);
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
