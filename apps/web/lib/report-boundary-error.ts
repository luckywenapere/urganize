import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';

/**
 * The reporting side of a component-level `ErrorBoundary`, kept out of the
 * boundary component so the boundary itself imports nothing that can fail.
 *
 * Deliberately swallows its own failures. A boundary whose reporter throws
 * unmounts the thing it was containing — see the try/catch at the call site in
 * ErrorBoundary.componentDidCatch, which is the belt to this braces.
 */
export function reportBoundaryError(error: Error, scope: string) {
  try {
    captureAnalyticsEvent(
      createPostHogEvent('app_error_shown', {
        scope,
        // Read at call time rather than passed in: a widget boundary has no
        // router context of its own, and this only ever runs in the browser.
        pathname: typeof window === 'undefined' ? 'unknown' : window.location.pathname,
        error_name: error.name || 'Error',
      })
    );
  } catch {
    // Ignore — the console.error in the boundary is the durable record.
  }
}
