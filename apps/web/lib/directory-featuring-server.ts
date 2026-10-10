import type { SupabaseClient } from '@supabase/supabase-js';
import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import { profileRoles } from './person-profile';
import { inChunks, readAllPages, readInChunks, IN_LIST_CHUNK, ROWS_PAGE_SIZE } from './paged-rows';
import { readTestRelease } from './test-release';
import {
  buildManagerRecord,
  isRolloutDelivered,
  type ManagerRecord,
  type ManagerRolloutRow,
} from './manager-record';
import {
  FEATURED_NOTE_MAX_CHARS,
  RISING_TEAMMATE_WINDOW_DAYS,
  RISING_WINDOW_DAYS,
  buildShelves,
  featuredEndsOn,
  featuredHasRoom,
  isoDay,
  isValidIsoDay,
  rankRising,
  resolveViewerKind,
  risingMonthStart,
  type FeaturedRow,
  type RisingCandidate,
  type Shelf,
  type ShelfPerson,
  type ViewerKind,
} from './directory-featuring';
import type { PersonAvailability } from '@/types/directory';

/**
 * The I/O half of featuring (directory spec, section 6). The rules are in
 * lib/directory-featuring.ts and lib/manager-record.ts; this reads and writes.
 *
 * EVERYTHING READ HERE FAILS TO "NOTHING TO SHOW". A shelf is an extra at the top
 * of a page that works without it, so a missing table (the migration is applied
 * by hand), a read blip or an unreadable row must cost an empty shelf and never
 * an error on the directory. The writes are the opposite: they report exactly
 * what happened, because an admin pressing "Feature" needs to know.
 *
 * Declared here rather than imported from app/api/directory/_shared: a lib
 * module must not depend on a route group (work-requests-server.ts says the same).
 */

const FEATURED_TABLE = 'directory_featured';
const RISING_TABLE = 'directory_rising';
const PERSON_PROFILES_TABLE = 'person_profiles';
const DELIVERY_RECORDS_TABLE = 'delivery_records';
const RELEASES_TABLE = 'releases';
const TASKS_TABLE = 'tasks';
const PROFILES_TABLE = 'profiles';

/** Rows read at most for one sweep or one record load. Past it the answer is
 *  "not looked at", never a smaller number dressed up as the truth. */
const RELEASE_READ_CAP = 5_000;
const TASK_READ_CAP = 25_000;
const RECORD_READ_CAP = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const isRole = (value: unknown): value is DirectoryRole =>
  typeof value === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(value);

// ─────────────────────────────────────────────────────────────────────────────
// Manager records

/**
 * Releases run, artists managed and artists still active, for a handful of
 * people. A person with no rollout gets no entry, which the card reads as "no
 * record" rather than three zeros.
 *
 * Never throws. A read that fails returns an empty map, so a card renders
 * without its numbers, which is visibly absent and not silently wrong.
 */
export async function loadManagerRecords(
  admin: SupabaseClient,
  userIds: readonly string[],
  now: Date = new Date()
): Promise<Map<string, ManagerRecord>> {
  const records = new Map<string, ManagerRecord>();
  const owners = [...new Set(userIds.filter(Boolean))];
  if (owners.length === 0) return records;

  try {
    const releases = await readInChunks<string, Record<string, unknown>>(
      owners,
      (group, from, to) =>
        admin
          .from(RELEASES_TABLE)
          .select('id, owner_user_id, artist_id, release_date, status, metadata')
          .in('owner_user_id', group)
          .order('id')
          .range(from, to),
      { maxRows: RELEASE_READ_CAP }
    );
    if (releases.rows.length === 0) return records;

    const releaseIds = releases.rows.map((row) => String(row.id || '')).filter(Boolean);
    const tasks = await readInChunks<string, Record<string, unknown>>(
      releaseIds,
      (group, from, to) =>
        admin
          .from(TASKS_TABLE)
          .select('id, release_id, status')
          .in('release_id', group)
          .order('id')
          .range(from, to),
      { maxRows: TASK_READ_CAP }
    );

    // A truncated task read cannot prove a rollout is "every activity done", so
    // when it is cut short that clause is not trusted. The date clause still is.
    const totals = new Map<string, { total: number; done: number }>();
    for (const task of tasks.rows) {
      const releaseId = String(task.release_id || '');
      if (!releaseId) continue;
      const held = totals.get(releaseId) ?? { total: 0, done: 0 };
      held.total += 1;
      if (task.status === 'done') held.done += 1;
      totals.set(releaseId, held);
    }

    const byOwner = new Map<string, ManagerRolloutRow[]>();
    for (const release of releases.rows) {
      const owner = String(release.owner_user_id || '');
      const id = String(release.id || '');
      if (!owner || !id) continue;
      const counted = totals.get(id) ?? { total: 0, done: 0 };
      const list = byOwner.get(owner) ?? [];
      list.push({
        id,
        artistId: release.artist_id ? String(release.artist_id) : null,
        releaseDate: release.release_date ? String(release.release_date) : null,
        status: String(release.status || 'draft'),
        isTest: readTestRelease(asRow(release.metadata)),
        totalTasks: counted.total,
        allTasksDone: !tasks.truncated && counted.total > 0 && counted.done === counted.total,
      });
      byOwner.set(owner, list);
    }

    for (const [owner, rows] of byOwner) {
      records.set(owner, buildManagerRecord(rows, now));
    }
  } catch (error) {
    console.error('[directory-featuring] manager records failed', error);
    return new Map();
  }

  return records;
}

