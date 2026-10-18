/**
 * The browser Sentry client (URG-372). Loaded ONLY through the dynamic
 * import in lib/monitoring/report.ts, after the page has loaded and the main
 * thread is idle, so the SDK never rides the shared first-load bundle
 * (PERFORMANCE.md). Do not import this file statically from anywhere.
 */
import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_DENY_URLS,
  SENTRY_DATA_COLLECTION,
  SENTRY_IGNORE_ERRORS,
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  sentryBeforeSend,
} from './sentry-options';

// Integrations that measure performance or record sessions. This is an
// errors-only setup, so they are dropped even if a future SDK default adds them.
const UNWANTED_INTEGRATIONS = new Set([
  'BrowserTracing',
  'Replay',
  'ReplayCanvas',
  'BrowserProfiling',
  'Feedback',
]);

let started = false;

/** Returns false when there is nothing to send to (no DSN). */
export function initBrowserSentry(): boolean {
  if (started) return true;
  const dsn = resolveSentryDsn();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: resolveSentryEnvironment(),
    release: resolveSentryRelease(),
    // Errors only: no tracing (tracesSampleRate left unset means no spans and
    // no trace headers on our fetches), no replay, no profiling.
    integrations: (defaults) => defaults.filter((integration) => !UNWANTED_INTEGRATIONS.has(integration.name)),
    dataCollection: SENTRY_DATA_COLLECTION,
    // Never rewrite the app's own error messages (the default appends the
    // hostname to "Failed to fetch", which could show up in the UI).
    enhanceFetchErrorMessages: 'report-only',
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    denyUrls: SENTRY_DENY_URLS,
    beforeSend: sentryBeforeSend,
    // Enough context to read a crash; half the default keeps events small.
    maxBreadcrumbs: 50,
  });
  started = true;
  return true;
}

export function captureBrowserError(error: unknown, context?: Record<string, string>) {
  Sentry.captureException(error, context ? { tags: context } : undefined);
}
