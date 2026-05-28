import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_GROUPS_TABLE,
  TASKS_TABLE,
  buildTaskSchemaResponse,
  createAdminClient,
  requireActiveAuthenticatedUser,
  isTaskSchemaMissingError,
  resolveReleaseTaskWorkspace,
  type TaskGroupRow,
} from '@/lib/tasks-server';
import { type TaskGroup } from '@/lib/tasks';

type UpdateTaskGroupBody = {
  name?: unknown;
  position?: unknown;
  confirm?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();

function toTaskGroup(row: TaskGroupRow, taskCount = 0): TaskGroup {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    releaseId: row.release_id,
    name: row.name,
    position: row.position,
    taskCount,
    createdAt: row.created_at,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; groupId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { releaseId, groupId } = await context.params;

  try {
    const releaseContext = await resolveReleaseTaskWorkspace(adminClient, releaseId, auth.user);
    const body = (await request.json().catch(() => ({}))) as UpdateTaskGroupBody;
    const name = readString(body.name);
    const position = Number.isInteger(Number(body.position)) ? Number(body.position) : null;

    if (!name && position === null) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const updateResult = await adminClient
      .from(TASK_GROUPS_TABLE)
      .update({
        ...(name ? { name } : {}),
        ...(position !== null ? { position } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', groupId)
      .eq('workspace_id', releaseContext.workspaceId)
      .eq('release_id', releaseId)
      .select('id,workspace_id,release_id,name,position,created_at,updated_at')
      .maybeSingle();

    if (updateResult.error || !updateResult.data) {
      if (isTaskSchemaMissingError(updateResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: updateResult.error?.message || 'Could not update task group.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ group: toTaskGroup(updateResult.data as TaskGroupRow) });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update task group.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; groupId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { releaseId, groupId } = await context.params;

  try {
    const releaseContext = await resolveReleaseTaskWorkspace(adminClient, releaseId, auth.user);
    const body = (await request.json().catch(() => ({}))) as UpdateTaskGroupBody;
    const confirmDelete = body.confirm === true;

    const groupResult = await adminClient
      .from(TASK_GROUPS_TABLE)
      .select('id,workspace_id,release_id,name,position,created_at,updated_at')
      .eq('id', groupId)
      .eq('workspace_id', releaseContext.workspaceId)
      .eq('release_id', releaseId)
      .maybeSingle();

    if (groupResult.error) {
      if (isTaskSchemaMissingError(groupResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: groupResult.error.message || 'Could not load task group.' },
        { status: 500 }
      );
    }

    if (!groupResult.data) {
      return NextResponse.json({ error: 'Task group not found.' }, { status: 404 });
    }

    const [tasksResult, fallbackGroupResult] = await Promise.all([
      adminClient.from(TASKS_TABLE).select('id').eq('group_id', groupId).eq('workspace_id', releaseContext.workspaceId),
      adminClient
        .from(TASK_GROUPS_TABLE)
        .select('id,workspace_id,release_id,name,position,created_at,updated_at')
        .eq('workspace_id', releaseContext.workspaceId)
        .eq('release_id', releaseId)
        .neq('id', groupId)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (tasksResult.error || fallbackGroupResult.error) {
      const routeError = tasksResult.error || fallbackGroupResult.error;
      if (isTaskSchemaMissingError(routeError)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: routeError?.message || 'Could not prepare task group deletion.' },
        { status: 500 }
      );
    }

    const taskCount = Array.isArray(tasksResult.data) ? tasksResult.data.length : 0;
    if (taskCount > 0 && !confirmDelete) {
      return NextResponse.json(
        { error: 'This group still has tasks.', taskCount },
        { status: 409 }
      );
    }

    let fallbackGroupId = readString(fallbackGroupResult.data?.id) || '';
    if (taskCount > 0 && !fallbackGroupId) {
      const insertResult = await adminClient
        .from(TASK_GROUPS_TABLE)
        .insert({
          workspace_id: releaseContext.workspaceId,
          release_id: releaseId,
          name: 'General',
          position: 0,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (insertResult.error || !insertResult.data?.id) {
        if (isTaskSchemaMissingError(insertResult.error)) {
          return buildTaskSchemaResponse();
        }

        return NextResponse.json(
          { error: insertResult.error?.message || 'Could not create a fallback task group.' },
          { status: 500 }
        );
      }

      fallbackGroupId = readString(insertResult.data.id);
    }

    if (taskCount > 0 && fallbackGroupId) {
      const moveTasksResult = await adminClient
        .from(TASKS_TABLE)
        .update({
          group_id: fallbackGroupId,
          updated_at: new Date().toISOString(),
        })
        .eq('group_id', groupId)
        .eq('workspace_id', releaseContext.workspaceId);

      if (moveTasksResult.error) {
        if (isTaskSchemaMissingError(moveTasksResult.error)) {
          return buildTaskSchemaResponse();
        }

        return NextResponse.json(
          { error: moveTasksResult.error.message || 'Could not move tasks out of the group.' },
          { status: 500 }
        );
      }
    }

    const deleteResult = await adminClient
      .from(TASK_GROUPS_TABLE)
      .delete()
      .eq('id', groupId)
      .eq('workspace_id', releaseContext.workspaceId)
      .eq('release_id', releaseId);

    if (deleteResult.error) {
      if (isTaskSchemaMissingError(deleteResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: deleteResult.error.message || 'Could not delete task group.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, movedTaskCount: taskCount, fallbackGroupId: fallbackGroupId || null });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete task group.' },
      { status: 500 }
    );
  }
}
