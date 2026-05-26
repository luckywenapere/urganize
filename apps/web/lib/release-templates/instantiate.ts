/**
 * Template instantiation — turn a hand-crafted Template into concrete task rows.
 *
 * Given a Template, a target release, and a release date anchor, this module
 * computes per-task due dates from `offset_days`, resolves template-local
 * dependency IDs to freshly-minted UUIDs, and inserts the resulting rows into
 * the `tasks` table in a single batch.
 *
 * Template provenance (template_id, version, original task_id, role, etc.) is
 * preserved on each row under `metadata.template` so future passes (AI
 * tailoring, status update generator, debugging) can trace a task back to its
 * template origin without joining anywhere.
 *
 * @see CLAUDE.md "Hand-crafted release templates" and "Build sequence priority"
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Template, TemplateTask } from './types';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown for any known failure mode of {@link instantiateTemplate}. Use the
 * `reason` discriminator to branch — for example, an API route might map
 * `missing_release_date` to a 400, `invalid_template` to a 500 (programmer
 * error), and `database_error` to a 502.
 *
 * The original cause (when there is one — e.g., a Supabase PostgrestError) is
 * attached as `cause` for logging.
 */
export class TemplateInstantiationError extends Error {
  constructor(
    public readonly reason: 'missing_release_date' | 'database_error' | 'invalid_template',
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplateInstantiationError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASKS_TABLE = 'tasks';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Instantiate a template against a release: insert one `tasks` row per template
 * task, with due dates computed from `offset_days` relative to the release
 * date, and template-local dependencies translated into real task UUIDs.
 *
 * ## Behavior
 *
 * - Every template task becomes a real task row. Optional tasks are **not**
 *   filtered out here; the `optional` flag is preserved in metadata so the
 *   future AI tailoring layer can decide. At v1 the user edits the generated
 *   plan before commit; optional tasks they don't want get deleted by hand.
 * - Event milestones are inserted as ordinary task rows. Their
 *   `metadata.template.task_type === 'event_milestone'` marker is what the UI
 *   can read to render them as dated milestones rather than work items.
 * - All rows are inserted in a single batch. If the insert fails, no partial
 *   recovery is attempted — the caller decides whether to retry or surface.
 *
 * ## Non-idempotency
 *
 * Calling this function twice for the same release produces duplicate tasks.
 * The caller is responsible for ensuring it runs exactly once per release —
 * typically at release creation, before any user-visible tasks exist.
 *
 * ## Authorization
 *
 * This function performs no authorization checks. It assumes the caller has
 * already verified the user is allowed to create tasks under `releaseId` /
 * `workspaceId`. Auth lives at the API route layer, not here.
 *
 * The `supabaseClient` argument lets the caller decide which client to use:
 * an anon client (RLS-enforced) is appropriate for authenticated user flows;
 * a service-role client is appropriate for admin or test paths that have
 * already authorized out-of-band.
 *
 * ## Error handling
 *
 * Throws {@link TemplateInstantiationError} with one of:
 *
 * - `'missing_release_date'` — `releaseDate` is null. Tasks need a date anchor
 *   to compute offsets. Callers should require a release date before allowing
 *   template instantiation.
 * - `'invalid_template'` — the template is structurally broken (no tasks,
 *   duplicate task IDs, or `depends_on` references an unknown ID). This is a
 *   programmer error — fix the template file.
 * - `'database_error'` — Supabase returned an error on insert. The original
 *   error is attached as `cause`.
 *
 * @param params - Inputs for the instantiation, see fields above.
 * @returns Count of tasks created and the array of generated UUIDs (in the
 *   same order as `template.tasks`).
 * @throws {TemplateInstantiationError}
 */
export async function instantiateTemplate(params: {
  template: Template;
  releaseId: string;
  releaseDate: string | null;
  workspaceId: string;
  ownerUserId: string;
  supabaseClient: SupabaseClient;
}): Promise<{
  tasksCreated: number;
  taskIds: string[];
}> {
  const { template, releaseId, releaseDate, workspaceId, ownerUserId, supabaseClient } = params;

  // ---- 1. Validate inputs ----------------------------------------------------

  if (releaseDate === null) {
    throw new TemplateInstantiationError(
      'missing_release_date',
      'Cannot instantiate template without a release date: task offsets are computed relative to the release date.'
    );
  }

  if (!ISO_DATE_PATTERN.test(releaseDate)) {
    throw new TemplateInstantiationError(
      'missing_release_date',
      `Release date must be an ISO date string (YYYY-MM-DD). Received: ${releaseDate}`
    );
  }

  const releaseEpoch = Date.UTC(
    Number(releaseDate.slice(0, 4)),
    Number(releaseDate.slice(5, 7)) - 1,
    Number(releaseDate.slice(8, 10))
  );

  if (Number.isNaN(releaseEpoch)) {
    throw new TemplateInstantiationError(
      'missing_release_date',
      `Release date could not be parsed: ${releaseDate}`
    );
  }

  if (template.tasks.length === 0) {
    throw new TemplateInstantiationError(
      'invalid_template',
      `Template "${template.id}" has no tasks.`
    );
  }

  // ---- 2. Mint UUIDs + check for duplicate template task IDs -----------------

  const templateIdToUuid = new Map<string, string>();
  for (const task of template.tasks) {
    if (templateIdToUuid.has(task.id)) {
      throw new TemplateInstantiationError(
        'invalid_template',
        `Template "${template.id}" has duplicate task id: ${task.id}`
      );
    }
    templateIdToUuid.set(task.id, randomUUID());
  }

  // ---- 3. Validate depends_on references upfront -----------------------------
  // Catch this before issuing the insert so the failure is a clear template
  // bug rather than a confusing FK error on a uuid[] column.

  for (const task of template.tasks) {
    if (!task.depends_on) continue;
    for (const depId of task.depends_on) {
      if (!templateIdToUuid.has(depId)) {
        throw new TemplateInstantiationError(
          'invalid_template',
          `Template "${template.id}" task "${task.id}" depends on unknown task id: ${depId}`
        );
      }
    }
  }

  // ---- 4. Build rows ---------------------------------------------------------

  const taskRows = template.tasks.map((task, index) =>
    buildTaskRow({
      task,
      index,
      template,
      releaseId,
      workspaceId,
      ownerUserId,
      releaseEpoch,
      templateIdToUuid,
    })
  );

  // ---- 5. Insert in a single batch -------------------------------------------

  const { data, error } = await supabaseClient
    .from(TASKS_TABLE)
    .insert(taskRows)
    .select('id');

  if (error) {
    throw new TemplateInstantiationError(
      'database_error',
      `Failed to insert tasks for template "${template.id}" on release "${releaseId}": ${error.message}`,
      error
    );
  }

  const inserted = (data ?? []) as Array<{ id: string }>;

  return {
    tasksCreated: inserted.length,
    taskIds: inserted.map((row) => row.id),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface BuildTaskRowParams {
  task: TemplateTask;
  index: number;
  template: Template;
  releaseId: string;
  workspaceId: string;
  ownerUserId: string;
  releaseEpoch: number;
  templateIdToUuid: Map<string, string>;
}

function buildTaskRow(params: BuildTaskRowParams) {
  const {
    task,
    index,
    template,
    releaseId,
    workspaceId,
    ownerUserId,
    releaseEpoch,
    templateIdToUuid,
  } = params;

  const id = templateIdToUuid.get(task.id);
  if (!id) {
    // Defensive: would mean step 2 missed this task, which is impossible.
    throw new TemplateInstantiationError(
      'invalid_template',
      `No generated UUID for template task: ${task.id}`
    );
  }

  const dueDate = new Date(releaseEpoch + task.offset_days * MS_PER_DAY).toISOString();

  const dependencies = (task.depends_on ?? [])
    .map((depId) => templateIdToUuid.get(depId))
    .filter((uuid): uuid is string => Boolean(uuid));

  return {
    id,
    release_id: releaseId,
    workspace_id: workspaceId,
    group_id: null,
    created_by: ownerUserId,
    // Default to the release owner so the dashboard query
    // (TaskService.getTasksForUser, filters by assigned_to_user_id) surfaces
    // these tasks. Per-task reassignment happens in the task drawer.
    assigned_to_user_id: ownerUserId,
    assigned_to: null,
    assigned_collaborator_id: null,
    title: task.title,
    description: task.description,
    status: 'todo',
    priority: 'none',
    state: 'planning',
    position: index,
    auto_generated: true,
    due_date: dueDate,
    dependencies,
    metadata: {
      template: {
        template_id: template.id,
        template_version: template.version,
        task_id: task.id,
        role: task.role,
        task_type: task.type,
        duration_days: task.duration_days,
        optional: task.optional,
        tags: task.tags ?? [],
      },
    },
  };
}