/**
 * Which of these rollouts have come out, by id, for the founder's "shared
 * rollouts that went live" number (directory spec, section 7). The same rule as
 * a manager's record, so the two cannot disagree about what "came out" means.
 *
 * Null when it could not be worked out: the admin page then says so instead of
 * showing a zero that looks like a finding.
 */
export async function loadLiveSharedRollouts(
  admin: SupabaseClient,
  releaseIds: readonly string[],
  now: Date = new Date()
): Promise<Set<string> | null> {
  const ids = [...new Set(releaseIds.filter(Boolean))];
  if (ids.length === 0) return new Set();

  try {
    const releases = await readInChunks<string, Record<string, unknown>>(
      ids,
      (group, from, to) =>
        admin
          .from(RELEASES_TABLE)
          .select('id, artist_id, release_date, status, metadata')
          .in('id', group)
          .order('id')
          .range(from, to),
      { maxRows: RELEASE_READ_CAP }
    );
    if (releases.truncated) return null;

    const tasks = await readInChunks<string, Record<string, unknown>>(
      ids,
      (group, from, to) =>
        admin
          .from(TASKS_TABLE)
          .select('id, release_id, status')
          .in('release_id', group)
          .order('id')
          .range(from, to),
      { maxRows: TASK_READ_CAP }
    );

    const totals = new Map<string, { total: number; done: number }>();
    for (const task of tasks.rows) {
      const releaseId = String(task.release_id || '');
      if (!releaseId) continue;
      const held = totals.get(releaseId) ?? { total: 0, done: 0 };
      held.total += 1;
      if (task.status === 'done') held.done += 1;
      totals.set(releaseId, held);
    }

    const live = new Set<string>();
    for (const release of releases.rows) {
      const id = String(release.id || '');
      if (!id) continue;
      const counted = totals.get(id) ?? { total: 0, done: 0 };
      const delivered = isRolloutDelivered(
        {
          id,
          artistId: release.artist_id ? String(release.artist_id) : null,
          releaseDate: release.release_date ? String(release.release_date) : null,
          status: String(release.status || 'draft'),
          isTest: readTestRelease(asRow(release.metadata)),
          totalTasks: counted.total,
          allTasksDone: !tasks.truncated && counted.total > 0 && counted.done === counted.total,
        },
        now
      );
      if (delivered && !readTestRelease(asRow(release.metadata))) live.add(id);
    }
    return live;
  } catch (error) {
    console.error('[directory-featuring] live shared rollouts failed', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// What a viewer sees

type ProfileRow = {
  userId: string;
  displayName: string;
  city: string | null;
  availability: PersonAvailability;
  slug: string | null;
  isPublic: boolean;
  claimedRoles: DirectoryRole[];
};

/** The listed, claimed profiles among these people. Claimed is "has an account
 *  behind it": an unclaimed stand-in has no user id and is private by a
 *  constraint, so it can never appear here. */
async function loadListedProfiles(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>();
  for (const group of inChunks([...new Set(userIds)], IN_LIST_CHUNK)) {
    const { data } = await admin
      .from(PERSON_PROFILES_TABLE)
      .select('user_id, display_name, slug, roles, city, availability, visibility')
      .in('user_id', group)
      .neq('visibility', 'private');
    for (const raw of data || []) {
      const row = asRow(raw);
      const userId = String(row.user_id || '');
      if (!userId) continue;
      out.set(userId, {
        userId,
        displayName: String(row.display_name || ''),
        city: row.city ? String(row.city) : null,
        availability: (row.availability as PersonAvailability) || 'selective',
        slug: row.slug ? String(row.slug) : null,
        isPublic: row.visibility === 'public',
        claimedRoles: Array.isArray(row.roles) ? (row.roles as unknown[]).filter(isRole) : [],
      });
    }
  }
  return out;
}

export type ShelvesPayload = { viewer: ViewerKind; shelves: Shelf[] };

/**
 * The two shelves for one signed-in person, in the order that suits them.
 *
 * Featured is whoever Urganize has picked who is still published; On the rise is
 * this month's snapshot, again only the people still published. Both are checked
 * against the profile AT READ TIME, so somebody who unlists themselves leaves
 * the shelf at once rather than at the next sweep.
 */
export async function loadShelvesForViewer(
  admin: SupabaseClient,
  viewer: { userId: string },
  now: Date = new Date()
): Promise<ShelvesPayload> {
  let viewerKind: ViewerKind = 'manager';
  try {
    const [own, account] = await Promise.all([
      admin.from(PERSON_PROFILES_TABLE).select('roles').eq('user_id', viewer.userId).maybeSingle(),
      admin.from(PROFILES_TABLE).select('role').eq('id', viewer.userId).maybeSingle(),
    ]);
    const ownRoles = Array.isArray(asRow(own.data).roles)
      ? (asRow(own.data).roles as unknown[]).map(String)
      : [];
    viewerKind = resolveViewerKind({
      accountRole: typeof asRow(account.data).role === 'string' ? String(asRow(account.data).role) : null,
      ownRoles,
    });
  } catch {
    // The default is the common viewer, so a failed read still gets a sensible order.
  }

  try {
    const today = isoDay(now);
    const month = risingMonthStart(now);

    const [featuredResult, risingResult] = await Promise.all([
      admin
        .from(FEATURED_TABLE)
        .select('id, user_id, role, starts_on, ends_on')
        .lte('starts_on', today)
        .gte('ends_on', today)
        .order('created_at', { ascending: true })
        .limit(200),
      admin
        .from(RISING_TABLE)
        .select('user_id, role, rank')
        .eq('month', month)
        .order('role')
        .order('rank')
        .limit(200),
    ]);

    // A missing table is an empty shelf, not an error.
    const featuredRows = featuredResult.error ? [] : (featuredResult.data || []).map(asRow);
    const risingRows = risingResult.error ? [] : (risingResult.data || []).map(asRow);
    if (featuredRows.length === 0 && risingRows.length === 0) {
      return { viewer: viewerKind, shelves: [] };
    }

    const userIds = [
      ...new Set([...featuredRows, ...risingRows].map((row) => String(row.user_id || '')).filter(Boolean)),
    ];
    const profiles = await loadListedProfiles(admin, userIds);

    // What each person has delivered, so a card shows the count and not a claim.
    const deliveredByUser = new Map<string, DirectoryRole[]>();
    for (const group of inChunks(userIds, IN_LIST_CHUNK)) {
      const { data } = await admin
        .from(DELIVERY_RECORDS_TABLE)
        .select('user_id, role')
        .in('user_id', group);
      for (const raw of data || []) {
        const row = asRow(raw);
        const userId = String(row.user_id || '');
        if (!userId || !isRole(row.role)) continue;
        const held = deliveredByUser.get(userId) ?? [];
        held.push(row.role);
        deliveredByUser.set(userId, held);
      }
    }

    // A manager's card leads with their rollouts, so those are the only people
    // whose record is worth the reads.
    const managerIds = [...featuredRows, ...risingRows]
      .filter((row) => row.role === 'manager')
      .map((row) => String(row.user_id || ''))
      .filter((id) => profiles.has(id));
    const managerRecords = await loadManagerRecords(admin, managerIds, now);

    const personFor = (userId: string, role: DirectoryRole): ShelfPerson | null => {
      const profile = profiles.get(userId);
      if (!profile) return null;
      return {
        userId,
        displayName: profile.displayName,
        city: profile.city,
        availability: profile.availability,
        roles: profileRoles(
          profile.claimedRoles,
          (deliveredByUser.get(userId) ?? []).map((held) => ({ role: held }))
        ),
        slug: profile.slug,
        isPublic: profile.isPublic,
        managerRecord: role === 'manager' ? managerRecords.get(userId) ?? null : null,
      };
    };

    const toEntries = (rows: Record<string, unknown>[]) =>
      rows.flatMap((row) => {
        const role = row.role;
        if (!isRole(role)) return [];
        const person = personFor(String(row.user_id || ''), role);
        return person ? [{ role, person }] : [];
      });

    return {
      viewer: viewerKind,
      shelves: buildShelves({
        viewer: viewerKind,
        viewerUserId: viewer.userId,
        featured: toEntries(featuredRows),
        onTheRise: toEntries(risingRows),
      }),
    };
  } catch (error) {
    console.error('[directory-featuring] shelves failed', error);
    return { viewer: viewerKind, shelves: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The monthly sweep: On the rise

export type RisingSweepResult = {
  computed: boolean;
  people: number;
  reason?: 'already_computed' | 'table_unreadable' | 'nobody_qualifies' | 'failed';
};

/**
 * THE DAILY SWEEP THAT WRITES THIS MONTH'S "ON THE RISE", a passenger on
 * /api/cron/due-date-notifications for the reason every sweep there gives (two
 * schedule slots, one run a day).
 *
 * It writes the month ONCE. Once there is a snapshot for the month, every later
 * run leaves it alone, which is what "refreshes monthly" means and what stops
 * the shelf reshuffling whenever somebody finishes a task. While the month has
 * NO people (day one, or before there are 30 days of activity) it keeps trying
 * each day, because "empty until there is activity, then fills" is the spec's own
 * description of the first weeks, and a locked empty month would stay empty until
 * the next one.
 *
 * Not behind the directory flag: it writes a table nothing else reads, costs
 * nothing while there are no delivered rollouts, and the shelf is hidden behind
 * the directory flag on the READ side. Never throws.
 */
export async function runOnTheRiseSweep(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<RisingSweepResult> {
  try {
    const month = risingMonthStart(now);

    const existing = await admin.from(RISING_TABLE).select('id').eq('month', month).limit(1);
    if (existing.error) return { computed: false, people: 0, reason: 'table_unreadable' };
    if ((existing.data || []).length > 0) {
      return { computed: false, people: 0, reason: 'already_computed' };
    }

    const today = isoDay(now);
    const windowStart = isoDay(now.getTime() - RISING_WINDOW_DAYS * DAY_MS);

    // Rollouts that went live in the window: the date has arrived and is recent.
    const live = await readAllPages<Record<string, unknown>>(
      (from, to) =>
        admin
          .from(RELEASES_TABLE)
          .select('id, owner_user_id, artist_id, release_date, status, metadata')
          .gte('release_date', windowStart)
          .lte('release_date', today)
          .order('id')
          .range(from, to),
      { maxPages: Math.ceil(RELEASE_READ_CAP / ROWS_PAGE_SIZE) }
    );

    const liveReleases = live.rows.filter(
      (row) => row.id && row.owner_user_id && !readTestRelease(asRow(row.metadata))
    );
    if (liveReleases.length === 0) return { computed: false, people: 0, reason: 'nobody_qualifies' };

    const liveIds = liveReleases.map((row) => String(row.id));
    const ownerIds = [...new Set(liveReleases.map((row) => String(row.owner_user_id)))];

    // Creatives: the people with a delivery record on one of those rollouts.
    const windowRecords = await readInChunks<string, Record<string, unknown>>(
      liveIds,
      (group, from, to) =>
        admin
          .from(DELIVERY_RECORDS_TABLE)
          .select('id, user_id, role, release_id')
          .in('release_id', group)
          .order('id')
          .range(from, to),
      { maxRows: RECORD_READ_CAP }
    );

    const liveByPersonRole = new Map<string, Set<string>>();
    const people = new Set<string>(ownerIds);
    for (const record of windowRecords.rows) {
      const userId = String(record.user_id || '');
      const releaseId = String(record.release_id || '');
      if (!userId || !releaseId || !isRole(record.role)) continue;
      const key = `${userId}:${record.role}`;
      const held = liveByPersonRole.get(key) ?? new Set<string>();
      held.add(releaseId);
      liveByPersonRole.set(key, held);
      people.add(userId);
    }

    // The length of each creative's record in the role, as a tie-break.
    const totalByPersonRole = new Map<string, Set<string>>();
    const creativeIds = [...new Set([...liveByPersonRole.keys()].map((key) => key.split(':')[0]))];
    const allRecords = await readInChunks<string, Record<string, unknown>>(
      creativeIds,
      (group, from, to) =>
        admin
          .from(DELIVERY_RECORDS_TABLE)
          .select('id, user_id, role, release_id')
          .in('user_id', group)
          .order('id')
          .range(from, to),
      { maxRows: RECORD_READ_CAP }
    );
    for (const record of allRecords.rows) {
      const userId = String(record.user_id || '');
      const releaseId = String(record.release_id || '');
      if (!userId || !releaseId || !isRole(record.role)) continue;
      const key = `${userId}:${record.role}`;
      const held = totalByPersonRole.get(key) ?? new Set<string>();
      held.add(releaseId);
      totalByPersonRole.set(key, held);
    }

    // Managers: the owner of a rollout that went live, who also has a team
    // really working in Urganize.
    const liveByOwner = new Map<string, number>();
    for (const release of liveReleases) {
      const owner = String(release.owner_user_id);
      liveByOwner.set(owner, (liveByOwner.get(owner) ?? 0) + 1);
    }
    const teammatesByOwner = await loadActiveTeammates(admin, ownerIds, now);
    const managerRecords = await loadManagerRecords(admin, ownerIds, now);

    const profiles = await loadListedProfiles(admin, [...people]);

    const candidates: RisingCandidate[] = [];
    for (const [key, releases] of liveByPersonRole) {
      const [userId, role] = key.split(':') as [string, DirectoryRole];
      const profile = profiles.get(userId);
      candidates.push({
        userId,
        role,
        claimed: Boolean(profile),
        listed: Boolean(profile),
        displayName: profile?.displayName ?? '',
        liveReleases: releases.size,
        deliveredTotal: totalByPersonRole.get(key)?.size ?? releases.size,
        activeTeammates: null,
      });
    }
    for (const [owner, count] of liveByOwner) {
      const profile = profiles.get(owner);
      candidates.push({
        userId: owner,
        role: 'manager',
        claimed: Boolean(profile),
        listed: Boolean(profile),
        displayName: profile?.displayName ?? '',
        liveReleases: count,
        deliveredTotal: managerRecords.get(owner)?.releasesRun ?? count,
        activeTeammates: teammatesByOwner.get(owner) ?? 0,
      });
    }

    const ranked = rankRising(candidates);
    if (ranked.length === 0) return { computed: false, people: 0, reason: 'nobody_qualifies' };

    const rankWithinRole = new Map<DirectoryRole, number>();
    const rows = ranked.map((candidate) => {
      const rank = (rankWithinRole.get(candidate.role) ?? 0) + 1;
      rankWithinRole.set(candidate.role, rank);
      return {
        month,
        role: candidate.role,
        user_id: candidate.userId,
        rank,
        evidence: {
          live_releases: candidate.liveReleases,
          delivered_total: candidate.deliveredTotal,
          active_teammates: candidate.activeTeammates,
        },
      };
    });

    const { error } = await admin
      .from(RISING_TABLE)
      .upsert(rows, { onConflict: 'month,role,user_id', ignoreDuplicates: true });
    if (error) {
      console.error('[directory-featuring] on-the-rise write refused', error.message);
      return { computed: false, people: 0, reason: 'failed' };
    }
    return { computed: true, people: rows.length };
  } catch (error) {
    console.error('[directory-featuring] on-the-rise sweep failed', error);
    return { computed: false, people: 0, reason: 'failed' };
  }
}

/**
 * For each manager, how many different TEAMMATES touched an activity on one of
 * their rollouts in the last 30 days. A teammate is someone an activity is
 * assigned to who is not the owner: template instantiation hands the owner every
 * activity, so an activity on the owner proves nothing, the same filter the
 * delivery records and the owner-history heuristic use.
 */
export async function loadActiveTeammates(
  admin: SupabaseClient,
  ownerIds: readonly string[],
  now: Date = new Date()
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ownerIds.length === 0) return out;

  try {
    const releases = await readInChunks<string, Record<string, unknown>>(
      [...ownerIds],
      (group, from, to) =>
        admin
          .from(RELEASES_TABLE)
          .select('id, owner_user_id')
          .in('owner_user_id', group)
          .order('id')
          .range(from, to),
      { maxRows: RELEASE_READ_CAP }
    );
    const ownerByRelease = new Map<string, string>();
    for (const row of releases.rows) {
      if (row.id && row.owner_user_id) ownerByRelease.set(String(row.id), String(row.owner_user_id));
    }
    if (ownerByRelease.size === 0) return out;

    const since = new Date(now.getTime() - RISING_TEAMMATE_WINDOW_DAYS * DAY_MS).toISOString();
    const tasks = await readInChunks<string, Record<string, unknown>>(
      [...ownerByRelease.keys()],
      (group, from, to) =>
        admin
          .from(TASKS_TABLE)
          .select('id, release_id, assigned_to_user_id')
          .in('release_id', group)
          .gte('updated_at', since)
          .order('id')
          .range(from, to),
      { maxRows: TASK_READ_CAP }
    );

    const teammates = new Map<string, Set<string>>();
    for (const task of tasks.rows) {
      const owner = ownerByRelease.get(String(task.release_id || ''));
      const assignee = task.assigned_to_user_id ? String(task.assigned_to_user_id) : '';
      if (!owner || !assignee || assignee === owner) continue;
      const held = teammates.get(owner) ?? new Set<string>();
      held.add(assignee);
      teammates.set(owner, held);
    }
    for (const [owner, set] of teammates) out.set(owner, set.size);
  } catch (error) {
    console.error('[directory-featuring] active teammates failed', error);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Featuring, by hand (the admin)

export type AdminFeaturedEntry = FeaturedRow & {
  displayName: string;
  note: string | null;
  /** Whether they are still published. A pick of somebody who has unlisted
   *  stays in the list (so it can be removed) and is flagged. */
  listed: boolean;
};

export type AdminCandidate = { userId: string; displayName: string; roles: DirectoryRole[] };

/** The picks that still count (today or later), and the people who could be
 *  picked: every published, claimed profile. */
export async function loadFeaturedForAdmin(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ featured: AdminFeaturedEntry[]; candidates: AdminCandidate[]; error?: string }> {
  try {
    const today = isoDay(now);
    const { data, error } = await admin
      .from(FEATURED_TABLE)
      .select('id, user_id, role, starts_on, ends_on, note')
      .gte('ends_on', today)
      .order('role')
      .order('starts_on')
      .limit(500);
    if (error) return { featured: [], candidates: [], error: error.message };

    const rows = (data || []).map(asRow);
    const names = await loadListedProfiles(
      admin,
      rows.map((row) => String(row.user_id || ''))
    );

    const featured: AdminFeaturedEntry[] = rows.flatMap((row) => {
      if (!isRole(row.role)) return [];
      const userId = String(row.user_id || '');
      const profile = names.get(userId);
      return [
        {
          id: String(row.id || ''),
          userId,
          role: row.role,
          startsOn: String(row.starts_on || ''),
          endsOn: String(row.ends_on || ''),
          displayName: profile?.displayName || 'Unlisted',
          note: row.note ? String(row.note) : null,
          listed: Boolean(profile),
        },
      ];
    });

    const { data: people } = await admin
      .from(PERSON_PROFILES_TABLE)
      .select('user_id, display_name, roles')
      .not('user_id', 'is', null)
      .neq('visibility', 'private')
      .order('display_name')
      .limit(500);

    const candidates: AdminCandidate[] = (people || []).flatMap((raw) => {
      const row = asRow(raw);
      const userId = String(row.user_id || '');
      if (!userId) return [];
      return [
        {
          userId,
          displayName: String(row.display_name || ''),
          roles: Array.isArray(row.roles) ? (row.roles as unknown[]).filter(isRole) : [],
        },
      ];
    });

    return { featured, candidates };
  } catch (error) {
    return {
      featured: [],
      candidates: [],
      error: error instanceof Error ? error.message : 'Could not read the featured list.',
    };
  }
}

export type FeaturePickResult =
  | { ok: true; id: string; startsOn: string; endsOn: string }
  | { ok: false; status: number; error: string };

/**
 * Feature somebody for a role, for a quarter.
 *
 * THREE RULES, each from the spec: only a PUBLISHED, CLAIMED profile can be
 * featured ("Featured spots go to published profiles only", and Lane B says
 * nobody is shown as featured without saying yes, which publishing is); at most
 * six per role; and a pick is a quarter, which this works out so nobody has to
 * type an end date.
 */
export async function addFeaturedPick(
  admin: SupabaseClient,
  input: {
    userId: unknown;
    role: unknown;
    startsOn?: unknown;
    note?: unknown;
    pickedBy: string;
  },
  now: Date = new Date()
): Promise<FeaturePickResult> {
  const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
  if (!userId) return { ok: false, status: 400, error: 'Pick a person.' };
  if (!isRole(input.role)) return { ok: false, status: 400, error: 'Pick a role.' };
  const role = input.role;

  const startsOn = input.startsOn === undefined || input.startsOn === null || input.startsOn === ''
    ? isoDay(now)
    : input.startsOn;
  if (!isValidIsoDay(startsOn)) {
    return { ok: false, status: 400, error: 'The start date has to be a real day, like 2026-11-01.' };
  }

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > FEATURED_NOTE_MAX_CHARS) {
    return { ok: false, status: 400, error: `Keep the note to ${FEATURED_NOTE_MAX_CHARS} characters or fewer.` };
  }

  const profile = (await loadListedProfiles(admin, [userId])).get(userId);
  if (!profile) {
    return {
      ok: false,
      status: 409,
      error: 'They have to have a published profile before they can be featured.',
    };
  }

  const endsOn = featuredEndsOn(startsOn);

  const { data: existing, error: readError } = await admin
    .from(FEATURED_TABLE)
    .select('role, starts_on, ends_on')
    .eq('role', role)
    .gte('ends_on', startsOn);
  if (readError) return { ok: false, status: 500, error: readError.message || 'Could not read the picks.' };

  const held = (existing || []).map((raw) => {
    const row = asRow(raw);
    return {
      role: row.role as DirectoryRole,
      startsOn: String(row.starts_on || ''),
      endsOn: String(row.ends_on || ''),
    };
  });
  if (!featuredHasRoom(held, role, startsOn, endsOn)) {
    return { ok: false, status: 409, error: 'That shelf is full for those dates. Remove somebody first.' };
  }

  const { data, error } = await admin
    .from(FEATURED_TABLE)
    .insert({
      user_id: userId,
      role,
      starts_on: startsOn,
      ends_on: endsOn,
      note: note || null,
      picked_by: input.pickedBy,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (String((error as { code?: string } | null)?.code || '') === '23505') {
      return { ok: false, status: 409, error: 'They are already featured for that role from that day.' };
    }
    return { ok: false, status: 500, error: error?.message || 'Could not feature them.' };
  }
  return { ok: true, id: String(asRow(data).id || ''), startsOn, endsOn };
}

export async function removeFeaturedPick(
  admin: SupabaseClient,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Which pick?' };
  const { error } = await admin.from(FEATURED_TABLE).delete().eq('id', id);
  return error ? { ok: false, error: error.message || 'Could not remove that.' } : { ok: true };
}

/** This month's On the rise, for the founder's read. */
export async function loadRisingForAdmin(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ month: string; people: { userId: string; displayName: string; role: DirectoryRole; rank: number }[] }> {
  const month = risingMonthStart(now);
  try {
    const { data, error } = await admin
      .from(RISING_TABLE)
      .select('user_id, role, rank')
      .eq('month', month)
      .order('role')
      .order('rank');
    if (error) return { month, people: [] };
    const rows = (data || []).map(asRow);
    const names = await loadListedProfiles(admin, rows.map((row) => String(row.user_id || '')));
    return {
      month,
      people: rows.flatMap((row) => {
        if (!isRole(row.role)) return [];
        const userId = String(row.user_id || '');
        return [
          {
            userId,
            displayName: names.get(userId)?.displayName || 'Unlisted',
            role: row.role,
            rank: Number(row.rank) || 0,
          },
        ];
      }),
    };
  } catch {
    return { month, people: [] };
  }
}
