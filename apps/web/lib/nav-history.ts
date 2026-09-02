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
// so does any page/release pair.
//
// (The workspace back arrow that report was about no longer reads this module
// at all — see the note further down. Settings' back button still does, and the
// stack is what keeps IT terminating.)
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

// THE WORKSPACE BACK ARROW NO LONGER READS ANY OF THIS (2026-08-30).
//
// `resolveWorkspaceBackTarget` lived here until the founder rejected a
// history-aware release back arrow outright: it now always leaves the release
// for the catalog, so it needs no previous location, no rejections and no
// scene special case. See WorkspaceView's `goBack` for the reasoning; git
// history has the resolver if a smart destination is ever wanted again.
//
// SETTINGS IS THE ONLY CONSUMER LEFT, and it is a genuinely different button:
// Settings is a place you visit from somewhere, so returning to that somewhere
// is the whole point of it (founder request, 2026-07-23). It guards only
// against landing back on `/settings`, so the flow-page rejection the deleted
// resolver carried is gone with it — a Settings back CAN in principle land on
// a page like `/auth` that bounces an authenticated user straight into the
// app. Pre-existing rather than introduced here (the resolver never guarded
// Settings), and worth a guard of its own if it ever shows up in practice.
