/**
 * Shared Sentry settings for the client, server and edge runtimes (URG-372).
 *
 * ERRORS ONLY, on purpose. PostHog already records sessions, so there is no
 * Session Replay here, no profiling, and tracing is off everywhere. Every
 * extra Sentry feature is bytes on a slow Nigerian connection or quota on a
 * free plan, and neither is worth spending until somebody needs it.
 *
 * This file must stay free of runtime Sentry imports (types only), so it can
 * be read by the lazy client chunk and the server configs alike, and so a test
 * can exercise the filters without loading the SDK.
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

type SentryInitOptions = NonNullable<Parameters<typeof import('@sentry/nextjs').init>[0]>;

/** The project's DSN is public by design (it can only SEND events), so a
 *  literal fallback is safe and means no Vercel env change is needed. Set
 *  NEXT_PUBLIC_SENTRY_DSN to point somewhere else, or to "off" to disable. */
export const SENTRY_DSN_FALLBACK =
  'https://5730daf62c62acbcacbe0df72ecd980c@o4512277649096704.ingest.de.sentry.io/4512277651783760';

export function resolveSentryDsn(value: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN): string | undefined {
  const trimmed = String(value || '').trim();
  if (trimmed === 'off' || trimmed === 'false') return undefined;
  return trimmed || SENTRY_DSN_FALLBACK;
}

/** production / preview / development, as Vercel names them. Stamped into the
 *  client bundle by next.config.js because VERCEL_ENV is server-only. */
export function resolveSentryEnvironment(): string {
  return (
    String(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || '').trim() ||
    'development'
  );
}

/** The app version (the changelog's top entry, mirrored into package.json),
 *  stamped by next.config.js. Importing @urganize/changelog here would ship
 *  the whole ledger to the browser. */
export function resolveSentryRelease(): string | undefined {
  const version = String(process.env.NEXT_PUBLIC_APP_VERSION || '').trim();
  return version ? `urganize-web@${version}` : undefined;
}

/** What an event may carry. SDK v11's defaults collect cookies, request and
 *  response bodies, query strings and user fields; here that is cut back to
 *  roughly the old `sendDefaultPii: false`: no user fields, no cookies (the
 *  Supabase session lives in one), no bodies, no query strings (OAuth codes
 *  and invite tokens travel in them), and only the headers that say which
 *  browser and page an error came from. */
export const SENTRY_DATA_COLLECTION: SentryInitOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpBodies: [],
  urlQueryParams: false,
  httpHeaders: { request: { allow: ['user-agent', 'referer', 'accept-language'] }, response: false },
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
};

/** Messages that are noise, not bugs: browser quirks, a user leaving a page
 *  mid-request, a flaky network, and the chunk 404s after a deploy that
 *  lib/chunk-recovery.ts already recovers from. */
export const SENTRY_IGNORE_ERRORS: Array<string | RegExp> = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  /^AbortError\b/,
  'The user aborted a request',
  'The operation was aborted',
  'signal is aborted without reason',
  'Fetch is aborted',
  'Load failed',
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'Network request failed',
  /^ChunkLoadError\b/,
  /Loading chunk [\w-]+ failed/,
  /Failed to load chunk/,
  'Non-Error promise rejection captured with value: undefined',
  // NEXT_REDIRECT / NEXT_NOT_FOUND are control flow, not failures.
  'NEXT_REDIRECT',
  'NEXT_NOT_FOUND',
];

/** Scripts that are not ours: browser extensions, injected wallets, in-app
 *  browser shims. An error whose stack starts there is somebody else's bug. */
export const SENTRY_DENY_URLS: RegExp[] = [
  /^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i,
  /^chrome:\/\//i,
  /^webkit-masked-url:\/\//i,
  /extensions\//i,
  /^resource:\/\//i,
];

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$|\.local$/i;

export function isLocalHost(hostname: string | undefined | null): boolean {
  return LOCAL_HOST.test(String(hostname || '').trim());
}

function eventHostname(event: ErrorEvent): string | null {
  const url = event.request?.url;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Last filter before an event leaves: nothing from a local dev server, and
 *  no aborted fetches that slipped past ignoreErrors as a non-Error object. */
export function sentryBeforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isLocalHost(eventHostname(event))) return null;
  if (typeof window !== 'undefined' && isLocalHost(window.location?.hostname)) return null;

  const original = hint?.originalException as { name?: unknown } | null | undefined;
  if (original && typeof original === 'object' && original.name === 'AbortError') return null;

  return event;
}
