/**
 * The decisions behind the "a tap did nothing" report, kept apart from the
 * browser code so vitest can reach them (it only runs `lib/`).
 *
 * Why it exists (2026-10-03): PostHog showed real users rage-clicking the back
 * arrow and the release menu rows on a release page, mostly on phones, with no
 * JavaScript error at the time. Those controls change the URL, and a client
 * navigation only updates the URL once the router has finished, so a tap that
 * takes longer than a person will wait looks exactly like a dead button. We
 * could not tell "slow" from "never" from the recordings, so the app now says so
 * itself: if the URL has not changed shortly after such a tap, it reports it.
 */

/** How long a tap may take before it reads as dead. People re-tap at about a
 *  second (the rage-click bursts in PostHog were 0.5 to 1.5s apart), so 1.5s
 *  catches the moment they give up without firing on an ordinary slow load. */
export const NAV_STALL_MS = 1500;

/** At most this many reports a minute, so one frozen page cannot flood. */
export const NAV_STALL_MAX_PER_MINUTE = 3;

/** Where the same tap that was just reported is allowed to report again. */
export const NAV_STALL_MIN_GAP_MS = 5000;

/** How long a navigation may take before the app stops waiting for the router
 *  and loads the page the ordinary way. Long enough that a slow-but-working
 *  navigation on weak mobile data finishes first; short enough that a router
 *  that has stopped answering costs seconds instead of a stuck app. */
export const NAV_RECOVER_MS = 7000;

/** At most one recovery this often, so a destination that itself fails cannot
 *  turn into a reload loop. */
export const NAV_RECOVER_MIN_GAP_MS = 20_000;

export type NavStallLabel =
  | 'release_back_arrow'
  | `rollout_menu:${string}`
  | `link:${string}`;

/** The part of a URL that tells two screens apart. The hash is ignored: a hash
 *  change is not the navigation we are waiting for. */
function comparable(href: string): string {
  try {
    const u = new URL(href, 'http://x.invalid');
    return `${u.pathname}${u.search}`;
  } catch {
    return href;
  }
}

/** Did the tap land? True once the address is different from the one the tap
 *  started on. */
export function didNavigate(before: string, after: string): boolean {
  return comparable(before) !== comparable(after);
}

/**
 * Should a still-unchanged address be reported as stalled? The page being
 * hidden is the person leaving, not the button failing, and an offline phone is
 * a different problem (the offline banner already says so) that would swamp the
 * signal, so both are held back; the event still records `online` when it does
 * fire, to separate "slow" from "no signal at all".
 */
export function shouldReportStall(input: {
  before: string;
  after: string;
  visible: boolean;
}): boolean {
  return input.visible && !didNavigate(input.before, input.after);
}

/** Rate limit: allow a report unless there are already too many in the last
 *  minute or one for this same label was sent a moment ago. */
export function allowStallReport(
  history: ReadonlyArray<{ at: number; label: string }>,
  now: number,
  label: string
): boolean {
  const recent = history.filter((h) => now - h.at < 60_000);
  if (recent.length >= NAV_STALL_MAX_PER_MINUTE) return false;
  return !recent.some((h) => h.label === label && now - h.at < NAV_STALL_MIN_GAP_MS);
}

/** What the network looked like, trimmed to what we can read safely. Every field
 *  is optional because Safari exposes none of them. */
export type ConnectionSnapshot = {
  effective_type?: string;
  rtt_ms?: number;
  downlink_mbps?: number;
  save_data?: boolean;
};

export function describeConnection(
  connection:
    | {
        effectiveType?: unknown;
        rtt?: unknown;
        downlink?: unknown;
        saveData?: unknown;
      }
    | null
    | undefined
): ConnectionSnapshot {
  if (!connection) return {};
  const out: ConnectionSnapshot = {};
  if (typeof connection.effectiveType === 'string') out.effective_type = connection.effectiveType;
  if (typeof connection.rtt === 'number' && Number.isFinite(connection.rtt)) {
    out.rtt_ms = connection.rtt;
  }
  if (typeof connection.downlink === 'number' && Number.isFinite(connection.downlink)) {
    out.downlink_mbps = connection.downlink;
  }
  if (typeof connection.saveData === 'boolean') out.save_data = connection.saveData;
  return out;
}


