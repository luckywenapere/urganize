import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_ATTACHMENTS_TABLE,
  TASK_ATTACHMENTS_BUCKET,
  WORKSPACE_MEMBERS_TABLE,
  WORKSPACES_TABLE,
  buildReadOnlyResponse,
  buildTaskSchemaResponse,
  createTaskNotification,
  ensureTaskAccess,
  isReadOnlyWorkspaceMember,
  loadTaskDetail,
  requireAuthenticatedAdmin,
  requireAuthenticatedAdminOrInternal,
  isTaskSchemaMissingError,
  type TaskRow,
} from '@/lib/tasks-server';
import { TaskService } from '@/lib/services/task-service';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

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
  groupName: 'group_name',
  group_name: 'group_name',
  groupColor: 'group_color',
  group_color: 'group_color',
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
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const { id } = await context.params;

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    // ensureTaskAccess already fetched the row — hydrate from it instead of
    // re-selecting the same task.
    const task = await loadTaskDetail(adminClient, access.task, auth.user.id);
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
  // *OrInternal: the Chappi/MCP tool layer updates tasks by calling this route
  // internally, so it also accepts the MCP internal actor (URG-183).
  const auth = await requireAuthenticatedAdminOrInternal(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const { id } = await context.params;
  const taskService = new TaskService(adminClient);
  const posthogServer = createServerPostHogClient();

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    // Guests are read-only (founder decision, 2026-07-23).
    if (isReadOnlyWorkspaceMember(access.access, access.task.workspace_id)) {
      return buildReadOnlyResponse();
    }

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
          { error: 'Cannot assign an activity to someone outside your team.' },
          { status: 400 }
        );
      }
    }

    const previousAssigneeUserId = access.task.assigned_to_user_id;
    const previousStatus = access.task.status;

    // Activation timing: fire time_to_first_completed_task once per account,
    // on the first transition into 'done' of any task assigned to this user.
    // The count runs BEFORE the update below, so 0 means this is the first.
    // (Template instantiation assigns every generated task to the release
    // owner, so "assigned to me + done" is the right first-completion proxy.)
    let isFirstCompletion = false;
    if (mapped.updates.status === 'done' && previousStatus !== 'done') {
      const priorDoneCountResult = await adminClient
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to_user_id', auth.user.id)
        .eq('status', 'done');
      isFirstCompletion = !priorDoneCountResult.error && priorDoneCountResult.count === 0;
    }

    // updateTask returns the fresh post-update row via .select() — hydrate
    // from that instead of a third select of the same task. (access.task
    // would be STALE here; it predates the update.)
    const updatedRow = await taskService.updateTask(id, auth.user.id, mapped.updates);
    const task = updatedRow
      ? await loadTaskDetail(adminClient, updatedRow as TaskRow, auth.user.id)
      : await taskService.getTaskById(id, auth.user.id);

    // Notification types defined for these two events but never fired
    // anywhere until now — see lib/tasks.ts's NOTIFICATION_TYPE_OPTIONS and
    // getNotificationMessage, which already had copy for both. Fire-and-forget:
    // a notification failure shouldn't fail a task update that already
    // succeeded (createTaskNotification swallows its own errors internally).
    const nextAssigneeUserId =
      typeof mapped.updates.assigned_to_user_id === 'string'
        ? mapped.updates.assigned_to_user_id
        : null;
    if (
      nextAssigneeUserId &&
      nextAssigneeUserId !== previousAssigneeUserId &&
      nextAssigneeUserId !== auth.user.id
    ) {
      void createTaskNotification(adminClient, {
        userId: nextAssigneeUserId,
        type: 'task_assigned',
        taskId: id,
        actorId: auth.user.id,
      });
    }

    if (
      typeof mapped.updates.status === 'string' &&
      mapped.updates.status !== previousStatus
    ) {
      // Notify whoever the task is assigned to now (or was, if this same
      // request also cleared the assignee) — not the actor themself.
      const notifyUserId = nextAssigneeUserId ?? previousAssigneeUserId;
      if (notifyUserId && notifyUserId !== auth.user.id) {
        void createTaskNotification(adminClient, {
          userId: notifyUserId,
          type: 'task_status_changed',
          taskId: id,
          actorId: auth.user.id,
        });
      }
    }

    if (isFirstCompletion) {
      const signupMs = new Date(auth.user.created_at || '').getTime();
      if (Number.isFinite(signupMs)) {
        captureServerAnalyticsEvent(
          posthogServer,
          auth.user.id,
          createPostHogEvent('time_to_first_completed_task', {
            seconds_since_signup: Math.max(0, Math.round((Date.now() - signupMs) / 1000)),
          })
        );
      }
    }

    return NextResponse.json({ task });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) return buildTaskSchemaResponse();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update task.' },
      { status: 500 }
    );
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const { id } = await context.params;
  const taskService = new TaskService(adminClient);

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    // Guests are read-only (founder decision, 2026-07-23).
    if (isReadOnlyWorkspaceMember(access.access, access.task.workspace_id)) {
      return buildReadOnlyResponse();
    }

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
