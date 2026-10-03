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

export type NavStallLabel =
  | 'release_back_arrow'
  | `rollout_menu:${string}`;

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
