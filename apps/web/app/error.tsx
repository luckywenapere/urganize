'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// Deep import (URG-314): the package barrel would pull every ui component into
// every route's first load, and this boundary is on the shared chain.
import { Button } from '@urganize/ui/Button';
import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';
import { errorBackHref } from '@/lib/error-back-link';
import { reportErrorToMonitoring } from '@/lib/monitoring/report';

// The route-level boundary. Catches anything thrown while rendering a page or
// running its effects, on the client or during a server render, and replaces
// the page with this instead of leaving the user on a half-drawn screen.
//
// It renders INSIDE the root layout, which is the point: the topbar, the mobile
// nav and the UrgAns dock all survive, so a crash costs the user their page and
// not their way out of it. The trade-off is that anything the root layout mounts
// beside <main> is out of reach here — those are wrapped in ErrorBoundary in
// AppShell instead.
//
// What this does NOT catch, so nobody reads it as broader protection than it is:
// a JS chunk that never downloads. Nothing throws in that case — React simply
// never runs — which is why the two front-door pages server-render their real
// content (see CLAUDE.md → "The front door is server-rendered"). Boundaries and
// that fix cover different halves of the same problem.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  // One report per crash. Without the guard a re-render (a theme change, a
  // resize that re-runs a layout hook) would re-fire the event and make one
  // broken page look like many in PostHog.
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${error.digest ?? ''}:${error.name}:${pathname ?? ''}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;

    captureAnalyticsEvent(
      createPostHogEvent('app_error_shown', {
        scope: 'route',
        pathname: pathname ?? 'unknown',
        error_name: error.name || 'Error',
        ...(error.digest ? { digest: error.digest } : {}),
      })
    );
    // Sentry (URG-372). A digest means the error was thrown on the server,
    // where onRequestError in instrumentation.ts already reported it with the
    // real stack; the client only holds a redacted copy, so it is skipped.
    if (!error.digest) reportErrorToMonitoring(error, { boundary: 'route' });
  }, [error, pathname]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md border border-stroke-default bg-bg-surface px-6 py-7">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Something broke
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold leading-tight text-content-primary sm:text-2xl">
          This page stopped working
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-content-secondary">
          Not something you did. Try it again. If it keeps happening, the rest of
          your work is still fine, so head back and carry on there.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {/* reset() re-renders the segment. Worth offering first: a good share
              of these are a one-off bad response rather than a broken page. */}
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
          {/* The catalogue, not Home: Home is the landing page, so linking
              there made a crash on Home loop back into itself
              (lib/error-back-link.ts). */}
          <Link
            href={errorBackHref(pathname)}
            className="inline-flex min-h-11 items-center justify-center border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary"
          >
            Back to your rollouts
          </Link>
        </div>

        {/* The digest is the only handle that ties what the user saw to the
            server log for it, so it is worth showing rather than hiding. */}
        {error.digest ? (
          <p className="mt-6 border-t border-stroke-subtle pt-4 text-xs leading-relaxed text-content-tertiary">
            If you report this, quote{' '}
            <span className="font-mono text-content-secondary">{error.digest}</span>. It
            points us at the exact failure.
          </p>
        ) : null}
      </div>
    </div>
  );
}
