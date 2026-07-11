import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_GROUPS_TABLE,
  buildTaskSchemaResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  resolveReleaseTaskWorkspace,
  type TaskGroupRow,
} from '@/lib/tasks-server';
import { type TaskGroup } from '@/lib/tasks';

type CreateTaskGroupBody = {
  name?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();

function toTaskGroup(row: TaskGroupRow): TaskGroup {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    releaseId: row.release_id,
    name: row.name,
    position: row.position,
    taskCount: 0,
    createdAt: row.created_at,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { releaseId } = await context.params;

  try {
    const releaseContext = await resolveReleaseTaskWorkspace(adminClient, releaseId, auth.user);
    const body = (await request.json().catch(() => ({}))) as CreateTaskGroupBody;
    const name = readString(body.name);

    if (!name) {
      return NextResponse.json({ error: 'Group name is required.' }, { status: 400 });
    }

    const lastGroupResult = await adminClient
      .from(TASK_GROUPS_TABLE)
      .select('position')
      .eq('workspace_id', releaseContext.workspaceId)
      .eq('release_id', releaseId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastGroupResult.error) {
      if (isTaskSchemaMissingError(lastGroupResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: lastGroupResult.error.message || 'Could not prepare the task group.' },
        { status: 500 }
      );
    }

    const insertResult = await adminClient
      .from(TASK_GROUPS_TABLE)
      .insert({
        workspace_id: releaseContext.workspaceId,
        release_id: releaseId,
        name,
        position: Number(lastGroupResult.data?.position || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .select('id,workspace_id,release_id,name,position,created_at,updated_at')
      .maybeSingle();

    if (insertResult.error || !insertResult.data) {
      if (isTaskSchemaMissingError(insertResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: insertResult.error?.message || 'Could not create task group.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ group: toTaskGroup(insertResult.data as TaskGroupRow) }, { status: 201 });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create task group.' },
      { status: 500 }
    );
  }
}
