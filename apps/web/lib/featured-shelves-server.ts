import type { SupabaseClient } from '@supabase/supabase-js';
import { profileRoles } from './person-profile';
import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import type { DirectoryEntry } from './directory-search';
import { loadPersonPhotoUrls } from './profile-photo-server';
import {
  FEATURED_PER_ROLE,
  checkFeatureRequest,
  composeShelves,
  computeOnTheRise,
  hasEnoughHistory,
  monthKey,
  quarterBounds,
  shouldRecomputeRise,
  viewerKindFromProfile,
  viewerKindFromProfileType,
  type FeatureVerdict,
  type RiseActivity,
  type RiseCandidate,
  type RiseRecord,
  type RiseRelease,
  type ShelfEntry,
  type ViewerKind,
} from './featured-shelves';

/**
 * Reads and writes for the two shelves. The rules are in featured-shelves.ts;
 * this file only loads rows and shapes them.
 *
 * Reads FAIL TO EMPTY. A shelf is decoration on top of the directory, so a
 * failed read means no shelf, never an error page and never a half-built one.
 * The writes (a pick, the monthly recompute) fail loudly to their caller.
 *
 * NO MONEY PATH: nothing in here reads a plan, a price or a payment, and
 * lib/featured-shelves-guard.test.ts scans for one.
 */

export const FEATURED_TABLE = 'featured_profiles';
export const RISE_TABLE = 'on_the_rise_picks';
export const RISE_MONTH_SETTING = 'on_the_rise_month';

const PROFILES_TABLE = 'person_profiles';
const RECORDS_TABLE = 'delivery_records';
const SCAN_LIMIT = 5000;

export type DirectoryShelfPerson = DirectoryEntry & { slug: string | null; isPublic: boolean };
export type ShelfPerson = ShelfEntry<DirectoryShelfPerson>;

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});

const asRole = (value: unknown): DirectoryRole | null =>
  (DIRECTORY_ROLES as readonly string[]).includes(String(value)) ? (String(value) as DirectoryRole) : null;

