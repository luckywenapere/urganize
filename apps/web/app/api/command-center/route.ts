import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  requireActiveAuthenticatedUser,
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
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const releaseService = new ReleaseService(adminClient);
  const taskService = new TaskService(adminClient);

  try {
    const releases = await releaseService.getReleasesForUser(auth.user.id);
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    
    let tasks: ExecutionTask[] = [];
    if (access.workspaceIds.length && access.membershipIds.length) {
      tasks = await taskService.getTasksForUser(auth.user.id, access.workspaceIds) as ExecutionTask[];
    }

    // owner_user_id is NOT NULL, so a plain eq matches everything this user
    // owns and rides activity_logs_owner_created_idx (owner_user_id,
    // created_at desc) exactly.
    const activityResult = await adminClient
      .from(ACTIVITY_LOG_TABLE)
      .select('id,release_id,task_id,actor_user_id,action,message,metadata,created_at')
      .eq('owner_user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Activity is non-critical to the dashboard payload — degrade to an empty
    // feed rather than failing the whole request, but say so in the logs
    // (a silent coerce-to-[] is what hid the previous schema mismatch here).
    if (activityResult.error) {
      console.error('[command-center] activity query failed:', activityResult.error.message);
    }

    let activity: ActivityLogEntry[] = [];
    if (!activityResult.error && Array.isArray(activityResult.data)) {
      const rows = activityResult.data as Record<string, unknown>[];
      const actorProfileById = await loadProfilesByIds(
        adminClient,
        rows.map((row) => (row.actor_user_id ? String(row.actor_user_id) : ''))
      );
      activity = rows.map((row) => toActivity(row, actorProfileById));
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
