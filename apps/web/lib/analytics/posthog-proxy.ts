/**
 * Routing PostHog through our own domain, so blockers cannot switch analytics
 * off for us.
 *
 * WHY (2026-09-04). Firefox's Enhanced Tracking Protection was blocking
 * `us-assets.i.posthog.com` outright — status code `(null)`, meaning the
 * request never left the browser — so posthog-js could not even load its
 * recorder. The same block killed Vercel's own `/_vercel/insights/script.js`,
 * which is SAME-ORIGIN, and that is what proved it was the browser rather than
 * anything we serve: this app sets no Content Security Policy at all.
 *
 * PostHog's own figure is that blockers drop 10-25% of events, and the losses
 * are not random — an error-tracking product that silently misses a quarter of
 * crashes is worse than useless, because the gap is invisible. Serving their
 * scripts and ingest from our domain makes the traffic first-party, so pattern
 * matching on the URL has nothing to catch.
 *
 * The pieces live in two places that cannot import each other: the rewrite
 * destinations are in `next.config.js` (CommonJS, evaluated at build time) and
 * the client's `api_host` is here. `posthog-proxy.test.ts` reads that file and
 * asserts the two agree, because the failure mode of drifting apart is the SDK
 * posting into a 404 — silent, and identical to having nothing to report.
 */

/**
 * The first-party path PostHog traffic is served from.
 *
 * DO NOT change this to something descriptive. PostHog's docs are explicit that
 * `/analytics`, `/tracking`, `/telemetry` and `/posthog` are all matched by
 * blocklists, and `/ingest` is their own published example so it is on lists
 * too. A path that means nothing to anyone but us is the entire mechanism, and
 * a test pins that.
 */
export const POSTHOG_PROXY_PATH = '/urg-relay';

const US_INGEST = 'https://us.i.posthog.com';
const EU_INGEST = 'https://eu.i.posthog.com';

/**
 * The real upstream to proxy to. Used by next.config.js's rewrite destinations
 * (which re-derive it, since they cannot import this) and by the SERVER-side
 * PostHog client, which talks to PostHog directly — proxying server-to-server
 * through our own domain would be a pointless extra hop, and pointing the
 * server at the proxy path would make it call itself.
 *
 * `app.posthog.com` is upgraded rather than honoured: it was this app's old
 * default, and it is the UI host rather than an ingest endpoint.
 */
export function resolvePostHogIngestHost(configured: string | undefined): string {
  const trimmed = (configured || '').trim().replace(/\/+$/, '');
  if (!trimmed) return US_INGEST;
  if (trimmed === 'https://app.posthog.com' || trimmed === 'http://app.posthog.com') {
    return US_INGEST;
  }
  return trimmed;
}

/** Static assets (the recorder, autocapture bundles) come from a separate host. */
export function resolvePostHogAssetsHost(ingestHost: string): string {
  if (ingestHost === EU_INGEST) return 'https://eu-assets.i.posthog.com';
  return 'https://us-assets.i.posthog.com';
}

/**
 * Where a human goes to look at the data. Handed to posthog-js as `ui_host` so
 * that with `api_host` pointed at our own path, in-app links still resolve to
 * PostHog rather than to a route on this domain that does not exist.
 */
export function resolvePostHogUiHost(configured: string | undefined): string {
  return resolvePostHogIngestHost(configured) === EU_INGEST
    ? 'https://eu.posthog.com'
    : 'https://us.posthog.com';
}
