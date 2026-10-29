/**
 * Where the crash screen's "Back to your rollouts" goes (2026-10-09).
 *
 * It used to go to HOME_PATH, which is /dashboard/home since Home became the
 * landing page. So when Home itself was the page that broke, the way out led
 * straight back into the same crash, and so on. The button promises rollouts,
 * so it goes to the catalogue (/dashboard), which is where the rollouts are.
 *
 * The one page that cannot be sent there is the catalogue itself, for the same
 * reason; a crash there goes to Artists instead. Any other page goes to the
 * catalogue. Pure, so both directions are tested.
 */
export const ERROR_BACK_PATH = '/dashboard';
export const ERROR_BACK_FALLBACK_PATH = '/dashboard/artists';

export function errorBackHref(pathname: string | null | undefined): string {
  const path = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return path === ERROR_BACK_PATH ? ERROR_BACK_FALLBACK_PATH : ERROR_BACK_PATH;
}
