'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureAnalyticsPageView, captureFeatureDiscovery } from '@/lib/analytics';

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname || typeof window === 'undefined') {
      return;
    }

    const url = search ? `${window.location.origin}${pathname}?${search}` : `${window.location.origin}${pathname}`;

    captureAnalyticsPageView({
      pathname,
      search,
      url,
    });
    captureFeatureDiscovery(pathname);
  }, [pathname, search]);

  return null;
}
