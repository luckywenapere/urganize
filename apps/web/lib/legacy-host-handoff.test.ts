import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, SHARE_ORIGIN, currentShareOrigin, isLegacyAppHost, shareOrigin } from './app-hosts';
import {
  LEGACY_HOST_EARLY_SCRIPT,
  buildHandoffUrl,
  isAuthReturn,
  parseHandoffHash,
} from './legacy-host-handoff';

const session = { access_token: 'a.b.c', refresh_token: 'r1' };
const at = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });

describe('shareOrigin', () => {
  it('puts go.urganize.app on links made on any product host', () => {
    expect(shareOrigin('https://my.urganize.app')).toBe(SHARE_ORIGIN);
    expect(shareOrigin('https://app.urganize.app/')).toBe(SHARE_ORIGIN);
    expect(shareOrigin('https://go.urganize.app')).toBe(SHARE_ORIGIN);
  });

  it('keeps localhost, previews and the marketing site as they are', () => {
    expect(shareOrigin('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(shareOrigin('https://urganize-git-x.vercel.app')).toBe('https://urganize-git-x.vercel.app');
    expect(shareOrigin('https://urganize.app')).toBe('https://urganize.app');
  });

  it('is empty on the server', () => {
    expect(currentShareOrigin()).toBe('');
  });

  it('knows the old host only', () => {
    expect(isLegacyAppHost('App.Urganize.App')).toBe(true);
    expect(isLegacyAppHost('my.urganize.app')).toBe(false);
  });
});

describe('buildHandoffUrl', () => {
  it('carries a signed-in person to /auth/handoff with the session in the hash', () => {
    const url = new URL(buildHandoffUrl(at('/dashboard', '?release=9'), session));
    expect(url.origin).toBe(APP_ORIGIN);
    expect(url.pathname).toBe('/auth/handoff');
    expect(url.searchParams.get('next')).toBe('/dashboard?release=9');
    expect(url.search).not.toContain('a.b.c');
    expect(parseHandoffHash(url.hash)).toEqual(session);
    const hash = new URLSearchParams(url.hash.slice(1));
    expect(hash.get('token_type')).toBe('bearer');
    expect(hash.get('expires_in')).toBe('3600');
  });

  it('sends a signed-out person to the same page on the new host', () => {
    expect(buildHandoffUrl(at('/k/tobi', '?r=1', '#photos'), null)).toBe(`${APP_ORIGIN}/k/tobi?r=1#photos`);
  });

  it('forwards a sign-in link in flight untouched, even when signed in', () => {
    const hash = '#access_token=x&refresh_token=y&type=signup';
    expect(buildHandoffUrl(at('/auth/callback', '?next=/dashboard', hash), session)).toBe(
      `${APP_ORIGIN}/auth/callback?next=/dashboard${hash}`
    );
    expect(buildHandoffUrl(at('/auth', '', '#error=access_denied&error_description=x'), session)).toBe(
      `${APP_ORIGIN}/auth#error=access_denied&error_description=x`
    );
  });

  it('never hands off back into /auth/handoff', () => {
    const url = new URL(buildHandoffUrl(at('/auth/handoff', '?next=/x'), session));
    expect(url.searchParams.get('next')).toBe('/');
  });
});

describe('parseHandoffHash', () => {
  it('ignores anything that is not a handoff', () => {
    expect(parseHandoffHash('#access_token=a&refresh_token=b&type=signup')).toBeNull();
    expect(parseHandoffHash('#type=handoff&access_token=a')).toBeNull();
    expect(parseHandoffHash('')).toBeNull();
  });
});

describe('the early <head> script', () => {
  function run(href: string): string | null {
    const url = new URL(href);
    let replaced: string | null = null;
    const location = {
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace: (to: string) => {
        replaced = to;
      },
    };
    new Function('window', LEGACY_HOST_EARLY_SCRIPT)({ location });
    return replaced;
  }

  it('agrees with isAuthReturn on the old host', () => {
    const cases = [
      'https://app.urganize.app/auth/callback?next=/x#access_token=a&refresh_token=b',
      'https://app.urganize.app/auth/callback?code=1',
      'https://app.urganize.app/auth#error=x&error_description=y',
      'https://app.urganize.app/dashboard',
      'https://app.urganize.app/k/tobi#photos',
    ];
    for (const href of cases) {
      const url = new URL(href);
      const forwarded = isAuthReturn(at(url.pathname, url.search, url.hash));
      expect(run(href)).toBe(forwarded ? `${APP_ORIGIN}${url.pathname}${url.search}${url.hash}` : null);
    }
  });

  it('does nothing on the new host', () => {
    expect(run('https://my.urganize.app/auth/callback#access_token=a')).toBeNull();
  });
});
