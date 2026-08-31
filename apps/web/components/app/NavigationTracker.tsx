'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordNavigation } from '@/lib/nav-history';
import { startInstallPromptCapture } from '@/lib/install-prompt';

// Whether to listen for the browser's install offer at all. Gated here as
// well as at the card so a flag-off build attaches no listeners.
const INSTALL_PROMPT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_INSTALL_PROMPT === 'true';

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
 *
 * It also starts the install prompt's beforeinstallprompt capture, and the
 * reason is timing rather than tidiness: Chrome fires that event once,
 * shortly after load, and an unlistened event is simply gone — while
 * InstallAppPrompt is a dynamic import that may not have resolved yet. This
 * module is eagerly imported by AppShell, so the listener is attached in
 * time. See lib/install-prompt.ts.
 */
export function NavigationTracker() {
  useEffect(() => {
    if (INSTALL_PROMPT_ENABLED) startInstallPromptCapture();
  }, []);

  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}
