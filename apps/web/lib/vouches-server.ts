import type { SupabaseClient } from '@supabase/supabase-js';
import type { VouchInput, VouchView, WorkedTogetherRow } from './vouches';

// Reads and writes for Vouch, slice 1. See lib/vouches.ts for what it is.
//
// Same rule as lib/relationships-server.ts: every function takes the team's
// workspace id from the caller (the routes resolve it from the signed-in user)
// and scopes every query to it. Nothing here trusts a team id from a request.
//
// Built to land before its migration: a missing person_vouches table, or a
// missing tasks.assigned_person_id column (20261003100000), reads as "nothing
// yet" and a write answers that it is not ready, never a crash.

const TASKS = 'tasks';
const RELEASES = 'releases';
const RELATIONSHIPS = 'team_relationships';
const VOUCHES = 'person_vouches';
const PROFILES = 'profiles';

/** A team's whole activity list is thousands at most. */
const ASSIGNMENT_LIMIT = 5000;
const WORK_LIMIT = 200;
const VOUCH_LIMIT = 100;

type Failure = { ok: false; error: string; status: number };

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Undefined table or column, from Postgres (42P01, 42703) or PostgREST's
 * schema cache (PGRST205, PGRST204): the migration is not applied yet.
 */
export function isMissingSchema(error: unknown): boolean {
  const code = text(asRow(error).code).toUpperCase();
  return code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST204';
}

const NOT_READY: Failure = { ok: false, error: 'This is switching on soon.', status: 503 };

