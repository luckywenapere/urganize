import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ActivityLogEntry, ExecutionTask } from '@/lib/execution-types';

const ACTIVITY_LOG_TABLE = 'activity_logs';

const toActivity = (row: Record<string, unknown>): ActivityLogEntry => ({
  id: String(row.id || ''),
  releaseId: row.release_id ? String(row.release_id) : null,
  taskId: row.task_id ? String(row.task_id) : null,
  actorName: String(row.actor_name || 'Urganize'),
  action: String(row.action || 'updated'),
  message: String(row.message || 'Workspace activity recorded'),
  createdAt: String(row.created_at || new Date().toISOString()),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
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

    const activityResult = await adminClient
      .from(ACTIVITY_LOG_TABLE)
      .select('id,release_id,task_id,actor_name,action,message,created_at')
      .or(`user_id.eq.${auth.user.id},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(20);

    const activity =
      activityResult.error || !Array.isArray(activityResult.data)
        ? []
        : activityResult.data.map((row) => toActivity(row as Record<string, unknown>));

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
