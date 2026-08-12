import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
  loadProfilesByIds,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ActivityLogEntry, ExecutionTask } from '@/lib/execution-types';

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
  message: String(row.message || 'Workspace activity recorded'),
  createdAt: String(row.created_at || new Date().toISOString()),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const releaseService = new ReleaseService(adminClient);
  const taskService = new TaskService(adminClient);

  try {
    // Access first: its releaseOwnerIds drive whole-workspace release
    // visibility (a teammate sees the shared catalog, not just their own).
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);

    // Releases, tasks, and activity are independent reads — they used to run
    // as three serial round trips (plus the actor-profile lookup nested in
    // activity). Fanned out, the request costs the slowest one, not the sum.
    const [releases, rawTasks, activity] = await Promise.all([
      releaseService.getReleasesForUser(
        auth.user.id,
        access.releaseOwnerIds,
        access.artistScopeByOwnerId
      ),
      (async (): Promise<ExecutionTask[]> => {
        if (!access.workspaceIds.length || !access.membershipIds.length) return [];
        return (await taskService.getTasksForUser(
          auth.user.id,
          access.workspaceIds
        )) as ExecutionTask[];
      })(),
      (async (): Promise<ActivityLogEntry[]> => {
        // owner_user_id is NOT NULL, so a plain eq matches everything this
        // user owns and rides activity_logs_owner_created_idx (owner_user_id,
        // created_at desc) exactly.
        const activityResult = await adminClient
          .from(ACTIVITY_LOG_TABLE)
          .select('id,release_id,task_id,actor_user_id,action,message,metadata,created_at')
          .eq('owner_user_id', auth.user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        // Activity is non-critical to the dashboard payload — degrade to an
        // empty feed rather than failing the whole request, but say so in the
        // logs (a silent coerce-to-[] is what hid the previous schema
        // mismatch here). Kept INSIDE this closure so a failure here can't
        // reject the Promise.all and take releases/tasks down with it.
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
      })(),
    ]);

    // Artist-scoped members only see activities for THEIR releases — the
    // release list is already scope-filtered, so it doubles as the
    // allow-list. Unscoped users skip this entirely. Pure JS, so it happens
    // after the fan-out rather than forcing tasks to wait on releases.
    let tasks: ExecutionTask[] = rawTasks;
    if (tasks.length && Object.keys(access.artistScopeByOwnerId).length > 0) {
      const visibleReleaseIds = new Set(releases.map((release) => release.id));
      tasks = tasks.filter((task) => task.releaseId && visibleReleaseIds.has(task.releaseId));
    }

    let todaysDirective: ExecutionTask | null = null;
    const incompleteTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    
    if (incompleteTasks.length > 0) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      
      const overdue = incompleteTasks.find(t => t.dueDate && t.dueDate < todayStr);
      if (overdue) {
        todaysDirective = overdue;
      } else {
        const dueToday = incompleteTasks.find(t => t.dueDate === todayStr);
        todaysDirective = dueToday || incompleteTasks[0];
      }
    }

    return NextResponse.json({ releases, tasks, activity, todaysDirective });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return NextResponse.json({ error: 'Schema missing' }, { status: 501 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
