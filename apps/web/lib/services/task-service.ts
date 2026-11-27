import { SupabaseClient } from '@supabase/supabase-js';
import type { Timings } from '@/lib/server-timing';
import {
  TASKS_TABLE,
  TASKS_SELECT_COLUMNS,
  loadTasks,
  loadTaskDetail,
  type TaskRow
} from '@/lib/tasks-server';
import { TaskStatus, TaskPriority, TaskRequirement } from '@/types/tasks';
import { ReleasePipelineState } from '@/types/releases';
import { getTaskCompletionBlocker } from '@/lib/release-execution';
import { readAllPages, ROWS_MAX_PAGES, ROWS_PAGE_SIZE } from '@/lib/paged-rows';
import { dropRowsOfDeletedReleases } from '@/lib/rollout-trash-server';
import {
  TASK_DONE_STATUS,
  TASK_LOCKED_STATUS,
  isDependencySatisfied,
  TASK_PENDING_STATUS,
  type ExecutionTask,
} from '@/lib/execution-types';

/** Result of a server-side completion attempt. Mirrors the blocker gate the
 * client store enforces so Chappi can't complete a task whose dependency chain
 * is unmet. */
export type CompleteTaskResult =
  | { ok: true; completedId: string; unlockedIds: string[] }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'blocked'; message: string };

// Hard ceiling on list queries: ROWS_MAX_PAGES pages of ROWS_PAGE_SIZE. It used
// to be one 1,000-row page, which a team of about sixteen rollouts reached, and
// the rows past it (the latest-dated ones) silently dropped out of every count.
// Pages are only read while the last one came back full, and the ceiling is
// still logged when hit, because a silent cap would read as "that's all there is".
const TASK_LIST_MAX_ROWS = ROWS_PAGE_SIZE * ROWS_MAX_PAGES;

/**
 * Who is asking, as far as task lists care: the workspaces they belong to and
 * the limits they carry in each. WorkspaceAccessContext and ChappiToolContext
 * both satisfy it, so callers pass the whole context.
 *
 * Required, not optional (#853): the lists used to take bare workspace ids,
 * so an artist-limited member read every task on the team. A required field
 * cannot be forgotten.
 */
export type TaskListScope = {
  workspaceIds: string[];
  artistScopeByWorkspaceId: Record<string, string>;
  releaseScopeByWorkspaceId: Record<string, readonly string[]>;
};

/**
 * Drop rows the caller's limits hide. Unlimited callers pay nothing. A limited
 * member sees a rollout's task only when that rollout passes both limits for
 * the task's workspace. A project's task (no rollout, 4 Nov 2026) shows to an
 * artist-limited member of that artist only, and never to a rollout-limited one.
 */
export async function dropRowsOutsideScope<T>(
  adminClient: SupabaseClient,
  rows: T[],
  scope: TaskListScope,
  pick: (row: T) => { workspaceId: string; releaseId: string | null; recordId?: string | null }
): Promise<T[]> {
  const limited = (workspaceId: string) =>
    Boolean(scope.artistScopeByWorkspaceId[workspaceId] || scope.releaseScopeByWorkspaceId[workspaceId]);
  if (!rows.some((row) => limited(pick(row).workspaceId))) return rows;

  const artistNeeded = new Set<string>();
  for (const row of rows) {
    const { workspaceId, releaseId } = pick(row);
    if (releaseId && scope.artistScopeByWorkspaceId[workspaceId]) artistNeeded.add(releaseId);
  }
  const recordNeeded = new Set<string>();
  for (const row of rows) {
    const { workspaceId, releaseId, recordId } = pick(row);
    if (!releaseId && recordId && scope.artistScopeByWorkspaceId[workspaceId]) recordNeeded.add(recordId);
  }
  const artistByRecord = new Map<string, string>();
  if (recordNeeded.size) {
    const { data, error } = await adminClient
      .from('next_records')
      .select('id,artist_id')
      .in('id', Array.from(recordNeeded));
    if (error) throw error;
    for (const row of (data || []) as Array<{ id: string; artist_id: string | null }>) {
      artistByRecord.set(String(row.id), String(row.artist_id || ''));
    }
  }
  const artistByRelease = new Map<string, string>();
  if (artistNeeded.size) {
    const { data, error } = await adminClient
      .from('releases')
      .select('id,artist_id')
      .in('id', Array.from(artistNeeded));
    if (error) throw error;
    for (const row of (data || []) as Array<{ id: string; artist_id: string | null }>) {
      artistByRelease.set(String(row.id), String(row.artist_id || ''));
    }
  }

  return rows.filter((row) => {
    const { workspaceId, releaseId, recordId } = pick(row);
    if (!limited(workspaceId)) return true;
    if (!releaseId) {
      if (!recordId || scope.releaseScopeByWorkspaceId[workspaceId]) return false;
      const artistScope = scope.artistScopeByWorkspaceId[workspaceId];
      return Boolean(artistScope) && artistByRecord.get(recordId) === artistScope;
    }
    const releaseScope = scope.releaseScopeByWorkspaceId[workspaceId];
    if (releaseScope && !releaseScope.includes(releaseId)) return false;
    const artistScope = scope.artistScopeByWorkspaceId[workspaceId];
    if (artistScope && artistByRelease.get(releaseId) !== artistScope) return false;
    return true;
  });
}

