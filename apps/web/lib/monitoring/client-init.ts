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
  SENTRY_CLIENT_TRACES_SAMPLE_RATE,
} from './sentry-options';
import type { MonitoringBreadcrumb } from './report';

// Integrations that record sessions or profile. PostHog records sessions, so
// these stay off even if a future SDK default adds them. Tracing is on, at a
// small sample (sentry-options.ts), through browserTracingIntegration below.
const UNWANTED_INTEGRATIONS = new Set([
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
    // Errors, plus performance traces for a tenth of page loads so a dropped
    // UrgAns reply can be followed from the browser into /api/urgans (trace
    // headers go to our own origin only, the SDK default). No replay, no
    // profiling.
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) => !UNWANTED_INTEGRATIONS.has(integration.name) && integration.name !== 'BrowserTracing'
      ),
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: SENTRY_CLIENT_TRACES_SAMPLE_RATE,
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

export function addBrowserBreadcrumb(crumb: MonitoringBreadcrumb) {
  Sentry.addBreadcrumb({ type: 'default', level: crumb.level ?? 'info', ...crumb });
}
