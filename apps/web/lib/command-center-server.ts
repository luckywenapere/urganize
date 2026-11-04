// The command-center data load, moved out of app/api/command-center/route.ts
// so a second caller (app/api/home/route.ts) can load the SAME releases +
// tasks + activity + todaysDirective payload without a second implementation
// to drift from the first.
//
// DELIBERATELY KEEPS NO try/catch OF ITS OWN. The command-center route's own
// try/catch maps a thrown error to its grandfathered schema-missing check
// (501) or a generic message (500) with logging — that mapping is
// response-shaping, which belongs at the route boundary, not buried in a
// function a second caller (Home, which does NOT carry that grandfathered
// check — see app/api/home/route.ts) may want to handle differently. This
// function can throw exactly as the inline body used to; every caller wraps
// it in its own try/catch.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadWorkspaceAccessContext, loadProfilesByIds } from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ActivityLogEntry, CommandCenterData, ExecutionTask } from '@/lib/execution-types';
import type { Timings } from '@/lib/server-timing';
import { isTaskClosed } from '@/types/tasks';

type WorkspaceAccessContext = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

const ACTIVITY_LOG_TABLE = 'activity_logs';

// activity_logs has no actor_name column — the actor is actor_user_id, plus a
// metadata.legacy_actor_name carried over by the v1-cut migration for rows
// that predate the split. Prefer the historical name (accurate for legacy
// rows, whose actor_user_id was a best-guess backfill), then the actor's
// profile, then the system fallback.
const resolveActorName = (
  row: Record<string, unknown>,
  actorProfileById: Map<string, { name?: string | null; email?: string | null }>
): string => {
  const metadata = (row.metadata || {}) as Record<string, unknown>;
  if (typeof metadata.legacy_actor_name === 'string' && metadata.legacy_actor_name.trim()) {
    return metadata.legacy_actor_name.trim();
  }
  const actorId = row.actor_user_id ? String(row.actor_user_id) : '';
  const profile = actorId ? actorProfileById.get(actorId) : undefined;
  return profile?.name?.trim() || profile?.email?.trim() || 'Urganize';
};

const toActivity = (
  row: Record<string, unknown>,
  actorProfileById: Map<string, { name?: string | null; email?: string | null }>
): ActivityLogEntry => ({
  id: String(row.id || ''),
  releaseId: row.release_id ? String(row.release_id) : null,
  taskId: row.task_id ? String(row.task_id) : null,
  actorName: resolveActorName(row, actorProfileById),
  action: String(row.action || 'updated'),
  message: String(row.message || 'Activity recorded'),
  createdAt: String(row.created_at || new Date().toISOString()),
});

/**
 * Releases, tasks, and activity for this user — identical to what
 * GET /api/command-center has always returned. Can throw (schema-missing
 * errors, raw PostgREST error objects); callers own the response mapping.
 */
export async function loadCommandCenterData(
  adminClient: SupabaseClient,
  user: User,
  options: {
    timings?: Timings;
    /** An access context the caller already resolved for this same request.
     * Passing it skips a second full lookup (invite activation, workspace
     * resolve, role read); omitting it resolves one exactly as before. */
    access?: WorkspaceAccessContext;
  } = {}
): Promise<CommandCenterData> {
  const { timings } = options;
  // Optional Server-Timing recorder: when absent the work just runs.
  const step = <T>(name: string, work: () => Promise<T>): Promise<T> =>
    timings ? timings.time(name, work) : work();

  const releaseService = new ReleaseService(adminClient);
  const taskService = new TaskService(adminClient);

  // Access first: its releaseOwnerIds drive whole-workspace release
  // visibility (a teammate sees the shared catalog, not just their own).
  const access =
    options.access ?? (await step('cc_access', () => loadWorkspaceAccessContext(adminClient, user)));

  // Releases, tasks, and activity are independent reads — they used to run
  // as three serial round trips (plus the actor-profile lookup nested in
  // activity). Fanned out, the request costs the slowest one, not the sum.
  const [releases, rawTasks, activity] = await Promise.all([
    step('cc_releases', () =>
      releaseService.getReleasesForUser(
        user.id,
        access.releaseOwnerIds,
        access.artistScopeByOwnerId,
        access.releaseScopeByOwnerId
      )
    ),
    (async (): Promise<ExecutionTask[]> => {
      if (!access.workspaceIds.length || !access.membershipIds.length) return [];
      return (await step('cc_tasks', () =>
        taskService.getTasksForUser(user.id, access, {}, timings)
      )) as ExecutionTask[];
    })(),
    step('cc_activity', async (): Promise<ActivityLogEntry[]> => {
      // owner_user_id is NOT NULL, so a plain eq matches everything this
      // user owns and rides activity_logs_owner_created_idx (owner_user_id,
      // created_at desc) exactly.
      const activityResult = await adminClient
        .from(ACTIVITY_LOG_TABLE)
        .select('id,release_id,task_id,actor_user_id,action,message,metadata,created_at')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // Activity is non-critical to the dashboard payload — degrade to an
      // empty feed rather than failing the whole request, but say so in the
      // logs (a silent coerce-to-[] is what hid a previous schema mismatch
      // here). Kept INSIDE this closure so a failure here can't reject the
      // Promise.all and take releases/tasks down with it.
      if (activityResult.error) {
        console.error('[command-center] activity query failed:', activityResult.error.message);
        return [];
      }
      if (!Array.isArray(activityResult.data)) return [];

      const rows = activityResult.data as Record<string, unknown>[];
      const actorProfileById = await loadProfilesByIds(
        adminClient,
        rows.map((row) => (row.actor_user_id ? String(row.actor_user_id) : ''))
      );
      return rows.map((row) => toActivity(row, actorProfileById));
    }),
  ]);

  // Artist-scoped members only see activities for THEIR releases — the
  // release list is already scope-filtered, so it doubles as the
  // allow-list. Unscoped users skip this entirely. Pure JS, so it happens
  // after the fan-out rather than forcing tasks to wait on releases.
  let tasks: ExecutionTask[] = rawTasks;
  if (
    tasks.length &&
    (Object.keys(access.artistScopeByOwnerId).length > 0 ||
      Object.keys(access.releaseScopeByOwnerId).length > 0)
  ) {
    const visibleReleaseIds = new Set(releases.map((release) => release.id));
    // A project's task has no rollout; the task list already dropped the ones
    // this member cannot see (dropRowsOutsideScope), so it stays.
    tasks = tasks.filter((task) =>
      task.releaseId ? visibleReleaseIds.has(task.releaseId) : Boolean(task.recordId)
    );
  }

  let todaysDirective: ExecutionTask | null = null;
  const incompleteTasks = tasks.filter((t) => !isTaskClosed(t.status));

  if (incompleteTasks.length > 0) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const overdue = incompleteTasks.find((t) => t.dueDate && t.dueDate < todayStr);
    if (overdue) {
      todaysDirective = overdue;
    } else {
      const dueToday = incompleteTasks.find((t) => t.dueDate === todayStr);
      todaysDirective = dueToday || incompleteTasks[0];
    }
  }

  return { releases, tasks, activity, todaysDirective };
}
