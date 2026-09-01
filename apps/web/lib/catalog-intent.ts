import { forgetSceneForCurrentRelease } from './scene-memory';

// "The user has asked for the catalog this session, so stop bouncing them out
// of it."
//
// WHY THIS EXISTS. A workspace holding exactly one release scopes itself to
// that release on arrival — "a catalog of one is not a catalog" (founder call,
// 2026-08-12), so activities ARE the dashboard and the one-card grid is a dead
// click. That convenience is guarded in WorkspaceView by a useRef, whose own
// comment says what the bug is out loud: it means "the auto-scope has had its
// one chance THIS MOUNT". WorkspaceView unmounts the moment you leave
// /dashboard, so the chance came back every time you returned — and Home,
// Catalog and the back arrow all return. Tapping Home from Settings on a
// single-release account therefore navigated to the catalog and was dragged
// straight back into the release, invisibly, because the skeleton gate covers
// exactly that frame. The button looked broken because it WAS: it could not
// reach its destination (founder report, 2026-09-01: "clicking the home button
// should always lead back to catalog view no matter what").
//
// A ref cannot fix that, because the fact it needs to remember outlives the
// component. sessionStorage can: it is per tab, it survives a reload, and it
// dies with the tab, which is exactly the lifetime of "this visit". Every
// deliberate exit records the intent on its way out and the auto-scope reads
// it, so the one navigation whose whole purpose is to reach the catalog can
// never be undone by the convenience that assumes you did not mean it.
//
// This is the THIRD report caused by that auto-scope (the back arrow was a
// no-op until v1.9.1; the side menu's Catalog row until 2026-08-31), and the
// 2026-08-31 note predicted this one almost exactly, naming the fix as its own
// founder call. That call has now been made for the buttons. The auto-scope
// itself is deliberately kept for a genuinely undirected first arrival, which
// is the only thing the 2026-08-12 call was ever about — nobody has asked for
// signing in to stop landing on your only release.

const CATALOG_INTENT_KEY = 'urganize.catalog.requested';
const CATALOG_INTENT_PROBE_KEY = 'urganize.catalog.probe';
const MARK = '1';

/**
 * Can this tab's session store actually REMEMBER something? Probed with a real
 * write, not a read, and that distinction is load-bearing: Safari's private
 * mode serves getItem happily and throws on setItem, so a read-only probe
 * reports a store that cannot hold the mark any exit is about to write. Same
 * reasoning as lib/install-prompt.ts's own writable probe.
 */
function isSessionStoreWritable(): boolean {
  try {
    window.sessionStorage.setItem(CATALOG_INTENT_PROBE_KEY, MARK);
    window.sessionStorage.removeItem(CATALOG_INTENT_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record that the user deliberately navigated to the catalog.
 *
 * Best-effort and never throws: every caller is a click handler on its way
 * into a navigation, and a full store must not turn a tap into an exception.
 * A lost write is covered by isCatalogRequested's fail direction below.
 */
export function markCatalogRequested(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CATALOG_INTENT_KEY, MARK);
  } catch {
    // Storage full or blocked. isCatalogRequested() answers `true` for an
    // unwritable store, so the auto-scope stands down anyway and the catalog
    // stays reachable — which is the half that matters.
  }
}

/**
 * Has the user asked for the catalog this session? Read by WorkspaceView to
 * decide whether its lone-release auto-scope may still fire.
 *
 * FAILS TOWARD NOT AUTO-SCOPING. An unusable store answers `true`, because a
 * store that cannot be written is a store where no exit can ever record
 * intent — and if the two outcomes are "a private-window user with one release
 * lands on a one-card catalog" and "a private-window user can never reach
 * their catalog at all", only the first is an inconvenience. The second is the
 * dead end this module exists to remove.
 *
 * Returns `false` during SSR, which is both the truthful answer (there is no
 * session store) and the hydration-safe one — see WorkspaceView's read.
 */
export function isCatalogRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(CATALOG_INTENT_KEY) === MARK) return true;
  } catch {
    // Reading threw, so nothing could have been recorded and nothing can be.
    return true;
  }
  return !isSessionStoreWritable();
}

/**
 * Leave the scoped release for the catalog — the ONE step every such control
 * takes, and the reason it is one function rather than a habit.
 *
 * Two things have to happen together. The release forgets whichever scene it
 * was showing, so tapping it again starts at Activities instead of resuming
 * the thing the user just walked out of (lib/scene-memory). And the catalog
 * intent is recorded, so the lone-release auto-scope does not undo the
 * navigation (see the header).
 *
 * Five surfaces call this: MobileNavBar's Home tab, the side menu's Catalog
 * row, the topbar's Catalog icon, the mobile search's page results, and
 * WorkspaceView's back arrow (which reaches the same end through setScope's
 * `forgetScene`, so it marks the intent itself). Doing it in one place is what
 * stopped the first three drifting apart from each other; that history is why
 * a new "go to the catalog" control belongs here rather than doing its own
 * half of the job.
 *
 * Safe to call from ANY page, scoped or not: the scene half reads `?release=`
 * fresh and no-ops when nothing is scoped, and the intent half is the point
 * even then — someone tapping Home from Settings is asking for the catalog
 * just as plainly as someone tapping it from inside a release.
 */
export function leaveReleaseForCatalog(): void {
  markCatalogRequested();
  forgetSceneForCurrentRelease();
}

/**
 * Forget that the catalog was ever asked for. Called from the auth store's
 * SIGNED_OUT handler beside resetSceneMemory() and resetSceneData(): a
 * same-tab logout then login is a new arrival and should get its one
 * auto-scope, exactly as a new tab would.
 */
export function resetCatalogIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CATALOG_INTENT_KEY);
  } catch {
    // Already gone or storage blocked — nothing further to do.
  }
}
