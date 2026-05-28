import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_ATTACHMENTS_TABLE,
  TASK_ATTACHMENTS_BUCKET,
  WORKSPACE_MEMBERS_TABLE,
  WORKSPACES_TABLE,
  buildTaskSchemaResponse,
  createAdminClient,
  ensureTaskAccess,
  requireActiveAuthenticatedUser,
  isTaskSchemaMissingError,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';

// Allowed PATCH body fields → tasks-table column names. The route is the API
// boundary that translates camelCase client payloads into snake_case columns
// and rejects anything not on this list. Keeps the dual `assigned_to` /
// `assigned_to_user_id` ambiguity out of the wire format: only
// `assigned_to_user_id` is writable in v1.
const TASK_PATCH_FIELD_MAP: Record<string, string> = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  dueDate: 'due_date',
  due_date: 'due_date',
  assignedToUserId: 'assigned_to_user_id',
  assigned_to_user_id: 'assigned_to_user_id',
  dependencies: 'dependencies',
  position: 'position',
  state: 'state',
  releaseId: 'release_id',
  release_id: 'release_id',
  groupId: 'group_id',
  group_id: 'group_id',
  requirement: 'requirement',
};

function mapTaskPatchBody(body: unknown): { updates: Record<string, unknown> } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object.' };
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const column = TASK_PATCH_FIELD_MAP[key];
    if (!column) {
      return { error: `Unknown field: ${key}` };
    }
    updates[column] = value;
  }

  return { updates };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
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
  const auth = await requireActiveAuthenticatedUser(request);
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
    const mapped = mapTaskPatchBody(body);
    if ('error' in mapped) {
      return NextResponse.json({ error: mapped.error }, { status: 400 });
    }

    // Validate the assignee belongs to the task's workspace. null is allowed
    // (unassignment); absent field is skipped. A user qualifies as either an
    // active workspace_members row OR the workspace owner.
    if (typeof mapped.updates.assigned_to_user_id === 'string') {
      const targetUserId = mapped.updates.assigned_to_user_id;
      const workspaceId = access.task.workspace_id;
      const [memberResult, ownerResult] = await Promise.all([
        adminClient
          .from(WORKSPACE_MEMBERS_TABLE)
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', targetUserId)
          .eq('status', 'active')
          .maybeSingle(),
        adminClient
          .from(WORKSPACES_TABLE)
          .select('id')
          .eq('id', workspaceId)
          .eq('owner_id', targetUserId)
          .maybeSingle(),
      ]);

      if (memberResult.error) throw memberResult.error;
      if (ownerResult.error) throw ownerResult.error;

      if (!memberResult.data && !ownerResult.data) {
        return NextResponse.json(
          { error: 'Cannot assign task to user outside workspace.' },
          { status: 400 }
        );
      }
    }

    await taskService.updateTask(id, auth.user.id, mapped.updates);
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
  const auth = await requireActiveAuthenticatedUser(request);
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
