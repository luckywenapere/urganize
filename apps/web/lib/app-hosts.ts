// The product app's front doors. See
// docs/notes/2026-10-28-two-front-doors-my-and-go.md.
//
// team.urganize.app is where the app lives (founder call, 29 Oct 2026; it was
// my.urganize.app for one day). go.urganize.app is the name we put on links
// people hand to someone else (a team invite, a press kit, a profile). Since
// #1380 the app answers it itself (next.config.js): a source-link slug is one
// 307 to its tagged page, any other path is one 308 to the same path on
// team.urganize.app. Vercel's domain setting must not redirect it first.
// app.urganize.app and my.urganize.app are old addresses: a browser that holds
// the sign-in hint cookie is still served the app so its session can be moved
// across (lib/legacy-host-handoff.ts), because a Supabase session is kept in
// localStorage, which is per origin; everyone else is redirected to team.
// music.urganize.app is the music side's own address (#1378, lib/music-host.ts).

export const APP_ORIGIN = 'https://team.urganize.app';
export const SHARE_ORIGIN = 'https://go.urganize.app';
export const LEGACY_APP_HOSTS: readonly string[] = ['app.urganize.app', 'my.urganize.app'];

const PRODUCT_HOSTS = new Set(['team.urganize.app', 'go.urganize.app', ...LEGACY_APP_HOSTS]);

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The origin a link meant for someone else should carry. On any production
 * product host that is go.urganize.app; anywhere else (localhost, a preview
 * deployment) the origin is kept, so a link made there still opens there.
 */
export function shareOrigin(origin: string): string {
  const clean = origin.trim().replace(/\/+$/, '');
  return PRODUCT_HOSTS.has(hostOf(clean)) ? SHARE_ORIGIN : clean;
}

/** shareOrigin() for the page the browser is on. Empty on the server. */
export function currentShareOrigin(): string {
  if (typeof window === 'undefined') return '';
  return shareOrigin(window.location.origin);
}

export function isLegacyAppHost(hostname: string): boolean {
  return LEGACY_APP_HOSTS.includes(hostname.trim().toLowerCase());
}