/** Published profiles for these ids, shaped exactly like a directory card. */
async function loadPublishedPeople(
  admin: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, DirectoryShelfPerson>> {
  const people = new Map<string, DirectoryShelfPerson>();
  if (profileIds.length === 0) return people;

  const { data: profiles, error } = await admin
    .from(PROFILES_TABLE)
    .select('id, user_id, display_name, slug, roles, city, availability, visibility, status')
    .in('id', profileIds)
    .eq('status', 'claimed')
    .neq('visibility', 'private');
  if (error || !profiles) return people;

  const userIds = profiles.map((row) => String(asRow(row).user_id || '')).filter(Boolean);
  const recordsByUser = new Map<string, Array<{ role: DirectoryRole }>>();
  if (userIds.length > 0) {
    const { data: records } = await admin.from(RECORDS_TABLE).select('user_id, role').in('user_id', userIds);
    for (const raw of records || []) {
      const row = asRow(raw);
      const role = asRole(row.role);
      const userId = String(row.user_id || '');
      if (!role || !userId) continue;
      recordsByUser.set(userId, [...(recordsByUser.get(userId) ?? []), { role }]);
    }
  }

  const photoUrls = await loadPersonPhotoUrls(admin, userIds);

  for (const raw of profiles) {
    const row = asRow(raw);
    const userId = String(row.user_id || '');
    if (!userId) continue;
    const claimed = (Array.isArray(row.roles) ? row.roles : [])
      .map(asRole)
      .filter((role): role is DirectoryRole => role !== null);
    people.set(String(row.id), {
      userId,
      displayName: String(row.display_name || ''),
      city: row.city ? String(row.city) : null,
      availability: (row.availability as DirectoryEntry['availability']) || 'selective',
      roles: profileRoles(claimed, recordsByUser.get(userId) ?? []),
      slug: row.slug ? String(row.slug) : null,
      isPublic: String(row.visibility) === 'public',
      avatarUrl: photoUrls.get(userId) ?? null,
    });
  }
  return people;
}

export async function loadViewerKind(
  admin: SupabaseClient,
  viewerUserId: string,
  viewerProfileType: string | null = null
): Promise<ViewerKind> {
  try {
    const { data } = await admin.from(PROFILES_TABLE).select('roles').eq('user_id', viewerUserId).maybeSingle();
    const roles = Array.isArray(asRow(data).roles) ? (asRow(data).roles as string[]) : [];
    // The viewer's own profile type wins; claimed roles are the fallback.
    return viewerKindFromProfile({
      profileType: viewerKindFromProfileType(viewerProfileType),
      claimedRoles: roles,
    });
  } catch {
    return viewerKindFromProfile({ claimedRoles: [] });
  }
}

export type ShelvesPayload = {
  featured: ShelfPerson[];
  onTheRise: ShelfPerson[];
  viewerKind: ViewerKind;
};

/** Both shelves for one viewer. Never throws; a read that fails is an empty shelf. */
export async function loadShelves(
  admin: SupabaseClient,
  viewerUserId: string,
  now: Date = new Date(),
  viewerProfileType: string | null = null
): Promise<ShelvesPayload> {
  const viewerKind = await loadViewerKind(admin, viewerUserId, viewerProfileType);
  try {
    const nowIso = now.toISOString();
    const [featuredResult, riseResult] = await Promise.all([
      admin.from(FEATURED_TABLE).select('profile_id, role').lte('starts_at', nowIso).gt('ends_at', nowIso).order('created_at'),
      admin.from(RISE_TABLE).select('profile_id, role').eq('month', monthKey(now)).order('computed_at'),
    ]);

    const featuredRows = featuredResult.error ? [] : (featuredResult.data || []).map(asRow);
    const riseRows = riseResult.error ? [] : (riseResult.data || []).map(asRow);
    const ids = [...new Set([...featuredRows, ...riseRows].map((row) => String(row.profile_id || '')).filter(Boolean))];
    const people = await loadPublishedPeople(admin, ids);

    const shape = (rows: Row[]): ShelfPerson[] =>
      rows.flatMap((row) => {
        const person = people.get(String(row.profile_id));
        const role = asRole(row.role);
        return person && role ? [{ ...person, shelfRole: role }] : [];
      });

    return { ...composeShelves(shape(featuredRows), shape(riseRows), viewerKind), viewerKind };
  } catch {
    return { featured: [], onTheRise: [], viewerKind };
  }
}

// Admin ---------------------------------------------------------------------

export type AdminFeaturedRow = {
  id: string;
  profileId: string;
  displayName: string;
  role: DirectoryRole;
  startsAt: string;
  endsAt: string;
  published: boolean;
};

export type AdminCandidate = { profileId: string; displayName: string; roles: DirectoryRole[] };

export type AdminFeaturedPayload = {
  quarters: Array<{ key: 'current' | 'next'; label: string; startsAt: string; endsAt: string }>;
  featured: AdminFeaturedRow[];
  candidates: AdminCandidate[];
  perRole: number;
};

/** What the picker shows: both quarters, who is in them, and who could be. */
export async function loadAdminFeatured(admin: SupabaseClient, now: Date = new Date()): Promise<AdminFeaturedPayload> {
  const current = quarterBounds(now, 0);
  const next = quarterBounds(now, 1);

  const [featuredResult, candidateResult, recordsResult] = await Promise.all([
    admin
      .from(FEATURED_TABLE)
      .select('id, profile_id, role, starts_at, ends_at')
      .gte('starts_at', current.startsAt)
      .order('created_at')
      .limit(SCAN_LIMIT),
    admin
      .from(PROFILES_TABLE)
      .select('id, user_id, display_name, roles, visibility, status')
      .eq('status', 'claimed')
      .neq('visibility', 'private')
      .order('display_name')
      .limit(SCAN_LIMIT),
    admin.from(RECORDS_TABLE).select('user_id, role').limit(SCAN_LIMIT * 4),
  ]);
  for (const [table, result] of [
    [FEATURED_TABLE, featuredResult],
    [PROFILES_TABLE, candidateResult],
  ] as const) {
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
  }

  const profileRows = (candidateResult.data || []).map(asRow);
  const byId = new Map(profileRows.map((row) => [String(row.id), row]));
  const deliveredByUser = new Map<string, Set<DirectoryRole>>();
  for (const raw of recordsResult.error ? [] : recordsResult.data || []) {
    const row = asRow(raw);
    const role = asRole(row.role);
    const userId = String(row.user_id || '');
    if (!role || !userId) continue;
    const set = deliveredByUser.get(userId) ?? new Set<DirectoryRole>();
    set.add(role);
    deliveredByUser.set(userId, set);
  }

  const candidates: AdminCandidate[] = profileRows.map((row) => {
    const claimed = (Array.isArray(row.roles) ? row.roles : []).map(asRole).filter((r): r is DirectoryRole => r !== null);
    const delivered = deliveredByUser.get(String(row.user_id || '')) ?? new Set<DirectoryRole>();
    return {
      profileId: String(row.id),
      displayName: String(row.display_name || ''),
      roles: [...new Set<DirectoryRole>([...claimed, ...delivered])],
    };
  });

  const featured: AdminFeaturedRow[] = (featuredResult.data || []).flatMap((raw) => {
    const row = asRow(raw);
    const role = asRole(row.role);
    if (!role) return [];
    const profile = byId.get(String(row.profile_id));
    return [
      {
        id: String(row.id),
        profileId: String(row.profile_id),
        displayName: String(asRow(profile).display_name || 'Unlisted profile'),
        role,
        startsAt: String(row.starts_at),
        endsAt: String(row.ends_at),
        // Someone who went private after being picked stays visible HERE (so
        // the admin can remove them) and is dropped from the shelf itself.
        published: Boolean(profile),
      },
    ];
  });

  return {
    quarters: [
      { key: 'current', ...current },
      { key: 'next', ...next },
    ],
    featured,
    candidates,
    perRole: FEATURED_PER_ROLE,
  };
}

export type AddFeaturedResult =
  | { ok: true; id: string }
  | { ok: false; status: number; code: string; message: string };

/** The one insert path. Checks the rules, then lets the trigger check them again. */
export async function addFeatured(
  admin: SupabaseClient,
  input: { profileId: string; role: string; quarter: 'current' | 'next'; adminUserId: string },
  now: Date = new Date()
): Promise<AddFeaturedResult> {
  const bounds = quarterBounds(now, input.quarter === 'next' ? 1 : 0);

  const { data: profileRow } = await admin
    .from(PROFILES_TABLE)
    .select('id, user_id, status, visibility, roles')
    .eq('id', input.profileId)
    .maybeSingle();
  if (!profileRow) return { ok: false, status: 404, code: 'profile_not_found', message: 'That profile does not exist.' };
  const profile = asRow(profileRow);

  const [{ data: recordRows }, { data: sameRole }] = await Promise.all([
    admin.from(RECORDS_TABLE).select('role').eq('user_id', String(profile.user_id || '')),
    admin.from(FEATURED_TABLE).select('profile_id').eq('role', input.role).eq('starts_at', bounds.startsAt),
  ]);

  const claimed = (Array.isArray(profile.roles) ? profile.roles : []).map(String);
  const delivered = (recordRows || []).map((row) => String(asRow(row).role || ''));
  const existing = (sameRole || []).map((row) => String(asRow(row).profile_id));

  const verdict: FeatureVerdict = checkFeatureRequest({
    profile: {
      userId: profile.user_id ? String(profile.user_id) : null,
      status: String(profile.status || ''),
      visibility: String(profile.visibility || ''),
    },
    role: input.role,
    heldRoles: [...claimed, ...delivered],
    featuredInRole: existing.length,
    alreadyFeatured: existing.includes(input.profileId),
  });
  if (!verdict.ok) return { ok: false, status: 409, code: verdict.code, message: verdict.message };

  const { data, error } = await admin
    .from(FEATURED_TABLE)
    .insert({
      profile_id: input.profileId,
      role: input.role,
      starts_at: bounds.startsAt,
      ends_at: bounds.endsAt,
      created_by: input.adminUserId,
    })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, status: 500, code: 'insert_failed', message: error?.message || 'Could not save.' };
  }
  return { ok: true, id: String(asRow(data).id) };
}

