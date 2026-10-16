/**
 * Turning an approved plan draft into real task rows.
 *
 * The server-only half of the planner: this needs `node:crypto` to mint task
 * UUIDs, so it stays out of lib/release-planning.ts (the tasks.ts /
 * tasks-server.ts split precedent).
 *
 * Modeled directly on lib/release-templates/instantiate.ts, and deliberately
 * produces the same row shape: an approved plan must be indistinguishable from
 * a template-instantiated plan to everything downstream, so event milestones,
 * catch-up bucketing, dependency blockers and the "Mine only" view all keep
 * working with no special cases.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rolloutPhaseForOffset } from './rollout-phases';

import {
  activeDraftTasks,
  finalizeKeyTasks,
  isTaskPreCompletedByReady,
  parseYmd,
  type DraftTask,
  type ReleasePlanDraftDoc,
} from './release-planning';

const TASKS_TABLE = 'tasks';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class PlanApprovalError extends Error {
  constructor(
    public readonly reason: 'missing_release_date' | 'empty_plan' | 'database_error',
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PlanApprovalError';
  }
}

export type PlanTaskRow = {
  id: string;
  release_id: string;
  workspace_id: string;
  group_id: null;
  created_by: string;
  assigned_to_user_id: string | null;
  assigned_to: null;
  assigned_collaborator_id: null;
  title: string;
  description: string;
  status: string;
  priority: string;
  state: string;
  position: number;
  auto_generated: boolean;
  due_date: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
};

export type BuildTaskRowsResult = {
  rows: PlanTaskRow[];
  /** Plain-language notes for the manager about anything we had to change. */
  warnings: string[];
};

/**
 * Build the task rows an approved draft becomes. Pure: no database, no clock
 * beyond the `approvedAtMs` anchor the caller passes in.
 *
 * Assignees are resolved here rather than rejected. A teammate can leave the
 * team while a draft sits open, and refusing to approve the whole plan over
 * one stale name would punish the manager for someone else's change. The task
 * falls back to the release owner and the change is reported.
 */
