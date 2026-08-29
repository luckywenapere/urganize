// In-app "where did I come from" memory (founder request, 2026-07-23): the
// Settings back button returns to the EXACT previous page — a scoped
// workspace, a release, Chappi — not a hardcoded destination. Tracked in
// sessionStorage (per-tab, dies with the tab) by NavigationTracker on every
// route change; browser history alone can't answer this reliably (deep
// links, fresh tabs, external referrers).
//
// A STACK, NOT ONE SLOT (2026-08-29), and the difference is the entire reason
// the back buttons used to trap people. The old shape was a `current` +
// `previous` pair, so every back press REFILLED the slot with the page it had
// just left — which made the next back press return there. Two surfaces read
// this (the workspace arrow and Settings), so the loop was one tap wide:
//
//   release -> Settings -> back -> release -> back -> Settings -> back -> ...
//
// The founder hit exactly that and reported "this back button gets stuck a lot,
// I can't even go back". Two different releases loop the same way (UrgAns, a
// note's release chip and the desktop rails can all move you between them), and
// so does any page/release pair. `resolveWorkspaceBackTarget`'s same-release
// guard below caught ONE instance of this shape; the data structure is what
// caused it.
//
// With a stack, returning to the entry directly beneath the top POPS instead of
// pushing (see recordNavigation), so back always shrinks the trail and always
// terminates. It costs one JSON parse per route change on a per-tab store.

const STACK_KEY = 'urganize.nav.stack';

/** Trail depth. Long enough that back stays useful across a real session,
 * short enough that scene switching — which `replace`s, and therefore appends
 * without a matching pop — can't grow this without bound. */
const MAX_DEPTH = 20;

/** Same-app relative paths only — defense against anything untoward reaching
 * the trail, and the reason a stored value can be trusted as a push target. */
function isInAppUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function readStack(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isInAppUrl).slice(-MAX_DEPTH);
  } catch {
    // Unparseable (a half-written value, a shape from an older build) is
    // treated as no history at all: back falls through to its floor, which is
    // always safe, and the trail rebuilds from the next navigation.
    return [];
  }
}

/**
 * The trail after navigating to `url` — the whole decision, kept pure so it can
 * be tested without a browser (this repo runs vitest in `node`).
 *
 * Three cases, and the middle one is what makes back terminate:
 *  - Same URL as the top: a re-render, not a navigation. Unchanged.
 *  - The entry directly BENEATH the top: the user went back one step (our own
 *    button, the browser's, or an edge swipe — this cannot tell them apart and
 *    does not need to). Pop, so the page they left is forgotten rather than
 *    becoming the next "previous".
 *  - Anything else: a forward move. Push, capped at MAX_DEPTH.
 */
export function nextNavigationStack(stack: readonly string[], url: string): string[] {
  if (!isInAppUrl(url)) return [...stack];
  if (stack[stack.length - 1] === url) return [...stack];
  if (stack.length > 1 && stack[stack.length - 2] === url) return stack.slice(0, -1);
  return [...stack, url].slice(-MAX_DEPTH);
}

/** Record the tab's current in-app URL. See nextNavigationStack for the rules. */
export function recordNavigation(url: string) {
  if (typeof window === 'undefined' || !isInAppUrl(url)) return;
  try {
    const next = nextNavigationStack(readStack(), url);
    window.sessionStorage.setItem(STACK_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage can throw in private modes — the back buttons fall back
    // to their own floors (/dashboard for Settings, dropping the release
    // scope for the workspace), both of which are always safe.
  }
}

/** The in-app URL the user was on before the current page, or null. */
export function readPreviousLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const stack = readStack();
  return stack.length > 1 ? (stack[stack.length - 2] ?? null) : null;
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
 * THREE REJECTIONS, and the first is the whole reason this function exists:
 *
 *  1. A PREVIOUS LOCATION THAT STILL SCOPES THE SAME RELEASE IS NOT "BACK".
 *     Scene switches `replace`, which appends to the trail without a matching
 *     pop, so the entry beneath the top can still be a scene of the release
 *     being left. Pushing it would re-open the thing the user just closed.
 *     Going back to the release you are trying to leave is not leaving it.
 *     This is the analogue of the Settings back button's
 *     `!previous.startsWith('/settings')` guard, which does not transfer
 *     directly because both URLs here share one pathname.
 *  2. A flow page (see NON_DESTINATION_PREFIXES).
 *  3. THE PAGE THE USER IS ALREADY ON. The trail cannot normally produce this
 *     — it never holds the same URL twice in a row — but a navigation that
 *     never reached NavigationTracker's effect would desync it, and the cost
 *     of being wrong here is the worst possible one for this button: a tap
 *     that visibly does nothing. Falling through to the scope drop always
 *     moves. Pass the live `window.location` value, not a render-time copy.
 *
 * The same-origin check mirrors readPreviousLocation's, because this is also
 * reachable with a value that never went through it.
 */
export function resolveWorkspaceBackTarget(input: {
  previous: string | null;
  scopedReleaseId: string | null;
  currentUrl?: string | null;
}): string | null {
  const previous = input.previous;
  if (!previous) return null;
  if (!previous.startsWith('/') || previous.startsWith('//')) return null;
  if (input.currentUrl && previous === input.currentUrl) return null;

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
