import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import type { PersonAvailability, ProfileRole } from '@/types/directory';
import type { ManagerRecord } from './manager-record';

/**
 * Featured, not ranked (directory spec, section 6).
 *
 * Two shelves at the top of the directory: FEATURED, picked by Urganize, and ON
 * THE RISE, earned from work done in Urganize. One shelf alone fails: picks only
 * means nobody else can get there, earned only means the top is empty on day one.
 *
 * PURE, so the rules a person can be seen under are tests and not a reading of a
 * query. lib/directory-featuring-server.ts is the I/O half.
 *
 * Deliberately NOT built here, because the spec parks it: a real ranking inside
 * search results. That wants a few hundred claimed profiles to rank against.
 */

/** Up to six per role, on both shelves (spec, section 6). */
export const SHELF_SIZE = 6;

/** How recently a release must have gone live for the person on it to rise. */
export const RISING_WINDOW_DAYS = 90;

/** A manager rises only if their team is really working in Urganize: at least
 *  this many teammates active on their rollouts in this many days. The same
 *  behaviour moves the scoreboard's weekly active paying teams, on purpose. */
export const RISING_TEAMMATE_WINDOW_DAYS = 30;
export const RISING_MIN_ACTIVE_TEAMMATES = 2;

/** "One quarter, reviewed at the strategy check." */
export const FEATURED_MONTHS = 3;

export const FEATURED_NOTE_MAX_CHARS = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Who is looking decides what leads

/**
 * "Who sits on the shelves depends on who's looking. An artist searching sees
 * managers first. A manager searching sees creatives and adjacent pros first."
 */
export type ViewerKind = 'artist' | 'manager';

/**
 * Which of the two a signed-in person is.
 *
 * Their own directory record wins over the account's setup answer, because a
 * person who has said "I am a manager" in the directory is one whatever they
 * ticked at sign-up. Otherwise only an account that said plain "artist" is an
 * artist; every other account type (a team, a manager, a label person) is
 * somebody building a team, which is the more common viewer by far, so it is the
 * default.
 */
export function resolveViewerKind(input: {
  accountRole: string | null | undefined;
  ownRoles: readonly string[];
}): ViewerKind {
  if (input.ownRoles.includes('manager')) return 'manager';
  return input.accountRole === 'artist' ? 'artist' : 'manager';
}

const CREATIVE_ROLES: readonly DirectoryRole[] = [
  'producer',
  'mix_engineer',
  'master_engineer',
  'songwriter',
  'videographer',
  'video_director',
  'photographer',
  'graphic_designer',
  'digital_marketer',
];

const ADJACENT_ROLES: readonly DirectoryRole[] = [
  'pr',
  'a_and_r',
  'playlist_curator',
  'booking_agent',
  'tour_manager',
  'distributor',
];

/**
 * The order the shelves are shown in. Covers every role exactly once, which a
 * test holds: a role added to the vocabulary and forgotten here would never get a
 * shelf, and nothing would look wrong.
 */
