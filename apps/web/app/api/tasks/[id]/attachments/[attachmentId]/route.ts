import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_ATTACHMENTS_TABLE,
  TASK_ATTACHMENTS_BUCKET,
  buildTaskSchemaResponse,
  ensureTaskAccess,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadTaskAttachments,
} from '@/lib/tasks-server';

const readString = (value: unknown): string => String(value || '').trim();

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { id, attachmentId } = await context.params;

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const attachmentResult = await adminClient
      .from(TASK_ATTACHMENTS_TABLE)
      .select('id,storage_path')
      .eq('id', attachmentId)
      .eq('task_id', access.task.id)
      .maybeSingle();

    if (attachmentResult.error) {
      if (isTaskSchemaMissingError(attachmentResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: attachmentResult.error.message || 'Could not load task attachment.' },
        { status: 500 }
      );
    }

    if (!attachmentResult.data) {
      return NextResponse.json({ error: 'Task attachment not found.' }, { status: 404 });
    }

    const storagePath = readString(attachmentResult.data.storage_path);
    if (storagePath) {
      await adminClient.storage.from(TASK_ATTACHMENTS_BUCKET).remove([storagePath]);
    }

    const deleteResult = await adminClient
      .from(TASK_ATTACHMENTS_TABLE)
      .delete()
      .eq('id', attachmentId)
      .eq('task_id', access.task.id);

    if (deleteResult.error) {
      if (isTaskSchemaMissingError(deleteResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: deleteResult.error.message || 'Could not delete task attachment.' },
        { status: 500 }
      );
    }

    const attachments = await loadTaskAttachments(adminClient, access.task.id);
    return NextResponse.json({ attachments });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete task attachment.' },
      { status: 500 }
    );
  }
}
