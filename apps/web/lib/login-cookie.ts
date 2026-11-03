// A "this browser is signed in" hint the marketing site (urganize.app) can read.
//
// The Supabase session lives in localStorage on team.urganize.app, and
// localStorage is per origin, so the marketing site cannot see it. A cookie on
// the parent domain is the one signal both hosts can read. It holds the single
// character "1" and nothing else: no token, no user id. It is a HINT, like the
// pre-paint `data-auth-session` probe on /auth. If the session has since
// expired the visitor is sent to the app and lands on its login form, which
// already handles that.
//
// apps/homepage/lib/login-redirect.ts carries a copy of the cookie name (that
// app cannot import from this one). Change both together.

export const LOGIN_COOKIE_NAME = 'urganize_in';

/** The parent domain both sites share. */
const LOGIN_COOKIE_DOMAIN = '.urganize.app';

/** 30 days. Renewed on every token refresh, so an active user never runs out. */
export const LOGIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Only the real product hosts carry the cookie. localhost and preview URLs are
 * not under .urganize.app, so a Domain=.urganize.app cookie would be refused
 * there anyway; skipping them avoids pointless writes and keeps dev quiet.
 */
export function isLoginCookieHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === 'urganize.app' || host.endsWith('.urganize.app');
}

export function buildLoginCookie(): string {
  return `${LOGIN_COOKIE_NAME}=1; Domain=${LOGIN_COOKIE_DOMAIN}; Path=/; Max-Age=${LOGIN_COOKIE_MAX_AGE_SECONDS}; Secure; SameSite=Lax`;
}

export function buildClearLoginCookie(): string {
  return `${LOGIN_COOKIE_NAME}=; Domain=${LOGIN_COOKIE_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`;
}

function writeLoginCookie(value: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  try {
    if (!isLoginCookieHost(window.location.hostname)) return;
    document.cookie = value;
  } catch {
    // Cookies blocked. The hint is a convenience, never worth an error.
  }
}

export function setLoginCookie(): void {
  writeLoginCookie(buildLoginCookie());
}

export function clearLoginCookie(): void {
  writeLoginCookie(buildClearLoginCookie());
}
