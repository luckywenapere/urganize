import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildClearLoginCookie,
  buildLoginCookie,
  isLoginCookieHost,
  LOGIN_COOKIE_MAX_AGE_SECONDS,
  LOGIN_COOKIE_NAME,
} from './login-cookie';
// The marketing site's half. It cannot import from this app, so this test is
// what holds the two copies of the cookie name and the redirect decision
// together.
import {
  LOGIN_COOKIE_NAME as HOMEPAGE_COOKIE_NAME,
  LOGIN_REDIRECT_SCRIPT,
  shouldRedirectToApp,
} from '../../homepage/lib/login-redirect';

describe('the login cookie', () => {
  it('is shared across the parent domain and only ever holds 1', () => {
    const cookie = buildLoginCookie();
    expect(cookie).toContain(`${LOGIN_COOKIE_NAME}=1;`);
    expect(cookie).toContain('Domain=.urganize.app');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Max-Age=${LOGIN_COOKIE_MAX_AGE_SECONDS}`);
    // Nothing token-shaped: name=1 and attributes, no other key=value.
    const pairs = cookie.split(';').map((p) => p.trim().split('=')[0]);
    expect(pairs).toEqual([
      LOGIN_COOKIE_NAME,
      'Domain',
      'Path',
      'Max-Age',
      'Secure',
      'SameSite',
    ]);
  });

  it('is cleared with the same domain and path, or the browser keeps it', () => {
    const clear = buildClearLoginCookie();
    expect(clear).toContain(`${LOGIN_COOKIE_NAME}=;`);
    expect(clear).toContain('Domain=.urganize.app');
    expect(clear).toContain('Path=/');
    expect(clear).toContain('Max-Age=0');
  });

  it('is only written on the real product hosts', () => {
    expect(isLoginCookieHost('app.urganize.app')).toBe(true);
    expect(isLoginCookieHost('urganize.app')).toBe(true);
    expect(isLoginCookieHost('APP.Urganize.app')).toBe(true);
    expect(isLoginCookieHost('localhost')).toBe(false);
    expect(isLoginCookieHost('web-git-x.vercel.app')).toBe(false);
    // A lookalike must not count.
    expect(isLoginCookieHost('evilurganize.app')).toBe(false);
    expect(isLoginCookieHost('urganize.app.evil.test')).toBe(false);
  });
});

describe('the marketing site redirect', () => {
  it('uses the same cookie name as the app', () => {
    expect(HOMEPAGE_COOKIE_NAME).toBe(LOGIN_COOKIE_NAME);
  });

  it('redirects only when the cookie is present', () => {
    expect(shouldRedirectToApp(`${LOGIN_COOKIE_NAME}=1`, '')).toBe(true);
    expect(shouldRedirectToApp(`a=b; ${LOGIN_COOKIE_NAME}=1; c=d`, '')).toBe(true);
    expect(shouldRedirectToApp('', '')).toBe(false);
    expect(shouldRedirectToApp('a=b', '')).toBe(false);
    expect(shouldRedirectToApp(`${LOGIN_COOKIE_NAME}=0`, '')).toBe(false);
    expect(shouldRedirectToApp(`x${LOGIN_COOKIE_NAME}=1`, '')).toBe(false);
  });

  it('does not redirect when asked to stay', () => {
    expect(shouldRedirectToApp(`${LOGIN_COOKIE_NAME}=1`, '?stay=1')).toBe(false);
    expect(shouldRedirectToApp(`${LOGIN_COOKIE_NAME}=1`, '?a=b&stay')).toBe(false);
    expect(shouldRedirectToApp(`${LOGIN_COOKIE_NAME}=1`, '?stayed=1')).toBe(true);
  });

  // The script is hand-written text that runs in the browser, so run it and
  // check it agrees with the function above rather than trusting the copy.
  function runScript(cookie: string, search: string): string | null {
    let target: string | null = null;
    new Function('location', 'document', LOGIN_REDIRECT_SCRIPT)(
      { search, replace: (url: string) => (target = url) },
      { cookie },
    );
    return target;
  }

  it('the inline script makes the same decision as the function', () => {
    const cases: Array<[string, string]> = [
      [`${LOGIN_COOKIE_NAME}=1`, ''],
      [`a=b; ${LOGIN_COOKIE_NAME}=1`, '?x=1'],
      ['', ''],
      ['a=b', ''],
      [`${LOGIN_COOKIE_NAME}=1`, '?stay=1'],
      [`${LOGIN_COOKIE_NAME}=1`, '?stayed=1'],
      [`${LOGIN_COOKIE_NAME}=0`, ''],
    ];
    for (const [cookie, search] of cases) {
      expect(runScript(cookie, search) !== null).toBe(shouldRedirectToApp(cookie, search));
    }
    expect(runScript(`${LOGIN_COOKIE_NAME}=1`, '')).toBe('https://team.urganize.app/');
  });

  it('fails open when the page cannot read cookies', () => {
    expect(() =>
      new Function('location', 'document', LOGIN_REDIRECT_SCRIPT)(
        { search: '', replace: () => {} },
        {
          get cookie(): string {
            throw new Error('blocked');
          },
        },
      ),
    ).not.toThrow();
  });
});

describe('the app keeps the cookie in step with the session', () => {
  const source = readFileSync(join(__dirname, 'auth-store.ts'), 'utf8');
  const handlerStart = source.indexOf('supabase.auth.onAuthStateChange');
  const handler = source.slice(handlerStart);
  const between = (from: string, to: string): string => {
    const a = handler.indexOf(from);
    const b = handler.indexOf(to, a + from.length);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return handler.slice(a, b);
  };

  it('sets it for a live session, a sign-in and a token refresh', () => {
    expect(between("event === 'INITIAL_SESSION'", "event === 'SIGNED_OUT'")).toContain(
      'setLoginCookie()',
    );
    expect(between("event === 'SIGNED_IN'", "event === 'TOKEN_REFRESHED'")).toContain(
      'setLoginCookie()',
    );
    expect(handler.slice(handler.indexOf("event === 'TOKEN_REFRESHED'"))).toContain(
      'setLoginCookie()',
    );
  });

  it('clears it on sign-out and when no session is found', () => {
    expect(between("event === 'SIGNED_OUT'", "event === 'SIGNED_IN'")).toContain(
      'clearLoginCookie()',
    );
    expect(between("event === 'INITIAL_SESSION'", 'return;')).toContain('clearLoginCookie()');
  });
});
