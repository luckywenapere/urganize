// Sentry for the edge runtime (URG-372). Loaded by instrumentation.ts.
// Errors, plus tracing for /api/urgans only (serverTracesSampler: every UrgAns
// request, no other route), no profiling.
import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_DATA_COLLECTION,
  SENTRY_IGNORE_ERRORS,
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  sentryBeforeSend,
  serverTracesSampler,
} from './lib/monitoring/sentry-options';

Sentry.init({
  dsn: resolveSentryDsn(),
  // Only deployed builds report. A local `next dev` or `next start` sends
  // nothing, so a developer's mistakes never land in the production project.
  enabled: Boolean(process.env.VERCEL_ENV),
  environment: resolveSentryEnvironment(),
  release: resolveSentryRelease(),
  dataCollection: SENTRY_DATA_COLLECTION,
  // Never rewrite the app's own error messages (the default appends the
  // hostname to "Failed to fetch", which could show up in the UI).
  enhanceFetchErrorMessages: 'report-only',
  ignoreErrors: SENTRY_IGNORE_ERRORS,
  beforeSend: sentryBeforeSend,
  tracesSampler: serverTracesSampler,
});
