import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_APP_HOSTS, SHARE_ORIGIN, APP_ORIGIN } from './app-hosts';
import { LOGIN_COOKIE_NAME } from './login-cookie';
import { SOURCE_LINKS } from './source-links';

// One hop from go.urganize.app and the old app hosts (#1380). next.config.js is
// CommonJS and cannot import lib/, so it repeats the host names and the hint
// cookie name; these tests keep the copies equal and pin the rules' shape.
// The live behaviour (a real 307 for a slug, a 308 for the rest) is checked
// with `next start` and curl -H Host, see docs/notes/2026-11-23-redirect-chain.md.

type Rule = {
  source: string;
  destination: string;
  permanent: boolean;
  has?: Array<{ type: string; value?: string; key?: string }>;
  missing?: Array<{ type: string; value?: string; key?: string }>;
};

const requireFromHere = createRequire(join(process.cwd(), 'package.json'));
const config = requireFromHere('./next.config.js');
const { match } = requireFromHere('next/dist/compiled/path-to-regexp');

async function rules(): Promise<Rule[]> {
  return (await config.redirects()) as Rule[];
}
const hostOf = (rule: Rule) => rule.has?.find((c) => c.type === 'host')?.value;
const matches = (rule: Rule, path: string) => Boolean(match(rule.source)(path));

describe('go.urganize.app rules', () => {
  it('uses the share host and the app origin from lib/app-hosts', async () => {
    const goRules = (await rules()).filter((r) => hostOf(r) === new URL(SHARE_ORIGIN).hostname);
    expect(goRules.length).toBe(3);
    for (const rule of goRules) expect(rule.destination.startsWith(APP_ORIGIN)).toBe(true);
  });

  it('lets every source link slug through to the counting rewrite', async () => {
    const pass = (await rules()).find((r) => hostOf(r) === 'go.urganize.app' && r.source !== '/');
    expect(pass).toBeDefined();
    for (const link of SOURCE_LINKS) {
      expect(matches(pass!, `/${link.slug}`), link.slug).toBe(false);
    }
  });

  it('sends any other go path to the same path on the app origin, permanently', async () => {
    const pass = (await rules()).find((r) => hostOf(r) === 'go.urganize.app' && r.source !== '/')!;
    for (const path of ['/join/abc123', '/p/some-artist', '/k/token', '/xx', '/x/extra']) {
      expect(matches(pass, path), path).toBe(true);
    }
    expect(pass.destination).toBe(`${APP_ORIGIN}/:path`);
    expect(pass.permanent).toBe(true);
  });

  it('splits the bare root on the sign-in hint cookie', async () => {
    const roots = (await rules()).filter((r) => hostOf(r) === 'go.urganize.app' && r.source === '/');
    expect(roots.map((r) => r.destination)).toEqual([`${APP_ORIGIN}/dashboard`, `${APP_ORIGIN}/auth`]);
    expect(roots[0].has?.some((c) => c.type === 'cookie' && c.key === LOGIN_COOKIE_NAME)).toBe(true);
    expect(roots[1].has?.some((c) => c.type === 'cookie')).toBe(false);
  });
});

describe('legacy app hosts', () => {
  it('redirect only a browser without the hint cookie, once, to the same path', async () => {
    for (const host of LEGACY_APP_HOSTS) {
      const rule = (await rules()).find((r) => hostOf(r) === host)!;
      expect(rule, host).toBeDefined();
      expect(rule.missing).toEqual([{ type: 'cookie', key: LOGIN_COOKIE_NAME }]);
      expect(rule.destination).toBe(`${APP_ORIGIN}/:path`);
      expect(rule.permanent).toBe(false);
    }
  });

  it('never redirect API calls or build assets, so webhooks keep working', async () => {
    const rule = (await rules()).find((r) => hostOf(r) === LEGACY_APP_HOSTS[0])!;
    for (const path of ['/api/webhooks/paystack', '/api', '/_next/static/chunk.js']) {
      expect(matches(rule, path), path).toBe(false);
    }
    for (const path of ['/', '/dashboard', '/auth/callback', '/apiary', '/onboarding']) {
      expect(matches(rule, path), path).toBe(true);
    }
  });

  it('config copies of the hosts match lib/app-hosts', async () => {
    const hosts = (await rules())
      .filter((r) => r.missing && hostOf(r))
      .map((r) => hostOf(r));
    expect(hosts).toEqual([...LEGACY_APP_HOSTS]);
  });
});
