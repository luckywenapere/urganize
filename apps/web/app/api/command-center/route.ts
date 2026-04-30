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
        .select('id,workspace_id,group_id,release_id,created_by,assigned_to,title,description,status,priority,due_date,completed_at,position,requirement,dependencies,state,auto_generated,metadata,created_at,updated_at')
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

  return NextResponse.json({ releases, tasks, activity });
}
