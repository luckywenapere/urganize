import { NextRequest, NextResponse } from 'next/server';
import {
  TASKS_TABLE,
  buildTaskSchemaResponse,
  createAdminClient,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadTaskDetail,
  loadWorkspaceAccessContext,
  type TaskRow,
} from '@/lib/tasks-server';

type ReorderTaskInput = {
  id?: unknown;
  groupId?: unknown;
  position?: unknown;
};

type ReorderBody = {
  tasks?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();
const readNullableString = (value: unknown): string | null => {
  const normalized = readString(value);
  return normalized || null;
};

export async function PATCH(request: NextRequest) {
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
    if (!access.workspaceIds.length) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as ReorderBody;
    const items = Array.isArray(body.tasks) ? (body.tasks as ReorderTaskInput[]) : [];
    if (!items.length) {
      return NextResponse.json({ error: 'Task reorder payload is required.' }, { status: 400 });
    }

    const taskIds = items.map((item) => readString(item.id)).filter(Boolean);
    if (!taskIds.length) {
      return NextResponse.json({ error: 'Task ids are required.' }, { status: 400 });
    }

    const tasksResult = await adminClient
      .from(TASKS_TABLE)
      .select('id,workspace_id,group_id,release_id,created_by,assigned_to,title,description,status,priority,due_date,completed_at,position,requirement,dependencies,state,auto_generated,metadata,created_at,updated_at')
      .in('id', taskIds)
      .in('workspace_id', access.workspaceIds);

    if (tasksResult.error) {
      if (isTaskSchemaMissingError(tasksResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: tasksResult.error.message || 'Could not load tasks.' }, { status: 500 });
    }

    const rows = Array.isArray(tasksResult.data) ? (tasksResult.data as TaskRow[]) : [];
    if (rows.length !== taskIds.length) {
      return NextResponse.json({ error: 'One or more tasks were not found.' }, { status: 404 });
    }

    const rowById = new Map(rows.map((row) => [row.id, row] as const));
    const now = new Date().toISOString();

    await Promise.all(
      items.map((item, index) => {
        const id = readString(item.id);
        const row = rowById.get(id);
        if (!row) {
          return Promise.resolve(null);
        }

        const nextGroupId = item.groupId === undefined ? row.group_id : readNullableString(item.groupId);
        const nextPosition = Number.isInteger(Number(item.position)) ? Number(item.position) : index;

        return adminClient
          .from(TASKS_TABLE)
          .update({
            group_id: nextGroupId,
            position: nextPosition,
            updated_at: now,
          })
          .eq('id', id)
          .eq('workspace_id', row.workspace_id);
      })
    );

    const refreshedResult = await adminClient
      .from(TASKS_TABLE)
      .select('id,workspace_id,group_id,release_id,created_by,assigned_to,title,description,status,priority,due_date,completed_at,position,requirement,dependencies,state,auto_generated,metadata,created_at,updated_at')
      .in('id', taskIds)
      .order('position', { ascending: true });

    if (refreshedResult.error) {
      if (isTaskSchemaMissingError(refreshedResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: refreshedResult.error.message || 'Could not reload tasks.' }, { status: 500 });
    }

    const refreshedRows = Array.isArray(refreshedResult.data) ? (refreshedResult.data as TaskRow[]) : [];
    const tasks = await Promise.all(refreshedRows.map((row) => loadTaskDetail(adminClient, row, auth.user.id)));

    return NextResponse.json({ tasks });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not reorder tasks.' },
      { status: 500 }
    );
  }
}
