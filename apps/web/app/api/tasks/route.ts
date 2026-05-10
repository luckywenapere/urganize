import { NextRequest, NextResponse } from 'next/server';
import { groupTasksIntoSections } from '@/lib/tasks';
import {
  TASKS_TABLE,
  buildTaskSchemaResponse,
  createAdminClient,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
  ensureWorkspaceAccess,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const taskService = new TaskService(adminClient);

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.membershipIds.length) {
      return NextResponse.json({ tasks: [], sections: groupTasksIntoSections([]) });
    }

    const releaseId = request.nextUrl.searchParams.get('release');
    const priority = request.nextUrl.searchParams.get('priority') || undefined;
    const status = request.nextUrl.searchParams.get('status') || undefined;

    const tasks = await taskService.getTasksForUser(auth.user.id, access.workspaceIds, {
      releaseId,
      priority,
      status,
    });

    const createdTasksResult = await adminClient
      .from(TASKS_TABLE)
      .select('id', { count: 'exact', head: true })
      .in('workspace_id', access.workspaceIds)
      .eq('created_by', auth.user.id);

    const createdTaskCount = createdTasksResult.count || 0;

    return NextResponse.json({
      tasks,
      sections: groupTasksIntoSections(tasks),
      createdTaskCount,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load tasks.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const taskService = new TaskService(adminClient);

  try {
    const body = await request.json();
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = body.workspaceId || access.primaryWorkspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const workspaceAccess = await ensureWorkspaceAccess(adminClient, workspaceId, auth.user);
    if ('error' in workspaceAccess) return workspaceAccess.error;

    const task = await taskService.createTask(auth.user.id, workspaceId, body);

    return NextResponse.json({ task });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create task.' },
      { status: 500 }
    );
  }
}
