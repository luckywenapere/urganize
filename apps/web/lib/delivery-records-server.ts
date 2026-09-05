import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDeliveryRecords,
  planReconcile,
  summarizeByRole,
  type DeliveryRecord,
  type DeliverySourceRelease,
  type DeliverySourceTask,
  type RoleSummary,
  type StoredDeliveryRecord,
} from './delivery-records';

/**
 * Loads the history lib/delivery-records.ts ranks, and writes what it decides.
 *
 * Modelled on lib/task-owners-server.ts, which asks a near-identical question
 * of the same two tables. The differences are the two that matter here: this
 * one is NOT scoped to a single team, because a directory that only showed you
 * your own colleagues would not be a directory, and it only counts work on a
 * release that has actually been delivered.
 *
 * FAILS CLOSED to an empty list on any read problem. A directory that shows
 * nothing is a directory with an honest empty state; one that shows a partial
 * record read during an outage is a person's credentials quietly understated,
 * and nothing on screen would say so.
 */

const RELEASES_TABLE = 'releases';
const TASKS_TABLE = 'tasks';
const DELIVERY_RECORDS_TABLE = 'delivery_records';

/** Bounds the scan for a backfill over the whole product rather than one team.
 *  Generous at current volume, and the dry run reports when it is reached. */
const RELEASE_SCAN_LIMIT = 2000;
const TASK_SCAN_LIMIT = 100000;

function asRowValue(row: unknown, key: string): unknown {
  return row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined;
}

