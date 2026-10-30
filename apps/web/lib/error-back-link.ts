/**
 * Where the crash screen's "Back to Home" goes (2026-10-09, updated
 * 2026-10-30).
 *
 * It goes to Home, /dashboard, the artist list (the Rollouts list that used to
 * live there was turned off on Oct 30, 2026). A crashed rollout
 * (/dashboard?release=) goes there too: the list is a different page.
 *
 * The one page that cannot be sent there is Home itself, or the way out leads
 * straight back into the same crash; a crash there goes to Team instead. Pure,
 * so every direction is tested.
 */
export const ERROR_BACK_PATH = '/dashboard';
export const ERROR_BACK_FALLBACK_PATH = '/dashboard/team';

export function errorBackHref(pathname: string | null | undefined, search?: string | null): string {
  const path = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path !== ERROR_BACK_PATH) return ERROR_BACK_PATH;
  const onRollout = Boolean(new URLSearchParams(search || '').get('release'));
  return onRollout ? ERROR_BACK_PATH : ERROR_BACK_FALLBACK_PATH;
}
