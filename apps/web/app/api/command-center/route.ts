import { NextRequest, NextResponse } from 'next/server';
import {
  TASKS_TABLE,
  createAdminClient,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadTasks,
  loadWorkspaceAccessContext,
  type TaskRow,
} from '@/lib/tasks-server';
import { normalizePipelineState } from '@/lib/release-execution';
import type { ActivityLogEntry, ExecutionRelease, ExecutionTask } from '@/lib/execution-types';

const ACTIVITY_LOG_TABLE = 'activity_log';

type ReleaseRow = {
  id: string;
  title: string | null;
  artist_name: string | null;
  release_date: string | null;
  description: string | null;
  status: string | null;
  state?: string | null;
  readiness_score?: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const toRelease = (row: ReleaseRow): ExecutionRelease => ({
  id: String(row.id || ''),
  title: String(row.title || 'Untitled release'),
  artistName: String(row.artist_name || 'Unknown artist'),
  releaseDate: row.release_date ? String(row.release_date) : null,
  description: row.description ? String(row.description) : null,
  status: String(row.status || 'draft'),
  state: normalizePipelineState(row.state),
  readinessScore: Number(row.readiness_score || 0),
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

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

  const releasesResult = await adminClient
    .from('releases')
    .select('id,title,artist_name,release_date,description,status,state,readiness_score,created_at,updated_at')
    .or(`owner_user_id.eq.${auth.user.id},user_id.eq.${auth.user.id}`)
    .order('release_date', { ascending: true, nullsFirst: false });

  if (releasesResult.error) {
    return NextResponse.json({ error: releasesResult.error.message || 'Could not load releases.' }, { status: 500 });
  }

  const releases = (Array.isArray(releasesResult.data) ? releasesResult.data : []).map((row) =>
    toRelease(row as ReleaseRow)
  );

  let tasks: ExecutionTask[] = [];
  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (access.workspaceIds.length && access.membershipIds.length) {
      const taskResult = await adminClient
        .from(TASKS_TABLE)
        .select('id,workspace_id,group_id,release_id,created_by,assigned_to_user_id,assigned_to,title,description,status,priority,due_date,completed_at,position,requirement,dependencies,state,auto_generated,metadata,created_at,updated_at')
        .eq('assigned_to_user_id', auth.user.id)
        .in('workspace_id', access.workspaceIds)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (taskResult.error) throw taskResult.error;
      tasks = await loadTasks(adminClient, (taskResult.data || []) as TaskRow[], auth.user.id);
    }
  } catch (error) {
    if (!isTaskSchemaMissingError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not load execution tasks.' },
        { status: 500 }
      );
    }
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
    
    // 1. Overdue
    const overdue = incompleteTasks.find(t => t.dueDate && t.dueDate < todayStr);
    
    if (overdue) {
      todaysDirective = overdue;
    } else {
      // 2. Release within 7 days
      let upcomingReleaseTask: ExecutionTask | null = null;
      for (const release of releases) {
        if (release.releaseDate) {
          const rDate = new Date(release.releaseDate);
          const rDateStr = rDate.toISOString().slice(0, 10);
          const timeDiff = rDate.getTime() - now.getTime();
          const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
          
          if (diffDays >= 0 && diffDays <= 7) {
            const releaseTasks = incompleteTasks.filter(t => t.releaseId === release.id);
            if (releaseTasks.length > 0) {
              const priorityWeights: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
              upcomingReleaseTask = releaseTasks.sort((a, b) => {
                 const weightA = priorityWeights[a.priority || 'low'] ?? 0;
                 const weightB = priorityWeights[b.priority || 'low'] ?? 0;
                 return weightB - weightA;
              })[0];
              break;
            }
          }
        }
      }

      if (upcomingReleaseTask) {
        todaysDirective = upcomingReleaseTask;
      } else {
        // 3. Due today
        const dueToday = incompleteTasks.find(t => t.dueDate === todayStr);
        if (dueToday) {
          todaysDirective = dueToday;
        } else {
          // 4. Oldest incomplete with status 'todo'
          const todos = incompleteTasks.filter(t => t.status === 'todo');
          if (todos.length > 0) {
            todaysDirective = todos.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
          } else {
             // fallback to oldest incomplete if no 'todo'
             todaysDirective = incompleteTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
          }
        }
      }
    }
  }

  return NextResponse.json({ releases, tasks, activity, todaysDirective });
}
