// SERVER-ONLY: keeps a rollout's three distribution prep tasks in step with the
// check before distribution (#851). The decisions are in
// lib/distribution-prep-tasks.ts; this reads, asks it, and writes.
//
// Never throws: it runs when a rollout is opened, and a failed read or write
// costs these three tasks, never the page. The next open tries again.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { checkReleaseForDistribution } from './distribution-server';
import {
  PREP_TASK_METADATA_KEY,
  isDistributionPrepStep,
  planDistributionPrep,
  readPrepAutoRecord,
  type PrepExistingTask,
} from './distribution-prep-tasks';
import { readTemplateOrigin } from './editorial-pitch-server';
import { isReleaseActive } from './release-activity';
import { readTaskPhase, withTaskPhase } from './rollout-phases';
import { onlyPreProductionWork } from './pre-production';
import { readTestRelease } from './test-release';

const TASKS_TABLE = 'tasks';
const RELEASES_TABLE = 'releases';

/** releases.metadata key listing the steps ever added, so a deleted one stays deleted. */
export const PREP_ADDED_METADATA_KEY = 'distribution_prep_added';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readAdded(metadata: JsonRecord): string[] {
  const value = metadata[PREP_ADDED_METADATA_KEY];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

type ReleaseRow = {
  owner_user_id: string;
  artist_id: string | null;
  release_date: string | null;
  status: string | null;
  metadata: unknown;
  updated_at: string | null;
};

type TaskRow = {
  id: string;
  status: string | null;
  due_date: string | null;
  position: number | null;
  workspace_id: string;
  metadata: unknown;
};

/** The team the rollout's tasks go in: its other tasks', else its artist's,
 *  else the owner's own team. */
async function resolveWorkspaceId(admin: SupabaseClient, release: ReleaseRow, rows: TaskRow[]) {
  if (rows[0]?.workspace_id) return rows[0].workspace_id;
  if (release.artist_id) {
    const artist = await admin.from('artists').select('workspace_id').eq('id', release.artist_id).maybeSingle();
    const id = (artist.data as { workspace_id?: string | null } | null)?.workspace_id;
    if (!artist.error && id) return id;
  }
  const owned = await admin
    .from('workspaces')
    .select('id')
    .eq('owner_id', release.owner_user_id)
    .order('created_at', { ascending: true })
    .limit(1);
  const first = Array.isArray(owned.data) ? (owned.data[0] as { id?: string } | undefined) : undefined;
  return owned.error ? null : first?.id ?? null;
}

export type PrepSyncResult = { changed: boolean };

export async function syncDistributionPrepTasks(
  admin: SupabaseClient,
  releaseId: string,
  now: Date = new Date()
): Promise<PrepSyncResult> {
  const unchanged = { changed: false };
  try {
    const releaseResult = await admin
      .from(RELEASES_TABLE)
      .select('id,owner_user_id,artist_id,release_date,status,metadata,updated_at')
      .eq('id', releaseId)
      .is('deleted_at', null)
      .maybeSingle();
    if (releaseResult.error || !releaseResult.data) return unchanged;
    const release = releaseResult.data as ReleaseRow;
    const metadata = asRecord(release.metadata);
    if (readTestRelease(metadata) || !isReleaseActive(release.status) || release.status === 'released') {
      return unchanged;
    }
    // A plan still being written gets its tasks on the next open.
    if (metadata.planner_pending === true || metadata.template_pending === true) return unchanged;

    const tasksResult = await admin
      .from(TASKS_TABLE)
      .select('id,status,due_date,position,workspace_id,metadata')
      .eq('release_id', releaseId);
    if (tasksResult.error || !Array.isArray(tasksResult.data)) return unchanged;
    const rows = tasksResult.data as TaskRow[];

    const check = await checkReleaseForDistribution(admin, releaseId, now);
    // Fails closed: no answer means no tick and no new task.
    if (!check) return unchanged;

    const existing: PrepExistingTask[] = [];
    const others: Array<{ phase: string | null }> = [];
    for (const row of rows) {
      const stepId = readTemplateOrigin(row.metadata).taskId;
      if (stepId && isDistributionPrepStep(stepId)) {
        existing.push({
          id: row.id,
          stepId,
          status: row.status ?? 'todo',
          dueDate: row.due_date,
          phase: readTaskPhase(row.metadata),
          auto: readPrepAutoRecord(row.metadata),
        });
      } else {
        others.push({ phase: readTaskPhase(row.metadata) });
      }
    }

    const added = readAdded(metadata);
    const plan = planDistributionPrep({
      releaseDate: release.release_date,
      now,
      // The screen's own test for "has a plan", over everything but these three.
      hasPlan: others.length > 0 && !onlyPreProductionWork(others),
      openCodes: check.errors.map((issue) => issue.code),
      existing,
      added,
    });
    let changed = false;
    const nowIso = now.toISOString();

    for (const id of plan.tick) {
      const update = await admin
        .from(TASKS_TABLE)
        .update({ status: 'done', completed_at: nowIso })
        .eq('id', id)
        .neq('status', 'done');
      if (!update.error) changed = true;
    }

    for (const change of plan.update) {
      const row = rows.find((candidate) => candidate.id === change.id);
      if (!row) continue;
      let nextMetadata: JsonRecord = asRecord(row.metadata);
      if (change.phase) nextMetadata = withTaskPhase(nextMetadata, change.phase);
      if (change.auto) nextMetadata = { ...nextMetadata, [PREP_TASK_METADATA_KEY]: change.auto };
      const update = await admin
        .from(TASKS_TABLE)
        .update({ ...(change.auto ? { due_date: change.dueDate ?? null } : {}), metadata: nextMetadata })
        .eq('id', change.id);
      if (!update.error) changed = true;
    }

    if (plan.insert.length > 0) {
      const workspaceId = await resolveWorkspaceId(admin, release, rows);
      if (!workspaceId) return { changed };

      // Claim first on the row's updated_at, so two tabs cannot both insert.
      const claimed = await admin
        .from(RELEASES_TABLE)
        .update({
          metadata: {
            ...metadata,
            [PREP_ADDED_METADATA_KEY]: [...added, ...plan.insert.map((row) => row.def.stepId)],
          },
        })
        .eq('id', releaseId)
        .eq('updated_at', release.updated_at ?? '')
        .select('id');
      if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length === 0) return { changed };

      let position = rows.reduce((max, row) => Math.max(max, row.position ?? 0), 0);
      const insert = await admin.from(TASKS_TABLE).insert(
        plan.insert.map(({ def, dueDate, phase, auto }) => {
          position += 1;
          return {
            id: randomUUID(),
            release_id: releaseId,
            workspace_id: workspaceId,
            group_id: null,
            created_by: release.owner_user_id,
            assigned_to_user_id: release.owner_user_id,
            assigned_to: null,
            assigned_collaborator_id: null,
            title: def.title,
            description: def.description,
            status: 'todo',
            priority: 'none',
            state: 'planning',
            position,
            // False on purpose: the planner refuses a rollout that already has
            // generated tasks (see lib/distribution-prep-tasks.ts).
            auto_generated: false,
            due_date: dueDate,
            dependencies: [],
            metadata: withTaskPhase(
              {
                template: {
                  task_id: def.stepId,
                  role: 'manager',
                  task_type: 'task',
                  duration_days: 1,
                  optional: false,
                  tags: [...def.tags],
                  compressed_runway: false,
                },
                [PREP_TASK_METADATA_KEY]: auto,
              },
              phase
            ),
          };
        })
      );
      if (insert.error) {
        console.error('[distribution-prep] could not add tasks', insert.error.message);
        // Put the record back so the next open tries again.
        const latest = await admin.from(RELEASES_TABLE).select('metadata').eq('id', releaseId).maybeSingle();
        if (!latest.error && latest.data) {
          const restored = { ...asRecord((latest.data as { metadata: unknown }).metadata) };
          restored[PREP_ADDED_METADATA_KEY] = added;
          await admin.from(RELEASES_TABLE).update({ metadata: restored }).eq('id', releaseId);
        }
        return { changed };
      }
      changed = true;
    }

    return { changed };
  } catch (error) {
    console.error('[distribution-prep] sync failed', error);
    return unchanged;
  }
}