export async function removeFeatured(admin: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await admin.from(FEATURED_TABLE).delete().eq('id', id);
  return !error;
}

// On the rise: the monthly sweep -------------------------------------------

export type RiseSweepResult =
  | { ran: false; reason: 'already_this_month' | 'not_enough_history' | 'read_failed' | 'error' }
  | { ran: true; month: string; picks: number };

/**
 * A passenger on the daily cron. It recomputes only when the Lagos month
 * changed since the last good run, so on every other day it costs one settings
 * read. Until thirty days of task activity exist it does nothing and does NOT
 * mark the month, so it looks again the next day.
 *
 * Writes the new month's picks first, then removes other months', so the shelf
 * is never empty between the two. Never throws.
 */
export async function runOnTheRiseSweep(admin: SupabaseClient, now: Date = new Date()): Promise<RiseSweepResult> {
  try {
    const { data: setting, error: settingError } = await admin
      .from('app_settings')
      .select('value_json')
      .eq('key', RISE_MONTH_SETTING)
      .maybeSingle();
    if (settingError) return { ran: false, reason: 'read_failed' };
    const last = asRow(asRow(setting).value_json).month;
    if (!shouldRecomputeRise(typeof last === 'string' ? last : null, now)) {
      return { ran: false, reason: 'already_this_month' };
    }

    const { data: earliest, error: earliestError } = await admin
      .from('task_activity')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);
    if (earliestError) return { ran: false, reason: 'read_failed' };
    const earliestAt = earliest?.[0] ? String(asRow(earliest[0]).created_at || '') : null;
    if (!hasEnoughHistory(earliestAt, now)) return { ran: false, reason: 'not_enough_history' };

    const input = await loadRiseInput(admin, now);
    if (!input) return { ran: false, reason: 'read_failed' };

    const month = monthKey(now);
    const picks = computeOnTheRise(input, now);

    if (picks.length > 0) {
      const { error } = await admin.from(RISE_TABLE).upsert(
        picks.map((pick) => ({ profile_id: pick.profileId, role: pick.role, month, computed_at: now.toISOString() })),
        { onConflict: 'profile_id,role,month' }
      );
      if (error) return { ran: false, reason: 'error' };
    }
    // Stale picks for this month (the sweep re-ran) and older months go.
    const keepIds = picks.map((pick) => `${pick.profileId}|${pick.role}`);
    const { data: thisMonth } = await admin.from(RISE_TABLE).select('id, profile_id, role').eq('month', month);
    const stale = (thisMonth || [])
      .map(asRow)
      .filter((row) => !keepIds.includes(`${row.profile_id}|${row.role}`))
      .map((row) => String(row.id));
    if (stale.length > 0) await admin.from(RISE_TABLE).delete().in('id', stale);
    await admin.from(RISE_TABLE).delete().neq('month', month);

    const { error: markError } = await admin
      .from('app_settings')
      .upsert({ key: RISE_MONTH_SETTING, value_json: { month }, updated_at: now.toISOString() }, { onConflict: 'key' });
    if (markError) return { ran: false, reason: 'error' };

    return { ran: true, month, picks: picks.length };
  } catch {
    return { ran: false, reason: 'error' };
  }
}

