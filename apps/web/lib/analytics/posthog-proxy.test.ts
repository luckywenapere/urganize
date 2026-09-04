import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  POSTHOG_PROXY_PATH,
  resolvePostHogAssetsHost,
  resolvePostHogIngestHost,
  resolvePostHogUiHost,
} from './posthog-proxy';

// Why this module exists (2026-09-04): Firefox's tracking protection was
// blocking us-assets.i.posthog.com outright — status code (null), the request
// never left the browser — so the SDK could not even load. PostHog's own
// estimate is that blockers drop 10-25% of events, and the ones lost are
// disproportionately the errors you most want.

describe('POSTHOG_PROXY_PATH', () => {
  it('is not a path blockers already match on', () => {
    // PostHog's docs are explicit: avoid /analytics, /tracking, /telemetry,
    // /posthog. /ingest is their own example and so is on lists too. The whole
    // point is a path a blocklist has never seen.
    for (const known of ['analytics', 'tracking', 'telemetry', 'posthog', 'ingest', 'collect', 'metrics']) {
      expect(POSTHOG_PROXY_PATH.toLowerCase(), known).not.toContain(known);
    }
  });

  it('is a root-relative path, which is what makes it first-party', () => {
    expect(POSTHOG_PROXY_PATH.startsWith('/')).toBe(true);
    expect(POSTHOG_PROXY_PATH).not.toContain('://');
    expect(POSTHOG_PROXY_PATH.endsWith('/')).toBe(false);
  });

  it('does not collide with a real route segment', () => {
    for (const route of ['/dashboard', '/settings', '/admin', '/auth', '/api', '/curator', '/epk']) {
      expect(POSTHOG_PROXY_PATH.startsWith(route)).toBe(false);
    }
  });
});

describe('resolvePostHogIngestHost', () => {
  it('defaults to US cloud', () => {
    expect(resolvePostHogIngestHost(undefined)).toBe('https://us.i.posthog.com');
    expect(resolvePostHogIngestHost('')).toBe('https://us.i.posthog.com');
    expect(resolvePostHogIngestHost('   ')).toBe('https://us.i.posthog.com');
  });

  it('honours an explicitly configured host', () => {
    expect(resolvePostHogIngestHost('https://eu.i.posthog.com')).toBe('https://eu.i.posthog.com');
  });

  it('strips a trailing slash, which would double up in a rewrite destination', () => {
    expect(resolvePostHogIngestHost('https://eu.i.posthog.com/')).toBe('https://eu.i.posthog.com');
  });

  it('upgrades the legacy app.posthog.com host to the regional ingest host', () => {
    // Our old default. It is the UI host, not an ingest host, and proxying to
    // it is not what anyone means.
    expect(resolvePostHogIngestHost('https://app.posthog.com')).toBe('https://us.i.posthog.com');
  });
});

describe('resolvePostHogAssetsHost', () => {
  it('maps each region to its own assets host', () => {
    expect(resolvePostHogAssetsHost('https://us.i.posthog.com')).toBe('https://us-assets.i.posthog.com');
    expect(resolvePostHogAssetsHost('https://eu.i.posthog.com')).toBe('https://eu-assets.i.posthog.com');
  });

  it('falls back to US assets for anything unrecognised, rather than guessing', () => {
    expect(resolvePostHogAssetsHost('https://posthog.example.com')).toBe('https://us-assets.i.posthog.com');
  });
});

describe('resolvePostHogUiHost', () => {
  it('points at the app, not the ingest endpoint, so in-app links land somewhere useful', () => {
    expect(resolvePostHogUiHost('https://us.i.posthog.com')).toBe('https://us.posthog.com');
    expect(resolvePostHogUiHost('https://eu.i.posthog.com')).toBe('https://eu.posthog.com');
  });

  it('defaults to US', () => {
    expect(resolvePostHogUiHost(undefined)).toBe('https://us.posthog.com');
  });
});

describe('next.config.js agrees with this module', () => {
  // next.config.js is CommonJS and cannot import this TypeScript module, so the
  // proxy path is written in both places. Rather than string-matching the
  // source (which misses, because the config builds its sources from a
  // template literal), this LOADS the real config and asserts the resolved
  // rewrites — so it tests what Next will actually serve. Drift means the SDK
  // posts into a 404, which is silent and looks exactly like having nothing to
  // report.
  const require_ = createRequire(import.meta.url);

  async function loadRewrites() {
    const config = require_(join(process.cwd(), 'next.config.js'));
    return (await config.rewrites()) as Array<{ source: string; destination: string }>;
  }

  it('proxies static assets to the assets host', async () => {
    const rule = (await loadRewrites()).find((r) => r.source === `${POSTHOG_PROXY_PATH}/static/:path*`);
    expect(rule).toBeDefined();
    expect(rule?.destination).toBe(`${resolvePostHogAssetsHost(resolvePostHogIngestHost(process.env.NEXT_PUBLIC_POSTHOG_HOST))}/static/:path*`);
  });

  it('proxies everything else to the ingest host', async () => {
    const rule = (await loadRewrites()).find((r) => r.source === `${POSTHOG_PROXY_PATH}/:path*`);
    expect(rule).toBeDefined();
    expect(rule?.destination).toBe(`${resolvePostHogIngestHost(process.env.NEXT_PUBLIC_POSTHOG_HOST)}/:path*`);
  });

  it('matches /static BEFORE the catch-all, or the recorder 404s', async () => {
    const rules = await loadRewrites();
    const staticIndex = rules.findIndex((r) => r.source === `${POSTHOG_PROXY_PATH}/static/:path*`);
    const catchAllIndex = rules.findIndex((r) => r.source === `${POSTHOG_PROXY_PATH}/:path*`);
    expect(staticIndex).toBeGreaterThanOrEqual(0);
    expect(staticIndex).toBeLessThan(catchAllIndex);
  });

  it('sets skipTrailingSlashRedirect, which PostHog\u2019s API needs', () => {
    expect(require_(join(process.cwd(), 'next.config.js')).skipTrailingSlashRedirect).toBe(true);
  });
});
