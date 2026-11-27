import { lagosWeekStart } from './admin-signup-return';
import type { SourceLink } from './source-links';
import type { TeamAccessState } from './team-billing';

/**
 * The numbers for /admin/source-links (2026-11-27, #1409): for each short link
 * (go.urganize.app/tt, /ig, /x ...), how many people tapped it, how many signed
 * up, and what those sign-ups went on to do.
 *
 * PURE: the route reads the counts and rows and hands them here, so the rules
 * are tested once.
 *
 * Rules worth not re-deciding:
 *  - WEEKS run Monday to Sunday on the Lagos clock, like every admin number
 *    (lagosWeekStart). "Last week" is the whole week before this one.
 *  - OUR OWN ACCOUNTS ARE LEFT OUT of sign-ups, the way every admin page does
 *    it. A tap has no person, so taps cannot be filtered: our own taps while
 *    testing a link are in the tap numbers.
 *  - "Not tracked" is null, never zero. Before the table exists the route
 *    hands over null and the page says so.
 *  - A SIGN-UP COUNTS ONCE, under the link in the cookie when the team was
 *    made (last link wins, lib/source-links.ts).
 *  - A link that left the list but has rows keeps its row, named by its slug,
 *    so old numbers do not vanish when a link is removed.
 *  - The rate is sign-ups per 100 taps over everything counted. Both started
 *    being counted on the same day, but a sign-up can come from a tap up to 30
 *    days earlier (the cookie), so in the first weeks the rate can read high.
 *    The page says so.
 *  - A sign-up row goes when its account is deleted (on delete cascade), so
 *    past sign-up counts can fall. The page says so.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many of the newest sign-ups the page lists by name. */
export const SOURCE_LINK_RECENT_SIGNUPS = 30;

export type SourceLinkWindow = { thisWeek: number; lastWeek: number; all: number };

/** One row of public.source_link_tap_counts(). */
export type SourceLinkTapCount = {
  slug: string;
  total: number;
  thisWeek: number;
  lastWeek: number;
  firstAt: string | null;
};

export type SourceLinkSignupRow = { slug: string; user_id: string | null; created_at: string | null };

export type SourceLinkAccount = { name: string | null; email: string | null };

/** Where a sign-up's own team stands today. */
export type SourceLinkPlan = 'paying' | 'trial' | 'free_access' | 'lapsed' | 'ended' | 'no_team';

export type SourceLinkStatsInput = {
  now: number;
  links: readonly SourceLink[];
  /** Null when the counts cannot be read (the migration is not applied yet). */
  taps: SourceLinkTapCount[] | null;
  /** Null when the rows cannot be read. */
  signups: SourceLinkSignupRow[] | null;
  internalUserIds: ReadonlySet<string>;
  accounts: ReadonlyMap<string, SourceLinkAccount>;
  /** Accounts that own at least one rollout that is not a test rollout. */
  rolloutOwnerIds: ReadonlySet<string>;
  planByUserId: ReadonlyMap<string, SourceLinkPlan>;
};

export type SourceLinkRow = {
  slug: string;
  label: string;
  medium: string;
  /** False for a link that has rows but is no longer on the list. */
  listed: boolean;
  /** Null when taps are not tracked. */
  taps: SourceLinkWindow | null;
  /** Null when sign-ups are not tracked. */
  signups: SourceLinkWindow | null;
  /** Sign-ups per 100 taps, everything counted. Null with no taps or no data. */
  ratePercent: number | null;
  /** Of the sign-ups: how many made a rollout, and how many pay today. */
  withRollout: number;
  paying: number;
};

export type SourceLinkSignup = {
  userId: string;
  name: string | null;
  email: string | null;
  slug: string;
  label: string;
  at: string;
  hasRollout: boolean;
  plan: SourceLinkPlan;
};

export type SourceLinkStats = {
  /** False when neither taps nor sign-ups could be read. */
  tracked: boolean;
  weekStart: string;
  lastWeekStart: string;
  /** The first tap or sign-up ever counted, or null when there is none. */
  countingSince: string | null;
  totals: {
    taps: SourceLinkWindow | null;
    signups: SourceLinkWindow | null;
    withRollout: number;
    paying: number;
  };
  rows: SourceLinkRow[];
  recentSignups: SourceLinkSignup[];
};

/** The Monday 00:00 (Lagos) that starts this week and the one before, as ms. */
export function sourceLinkWeekStarts(now: number): { thisWeek: number; lastWeek: number } {
  const thisWeek = lagosWeekStart(now);
  return { thisWeek, lastWeek: thisWeek - WEEK_MS };
}

/** How a team's access reads on this page. No team of their own is its own answer. */
export function planFromTeamState(state: TeamAccessState | null | undefined): SourceLinkPlan {
  switch (state) {
    case 'paid':
      return 'paying';
    case 'comped':
      return 'free_access';
    case 'trial':
    case 'grace':
      return 'trial';
    case 'read_only':
      return 'lapsed';
    case 'walled':
      return 'ended';
    default:
      return 'no_team';
  }
}

export const SOURCE_LINK_PLAN_LABEL: Record<SourceLinkPlan, string> = {
  paying: 'Paying',
  trial: 'On trial',
  free_access: 'Free access',
  lapsed: 'Payment lapsed',
  ended: 'Trial ended',
  no_team: 'No team',
};