/**
 * Turn a link or a computed destination into an address we are willing to load.
 * Same-origin http(s) only: this value is handed to `location.assign`, so
 * anything else (another site, `javascript:`, `mailto:`, garbage) is refused.
 * Returns the path, query and hash, never the origin.
 */
export function resolveRecoverTarget(raw: string, currentHref: string): string | null {
  try {
    const current = new URL(currentHref);
    const target = new URL(raw, current);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
    if (target.origin !== current.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/**
 * Should the app give up on the router and load `target` itself? Only when the
 * address is exactly where the tap left it (nothing landed), the target really
 * is somewhere else, the person is still looking at the page and still has a
 * connection. An offline phone cannot load a page either, and the offline banner
 * already says why; a hidden tab is the person leaving, not the app freezing.
 */
export function shouldRecover(input: {
  before: string;
  after: string;
  target: string;
  visible: boolean;
  online: boolean;
}): boolean {
  if (!input.visible || !input.online) return false;
  if (didNavigate(input.before, input.after)) return false;
  return didNavigate(input.after, input.target);
}

/** Allow a recovery unless one just ran. */
export function allowRecovery(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= NAV_RECOVER_MIN_GAP_MS;
}

/**
 * What a plain link click is asking for, or null when this click is not a
 * navigation we should watch: another mouse button, a modified click (new tab,
 * download), a link that opens elsewhere or downloads, or one that points
 * somewhere that is not this app.
 */
export function linkClickTarget(input: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  href: string | null;
  target: string | null;
  hasDownload: boolean;
  currentHref: string;
}): string | null {
  if (input.button !== 0) return null;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return null;
  if (input.hasDownload) return null;
  if (input.target && input.target !== '_self') return null;
  if (!input.href) return null;
  return resolveRecoverTarget(input.href, input.currentHref);
}

/**
 * Where a release menu row sends the page, for the recovery. A row that is
 * lit closes its scene; any other opens it. `activities` is the main view, not
 * a scene, so it always means "no scene". Returns null for anything that is not
 * a release page, where there is nothing sensible to load.
 */
export function sceneRowTarget(
  currentHref: string,
  key: string,
  isActive: boolean
): string | null {
  try {
    const url = new URL(currentHref);
    if (!url.searchParams.get('release')) return null;
    if (key === 'activities' || isActive) {
      url.searchParams.delete('scene');
    } else {
      url.searchParams.set('scene', key);
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * A second tap on a link whose first tap is still loading (2026-10-14, founder
 * report: "I click a link, land on the page, then it refreshes again"). Each tap
 * used to start its own navigation and arm its own recovery timer, so an
 * impatient double tap could load the page twice. A repeat is the same target,
 * the address still where the first tap left it, and the first tap still young
 * enough that its navigation (or its recovery) is the one in charge.
 */
export type PendingNav = { target: string; before: string; at: number };

export function isDuplicateNavClick(
  pending: PendingNav | null,
  target: string,
  currentHref: string,
  now: number
): boolean {
  if (!pending) return false;
  if (now - pending.at >= NAV_RECOVER_MS) return false;
  if (didNavigate(pending.before, currentHref)) return false;
  return comparable(pending.target) === comparable(target);
}

/** How recently the router must have received the target's data for the
 *  recovery to hold off: it has the page and is rendering it, so a hard load
 *  now would land on top of it and show as a second load. */
export const NAV_RSC_LANDING_MS = 3000;

/**
 * Did the router just receive the server payload for `target`? Next fetches a
 * route's RSC payload with an `_rsc` query param; a completed one for the same
 * path and search, within `windowMs`, means the navigation is slow but alive.
 * `entries` are PerformanceResourceTiming-shaped; `nowPerf` is
 * performance.now().
 */
export function routerJustReceived(
  entries: ReadonlyArray<{ name: string; responseEnd: number }>,
  target: string,
  nowPerf: number,
  windowMs: number = NAV_RSC_LANDING_MS
): boolean {
  const want = comparable(target);
  for (const entry of entries) {
    if (nowPerf - entry.responseEnd > windowMs) continue;
    try {
      const u = new URL(entry.name, 'http://x.invalid');
      if (!u.searchParams.has('_rsc')) continue;
      u.searchParams.delete('_rsc');
      if (`${u.pathname}${u.search}` === want) return true;
    } catch {
      // not a URL we can read
    }
  }
  return false;
}
