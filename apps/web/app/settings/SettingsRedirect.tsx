'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { legacySettingsTarget, settingsDeepLink } from '@/lib/settings-nav';

/**
 * `/settings` is not a page any more (2026-09-29). Settings is a pop-up that
 * opens over the dashboard from `?settings=`, and this route exists only so
 * every link that ever pointed here keeps working: the payment callback, an
 * emailed `/settings#directory`, an installed PWA's history, a bookmark, an
 * older UrgAns transcript.
 *
 * It has to run in the browser, not on the server, because a URL hash never
 * reaches the server and `#directory` / `#brand-colors` / `#teammates` are the
 * links that matter most. The mapping itself is `legacySettingsTarget` in
 * lib/settings-nav.ts, which is where it is tested.
 *
 * It reads `window.location` in an effect rather than `useSearchParams`, the
 * `/auth` rule: `useSearchParams` in a statically prerendered client page makes
 * Next serve the nearest Suspense fallback as the page's HTML, and this route
 * must stay `○ Static`.
 *
 * `replace`, not `push`, so Back leaves rather than bouncing off this stub.
 */
export default function SettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    const { segment, section } = legacySettingsTarget(window.location.search, window.location.hash);
    router.replace(settingsDeepLink({ segment, section }));
  }, [router]);

  // Nothing worth painting: the redirect is one client-side hop. The empty
  // block keeps the page from collapsing to zero height under the app chrome
  // for that frame.
  return <main className="min-h-[50dvh]" aria-busy="true" />;
}