/** Does this team have this person in My People? */
async function teamHasPerson(admin: SupabaseClient, workspaceId: string, personId: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from(RELATIONSHIPS)
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

export type TaskAssignment = { taskId: string; personId: string };

/** Every activity of the team with a person on it. Empty when the column is missing. */
export async function listAssignments(admin: SupabaseClient, workspaceId: string): Promise<TaskAssignment[]> {
  try {
    const { data, error } = await admin
      .from(TASKS)
      .select('id, assigned_person_id')
      .eq('workspace_id', workspaceId)
      .not('assigned_person_id', 'is', null)
      .limit(ASSIGNMENT_LIMIT);
    if (error || !data) return [];
    return data
      .map(asRow)
      .map((row) => ({ taskId: text(row.id), personId: text(row.assigned_person_id) }))
      .filter((row) => row.taskId && row.personId);
  } catch {
    return [];
  }
}

/**
 * Sets who did an activity: one of the team's people, or nobody. The activity
 * must be the team's and not in Trash; the person must be in the team's My
 * People. Writes tasks.assigned_person_id and nothing else.
 */
export async function assignPerson(
  admin: SupabaseClient,
  input: { workspaceId: string; taskId: string; personId: string | null }
): Promise<{ ok: true; personId: string | null } | Failure> {
  const { workspaceId, taskId, personId } = input;

  const taskResult = await admin
    .from(TASKS)
    .select('id, release_id')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (taskResult.error) return { ok: false, error: 'Could not save that.', status: 500 };
  if (!taskResult.data) return { ok: false, error: 'Activity not found.', status: 404 };

  const releaseId = textOrNull(asRow(taskResult.data).release_id);
  if (releaseId) {
    const releaseResult = await admin
      .from(RELEASES)
      .select('id, deleted_at')
      .eq('id', releaseId)
      .maybeSingle();
    // A rollout in Trash is gone as far as the app is concerned. (Releases
    // carry no workspace_id; the task's own workspace scope above is the
    // team check, and the release id comes from that task.)
    if (!releaseResult.error && (!releaseResult.data || asRow(releaseResult.data).deleted_at)) {
      return { ok: false, error: 'Activity not found.', status: 404 };
    }
  }

  if (personId) {
    const has = await teamHasPerson(admin, workspaceId, personId);
    if (has === null) return { ok: false, error: 'Could not save that.', status: 500 };
    if (!has) return { ok: false, error: 'Add them to My People first.', status: 404 };
  }

  const { error } = await admin
    .from(TASKS)
    .update({ assigned_person_id: personId })
    .eq('id', taskId)
    .eq('workspace_id', workspaceId);
  if (error) return isMissingSchema(error) ? NOT_READY : { ok: false, error: 'Could not save that.', status: 500 };
  return { ok: true, personId };
}

/**
 * "Worked together": the team's activities with this person on them, newest
 * first, each with its rollout and artist. Derived, never typed. Cancelled
 * activities and rollouts in Trash are left out.
 */
export async function listWorkedTogether(
  admin: SupabaseClient,
  workspaceId: string,
  personId: string
): Promise<WorkedTogetherRow[]> {
  try {
    const { data, error } = await admin
      .from(TASKS)
      .select('id, release_id, title, status, completed_at, due_date, created_at')
      .eq('workspace_id', workspaceId)
      .eq('assigned_person_id', personId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(WORK_LIMIT);
    if (error || !data) return [];
    const tasks = data.map(asRow);

    const releaseIds = [...new Set(tasks.map((row) => textOrNull(row.release_id)).filter((id): id is string => Boolean(id)))];
    const releases = new Map<string, Record<string, unknown>>();
    if (releaseIds.length > 0) {
      const releaseResult = await admin
        .from(RELEASES)
        .select('id, title, artist_name, deleted_at')
        .in('id', releaseIds);
      for (const row of releaseResult.data || []) releases.set(text(asRow(row).id), asRow(row));
    }

    const rows: WorkedTogetherRow[] = [];
    for (const task of tasks) {
      const releaseId = textOrNull(task.release_id);
      const release = releaseId ? releases.get(releaseId) : undefined;
      // Its rollout is in Trash (or gone): leave it out.
      if (releaseId && (!release || release.deleted_at)) continue;
      rows.push({
        taskId: text(task.id),
        releaseId,
        artistName: release ? text(release.artist_name) : '',
        releaseTitle: release ? text(release.title) : '',
        activity: text(task.title),
        when: textOrNull(task.completed_at) ?? textOrNull(task.due_date) ?? textOrNull(task.created_at),
      });
    }
    return rows.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
  } catch {
    return [];
  }
}

async function loadNames(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return names;
  try {
    const { data } = await admin.from(PROFILES).select('id, name').in('id', ids);
    for (const row of data || []) {
      const name = text(asRow(row).name).trim();
      if (name) names.set(text(asRow(row).id), name);
    }
  } catch {
    // A missing name reads as "Your team".
  }
  return names;
}

const toVouch = (row: Record<string, unknown>, names: Map<string, string>): VouchView => ({
  id: text(row.id),
  skill: text(row.skill),
  note: textOrNull(row.note),
  byName: names.get(text(row.created_by)) || 'Your team',
  createdAt: text(row.created_at),
  updatedAt: text(row.updated_at),
});

const VOUCH_COLUMNS = 'id, skill, note, created_by, created_at, updated_at';

/** The team's own vouches for a person, most recent first. Empty when the table is missing. */
export async function listVouches(admin: SupabaseClient, workspaceId: string, personId: string): Promise<VouchView[]> {
  try {
    const { data, error } = await admin
      .from(VOUCHES)
      .select(VOUCH_COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('person_id', personId)
      .order('updated_at', { ascending: false })
      .limit(VOUCH_LIMIT);
    if (error || !data) return [];
    const rows = data.map(asRow);
    const names = await loadNames(
      admin,
      rows.map((row) => text(row.created_by))
    );
    return rows.map((row) => toVouch(row, names));
  } catch {
    return [];
  }
}

/**
 * Saves a vouch. One per team per person per skill: vouching the same skill
 * again updates it, and keeps the old note when no new one is written.
 */
export async function saveVouch(
  admin: SupabaseClient,
  input: { workspaceId: string; personId: string; actorUserId: string; vouch: VouchInput }
): Promise<{ ok: true; vouch: VouchView } | Failure> {
  const { workspaceId, personId, actorUserId, vouch } = input;

  const has = await teamHasPerson(admin, workspaceId, personId);
  if (has === null) return { ok: false, error: 'Could not save that.', status: 500 };
  if (!has) return { ok: false, error: 'Contact not found.', status: 404 };

  if (vouch.taskId) {
    const taskResult = await admin
      .from(TASKS)
      .select('id')
      .eq('id', vouch.taskId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (taskResult.error) return { ok: false, error: 'Could not save that.', status: 500 };
    if (!taskResult.data) return { ok: false, error: 'That activity was not found.', status: 404 };
  }

  const row: Record<string, unknown> = {
    person_id: personId,
    skill: vouch.skill,
    created_by: actorUserId,
  };
  if (vouch.taskId) row.task_id = vouch.taskId;
  // Left out when empty, so a repeat vouch keeps the note it already had.
  if (vouch.note) row.note = vouch.note;

  const { data, error } = await admin
    .from(VOUCHES)
    .upsert({ ...row, workspace_id: workspaceId }, { onConflict: 'workspace_id,person_id,skill' })
    .select(VOUCH_COLUMNS)
    .single();
  if (error || !data) {
    return error && isMissingSchema(error) ? NOT_READY : { ok: false, error: 'Could not save that.', status: 500 };
  }
  const names = await loadNames(admin, [actorUserId]);
  return { ok: true, vouch: toVouch(asRow(data), names) };
}
