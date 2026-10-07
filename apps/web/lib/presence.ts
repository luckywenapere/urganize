// The "last seen" ping (2026-10-07): the rules both halves share.
//
// The browser (components/app/PresenceBeacon.tsx) pings POST /api/presence
// every PING_INTERVAL_MS while a tab is visible. The route records one row per
// person per Lagos calendar day in user_presence_days. /admin/metrics reads it:
// someone is "online now" when their last ping is within ONLINE_WINDOW_MS.
//
// Pure and client-safe: no imports at all, so the beacon and the route can both
// use it and vitest can reach it.

export const PRESENCE_TABLE = 'user_presence_days';

/** How often a visible tab pings. */
export const PING_INTERVAL_MS = 2 * 60 * 1000;

/** The shortest gap between two pings, so focus and visibility events in quick
 *  succession send one ping rather than several. */
export const PING_MIN_GAP_MS = 30 * 1000;

/** Seen this recently counts as online now. More than two ping intervals, so one
 *  slow or dropped ping does not flicker someone offline. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const PRESENCE_SURFACES = [
  'desktop_web',
  'phone_web',
  'installed',
  'android_app',
  'ios_app',
] as const;

export type PresenceSurface = (typeof PRESENCE_SURFACES)[number];

/** Anything we do not recognise reads as a computer browser, the plainest case. */
export function parseSurface(value: unknown): PresenceSurface {
  return typeof value === 'string' && (PRESENCE_SURFACES as readonly string[]).includes(value)
    ? (value as PresenceSurface)
    : 'desktop_web';
}

/** Lagos is UTC+1 all year (no daylight saving), so a fixed offset is exact. The
 *  same rule as lagosDayStart in lib/email/onboarding-sequence.ts, written out
 *  here so the browser bundle does not pull in the email code; the test checks
 *  the two agree. */
export const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The Lagos calendar day a moment falls on, as "YYYY-MM-DD". */
export function presenceDay(now: Date): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** True when a last-seen time is recent enough to count as online now. A time
 *  in the future (a clock ahead of ours) counts as now, not as forever. */
export function isOnline(lastSeenAt: string | null | undefined, now: Date): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  return now.getTime() - Math.min(seen, now.getTime()) <= ONLINE_WINDOW_MS;
}

export const SURFACE_LABEL: Record<PresenceSurface, string> = {
  desktop_web: 'Computer',
  phone_web: 'Phone browser',
  installed: 'Installed web app',
  android_app: 'Android app',
  ios_app: 'iPhone app',
};