/** "4.2%", "12%", "0%". Null (no taps yet) reads "No taps yet". */
export function formatSignupRate(ratePercent: number | null): string {
  if (ratePercent === null || !Number.isFinite(ratePercent)) return 'No taps yet';
  if (ratePercent === 0) return '0%';
  if (ratePercent < 10) return `${(Math.round(ratePercent * 10) / 10).toFixed(1).replace(/\.0$/, '')}%`;
  return `${Math.round(ratePercent)}%`;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function emptyWindow(): SourceLinkWindow {
  return { thisWeek: 0, lastWeek: 0, all: 0 };
}

function addWindow(into: SourceLinkWindow, from: SourceLinkWindow): void {
  into.thisWeek += from.thisWeek;
  into.lastWeek += from.lastWeek;
  into.all += from.all;
}

function count(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function buildSourceLinkStats(input: SourceLinkStatsInput): SourceLinkStats {
  const { now } = input;
  const weeks = sourceLinkWeekStarts(now);
  const listed = new Map(input.links.map((link) => [link.slug, link]));

  // Taps per slug, straight from the database's own counts.
  const tapsBySlug = new Map<string, SourceLinkWindow>();
  // Held in an object so the closure's writes are visible to the type checker.
  const first: { at: number | null } = { at: null };
  const sawAt = (value: number | null) => {
    if (value !== null && (first.at === null || value < first.at)) first.at = value;
  };
  for (const row of input.taps ?? []) {
    const slug = String(row.slug || '').trim().toLowerCase();
    if (!slug) continue;
    const window = tapsBySlug.get(slug) ?? emptyWindow();
    addWindow(window, { thisWeek: count(row.thisWeek), lastWeek: count(row.lastWeek), all: count(row.total) });
    tapsBySlug.set(slug, window);
    sawAt(ms(row.firstAt));
  }

  // Sign-ups: one per account, ours left out, nothing from the future.
  const signupsBySlug = new Map<string, SourceLinkWindow>();
  const rolloutBySlug = new Map<string, number>();
  const payingBySlug = new Map<string, number>();
  const people: SourceLinkSignup[] = [];
  const seen = new Set<string>();
  for (const row of input.signups ?? []) {
    const userId = row.user_id;
    const at = ms(row.created_at);
    const slug = String(row.slug || '').trim().toLowerCase();
    if (!userId || at === null || at > now || !slug) continue;
    if (seen.has(userId)) continue;
    seen.add(userId);
    // Counting began with this row whether or not the account is one of ours.
    sawAt(at);
    if (input.internalUserIds.has(userId)) continue;

    const window = signupsBySlug.get(slug) ?? emptyWindow();
    window.all += 1;
    if (at >= weeks.thisWeek) window.thisWeek += 1;
    else if (at >= weeks.lastWeek) window.lastWeek += 1;
    signupsBySlug.set(slug, window);

    const hasRollout = input.rolloutOwnerIds.has(userId);
    const plan = input.planByUserId.get(userId) ?? 'no_team';
    if (hasRollout) rolloutBySlug.set(slug, (rolloutBySlug.get(slug) ?? 0) + 1);
    if (plan === 'paying') payingBySlug.set(slug, (payingBySlug.get(slug) ?? 0) + 1);

    const account = input.accounts.get(userId);
    people.push({
      userId,
      name: account?.name ?? null,
      email: account?.email ?? null,
      slug,
      label: listed.get(slug)?.label ?? `/${slug}`,
      at: new Date(at).toISOString(),
      hasRollout,
      plan,
    });
  }

  const tapsTracked = input.taps !== null;
  const signupsTracked = input.signups !== null;

  const slugs = [
    ...input.links.map((link) => link.slug),
    ...[...new Set([...tapsBySlug.keys(), ...signupsBySlug.keys()])].filter((slug) => !listed.has(slug)).sort(),
  ];
  const order = new Map(slugs.map((slug, index) => [slug, index]));

  const rows: SourceLinkRow[] = slugs.map((slug) => {
    const link = listed.get(slug);
    const taps = tapsTracked ? (tapsBySlug.get(slug) ?? emptyWindow()) : null;
    const signups = signupsTracked ? (signupsBySlug.get(slug) ?? emptyWindow()) : null;
    return {
      slug,
      label: link?.label ?? `/${slug}`,
      medium: link?.medium ?? 'removed',
      listed: Boolean(link),
      taps,
      signups,
      ratePercent: taps && signups && taps.all > 0 ? (signups.all / taps.all) * 100 : null,
      withRollout: rolloutBySlug.get(slug) ?? 0,
      paying: payingBySlug.get(slug) ?? 0,
    };
  });

  // Most sign-ups first, then most taps, then the list's own order.
  rows.sort(
    (a, b) =>
      (b.signups?.all ?? 0) - (a.signups?.all ?? 0) ||
      (b.taps?.all ?? 0) - (a.taps?.all ?? 0) ||
      (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0)
  );

  const totalTaps = tapsTracked ? emptyWindow() : null;
  const totalSignups = signupsTracked ? emptyWindow() : null;
  let withRollout = 0;
  let paying = 0;
  for (const row of rows) {
    if (totalTaps && row.taps) addWindow(totalTaps, row.taps);
    if (totalSignups && row.signups) addWindow(totalSignups, row.signups);
    withRollout += row.withRollout;
    paying += row.paying;
  }

  people.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    tracked: tapsTracked || signupsTracked,
    weekStart: new Date(weeks.thisWeek).toISOString(),
    lastWeekStart: new Date(weeks.lastWeek).toISOString(),
    countingSince: first.at === null ? null : new Date(first.at).toISOString(),
    totals: { taps: totalTaps, signups: totalSignups, withRollout, paying },
    rows,
    recentSignups: people.slice(0, SOURCE_LINK_RECENT_SIGNUPS),
  };
}
