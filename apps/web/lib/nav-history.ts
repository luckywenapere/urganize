// In-app "where did I come from" memory (founder request, 2026-07-23): the
// Settings back button returns to the EXACT previous page — a scoped
// workspace, a release, Chappi — not a hardcoded destination. Tracked in
// sessionStorage (per-tab, dies with the tab) by NavigationTracker on every
// route change; browser history alone can't answer this reliably (deep
// links, fresh tabs, external referrers).

const CURRENT_KEY = 'urganize.nav.current';
const PREVIOUS_KEY = 'urganize.nav.previous';

/** Record the tab's current in-app URL; the one it replaces becomes the
 * "previous location". Same-URL re-renders are ignored. */
export function recordNavigation(url: string) {
  if (typeof window === 'undefined' || !url) return;
  try {
    const current = window.sessionStorage.getItem(CURRENT_KEY);
    if (current === url) return;
    if (current) window.sessionStorage.setItem(PREVIOUS_KEY, current);
    window.sessionStorage.setItem(CURRENT_KEY, url);
  } catch {
    // sessionStorage can throw in private modes — the back button falls
    // back to /dashboard, which is always safe.
  }
}

/** The in-app URL the user was on before the current page, or null. */
export function readPreviousLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const previous = window.sessionStorage.getItem(PREVIOUS_KEY);
    // Only ever return same-app relative paths — defense against anything
    // untoward finding its way into the slot.
    if (previous && previous.startsWith('/') && !previous.startsWith('//')) {
      return previous;
    }
    return null;
  } catch {
    return null;
  }
}
