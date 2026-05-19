import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_ATTACHMENTS_TABLE,
  TASK_ATTACHMENTS_BUCKET,
  buildTaskSchemaResponse,
  createAdminClient,
  ensureTaskAccess,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const taskService = new TaskService(adminClient);

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    const task = await taskService.getTaskById(id, auth.user.id);
    return NextResponse.json({ task });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load task.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const taskService = new TaskService(adminClient);

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    const body = await request.json();
    await taskService.updateTask(id, auth.user.id, body);
    const task = await taskService.getTaskById(id, auth.user.id);

    return NextResponse.json({ task });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update task.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const taskService = new TaskService(adminClient);

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    // Clean up attachments
    const attachmentResult = await adminClient
      .from(TASK_ATTACHMENTS_TABLE)
      .select('id,storage_path')
      .eq('task_id', id);

    if (!attachmentResult.error && Array.isArray(attachmentResult.data)) {
      const storagePaths = attachmentResult.data
        .map((attachment) => String(attachment.storage_path || '').trim())
        .filter(Boolean);

      if (storagePaths.length) {
        await adminClient.storage.from(TASK_ATTACHMENTS_BUCKET).remove(storagePaths);
      }
    }

    await taskService.deleteTask(id, access.task.workspace_id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete task.' },
      { status: 500 }
    );
  }
}