async function loadRiseInput(
  admin: SupabaseClient,
  now: Date
): Promise<{ candidates: RiseCandidate[]; releases: RiseRelease[]; records: RiseRecord[]; activity: RiseActivity[] } | null> {
  const since = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const activitySince = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();

  const [profiles, releases, records, activity] = await Promise.all([
    admin
      .from(PROFILES_TABLE)
      .select('id, user_id, status, visibility, roles')
      .eq('status', 'claimed')
      .neq('visibility', 'private')
      .limit(SCAN_LIMIT),
    admin
      .from('releases')
      .select('id, owner_user_id, release_date, status, metadata, updated_at')
      // Either way a release could have come out inside the window: it was
      // dated in it, or it was finished (and so touched) in it.
      .or(`release_date.gte.${since.slice(0, 10)},updated_at.gte.${since}`)
      .is('deleted_at', null)
      .limit(SCAN_LIMIT),
    admin.from(RECORDS_TABLE).select('user_id, role, release_id').not('release_id', 'is', null).limit(SCAN_LIMIT * 4),
    admin.from('task_activity').select('task_id, actor_id, created_at').gte('created_at', activitySince).limit(SCAN_LIMIT * 4),
  ]);
  if (profiles.error || releases.error || records.error || activity.error) return null;

  const releaseRows = (releases.data || []).map(asRow);
  const releaseIds = releaseRows.map((row) => String(row.id));
  if (releaseIds.length === 0) return { candidates: [], releases: [], records: [], activity: [] };

  const taskRows: Row[] = [];
  for (let i = 0; i < releaseIds.length; i += 150) {
    const { data, error } = await admin
      .from('tasks')
      .select('id, release_id, status, completed_at')
      .in('release_id', releaseIds.slice(i, i + 150))
      .limit(SCAN_LIMIT * 20);
    if (error) return null;
    taskRows.push(...(data || []).map(asRow));
  }

  const taskStats = new Map<string, { total: number; done: number; lastDoneAt: string | null }>();
  const releaseOfTask = new Map<string, string>();
  for (const row of taskRows) {
    const releaseId = String(row.release_id);
    releaseOfTask.set(String(row.id), releaseId);
    // Cancelled work is out of the count (URG-389): dropped is neither done nor owed.
    if (row.status === 'cancelled') continue;
    const stats = taskStats.get(releaseId) ?? { total: 0, done: 0, lastDoneAt: null };
    stats.total += 1;
    if (row.status === 'done') {
      stats.done += 1;
      const at = row.completed_at ? String(row.completed_at) : null;
      if (at && (!stats.lastDoneAt || at > stats.lastDoneAt)) stats.lastDoneAt = at;
    }
    taskStats.set(releaseId, stats);
  }

  return {
    candidates: (profiles.data || []).map(asRow).flatMap((row) =>
      row.user_id
        ? [
            {
              profileId: String(row.id),
              userId: String(row.user_id),
              status: String(row.status),
              visibility: String(row.visibility),
              claimedRoles: (Array.isArray(row.roles) ? row.roles : []).map(String),
            },
          ]
        : []
    ),
    releases: releaseRows.map((row) => {
      const stats = taskStats.get(String(row.id)) ?? { total: 0, done: 0, lastDoneAt: null };
      const metadata = asRow(row.metadata);
      return {
        id: String(row.id),
        ownerUserId: String(row.owner_user_id || ''),
        releaseDate: row.release_date ? String(row.release_date) : null,
        status: row.status ? String(row.status) : null,
        isTest: metadata.test_release === true,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
        taskCount: stats.total,
        doneTaskCount: stats.done,
        lastTaskDoneAt: stats.lastDoneAt,
      };
    }),
    records: (records.data || []).map(asRow).map((row) => ({
      userId: String(row.user_id),
      role: String(row.role),
      releaseId: String(row.release_id),
    })),
    activity: (activity.data || []).map(asRow).flatMap((row) => {
      const releaseId = releaseOfTask.get(String(row.task_id));
      return releaseId && row.actor_id
        ? [{ releaseId, actorId: String(row.actor_id), at: String(row.created_at) }]
        : [];
    }),
  };
}
