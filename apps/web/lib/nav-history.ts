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

/** Pages that must never be a back destination.
 *
 * Every one of them either bounces (the auth pages and /locked redirect an
 * authenticated team straight back into the app) or is a one-way flow step that
 * makes no sense to re-enter. Sending someone "back" to one is worse than not
 * moving them at all. */
const NON_DESTINATION_PREFIXES = [
  '/auth',
  '/onboarding',
  '/locked',
  '/start-trial',
  '/redeem',
  '/invite',
  '/join',
  '/payment',
] as const;

/** Does this URL scope the given release in the workspace?
 *
 * Read off the query string rather than by substring match, so a release id
 * appearing anywhere else in the URL cannot produce a false positive. */
function scopesRelease(url: string, releaseId: string): boolean {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return false;
  try {
    return new URLSearchParams(url.slice(queryStart + 1)).get('release') === releaseId;
  } catch {
    return false;
  }
}

/**
 * Where the workspace's back arrow should go, or null for "no usable previous —
 * fall back to dropping the release scope".
 *
 * Called only when NO scene is open: with a scene open the arrow closes the
 * scene and never consults history at all, which is what makes scene-to-scene
 * ping-pong structurally impossible rather than merely guarded against.
 *
 * TWO REJECTIONS, and the first is the whole reason this function exists:
 *
 *  1. A PREVIOUS LOCATION THAT STILL SCOPES THE SAME RELEASE IS NOT "BACK".
 *     nav-history holds one slot, not a stack, and skips same-URL writes — so
 *     immediately after closing a scene the previous location IS that scene's
 *     own URL. Pushing it would re-open the thing the user just left, and the
 *     user would be stuck bouncing between two URLs. Going back to the release
 *     you are trying to leave is not leaving it. This is the analogue of the
 *     Settings back button's `!previous.startsWith('/settings')` guard, which
 *     does not transfer directly because both URLs here share one pathname.
 *  2. A flow page (see NON_DESTINATION_PREFIXES).
 *
 * The same-origin check mirrors readPreviousLocation's, because this is also
 * reachable with a value that never went through it.
 */
export function resolveWorkspaceBackTarget(input: {
  previous: string | null;
  scopedReleaseId: string | null;
}): string | null {
  const previous = input.previous;
  if (!previous) return null;
  if (!previous.startsWith('/') || previous.startsWith('//')) return null;

  const path = previous.split('?')[0] ?? '';
  if (
    NON_DESTINATION_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  ) {
    return null;
  }

  if (input.scopedReleaseId && scopesRelease(previous, input.scopedReleaseId)) {
    return null;
  }

  return previous;
}