export class TaskService {
  constructor(private adminClient: SupabaseClient) {}

  /**
   * Returns tasks visible to the user. Visibility is workspace-membership-based:
   * any task in a workspace the user can access (passed in via `workspaceIds`,
   * which the caller derives from `loadWorkspaceAccessContext`) is included
   * regardless of assignee. Assignment is a display detail, not a visibility
   * rule.
   *
   * Pass `mineOnly: true` to re-narrow to tasks assigned to the user.
   */
  async getTasksForUser(userId: string, scope: TaskListScope, filters: {
    releaseId?: string | null;
    recordId?: string | null;
    priority?: string;
    status?: string;
    mineOnly?: boolean;
  } = {}, timings?: Timings) {
    const { workspaceIds } = scope;
    // `id` is the last sort key so paging is stable: due date and position are
    // not unique, and a tie could otherwise skip or repeat a row across pages.
    const readRows = () =>
      readAllPages<TaskRow>((from, to) => {
        let query = this.adminClient
          .from(TASKS_TABLE)
          .select(TASKS_SELECT_COLUMNS)
          .in('workspace_id', workspaceIds)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('position', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);

        if (filters.mineOnly) query = query.eq('assigned_to_user_id', userId);
        if (filters.releaseId) query = query.eq('release_id', filters.releaseId);
        if (filters.recordId) query = query.eq('record_id', filters.recordId);
        if (filters.priority) query = query.eq('priority', filters.priority);
        if (filters.status) query = query.eq('status', filters.status);
        return query as unknown as PromiseLike<{ data: TaskRow[] | null; error: { message?: string } | null }>;
      });

    const { rows, truncated } = await (timings ? timings.time('t_rows', readRows) : readRows());

    if (truncated) {
      console.warn(
        `[task-service] getTasksForUser hit the ${TASK_LIST_MAX_ROWS}-row cap for user ${userId} — results may be truncated.`
      );
    }

    // Tasks of a rollout in Trash stay in the table but never list.
    const liveRows = await dropRowsOfDeletedReleases(this.adminClient, rows, (row) => row.release_id);
    const visibleRows = await dropRowsOutsideScope(this.adminClient, liveRows, scope, (row) => ({
      workspaceId: String(row.workspace_id || ''),
      releaseId: row.release_id ? String(row.release_id) : null,
      recordId: row.record_id ? String(row.record_id) : null,
    }));
    return loadTasks(this.adminClient, visibleRows, userId, undefined, timings);
  }

  async getWorkspaceTasks(workspaceId: string, userId: string, scope: TaskListScope, filters: {
    releaseId?: string | null;
    priority?: string;
    status?: string;
  } = {}) {
    const { rows, truncated } = await readAllPages<TaskRow>((from, to) => {
      let query = this.adminClient
        .from(TASKS_TABLE)
        .select(TASKS_SELECT_COLUMNS)
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to);

      if (filters.releaseId) query = query.eq('release_id', filters.releaseId);
      if (filters.priority) query = query.eq('priority', filters.priority);
      if (filters.status) query = query.eq('status', filters.status);
      return query as unknown as PromiseLike<{ data: TaskRow[] | null; error: { message?: string } | null }>;
    });

