/** @type {import('next').NextConfig} */

// The /_next/image optimizer fetches whatever host remotePatterns allows, so a
// '**' wildcard turns it into an open proxy anyone can drive to burn image-
// optimization quota. Both next/image call sites (workspace release cover art,
// settings workspace logo) load signed Supabase Storage URLs, so only that
// host/path is allowed. Derived from env at build time; a malformed URL fails
// the build loudly rather than shipping a broken allowlist.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : null;

// PostHog reverse proxy (2026-09-04). Firefox's tracking protection was
// blocking us-assets.i.posthog.com outright — status code (null), the request
// never left the browser — so the SDK could not load and not one event was ever
// recorded. The same block killed Vercel's own SAME-ORIGIN
// /_vercel/insights/script.js, which is what proved it was the browser rather
// than anything we serve (this app sets no CSP at all).
//
// Serving PostHog from our own domain makes the traffic first-party, so URL
// pattern matching has nothing to catch. PostHog's figure is that blockers drop
// 10-25% of events, and for error tracking the missing quarter is invisible.
//
// The path is duplicated in lib/analytics/posthog-proxy.ts, which this file
// cannot import (CommonJS, build time). posthog-proxy.test.ts LOADS this file
// and asserts the resolved rewrites match — drifting apart means the SDK posts
// into a 404, which looks exactly like having nothing to report.
const POSTHOG_PROXY_PATH = '/urg-relay';
const posthogConfiguredHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || '').trim().replace(/\/+$/, '');
const posthogIngestHost =
  !posthogConfiguredHost || posthogConfiguredHost === 'https://app.posthog.com'
    ? 'https://us.i.posthog.com'
    : posthogConfiguredHost;
const posthogAssetsHost =
  posthogIngestHost === 'https://eu.i.posthog.com'
    ? 'https://eu-assets.i.posthog.com'
    : 'https://us-assets.i.posthog.com';

// One id per deployment (falls back to the commit, then the build time).
const BUILD_ID = (
  process.env.VERCEL_DEPLOYMENT_ID ||
  (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) ||
  `local-${Date.now().toString(36)}`
).replace(/[^A-Za-z0-9_-]/g, '');

// The Oct 16, 2026 feature cuts (URG-319). See the `env` block below.
const CUT_FEATURE_FLAGS = require('./lib/cut-features.json');

const nextConfig = {
  transpilePackages: ['@urganize/ui'],
  // Required by the PostHog proxy below: their ingest API is sensitive to the
  // trailing slash, and Next would otherwise 308 it away before the rewrite
  // runs. App-wide cost, measured rather than assumed: a URL typed with a
  // trailing slash no longer 308s to the canonical form — but it still SERVES
  // (checked against `next start`: /settings/ returns 200, not 404). So the
  // only real effect is a duplicate URL shape with no redirect, which no link
  // in this app emits and nothing depends on.
  skipTrailingSlashRedirect: true,
  // Version skew (2026-08-16). A tab opened before a deploy holds that build's
  // chunk URLs; once the new deployment takes the production alias those 404,
  // and the next client-side navigation — browser Back included — leaves the
  // page painted but inert (see lib/chunk-recovery.ts). Stamping the build's
  // deployment id onto asset requests is what lets Vercel Skew Protection
  // route an old client back to the deployment that owns its chunks.
  //
  // REQUIRES Skew Protection to be switched on for the project in the Vercel
  // dashboard — this line alone does nothing. Undefined outside Vercel (local,
  // CI), where Next simply omits the stamp, so it is safe everywhere.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  // Keep a warmed page for an hour, not Next's 5 minutes (2026-10-14).
  // AppShell warms every nav destination once per load; after 5 minutes the
  // warmed copy expired, so a later tap on Home went back to the network, and
  // on 3g (PostHog: ~300ms round trips) that was the 1.5-7s "stuck" tap.
  // Safe: every page payload is a static client shell with no server data, and
  // deploymentId above routes an old tab's requests to its own build.
  experimental: {
    staleTimes: { static: 3600 },
  },
  // Stamped at BUILD time and read at request time by /api/version, so the
  // deployed app can say when it was built. Evaluated once per build, which
  // is the point: a request-time `new Date()` would just report now.
  env: {
    // Feature cuts (Oct 16, 2026 brief, URG-319). These features are switched
    // off HERE rather than in Vercel so the cut is one reviewed list in git and
    // cannot be undone by an env edit. Next gives `env` precedence over the
    // process environment, so every literal process.env read of these flags,
    // client and server, sees 'false'. Data is kept; each gate's own flag-off
    // path (404s, bounces, hidden rows) does the hiding. To bring one back,
    // delete its line here (and check lib/cut-features.test.ts).
    ...CUT_FEATURE_FLAGS,
    BUILD_TIME: new Date().toISOString(),
    // The service worker's cache version (2026-10-15, URG-314): one value per
    // deployment, so each deploy registers a new worker that purges the last
    // build's caches. See public/sw-offline.js and lib/offline/register.ts.
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  // Every response names the build that produced it, so the service worker
  // only ever serves a cached page from its own build (public/sw-offline.js).
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'x-urg-build', value: BUILD_ID }] }];
  },
  // The recap card renderer reads static font binaries off disk at request
  // time (satori cannot use next/font). Output tracing only follows imports, so
  // a bare fs.readFile would leave the .ttf files out of the deployed lambda
  // and every generate would fail with ENOENT. Declare them explicitly.
  outputFileTracingIncludes: {
    '/api/releases/[releaseId]/recap': ['./assets/fonts/*.ttf'],
    // The share posters (2026-09-23) load the same four cuts through the same
    // loader, and the same rule applies: a route missing from this map ships
    // without its fonts and fails every image with ENOENT.
    '/api/releases/[releaseId]/share-card': ['./assets/fonts/*.ttf'],
    // The person share card (URG-305), same loader, same rule.
    '/p/[slug]/card': ['./assets/fonts/*.ttf'],
  },
  // /.well-known/* CANNOT be an app/ directory: Next's router ignores
  // dot-prefixed path segments, so app/.well-known/oauth-.../route.ts never
  // resolves. There is no middleware.ts in this app either (and adding one has
  // app-wide implications), so a rewrite is the mechanism.
  //
  // Both the bare and the path-suffixed forms are mapped for the
  // protected-resource document, because RFC 9728 has a client try
  // /.well-known/oauth-protected-resource/api/mcp FIRST for a resource that
  // lives at a path, and only then fall back to the root document. Serving one
  // and not the other works with some clients and silently fails with others.
  async rewrites() {
    return [
      // Order matters: /static must be matched before the catch-all, or the
      // recorder bundle is proxied to the ingest host and 404s. Pinned by test.
      {
        source: `${POSTHOG_PROXY_PATH}/static/:path*`,
        destination: `${posthogAssetsHost}/static/:path*`,
      },
      {
        source: `${POSTHOG_PROXY_PATH}/:path*`,
        destination: `${posthogIngestHost}/:path*`,
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/well-known/oauth-protected-resource',
      },
      {
        source: '/.well-known/oauth-protected-resource/:path*',
        destination: '/api/well-known/oauth-protected-resource',
      },
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/well-known/oauth-authorization-server',
      },
      {
        source: '/.well-known/oauth-authorization-server/:path*',
        destination: '/api/well-known/oauth-authorization-server',
      },
    ];
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/**',
          },
        ]
      : [],
  },
};

module.exports = nextConfig;
