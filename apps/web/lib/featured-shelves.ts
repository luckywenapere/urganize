import { releaseLiveAt, type ScoreboardRelease } from './scoreboard';
import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';

/**
 * The directory's two shelves: Featured, and On the rise this month.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURED, NOT RANKED (Profiles and Directory spec)
 *
 * Search results are never ranked. A person is either found by what they typed
 * or sits on a shelf above the search, and a shelf is something the product
 * says out loud: one is picked by hand, the other is computed from work that
 * really happened. Neither can be bought. There is no money path in this file
 * or in anything that calls it, and a test scans for one.
 *
 * Pure, so the rules are a failing test rather than a quiet drift. Nothing here
 * reads a database; lib/featured-shelves-server.ts loads rows and writes picks.
 */

// Featured --------------------------------------------------------------------

/** Up to six people per role, per quarter. */
export const FEATURED_PER_ROLE = 6;
export const RISING_PER_ROLE = 6;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lagos is UTC+1 all year, so a fixed offset is exact (see lagosDayStart). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** A profile can be shelved only when a person has claimed it AND listed it. */
export type PublishableProfile = {
  userId: string | null;
  status: string;
  visibility: string;
};

/**
 * THE SEAM FOR "PUBLISHED".
 *
 * Today published means claimed and not private: the same people the directory
 * already shows. If profiles gain an explicit publish step, this is the one
 * function to change, and the featured_profiles trigger in
 * 20261010140000_featured_shelves.sql is the one SQL rule to change with it.
 */
export function isPublishedProfile(profile: PublishableProfile): boolean {
  return Boolean(profile.userId) && profile.status === 'claimed' && profile.visibility !== 'private';
}

export type QuarterBounds = {
  startsAt: string;
  endsAt: string;
  /** "Q4 2026" */
  label: string;
};

/**
 * A Lagos calendar quarter, `offset` quarters from the one containing `now`.
 * Starts at Lagos midnight (23:00 UTC the evening before) so a quarter flips
 * when the team's own day does.
 */
export function quarterBounds(now: Date, offset = 0): QuarterBounds {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const index = lagos.getUTCFullYear() * 4 + Math.floor(lagos.getUTCMonth() / 3) + offset;
  const year = Math.floor(index / 4);
  const quarter = index % 4;
  const start = Date.UTC(year, quarter * 3, 1) - LAGOS_OFFSET_MS;
  const nextIndex = index + 1;
  const end = Date.UTC(Math.floor(nextIndex / 4), (nextIndex % 4) * 3, 1) - LAGOS_OFFSET_MS;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    label: `Q${quarter + 1} ${year}`,
  };
}

export type FeatureRefusal =
  | 'unknown_role'
  | 'not_published'
  | 'role_not_held'
  | 'already_featured'
  | 'role_full';

export const FEATURE_REFUSAL_COPY: Record<FeatureRefusal, string> = {
  unknown_role: 'That is not a role in the directory.',
  not_published: 'Only a profile that is claimed and listed can be featured.',
  role_not_held: 'This person has not claimed or delivered that role.',
  already_featured: 'They are already featured for that role this quarter.',
  role_full: `That role already has ${FEATURED_PER_ROLE} featured this quarter.`,
};

export type FeatureVerdict = { ok: true } | { ok: false; code: FeatureRefusal; message: string };

const refuse = (code: FeatureRefusal): FeatureVerdict => ({
  ok: false,
  code,
  message: FEATURE_REFUSAL_COPY[code],
});

/**
 * Whether the admin may add this person to the shelf for this role this
 * quarter. The insert route is the only caller and the database trigger repeats
 * the published and cap rules, so a second writer could not get around either.
 */
export function checkFeatureRequest(input: {
  profile: PublishableProfile;
  role: string;
  /** Roles they claimed plus roles with a delivery record. */
  heldRoles: readonly string[];
  /** Already featured this quarter, for this role (all people). */
  featuredInRole: number;
  /** This person is already featured for this role this quarter. */
  alreadyFeatured: boolean;
}): FeatureVerdict {
  if (!(DIRECTORY_ROLES as readonly string[]).includes(input.role)) return refuse('unknown_role');
  if (!isPublishedProfile(input.profile)) return refuse('not_published');
  if (!input.heldRoles.includes(input.role)) return refuse('role_not_held');
  if (input.alreadyFeatured) return refuse('already_featured');
  if (input.featuredInRole >= FEATURED_PER_ROLE) return refuse('role_full');
  return { ok: true };
}

// On the rise ----------------------------------------------------------------

export const RISE_WINDOW_DAYS = 90;
export const MANAGER_ACTIVITY_DAYS = 30;
export const MANAGER_MIN_TEAMMATES = 2;
/** Nothing is computed until the product has this much task activity on record. */
export const MIN_HISTORY_DAYS = 30;