function readTemplateTaskId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const template = (metadata as { template?: unknown }).template;
  if (!template || typeof template !== 'object') return null;
  // `task_id` is what both writers store. `template_task_id` is accepted for
  // the same defensive reason lib/tasks-server.ts accepts it: a reader looked
  // for that key for months, so a row could conceivably carry it.
  const record = template as Record<string, unknown>;
  for (const key of ['task_id', 'template_task_id']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export type DeliveryScan = {
  releases: DeliverySourceRelease[];
  /** True when a scan limit was reached, so a dry run can say the numbers
   *  below are a floor rather than the whole picture. */
  truncated: boolean;
};

/**
 * Every release and its tasks, for the whole product or one owner.
 *
 * Two queries rather than a join: PostgREST's nested select would apply the row
 * limit to the OUTER table only, so a release with 113 activities could silently
 * arrive with some of them missing, and a missing task is a missing credential.
 */
export async function loadDeliveryScan(
  admin: SupabaseClient,
  options: { ownerUserId?: string } = {}
): Promise<DeliveryScan> {
  try {
    let releaseQuery = admin
      .from(RELEASES_TABLE)
      .select('id, title, owner_user_id, release_date, status')
      .order('created_at', { ascending: false })
      .limit(RELEASE_SCAN_LIMIT);

    if (options.ownerUserId) {
      releaseQuery = releaseQuery.eq('owner_user_id', options.ownerUserId);
    }

    const { data: releaseRows, error: releaseError } = await releaseQuery;
    if (releaseError || !releaseRows || releaseRows.length === 0) {
      return { releases: [], truncated: false };
    }

    const releaseIds = releaseRows.map((row) => String(row.id));

    const { data: taskRows, error: taskError } = await admin
      .from(TASKS_TABLE)
      .select('id, release_id, assigned_to_user_id, status, completed_at, metadata')
      .in('release_id', releaseIds)
      .limit(TASK_SCAN_LIMIT);

    if (taskError) return { releases: [], truncated: false };

    const tasksByRelease = new Map<string, DeliverySourceTask[]>();
    for (const row of taskRows || []) {
      const releaseId = String(row.release_id || '');
      if (!releaseId) continue;
      const list = tasksByRelease.get(releaseId) ?? [];
      list.push({
        id: String(row.id),
        assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : null,
        templateTaskId: readTemplateTaskId(row.metadata),
        status: String(row.status || ''),
        completedAt: row.completed_at ? String(row.completed_at) : null,
      });
      tasksByRelease.set(releaseId, list);
    }

    const releases: DeliverySourceRelease[] = releaseRows.map((row) => ({
      id: String(row.id),
      title: String(row.title || ''),
      ownerUserId: String(row.owner_user_id || ''),
      releaseDate: row.release_date ? String(row.release_date) : null,
      status: String(row.status || ''),
      tasks: tasksByRelease.get(String(row.id)) ?? [],
    }));

    return {
      releases,
      truncated:
        releaseRows.length >= RELEASE_SCAN_LIMIT || (taskRows || []).length >= TASK_SCAN_LIMIT,
    };
  } catch {
    return { releases: [], truncated: false };
  }
}

export type DeliveryBackfillReport = {
  releasesScanned: number;
  releasesDelivered: number;
  records: number;
  people: number;
  byRole: RoleSummary[];
  truncated: boolean;
  /** Null on a dry run. The number of rows the database accepted otherwise. */
  written: number | null;
};

function report(
  scan: DeliveryScan,
  records: DeliveryRecord[],
  written: number | null
): DeliveryBackfillReport {
  return {
    releasesScanned: scan.releases.length,
    releasesDelivered: new Set(records.map((record) => record.releaseId)).size,
    records: records.length,
    people: new Set(records.map((record) => record.userId)).size,
    byRole: summarizeByRole(records),
    truncated: scan.truncated,
    written,
  };
}

/**
 * Compute what everybody has delivered, and optionally write it.
 *
 * DRY RUN IS THE DEFAULT, and that is not caution for its own sake. The one
 * way this feature fails catastrophically is by crediting a person with work
 * they did not do, and the shape of the report says whether it has: if a single
 * role holds every record, or one person holds dozens, the not-the-owner filter
 * has regressed and this must not be allowed to write.
 *
 * Writing is an upsert on the unique index, so running it twice changes
 * nothing and a re-run after a rule change corrects rows in place.
 */
export async function runDeliveryBackfill(
  admin: SupabaseClient,
  options: { write?: boolean; ownerUserId?: string; now?: Date } = {}
): Promise<DeliveryBackfillReport> {
  const scan = await loadDeliveryScan(admin, { ownerUserId: options.ownerUserId });
  const records = buildDeliveryRecords(scan.releases, options.now ?? new Date());

  if (!options.write || records.length === 0) {
    return report(scan, records, options.write ? 0 : null);
  }

  const { error, count } = await admin
    .from(DELIVERY_RECORDS_TABLE)
    .upsert(
      records.map((record) => ({
        user_id: record.userId,
        role: record.role,
        release_id: record.releaseId,
        completed_at: record.completedAt,
        computed_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,role,release_id', ignoreDuplicates: false, count: 'exact' }
    );

  if (error) throw new Error(error.message || 'Could not write delivery records.');
  return report(scan, records, count ?? records.length);
}

export type DeliveryReconcileResult = {
  scanned: number;
  written: number;
  removed: number;
  truncated: boolean;
};

/**
 * The daily sweep: bring delivery_records back in line with what is true.
 *
 * NOT A NEW CRON, and it cannot be one. `/vercel.json` holds exactly two
 * schedules and the Hobby plan caps them at one a day, so this runs as a step
 * inside /api/cron/due-date-notifications — the same piggyback the weekly
 * motivational nudges already make, recorded in that route.
 *
 * NO COMPLETION HOOK EITHER, deliberately. A task reaches `done` through two
 * divergent server paths (the PATCH route and completeTaskWithCascade) whose
 * only shared column is `status`, so hooking recomputation onto completion
 * would mean two hook points on the hottest write path in the product — and it
 * would still miss the case that needs it most, a release DATE passing, where
 * no write happens at all. One sweep covers both. A record appearing within a
 * day rather than within a second is not a cost for a credential nobody is
 * waiting on.
 *
 * Never throws. A sweep that fails must not take the notification cron down
 * with it, so the caller gets zeroes and the next run tries again.
 */
export async function runDeliveryReconcile(
  admin: SupabaseClient,
  options: { now?: Date } = {}
): Promise<DeliveryReconcileResult> {
  try {
    const scan = await loadDeliveryScan(admin);
    if (scan.releases.length === 0) {
      return { scanned: 0, written: 0, removed: 0, truncated: scan.truncated };
    }

    const computed = buildDeliveryRecords(scan.releases, options.now ?? new Date());
    const scannedReleaseIds = scan.releases.map((release) => release.id);

    const { data: storedRows } = await admin
      .from(DELIVERY_RECORDS_TABLE)
      .select('id, user_id, role, release_id')
      .in('release_id', scannedReleaseIds);

    const stored: StoredDeliveryRecord[] = (storedRows || []).map((row) => ({
      id: String(asRowValue(row, 'id')),
      userId: String(asRowValue(row, 'user_id')),
      role: String(asRowValue(row, 'role')) as DeliveryRecord['role'],
      releaseId: asRowValue(row, 'release_id') ? String(asRowValue(row, 'release_id')) : null,
    }));

    const plan = planReconcile({
      computed,
      stored,
      scannedReleaseIds,
      truncated: scan.truncated,
    });

    let written = 0;
    if (plan.upsert.length > 0) {
      const { error, count } = await admin
        .from(DELIVERY_RECORDS_TABLE)
        .upsert(
          plan.upsert.map((record) => ({
            user_id: record.userId,
            role: record.role,
            release_id: record.releaseId,
            completed_at: record.completedAt,
            computed_at: new Date().toISOString(),
          })),
          { onConflict: 'user_id,role,release_id', ignoreDuplicates: false, count: 'exact' }
        );
      if (!error) written = count ?? plan.upsert.length;
    }

    let removed = 0;
    if (plan.deleteIds.length > 0) {
      const { error } = await admin
        .from(DELIVERY_RECORDS_TABLE)
        .delete()
        .in('id', plan.deleteIds);
      if (!error) removed = plan.deleteIds.length;
    }

    return { scanned: scan.releases.length, written, removed, truncated: scan.truncated };
  } catch {
    return { scanned: 0, written: 0, removed: 0, truncated: false };
  }
}