export function buildTaskRowsFromDraft(params: {
  doc: ReleasePlanDraftDoc;
  draftId: string;
  releaseId: string;
  releaseDate: string;
  workspaceId: string;
  ownerUserId: string;
  assignableUserIds: Set<string>;
  approvedAtMs: number;
}): BuildTaskRowsResult {
  const {
    doc,
    draftId,
    releaseId,
    releaseDate,
    workspaceId,
    ownerUserId,
    assignableUserIds,
    approvedAtMs,
  } = params;

  const releaseEpoch = parseYmd(releaseDate);
  if (releaseEpoch === null) {
    throw new PlanApprovalError(
      'missing_release_date',
      `Release date could not be parsed: ${releaseDate}`
    );
  }

  // Chronological order, with the draft's own order breaking ties, so a task
  // the manager added lands beside the work it belongs with rather than at the
  // bottom of the board.
  // A smaller plan (URG-318) writes only its core, plus anything a "ready
  // today" answer already finished (it lands done, as before); the rest stay
  // in the plan record as suggestions (lib/plan-core.ts).
  const active = activeDraftTasks(doc)
    .filter(
      (task) =>
        !doc.core_only ||
        task.key === true ||
        (task.origin === 'template' &&
          isTaskPreCompletedByReady(task, doc.intake.ready_today, doc.template_id))
    )
    .map((task, index) => ({ task, index }))
    .sort((a, b) => a.task.offset_days - b.task.offset_days || a.index - b.index)
    .map((entry) => entry.task);

  if (active.length === 0) {
    throw new PlanApprovalError('empty_plan', 'This plan has no tasks left to schedule.');
  }

  const draftIdToUuid = new Map<string, string>();
  for (const task of active) {
    draftIdToUuid.set(task.id, randomUUID());
  }

  const approvedAtIso = new Date(approvedAtMs).toISOString();
  const warnings: string[] = [];

  // The short list the plan opens on (URG-258). Every task gets an explicit
  // true or false, which is also how the client tells a new plan from one
  // built before key tasks existed.
  const keyIds = doc.core_only
    ? new Set(active.map((task) => task.id))
    : finalizeKeyTasks(
        active,
        (task) =>
          task.origin === 'template' &&
          isTaskPreCompletedByReady(task, doc.intake.ready_today, doc.template_id)
      );
  let reassignedCount = 0;

  const rows = active.map((task, index) => {
    const id = draftIdToUuid.get(task.id) as string;

    const dueDateMs = releaseEpoch + task.offset_days * MS_PER_DAY;
    const dueDate = new Date(dueDateMs).toISOString();
    // Same meaning as template instantiation: a task whose date already passed
    // at the moment the plan was approved is a compressed timeline, not
    // slippage, so it belongs in "Catch up" rather than red "Overdue".
    const compressedRunway = dueDateMs < approvedAtMs;

    // Edges to tasks that were dropped from the plan simply disappear. Keeping
    // them would leave a dependency pointing at a task that will never exist,
    // which reads to the blocker check as permanently unfinished work.
    const dependencies = task.depends_on
      .map((depId) => draftIdToUuid.get(depId))
      .filter((uuid): uuid is string => Boolean(uuid));

    let assignee = task.assignee_user_id;
    if (assignee && !assignableUserIds.has(assignee)) {
      assignee = ownerUserId;
      reassignedCount += 1;
    }
    // Every core task has an owner (URG-318): nobody named means the manager.
    if (!assignee && doc.core_only) assignee = ownerUserId;

    // A "ready today" answer means the outcome is already finished, so the
    // matching playbook steps land done rather than sitting on the manager's
    // list as open work they have already done. Only ever a template task —
    // a manager-added row has no playbook provenance for this to key off.
    const preCompleted =
      task.origin === 'template' &&
      isTaskPreCompletedByReady(task, doc.intake.ready_today, doc.template_id);

    return {
      id,
      release_id: releaseId,
      workspace_id: workspaceId,
      group_id: null,
      created_by: ownerUserId,
      assigned_to_user_id: assignee,
      assigned_to: null,
      assigned_collaborator_id: null,
      title: task.title,
      description: task.why,
      status: preCompleted ? 'done' : 'todo',
      // A focus task UrgAns marked for the manager's goal lands high, so the
      // board's own priority sort and badge carry it with nothing new to build.
      priority: task.focus ? 'high' : 'none',
      state: 'planning',
      position: index,
      auto_generated: true,
      due_date: dueDate,
      dependencies,
      metadata: buildTaskMetadata({
        task,
        doc,
        draftId,
        approvedAtIso,
        compressedRunway,
        isKey: keyIds.has(task.id),
        isCore: Boolean(doc.core_only),
      }),
    } satisfies PlanTaskRow;
  });

  if (reassignedCount > 0) {
    warnings.push(
      reassignedCount === 1
        ? 'One task was assigned to someone who is no longer on the team, so it went to you.'
        : `${reassignedCount} tasks were assigned to people who are no longer on the team, so they went to you.`
    );
  }

  return { rows, warnings };
}

function buildTaskMetadata(params: {
  task: DraftTask;
  doc: ReleasePlanDraftDoc;
  draftId: string;
  approvedAtIso: string;
  compressedRunway: boolean;
  isKey?: boolean;
  /** Part of a smaller plan's core (URG-318). */
  isCore?: boolean;
  /** Added later from the plan's suggestions with one tap (URG-318). */
  suggested?: boolean;
}): Record<string, unknown> {
  const { task, doc, draftId, approvedAtIso, compressedRunway, isKey = false, isCore = false, suggested = false } = params;

  // Two readers in lib/tasks-server.ts key off metadata.template
  // (readTaskType, readCompressedRunway), so even a task the manager added by
  // hand needs those two keys there to be classified correctly. It gets only
  // those two: it claims no template provenance, and metadata.planner below
  // records where it really came from.
  const template: Record<string, unknown> =
    task.origin === 'template'
      ? {
          template_id: doc.template_id,
          template_version: doc.template_version,
          task_id: task.template_task_id,
          role: task.role,
          task_type: task.task_type,
          duration_days: task.duration_days,
          optional: task.optional,
          tags: task.tags,
          compressed_runway: compressedRunway,
        }
      : {
          task_type: task.task_type,
          compressed_runway: compressedRunway,
        };

  return {
    template,
    // The rollout phase (URG-292). The draft's four plan phases fold into
    // three (by offset, their one definition), so an approved plan groups
    // exactly as it was reviewed.
    phase: rolloutPhaseForOffset(task.offset_days),
    planner: {
      draft_id: draftId,
      draft_task_id: task.id,
      schema_version: doc.schema_version,
      origin: task.origin,
      approved_at: approvedAtIso,
      key: isKey,
      ...(isCore ? { core: true } : {}),
      ...(suggested ? { suggested: true } : {}),
      ...(task.focus ? { focus: true, focus_reason: task.focus_reason ?? null } : {}),
      // An added task has no playbook provenance, so its role and tags live here.
      ...(task.origin === 'ai' ? { role: task.role, tags: task.tags } : {}),
    },
  };
}