/** The first of the Lagos month, "YYYY-MM-01". Picks are stored against it. */
export function monthKey(now: Date): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 7) + '-01';
}

/** Only recompute when the month changed since the last good run. */
export function shouldRecomputeRise(lastComputedMonth: string | null, now: Date): boolean {
  return lastComputedMonth !== monthKey(now);
}

/**
 * Is there enough history for "this month" to mean anything? Task activity
 * started being recorded on 2026-10-02, and a shelf built from a week of it
 * would be noise dressed as a ranking, so it stays empty until a month exists.
 */
export function hasEnoughHistory(earliestActivityAt: string | null, now: Date): boolean {
  if (!earliestActivityAt) return false;
  const at = Date.parse(earliestActivityAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at >= MIN_HISTORY_DAYS * DAY_MS;
}

export type RiseCandidate = {
  profileId: string;
  userId: string;
  status: string;
  visibility: string;
  claimedRoles: readonly string[];
};

export type RiseRelease = {
  id: string;
  ownerUserId: string;
  releaseDate: string | null;
  status: string | null;
  isTest: boolean;
  updatedAt: string | null;
  taskCount: number;
  doneTaskCount: number;
  lastTaskDoneAt: string | null;
};

export type RiseRecord = { userId: string; role: string; releaseId: string };
export type RiseActivity = { releaseId: string; actorId: string; at: string };

export type RisePick = { profileId: string; userId: string; role: DirectoryRole };

function liveAt(release: RiseRelease, now: Date): number | null {
  const shaped: ScoreboardRelease = {
    id: release.id,
    workspaceId: '',
    createdAt: null,
    updatedAt: release.updatedAt,
    releaseDate: release.releaseDate,
    status: release.status,
    isTest: release.isTest,
    taskCount: release.taskCount,
    allTasksDone: release.taskCount > 0 && release.doneTaskCount === release.taskCount,
    lastTaskDoneAt: release.lastTaskDoneAt,
  };
  return releaseLiveAt(shaped, now);
}

/**
 * Who is on the rise this month. Every rule below exists to stop a person being
 * promoted for something that did not happen:
 *
 *  1. The profile is claimed and listed.
 *  2. A rollout went live in the last 90 days with them on it. "Live" is the
 *     scoreboard's releaseLiveAt, which is the recap-eligibility rule as a
 *     timestamp, and a test rollout never counts.
 *  3. Their work on it was delivered. For everyone but a manager that is a
 *     delivery record (a done task assigned to somebody other than the owner,
 *     on a release that came out). For a manager, who owns the rollout, it is a
 *     rollout of theirs with at least one activity done.
 *  4. A manager also needs two or more teammates active on their rollouts in
 *     the last 30 days: a manager with an empty team is not on the rise.
 *
 * Up to six per role, the most recent delivery first. Ties break on the profile
 * id so the same data always gives the same shelf.
 */
export function computeOnTheRise(
  input: {
    candidates: RiseCandidate[];
    releases: RiseRelease[];
    records: RiseRecord[];
    activity: RiseActivity[];
  },
  now: Date
): RisePick[] {
  const windowStart = now.getTime() - RISE_WINDOW_DAYS * DAY_MS;
  const activityStart = now.getTime() - MANAGER_ACTIVITY_DAYS * DAY_MS;

  const liveByRelease = new Map<string, number>();
  for (const release of input.releases) {
    if (release.isTest) continue;
    const at = liveAt(release, now);
    if (at !== null && at >= windowStart && at <= now.getTime()) liveByRelease.set(release.id, at);
  }

  const best = new Map<string, { profileId: string; role: string; at: number }>();
  const note = (profileId: string, role: string, at: number) => {
    const key = `${profileId}|${role}`;
    const held = best.get(key);
    if (!held || held.at < at) best.set(key, { profileId, role, at });
  };

  const publishedByUser = new Map<string, RiseCandidate>();
  for (const candidate of input.candidates) {
    const published = isPublishedProfile({
      userId: candidate.userId,
      status: candidate.status,
      visibility: candidate.visibility,
    });
    if (published) publishedByUser.set(candidate.userId, candidate);
  }

  for (const record of input.records) {
    const candidate = publishedByUser.get(record.userId);
    const at = liveByRelease.get(record.releaseId);
    if (!candidate || at === undefined) continue;
    if (!(DIRECTORY_ROLES as readonly string[]).includes(record.role)) continue;
    note(candidate.profileId, record.role, at);
  }

  const teammatesByOwner = new Map<string, Set<string>>();
  const ownerByRelease = new Map(input.releases.map((release) => [release.id, release.ownerUserId]));
  for (const entry of input.activity) {
    const owner = ownerByRelease.get(entry.releaseId);
    const at = Date.parse(entry.at);
    if (!owner || entry.actorId === owner) continue;
    if (Number.isNaN(at) || at < activityStart || at > now.getTime()) continue;
    const set = teammatesByOwner.get(owner) ?? new Set<string>();
    set.add(entry.actorId);
    teammatesByOwner.set(owner, set);
  }

  for (const release of input.releases) {
    const at = liveByRelease.get(release.id);
    if (at === undefined || release.doneTaskCount < 1) continue;
    const candidate = publishedByUser.get(release.ownerUserId);
    if (!candidate || !candidate.claimedRoles.includes('manager')) continue;
    if ((teammatesByOwner.get(release.ownerUserId)?.size ?? 0) < MANAGER_MIN_TEAMMATES) continue;
    note(candidate.profileId, 'manager', at);
  }

  const userByProfile = new Map(input.candidates.map((candidate) => [candidate.profileId, candidate.userId]));
  const byRole = new Map<string, Array<{ profileId: string; at: number }>>();
  for (const entry of best.values()) {
    const list = byRole.get(entry.role) ?? [];
    list.push({ profileId: entry.profileId, at: entry.at });
    byRole.set(entry.role, list);
  }

  const picks: RisePick[] = [];
  for (const role of DIRECTORY_ROLES) {
    const list = byRole.get(role);
    if (!list) continue;
    list.sort((a, b) => b.at - a.at || a.profileId.localeCompare(b.profileId));
    for (const entry of list.slice(0, RISING_PER_ROLE)) {
      picks.push({
        profileId: entry.profileId,
        userId: userByProfile.get(entry.profileId) as string,
        role,
      });
    }
  }
  return picks;
}

// Who is looking -------------------------------------------------------------

export type ViewerKind = 'artist' | 'manager' | 'creative';

const MANAGEMENT_ROLES: readonly string[] = ['manager', 'a_and_r', 'booking_agent', 'tour_manager'];

export const isManagementRole = (role: string): boolean => MANAGEMENT_ROLES.includes(role);

/**
 * THE SEAM FOR THE VIEWER'S PROFILE TYPE.
 *
 * `profileType` is where the profile-types work plugs in: when a viewer's
 * profile carries an explicit type it wins. Until then the kind is read from
 * the roles they claimed. Somebody with no claimed role is most likely an
 * artist (or a team owner) looking for help, so that is the default.
 */
export function viewerKindFromProfile(input: {
  profileType?: ViewerKind | null;
  claimedRoles?: readonly string[] | null;
}): ViewerKind {
  if (input.profileType) return input.profileType;
  const claimed = input.claimedRoles ?? [];
  if (claimed.some(isManagementRole)) return 'manager';
  if (claimed.length > 0) return 'creative';
  return 'artist';
}

/**
 * The directory's own profile type (manager, artist, creative, adjacent) as a
 * viewer kind. An adjacent pro (PR, marketing, booking) is looking for work like
 * a creative is, so they meet management first. No type at all is no answer.
 */
export function viewerKindFromProfileType(type: string | null | undefined): ViewerKind | null {
  if (type === 'manager' || type === 'artist' || type === 'creative') return type;
  if (type === 'adjacent') return 'creative';
  return null;
}

/**
 * Which half of the directory a viewer should meet first. An artist is looking
 * for management; a manager is looking for the people who make the work; a
 * creative is looking for work, which management hands out.
 */
export function managementFirst(kind: ViewerKind): boolean {
  return kind !== 'manager';
}

export type ShelfEntry<T> = T & { shelfRole: DirectoryRole };

/** Stable order for one shelf: the viewer's half first, then the vocabulary order. */
export function orderShelfForViewer<T>(
  entries: Array<ShelfEntry<T>>,
  kind: ViewerKind
): Array<ShelfEntry<T>> {
  const first = managementFirst(kind);
  const rank = (entry: ShelfEntry<T>) =>
    (isManagementRole(entry.shelfRole) === first ? 0 : 1) * 100 + DIRECTORY_ROLES.indexOf(entry.shelfRole);
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * The two shelves as the page shows them. Someone already Featured for a role
 * is not repeated under On the rise for that role: one person, one card per
 * role on screen. No empty shelf is returned as a heading: the caller draws a
 * shelf only when its list has something in it.
 */
export function composeShelves<T extends { userId: string }>(
  featured: Array<ShelfEntry<T>>,
  onTheRise: Array<ShelfEntry<T>>,
  kind: ViewerKind
): { featured: Array<ShelfEntry<T>>; onTheRise: Array<ShelfEntry<T>> } {
  const taken = new Set(featured.map((entry) => `${entry.userId}|${entry.shelfRole}`));
  const risingOnly = onTheRise.filter((entry) => !taken.has(`${entry.userId}|${entry.shelfRole}`));
  return {
    featured: orderShelfForViewer(featured, kind),
    onTheRise: orderShelfForViewer(risingOnly, kind),
  };
}
