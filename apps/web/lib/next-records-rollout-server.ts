import type { SupabaseClient } from '@supabase/supabase-js';
import { isOpenRecord, OPEN_RECORD_STATUSES, type NextRecord } from '@/lib/next-records';
import { carryOverTaskUpdates, madeFromLine, recordCredits, creditRolesFor } from '@/lib/next-records-rollout';
import { isTaskClosed } from '@/types/tasks';
import { RECORDS_TABLE, readRecord, type RecordsResult } from '@/lib/next-records-server';

// From the next record to its rollout (step 4, v2 mocks approved 27 Oct 2026).
//
// 1. "Continue" on the "Here's what I'll use" sheet makes the rollout through
//    the ordinary create route (plan limits, the paywall and the artist all
//    apply as usual), then linkRecordRelease points the record at it. The
//    record stays In the making while the planner is open: closing the planner
//    discards the empty rollout, and the foreign key (on delete set null)
//    unlinks the record on its own.
// 2. When the plan saves (app/api/releases/[releaseId]/plan/v2), the record's
//    "Finish ..." tasks lead it, and completeRecordRollout marks the record
//    planned and carries the session people into the rollout's credits.
//
// Every record query filters on the team, which comes from the gate or, for
// the planner's calls, from the rollout's own artist.

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

const RELEASES_TABLE = 'releases';
const TASKS_TABLE = 'tasks';
const ARTISTS_TABLE = 'artists';
const CREDIT_SUBMISSIONS_TABLE = 'release_credit_submissions';

/** Point a record still being made at the rollout the user just made for it. */
export async function linkRecordRelease(
  admin: SupabaseClient,
  ctx: { workspaceId: string; userId: string; artistId: string },
  recordId: string,
  releaseId: string
): Promise<RecordsResult<NextRecord>> {
  const current = await readRecord(admin, ctx.workspaceId, recordId);
  if (!current.ok) return current;
  if (!isOpenRecord(current.value.status)) return fail(409, 'This record already has its rollout.');

  // The rollout must be this user's own, for this record's artist: the one the
  // ordinary create route made a moment ago.
  const { data: release } = await admin
    .from(RELEASES_TABLE)
    .select('id,owner_user_id,artist_id')
    .eq('id', releaseId)
    .maybeSingle();
  const row = release as Row | null;
  if (!row || text(row.owner_user_id) !== ctx.userId || text(row.artist_id) !== ctx.artistId) {
    return fail(404, 'Rollout not found.');
  }

  const { error } = await admin
    .from(RECORDS_TABLE)
    .update({ release_id: releaseId })
    .eq('id', recordId)
    .eq('workspace_id', ctx.workspaceId)
    .in('status', [...OPEN_RECORD_STATUSES]);
  if (error) return fail(500, 'Could not link the rollout.');
  return readRecord(admin, ctx.workspaceId, recordId);
}

/** The team a rollout belongs to, through its artist. Null for a rollout with no artist. */
async function releaseTeam(admin: SupabaseClient, releaseId: string): Promise<{ workspaceId: string; artistId: string } | null> {
  const { data: release } = await admin.from(RELEASES_TABLE).select('artist_id').eq('id', releaseId).maybeSingle();
  const artistId = text((release as Row | null)?.artist_id);
  if (!artistId) return null;
  const { data: artist } = await admin.from(ARTISTS_TABLE).select('workspace_id').eq('id', artistId).maybeSingle();
  const workspaceId = text((artist as Row | null)?.workspace_id);
  return workspaceId ? { workspaceId, artistId } : null;
}

/**
 * The record a rollout is being planned from, still In the making, or null.
 * Never fails the planner: any read error means "no record".
 */
export async function findPlanningRecord(admin: SupabaseClient, releaseId: string): Promise<NextRecord | null> {
  try {
    const team = await releaseTeam(admin, releaseId);
    if (!team) return null;
    const { data } = await admin
      .from(RECORDS_TABLE)
      .select('id')
      .eq('workspace_id', team.workspaceId)
      .eq('artist_id', team.artistId)
      .eq('release_id', releaseId)
      .in('status', [...OPEN_RECORD_STATUSES])
      .limit(1);
    const id = text(((data ?? []) as Row[])[0]?.id);
    if (!id) return null;
    const record = await readRecord(admin, team.workspaceId, id);
    return record.ok ? record.value : null;
  } catch {
    return null;
  }
}

/**
 * Titles of the project's open tasks, so the plan does not add a song's finish
 * job twice (recordLeadTasks). Empty on any failure: a duplicate is the worst case.
 */
export async function openProjectTaskTitles(admin: SupabaseClient, releaseId: string, recordId: string): Promise<string[]> {
  try {
    const team = await releaseTeam(admin, releaseId);
    if (!team) return [];
    const { data } = await admin
      .from(TASKS_TABLE)
      .select('title,status')
      .eq('workspace_id', team.workspaceId)
      .eq('record_id', recordId);
    return ((data ?? []) as Row[]).filter((row) => !isTaskClosed(row.status)).map((row) => text(row.title));
  } catch {
    return [];
  }
}