export function shelfRoleOrder(viewer: ViewerKind): DirectoryRole[] {
  const order: DirectoryRole[] =
    viewer === 'artist'
      ? ['manager', ...CREATIVE_ROLES, ...ADJACENT_ROLES]
      : [...CREATIVE_ROLES, ...ADJACENT_ROLES, 'manager'];
  // Anything the vocabulary has that the two lists above do not name is added at
  // the end rather than lost.
  const missing = DIRECTORY_ROLES.filter((role) => !order.includes(role));
  return [...order, ...missing];
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured: picked by Urganize, for a quarter

export type FeaturedRow = {
  id: string;
  userId: string;
  role: DirectoryRole;
  /** YYYY-MM-DD, inclusive. */
  startsOn: string;
  /** YYYY-MM-DD, inclusive. */
  endsOn: string;
};

/** Today as a UTC calendar day. The picks are dates, not instants. */
export function isoDay(now: Date | number = Date.now()): string {
  return new Date(now instanceof Date ? now.getTime() : now).toISOString().slice(0, 10);
}

export function isValidIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The last day a pick runs, three months on from the day it starts. A day that
 *  does not exist three months on (the 31st) falls back to that month's end. */
export function featuredEndsOn(startsOn: string): string {
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + FEATURED_MONTHS;
  const day = start.getUTCDate();
  const monthEnd = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const sameDay = Date.UTC(year, month, Math.min(day, monthEnd));
  return new Date(sameDay - DAY_MS).toISOString().slice(0, 10);
}

/** On a shelf today? Both ends are inclusive, and the comparison is on ISO days,
 *  which sort the same way as the dates they spell. */
export function isFeaturedOn(row: Pick<FeaturedRow, 'startsOn' | 'endsOn'>, today: string): boolean {
  return row.startsOn <= today && today <= row.endsOn;
}

/**
 * Whether one more pick fits on a role's shelf. Counts picks running today or
 * later, so scheduling the next quarter's six while this quarter's six are still
 * up does not trip it, and the cap is what the spec says: up to six per role.
 */
export function featuredHasRoom(
  existing: readonly Pick<FeaturedRow, 'role' | 'startsOn' | 'endsOn'>[],
  role: DirectoryRole,
  startsOn: string,
  endsOn: string
): boolean {
  // Picks that overlap the new one's dates. Counting by overlap, not by "is it
  // current", is what makes two adjacent quarters independent of each other.
  const overlapping = existing.filter(
    (row) => row.role === role && row.startsOn <= endsOn && startsOn <= row.endsOn
  );
  return overlapping.length < SHELF_SIZE;
}

// ─────────────────────────────────────────────────────────────────────────────
// On the rise: earned from delivered work, refreshed monthly

/** The first day of the month a snapshot belongs to, UTC, as YYYY-MM-DD. */
export function risingMonthStart(now: Date | number = Date.now()): string {
  const at = new Date(now instanceof Date ? now.getTime() : now);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export type RisingCandidate = {
  userId: string;
  role: DirectoryRole;
  /** The person has an account behind the profile (not a seeded stand-in). */
  claimed: boolean;
  /** Published: findable in the directory. Rising needs it, like Featured. */
  listed: boolean;
  displayName: string;
  /** Rollouts that went live in the last 90 days with them on it, in this role. */
  liveReleases: number;
  /** Everything they have delivered in this role, ever. A tie-break only. */
  deliveredTotal: number;
  /** Managers only: teammates active on their rollouts in the last 30 days. */
  activeTeammates: number | null;
};

/**
 * HOW SOMEBODY EARNS ON THE RISE (spec, section 6, "proposed"):
 *
 *   1. Profile claimed and published.
 *   2. At least one release went live in the last 90 days with them on it.
 *   3. Their tasks on that release were delivered, not left open. (For a
 *      creative that is what a delivery record IS, so it is true by construction
 *      and not checked a second time here.)
 *   4. For managers: two or more teammates active on their releases in the last
 *      30 days.
 *
 * No follower counts and no fame, ever: "top" has to be earned from delivered
 * work (strategy doc).
 */
export function qualifiesForRising(candidate: RisingCandidate): boolean {
  if (!candidate.claimed || !candidate.listed) return false;
  if (candidate.liveReleases < 1) return false;
  if (candidate.role === 'manager') {
    return (candidate.activeTeammates ?? 0) >= RISING_MIN_ACTIVE_TEAMMATES;
  }
  return true;
}

/**
 * The shelf itself: the people who qualify, best first, six per role.
 *
 * Best is the number of rollouts they were on that went live in the window, then
 * the length of their record in the role, then name, so two people level on both
 * are always in the same order and the shelf does not reshuffle itself.
 */
export function rankRising(candidates: readonly RisingCandidate[]): RisingCandidate[] {
  const byRole = new Map<DirectoryRole, RisingCandidate[]>();
  for (const candidate of candidates) {
    if (!qualifiesForRising(candidate)) continue;
    const held = byRole.get(candidate.role) ?? [];
    held.push(candidate);
    byRole.set(candidate.role, held);
  }

  const out: RisingCandidate[] = [];
  for (const role of DIRECTORY_ROLES) {
    const held = byRole.get(role);
    if (!held) continue;
    const seen = new Set<string>();
    held
      .slice()
      .sort(
        (a, b) =>
          b.liveReleases - a.liveReleases ||
          b.deliveredTotal - a.deliveredTotal ||
          a.displayName.localeCompare(b.displayName) ||
          a.userId.localeCompare(b.userId)
      )
      .filter((candidate) => {
        // One person once per role, even if the same person was passed in twice.
        if (seen.has(candidate.userId)) return false;
        seen.add(candidate.userId);
        return true;
      })
      .slice(0, SHELF_SIZE)
      .forEach((candidate) => out.push(candidate));
  }
  return out;
}

/** Whether a release date puts a release "live in the last 90 days". The date
 *  has to have arrived (a planned release has not gone live) and be recent. A
 *  bare calendar day is read as that day in UTC, the same frame the scoreboard
 *  reads release dates in. */
export function wentLiveInWindow(
  releaseDate: string | null | undefined,
  now: Date | number = Date.now(),
  days: number = RISING_WINDOW_DAYS
): boolean {
  if (!releaseDate) return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  const day = Date.parse(`${String(releaseDate).slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(day)) return false;
  return day <= nowMs && day >= nowMs - days * DAY_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Putting the shelves together for one viewer

/** A person on a shelf: everything a card needs, nothing it should not carry. */
export type ShelfPerson = {
  userId: string;
  displayName: string;
  city: string | null;
  availability: PersonAvailability;
  roles: ProfileRole[];
  slug: string | null;
  isPublic: boolean;
  /** Set for a manager only. Computed from rollouts, never typed. */
  managerRecord: ManagerRecord | null;
};

export type Shelf = {
  role: DirectoryRole;
  featured: ShelfPerson[];
  onTheRise: ShelfPerson[];
};

/**
 * One shelf per role that has anybody on it, in the order this viewer should see
 * them.
 *
 * A person who is Featured for a role is not repeated under On the rise for the
 * same role: the shelf is for finding people, and the same face twice reads as a
 * shorter list than it is. The viewer is never on their own shelf, since "ask
 * yourself" is not an action. Each shelf is capped at six on both lists.
 */
export function buildShelves(input: {
  viewer: ViewerKind;
  viewerUserId?: string | null;
  featured: readonly { role: DirectoryRole; person: ShelfPerson }[];
  onTheRise: readonly { role: DirectoryRole; person: ShelfPerson }[];
}): Shelf[] {
  const shelves = new Map<DirectoryRole, Shelf>();
  const shelfFor = (role: DirectoryRole): Shelf => {
    const existing = shelves.get(role);
    if (existing) return existing;
    const created: Shelf = { role, featured: [], onTheRise: [] };
    shelves.set(role, created);
    return created;
  };
  const isSelf = (person: ShelfPerson) =>
    Boolean(input.viewerUserId) && person.userId === input.viewerUserId;

  for (const { role, person } of input.featured) {
    if (isSelf(person)) continue;
    const shelf = shelfFor(role);
    if (shelf.featured.some((held) => held.userId === person.userId)) continue;
    if (shelf.featured.length < SHELF_SIZE) shelf.featured.push(person);
  }

  for (const { role, person } of input.onTheRise) {
    if (isSelf(person)) continue;
    const shelf = shelfFor(role);
    if (shelf.featured.some((held) => held.userId === person.userId)) continue;
    if (shelf.onTheRise.some((held) => held.userId === person.userId)) continue;
    if (shelf.onTheRise.length < SHELF_SIZE) shelf.onTheRise.push(person);
  }

  return shelfRoleOrder(input.viewer)
    .map((role) => shelves.get(role))
    .filter(
      (shelf): shelf is Shelf =>
        Boolean(shelf) && (shelf!.featured.length > 0 || shelf!.onTheRise.length > 0)
    );
}

export const SHELF_COPY = {
  featured: 'Featured',
  onTheRise: 'On the rise this month',
} as const;
