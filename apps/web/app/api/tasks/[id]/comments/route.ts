import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  createAdminClient,
  createTaskNotification,
  ensureTaskAccess,
  getAuthenticatedUser,
  isTaskSchemaMissingError,
  loadTaskComments,
  logTaskActivity,
  type TaskRow,
} from '@/lib/tasks-server';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

const TASK_COMMENTS_TABLE = 'task_comments';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

type CreateCommentBody = {
  content?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();

async function findAssigneeUserId(
  adminClient: ReturnType<typeof createAdminClient>,
  task: TaskRow
): Promise<string | null> {
  if (!adminClient || !task.assigned_to) {
    return null;
  }

  const result = await adminClient
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('user_id')
    .eq('id', task.assigned_to)
    .maybeSingle();

  if (result.error) {
    return null;
  }

  return readString(result.data?.user_id) || null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { id } = await context.params;
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const body = (await request.json().catch(() => ({}))) as CreateCommentBody;
    const content = readString(body.content);
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required.' }, { status: 400 });
    }

    const insertResult = await adminClient
      .from(TASK_COMMENTS_TABLE)
      .insert({
        task_id: access.task.id,
        user_id: auth.user.id,
        content,
      })
      .select('id')
      .maybeSingle();

    if (insertResult.error) {
      if (isTaskSchemaMissingError(insertResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: insertResult.error.message || 'Could not add comment.' }, { status: 500 });
    }

    await logTaskActivity(adminClient, {
      taskId: access.task.id,
      actorId: auth.user.id,
      message: 'commented on this task',
    });

    const assigneeUserId = await findAssigneeUserId(adminClient, access.task);
    if (assigneeUserId && assigneeUserId !== auth.user.id) {
      await createTaskNotification(adminClient, {
        userId: assigneeUserId,
        type: 'task_commented',
        taskId: access.task.id,
        actorId: auth.user.id,
      });
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('task_comment_added', {
        task_id: access.task.id,
      })
    );

    const comments = await loadTaskComments(adminClient, access.task.id, auth.user.id);
    return NextResponse.json({ comments }, { status: 201 });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
