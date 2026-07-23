'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordNavigation } from '@/lib/nav-history';

function TrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    recordNavigation(query ? `${pathname}?${query}` : pathname);
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
