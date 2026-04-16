import { NextRequest, NextResponse } from 'next/server';
import { sortTasks, type AllTasksResponse } from '@/lib/tasks';
import {
  TASKS_TABLE,
  buildTaskSchemaResponse,
  createAdminClient,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadTasks,
  loadWorkspaceAccessContext,
  normalizeTaskFilters,
  type TaskRow,
} from '@/lib/tasks-server';

const readString = (value: unknown): string => String(value || '').trim();

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;

    if (!workspaceId) {
      const empty: AllTasksResponse = { grouped: [] };
      return NextResponse.json(empty);
    }

    const filters = normalizeTaskFilters(request.nextUrl.searchParams);
    let query = adminClient
      .from(TASKS_TABLE)
      .select('id,workspace_id,group_id,release_id,created_by,assigned_to,title,description,status,priority,due_date,completed_at,position,metadata,created_at,updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    if (filters.releaseId) {
      query = query.eq('release_id', filters.releaseId);
    }

    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const result = await query;
    if (result.error) {
      if (isTaskSchemaMissingError(result.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: result.error.message || 'Could not load tasks.' }, { status: 500 });
    }

    const tasks = sortTasks(
      await loadTasks(adminClient, Array.isArray(result.data) ? (result.data as TaskRow[]) : [], auth.user.id),
      filters.sort || 'due_date'
    );

    const groupedMap = new Map<string, AllTasksResponse['grouped'][number]>();
    for (const task of tasks) {
      const groupKey = task.release?.id || 'no-release';
      const existing = groupedMap.get(groupKey);
      if (existing) {
        existing.tasks.push(task);
        continue;
      }

      groupedMap.set(groupKey, {
        release: task.release,
        tasks: [task],
      });
    }

    const grouped = Array.from(groupedMap.values()).sort((left, right) => {
      if (!left.release && right.release) {
        return 1;
      }

      if (left.release && !right.release) {
        return -1;
      }

      return readString(left.release?.title).localeCompare(readString(right.release?.title));
    });

    return NextResponse.json({
      grouped,
      filters,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load tasks.' },
      { status: 500 }
    );
  }
}
