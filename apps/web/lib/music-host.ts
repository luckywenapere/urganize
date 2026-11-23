/**
 * Urganize Music has its own address, music.urganize.app (#1378), and
 * team.urganize.app opens the workspace again. Pure, so the rules for which
 * address a person lands on, and where a link between the two sides points,
 * are held by tests.
 *
 * Sign-in works on both addresses (founder call). A sign-in is kept per
 * address, so someone signed in on one may need to sign in again on the other.
 */

export const MUSIC_HOST = 'music.urganize.app';
export const TEAM_HOST = 'team.urganize.app';

const PRODUCTION_HOSTS = new Set([MUSIC_HOST, TEAM_HOST, 'app.urganize.app']);

function cleanHost(host: string | null | undefined): string {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
}

/** True on the music address. */
export function isMusicHost(host: string | null | undefined): boolean {
  return cleanHost(host) === MUSIC_HOST;
}

/** Where the site root sends someone: the music side on the music address,
 *  the workspace everywhere else (signed-out people bounce on to sign-in). */
export function rootPathForHost(host: string | null | undefined): '/music' | '/dashboard' {
  return isMusicHost(host) ? '/music' : '/dashboard';
}

/** Where a plain sign-in lands: back on music when it happened on the music
 *  address, the workspace otherwise. */
export function defaultSignInPath(host: string | null | undefined): '/music' | '/dashboard' {
  return rootPathForHost(host);
}

/**
 * A link to the music side from the workspace. On the live team address it is
 * the music address; on a preview or local copy it stays relative, because the
 * music address only serves production.
 */
export function musicHref(currentHost: string | null | undefined, path = '/music'): string {
  const host = cleanHost(currentHost);
  if (host === MUSIC_HOST || !PRODUCTION_HOSTS.has(host)) return path;
  return `https://${MUSIC_HOST}${path}`;
}

/** A link to the workspace from the music side, the same way round. */
export function teamHref(currentHost: string | null | undefined, path = '/dashboard'): string {
  const host = cleanHost(currentHost);
  if (host !== MUSIC_HOST) return path;
  return `https://${TEAM_HOST}${path}`;
}
