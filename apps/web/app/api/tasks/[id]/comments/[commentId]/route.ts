import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  ensureTaskThreadAccess,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadTaskComments,
  logTaskActivity,
} from '@/lib/tasks-server';

const TASK_COMMENTS_TABLE = 'task_comments';

const readString = (value: unknown): string => String(value || '').trim();

type UpdateCommentBody = {
  content?: unknown;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; commentId: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { id, commentId } = await context.params;

  try {
    const access = await ensureTaskThreadAccess(adminClient, id, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const body = (await request.json().catch(() => ({}))) as UpdateCommentBody;
    const content = readString(body.content);
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required.' }, { status: 400 });
    }

    const updateResult = await adminClient
      .from(TASK_COMMENTS_TABLE)
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('task_id', access.task.id)
      .eq('user_id', auth.user.id);

    if (updateResult.error) {
      if (isTaskSchemaMissingError(updateResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: updateResult.error.message || 'Could not update comment.' }, { status: 500 });
    }

    await logTaskActivity(adminClient, {
      taskId: access.task.id,
      actorId: auth.user.id,
      message: 'edited a comment',
    });

    const comments = await loadTaskComments(adminClient, access.task.id, auth.user.id);
    return NextResponse.json({ comments });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update comment.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; commentId: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { id, commentId } = await context.params;

  try {
    const access = await ensureTaskThreadAccess(adminClient, id, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const deleteResult = await adminClient
      .from(TASK_COMMENTS_TABLE)
      .delete()
      .eq('id', commentId)
      .eq('task_id', access.task.id)
      .eq('user_id', auth.user.id);

    if (deleteResult.error) {
      if (isTaskSchemaMissingError(deleteResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json({ error: deleteResult.error.message || 'Could not delete comment.' }, { status: 500 });
    }

    await logTaskActivity(adminClient, {
      taskId: access.task.id,
      actorId: auth.user.id,
      message: 'deleted a comment',
    });

    const comments = await loadTaskComments(adminClient, access.task.id, auth.user.id);
    return NextResponse.json({ comments });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete comment.' },
      { status: 500 }
    );
  }
}