/**
 * Insert an approved draft's tasks in a single batch.
 *
 * One statement rather than a row at a time: the plan is one decision, so it
 * either lands or it does not. `metadata` also rules out going through
 * POST /api/tasks, whose field allowlist rejects it.
 */
export async function instantiateDraftPlan(params: {
  doc: ReleasePlanDraftDoc;
  draftId: string;
  releaseId: string;
  releaseDate: string;
  workspaceId: string;
  ownerUserId: string;
  assignableUserIds: Set<string>;
  approvedAtMs: number;
  supabaseClient: SupabaseClient;
}): Promise<{ tasksCreated: number; taskIds: string[]; warnings: string[] }> {
  const { supabaseClient, ...buildParams } = params;

  const { rows, warnings } = buildTaskRowsFromDraft(buildParams);

  const { data, error } = await supabaseClient.from(TASKS_TABLE).insert(rows).select('id');

  if (error) {
    throw new PlanApprovalError(
      'database_error',
      `Failed to insert tasks for plan draft "${params.draftId}": ${error.message}`,
      error
    );
  }

  const inserted = (data ?? []) as Array<{ id: string }>;

  return {
    tasksCreated: inserted.length,
    taskIds: inserted.map((row) => row.id),
    warnings,
  };
}

/**
 * The activity a plan suggestion becomes when the manager adds it (URG-318).
 * The same row shape as the plan's own activities, dated from the release's
 * CURRENT date, owned by whoever the plan named (the manager when that person
 * left the team or nobody was named), and depending only on activities that
 * are on the board. It lands on the short list: the manager chose it.
 */
export function buildSuggestionTaskRow(params: {
  doc: ReleasePlanDraftDoc;
  task: DraftTask;
  draftId: string;
  releaseId: string;
  releaseDate: string;
  workspaceId: string;
  actorUserId: string;
  ownerUserId: string;
  assignableUserIds: Set<string>;
  /** draft task id → the activity it became, for this rollout. */
  boardIdsByDraftTaskId: Map<string, string>;
  position: number;
  nowMs: number;
}): PlanTaskRow {
  const { doc, task, releaseDate, nowMs } = params;
  const releaseEpoch = parseYmd(releaseDate);
  if (releaseEpoch === null) {
    throw new PlanApprovalError('missing_release_date', `Release date could not be parsed: ${releaseDate}`);
  }
  const dueDateMs = releaseEpoch + task.offset_days * MS_PER_DAY;
  const assignee =
    task.assignee_user_id && params.assignableUserIds.has(task.assignee_user_id)
      ? task.assignee_user_id
      : params.ownerUserId;
  return {
    id: randomUUID(),
    release_id: params.releaseId,
    workspace_id: params.workspaceId,
    group_id: null,
    created_by: params.actorUserId,
    assigned_to_user_id: assignee,
    assigned_to: null,
    assigned_collaborator_id: null,
    title: task.title,
    description: task.why,
    status: 'todo',
    priority: task.focus ? 'high' : 'none',
    state: 'planning',
    position: params.position,
    auto_generated: true,
    due_date: new Date(dueDateMs).toISOString(),
    dependencies: task.depends_on
      .map((depId) => params.boardIdsByDraftTaskId.get(depId))
      .filter((uuid): uuid is string => Boolean(uuid)),
    metadata: buildTaskMetadata({
      task,
      doc,
      draftId: params.draftId,
      approvedAtIso: new Date(nowMs).toISOString(),
      compressedRunway: dueDateMs < nowMs,
      isKey: true,
      suggested: true,
    }),
  };
}
