// Moving people from the old addresses (app.urganize.app, and my.urganize.app,
// the main address for one day) to team.urganize.app without signing them out
// (2026-10-29). The Supabase session sits in localStorage, which belongs to
// one origin, so a plain redirect lands every signed-in person on the new host
// signed out (found when the Vercel 308 went live for a few minutes).
//
// So the old hosts keep serving the app, and the page itself moves people:
// - A sign-in link already in flight (an email confirm, a Google return: a
//   token or an error in the hash, or /auth/callback) is forwarded as it is.
//   The early script in app/layout.tsx does this before supabase-js can read
//   the hash and store the session on the old host.
// - Otherwise a signed-in person goes to /auth/handoff on the new host with
//   their session in the hash (never the query: a hash is not sent to any
//   server), which stores it there and opens the page they were on.
// - A signed-out person goes to the same path on the new host.
//
// Once traffic on an old host has died down, its Vercel domain can be set to a
// 308 redirect to team.urganize.app; when both are, delete this module.

import { APP_ORIGIN, LEGACY_APP_HOSTS } from './app-hosts';
import { isSafeNextPath } from './email-confirmation';

export const HANDOFF_PATH = '/auth/handoff';
export const HANDOFF_HASH_TYPE = 'handoff';

export interface HandoffLocation {
  pathname: string;
  search: string;
  hash: string;
}

export interface HandoffSession {
  access_token: string;
  refresh_token: string;
  /** Passed along so supabase-js's own URL detection accepts the hash too. */
  expires_in?: number;
  expires_at?: number;
}

/** A sign-in link in flight: forward it untouched for the new host to finish. */
export function isAuthReturn(location: HandoffLocation): boolean {
  if (location.pathname === '/auth/callback' || location.pathname.startsWith('/auth/callback/')) return true;
  return /(^|[#&])(access_token|error|error_description)=/.test(location.hash);
}

export function buildHandoffUrl(location: HandoffLocation, session: HandoffSession | null): string {
  const here = `${location.pathname}${location.search}`;
  if (isAuthReturn(location) || !session?.access_token || !session.refresh_token) {
    return `${APP_ORIGIN}${here}${location.hash}`;
  }
  const next = isSafeNextPath(here) && !location.pathname.startsWith(HANDOFF_PATH) ? here : '/';
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    expires_in: String(session.expires_in ?? 3600),
    type: HANDOFF_HASH_TYPE,
  });
  if (session.expires_at) hash.set('expires_at', String(session.expires_at));
  return `${APP_ORIGIN}${HANDOFF_PATH}?next=${encodeURIComponent(next)}#${hash.toString()}`;
}

/** The session /auth/handoff was given, or null when the hash is not one. */
export function parseHandoffHash(hash: string): HandoffSession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('type') !== HANDOFF_HASH_TYPE) return null;
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  return access && refresh ? { access_token: access, refresh_token: refresh } : null;
}

/**
 * Runs in <head> before the app loads. Only forwards sign-in links in flight;
 * everything else waits for <LegacyHostHandoff>, which can read the session.
 * Mirrors isAuthReturn(); legacy-host-handoff.test.ts holds the two together.
 */
export const LEGACY_HOST_EARLY_SCRIPT = `(function(){try{var l=window.location;if(${JSON.stringify(
  LEGACY_APP_HOSTS
)}.indexOf(l.hostname)<0)return;var p=l.pathname;if(p==='/auth/callback'||p.indexOf('/auth/callback/')===0||/(^|[#&])(access_token|error|error_description)=/.test(l.hash)){l.replace(${JSON.stringify(
  APP_ORIGIN
)}+p+l.search+l.hash);}}catch(e){}})();`;