/**
 * The project's open tasks move onto the rollout, into Pre-production, owner
 * and day kept (2026-11-04, #1074). Done and cancelled ones stay on the project.
 * Each update is conditional on the task still being the project's, so a run
 * that repeats moves nothing twice.
 */
async function carryOverProjectTasks(
  admin: SupabaseClient,
  input: { workspaceId: string; recordId: string; releaseId: string }
): Promise<number> {
  const { data, error } = await admin
    .from(TASKS_TABLE)
    .select('id,status,metadata')
    .eq('workspace_id', input.workspaceId)
    .eq('record_id', input.recordId);
  if (error) {
    console.error('[next-record] plan saved but the project tasks could not be read:', error.message);
    return 0;
  }
  const updates = carryOverTaskUpdates(
    ((data ?? []) as Row[]).map((row) => ({ id: text(row.id), status: text(row.status), metadata: row.metadata }))
  );
  let moved = 0;
  for (const update of updates) {
    const result = await admin
      .from(TASKS_TABLE)
      .update({ release_id: input.releaseId, record_id: null, metadata: update.metadata, updated_at: new Date().toISOString() })
      .eq('id', update.id)
      .eq('workspace_id', input.workspaceId)
      .eq('record_id', input.recordId);
    if (result.error) console.error('[next-record] a project task did not move to the rollout:', result.error.message);
    else moved += 1;
  }
  return moved;
}

/**
 * The plan saved: the record leaves In the making, and each session person
 * becomes a credit on the rollout (once; a name already credited is skipped).
 * Best effort after the plan is in: a failure here is logged, never undoes it.
 */
export async function completeRecordRollout(
  admin: SupabaseClient,
  input: { record: NextRecord; releaseId: string; ownerUserId: string }
): Promise<void> {
  const { record, releaseId, ownerUserId } = input;
  try {
    const team = await releaseTeam(admin, releaseId);
    if (!team) return;
    const { error } = await admin
      .from(RECORDS_TABLE)
      .update({ status: 'planned', release_id: releaseId })
      .eq('id', record.id)
      .eq('workspace_id', team.workspaceId)
      .in('status', [...OPEN_RECORD_STATUSES]);
    if (error) {
      console.error('[next-record] plan saved but the record did not move to planned:', error.message);
      return;
    }

    await carryOverProjectTasks(admin, { workspaceId: team.workspaceId, recordId: record.id, releaseId });

    const people = recordCredits(record);
    if (people.length === 0) return;
    const { data: existing } = await admin
      .from(CREDIT_SUBMISSIONS_TABLE)
      .select('legal_name')
      .eq('release_id', releaseId);
    const credited = new Set(((existing ?? []) as Row[]).map((row) => text(row.legal_name).trim().toLowerCase()));
    const rows = people
      .filter((person) => !credited.has(person.name.trim().toLowerCase()))
      .map((person) => ({
        release_id: releaseId,
        owner_user_id: ownerUserId,
        legal_name: person.name,
        roles: creditRolesFor(person.role),
        contribution: person.role || null,
        confirmed_accurate: false,
      }));
    if (rows.length === 0) return;
    const inserted = await admin.from(CREDIT_SUBMISSIONS_TABLE).insert(rows);
    if (inserted.error) console.error('[next-record] plan saved but the credits did not carry over:', inserted.error.message);
  } catch (error) {
    console.error('[next-record] finishing the record after its plan failed:', error);
  }
}

export type ReleaseRecordLink = { recordId: string; artistId: string; line: string };

/** "Made from your record" on the rollout: the record that became it, or null. */
export async function readReleaseRecord(
  admin: SupabaseClient,
  workspaceId: string,
  releaseId: string
): Promise<RecordsResult<ReleaseRecordLink | null>> {
  const { data, error } = await admin
    .from(RECORDS_TABLE)
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('release_id', releaseId)
    .eq('status', 'planned')
    .limit(1);
  if (error) return fail(500, 'Could not load the record.');
  const id = text(((data ?? []) as Row[])[0]?.id);
  if (!id) return { ok: true, value: null };
  const record = await readRecord(admin, workspaceId, id);
  if (!record.ok) return record;
  return { ok: true, value: { recordId: id, artistId: record.value.artistId, line: madeFromLine(record.value) } };
}

/** The record linked to a rollout, for the gate's scope check. */
export async function findReleaseRecordArtist(
  admin: SupabaseClient,
  workspaceId: string,
  releaseId: string
): Promise<string | null> {
  const { data } = await admin
    .from(RECORDS_TABLE)
    .select('artist_id')
    .eq('workspace_id', workspaceId)
    .eq('release_id', releaseId)
    .limit(1);
  return text(((data ?? []) as Row[])[0]?.artist_id) || null;
}