    if (truncated) {
      console.warn(
        `[task-service] getWorkspaceTasks hit the ${TASK_LIST_MAX_ROWS}-row cap for workspace ${workspaceId} — results may be truncated.`
      );
    }

    const liveRows = await dropRowsOfDeletedReleases(this.adminClient, rows, (row) => row.release_id);
    const visibleRows = await dropRowsOutsideScope(this.adminClient, liveRows, scope, (row) => ({
      workspaceId: String(row.workspace_id || ''),
      releaseId: row.release_id ? String(row.release_id) : null,
      recordId: row.record_id ? String(row.record_id) : null,
    }));
    return loadTasks(this.adminClient, visibleRows, userId);
  }

  async getTaskById(taskId: string, userId: string) {
    const { data, error } = await this.adminClient
      .from(TASKS_TABLE)
      .select(TASKS_SELECT_COLUMNS)
      .eq('id', taskId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return loadTaskDetail(this.adminClient, data as TaskRow, userId);
  }

  async updateTask(taskId: string, userId: string, updates: Partial<TaskRow>) {
    const { data, error } = await this.adminClient
      .from(TASKS_TABLE)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createTask(userId: string, workspaceId: string, data: {
    title: string;
    description?: string | null;
    /** Exactly one of releaseId and recordId (tasks_one_owner_check). */
    releaseId: string | null;
    recordId?: string | null;
    groupId?: string | null;
    priority?: TaskPriority;
    dueDate?: string | null;
    status?: TaskStatus;
    requirement?: TaskRequirement | null;
    dependencies?: string[];
    state?: ReleasePipelineState;
    autoGenerated?: boolean;
    metadata?: Record<string, unknown>;
    assignedToUserId?: string | null;
    groupName?: string | null;
    groupColor?: string | null;
  }) {
    // assignedToUserId: callers that explicitly pass null mean "unassigned"
    // (the new + New task modal sends null when the picker is empty), so we
    // only fall back to the creator when the field is absent from the payload.
    // Templates and the legacy quick-create both pass an explicit value, so
    // they're unaffected.
    const assigneeUserId =
      data.assignedToUserId === undefined ? userId : data.assignedToUserId;
    const { data: result, error } = await this.adminClient
      .from(TASKS_TABLE)
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        assigned_to_user_id: assigneeUserId,
        title: data.title,
        description: data.description,
        release_id: data.releaseId,
        record_id: data.recordId ?? null,
        group_id: data.groupId,
        priority: data.priority || 'none',
        due_date: data.dueDate,
        status: data.status || 'todo',
        requirement: data.requirement,
        dependencies: data.dependencies || [],
        state: data.state || 'idea',
        auto_generated: data.autoGenerated || false,
        metadata: data.metadata || {},
        group_name: data.groupName ?? null,
        group_color: data.groupColor ?? null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    return result;
  }

  async deleteTask(taskId: string, workspaceId: string) {
    const { error } = await this.adminClient
      .from(TASKS_TABLE)
      .delete()
      .eq('id', taskId)
      .eq('workspace_id', workspaceId);

    if (error) throw error;
    return true;
  }

  /**
   * Complete a task WITH the dependency-blocker gate + cascade-unlock that
   * otherwise live only in the client store (`useTaskStore.completeTask`). The
   * PATCH route does neither, so a Chappi `complete_task` tool hitting raw
   * update would bypass the gate and strand dependents locked. This is the
   * server-side equivalent the agent calls. (A follow-up can repoint the store
   * at this same logic to remove the duplication — out of scope here.)
   *
   * `workspaceIds` is the caller's access set (from loadWorkspaceAccessContext);
   * it authorizes the mutation to the user's own workspaces.
   */
  /** Every task of a release, hydrated, so a rule can see the whole dependency graph. */
  private async loadReleaseTasks(releaseId: string, userId: string): Promise<ExecutionTask[]> {
    const { data: rows, error } = await this.adminClient
      .from(TASKS_TABLE)
      .select(TASKS_SELECT_COLUMNS)
      .eq('release_id', releaseId);
    if (error) throw error;
    return (await loadTasks(this.adminClient, (rows || []) as TaskRow[], userId)) as ExecutionTask[];
  }

  /**
   * What would stop this task being marked done, or null. The same rule the
   * checkbox and completeTaskWithCascade use (getTaskCompletionBlocker), so the
   * status menu and the API cannot finish a task those two would refuse.
   * Null also when the task cannot be found: the caller already proved access,
   * and an unreadable graph must not block someone from finishing their work.
   */
  async getCompletionBlocker(releaseId: string, taskId: string, userId: string): Promise<string | null> {
    const tasks = await this.loadReleaseTasks(releaseId, userId);
    const target = tasks.find((t) => t.id === taskId);
    return target ? getTaskCompletionBlocker(target, tasks) : null;
  }

  async completeTaskWithCascade(
    taskId: string,
    userId: string,
    workspaceIds: string[]
  ): Promise<CompleteTaskResult> {
    // 1. Locate the target and authorize it against the caller's workspaces.
    const { data: targetRow, error: targetError } = await this.adminClient
      .from(TASKS_TABLE)
      .select('id,release_id,workspace_id')
      .eq('id', taskId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!targetRow) return { ok: false, reason: 'not_found', message: 'Task not found.' };
    if (!workspaceIds.includes(String(targetRow.workspace_id))) {
      return { ok: false, reason: 'forbidden', message: "You don't have access to that task." };
    }

    // 2. Load the release's tasks so the blocker check + cascade see the whole
    //    dependency graph, exactly like the client store does.
    const tasks = await this.loadReleaseTasks(String(targetRow.release_id), userId);
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return { ok: false, reason: 'not_found', message: 'Task not found.' };

    // 3. Same gate the checkbox enforces: locked chain, unmet deps, or an
    //    unsatisfied requirement blocks completion.
    const blocker = getTaskCompletionBlocker(target, tasks);
    if (blocker) return { ok: false, reason: 'blocked', message: blocker };

    // 4. Mark done.
    const nowIso = new Date().toISOString();
    const { error: completeError } = await this.adminClient
      .from(TASKS_TABLE)
      .update({ status: TASK_DONE_STATUS, completed_at: nowIso, updated_at: nowIso })
      .eq('id', taskId);
    if (completeError) throw completeError;

    // 5. Cascade-unlock: any locked dependent whose every dependency is now
    //    done flips to todo (mirrors the store's unlockCandidates logic).
    const afterComplete = tasks.map((t) =>
      t.id === taskId ? ({ ...t, status: TASK_DONE_STATUS } as ExecutionTask) : t
    );
    const unlockedIds = afterComplete
      .filter(
        (candidate) =>
          candidate.status === TASK_LOCKED_STATUS &&
          candidate.dependencies.includes(taskId) &&
          candidate.dependencies.every(
            (id) => isDependencySatisfied(afterComplete.find((dep) => dep.id === id)?.status)
          )
      )
      .map((candidate) => candidate.id);

    if (unlockedIds.length > 0) {
      const { error: unlockError } = await this.adminClient
        .from(TASKS_TABLE)
        .update({ status: TASK_PENDING_STATUS, updated_at: new Date().toISOString() })
        .in('id', unlockedIds);
      if (unlockError) throw unlockError;
    }

    return { ok: true, completedId: taskId, unlockedIds };
  }

  /**
   * Reopen a done task → todo. Like the store's reopen path, this does NOT
   * re-lock dependents (more confusing than helpful at v1 scale). Authorized
   * against the caller's workspaces.
   */
  async reopenTask(
    taskId: string,
    workspaceIds: string[]
  ): Promise<CompleteTaskResult> {
    const { data: targetRow, error: targetError } = await this.adminClient
      .from(TASKS_TABLE)
      .select('id,workspace_id')
      .eq('id', taskId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!targetRow) return { ok: false, reason: 'not_found', message: 'Task not found.' };
    if (!workspaceIds.includes(String(targetRow.workspace_id))) {
      return { ok: false, reason: 'forbidden', message: "You don't have access to that task." };
    }

    const nowIso = new Date().toISOString();
    const { error } = await this.adminClient
      .from(TASKS_TABLE)
      .update({ status: TASK_PENDING_STATUS, completed_at: null, updated_at: nowIso })
      .eq('id', taskId);
    if (error) throw error;

    return { ok: true, completedId: taskId, unlockedIds: [] };
  }
}
