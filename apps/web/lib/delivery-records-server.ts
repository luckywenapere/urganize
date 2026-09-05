import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDeliveryRecords,
  summarizeByRole,
  type DeliveryRecord,
  type DeliverySourceRelease,
  type DeliverySourceTask,
  type RoleSummary,
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
