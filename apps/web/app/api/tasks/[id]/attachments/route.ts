import { NextRequest, NextResponse } from 'next/server';
import {
  TASK_ATTACHMENTS_TABLE,
  TASK_ATTACHMENTS_BUCKET,
  buildStoragePathForTaskAttachment,
  buildTaskSchemaResponse,
  createAdminClient,
  ensureTaskAccess,
  requireActiveAuthenticatedUser,
  isTaskSchemaMissingError,
  loadTaskAttachments,
} from '@/lib/tasks-server';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Attachment form data is required.' }, { status: 400 });
    }

    const uploadFile = formData.get('file');
    if (!(uploadFile instanceof File)) {
      return NextResponse.json({ error: 'Attachment file is required.' }, { status: 400 });
    }

    const storagePath = buildStoragePathForTaskAttachment(auth.user.id, access.task.id, uploadFile.name);
    const fileBuffer = Buffer.from(await uploadFile.arrayBuffer());
    const uploadResult = await adminClient.storage
      .from(TASK_ATTACHMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: uploadFile.type || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadResult.error) {
      return NextResponse.json(
        { error: uploadResult.error.message || 'Could not upload task attachment.' },
        { status: 500 }
      );
    }

    const insertResult = await adminClient
      .from(TASK_ATTACHMENTS_TABLE)
      .insert({
        task_id: access.task.id,
        user_id: auth.user.id,
        file_url: storagePath,
        file_name: uploadFile.name,
        file_size: Number(uploadFile.size || 0),
        storage_path: storagePath,
      });

    if (insertResult.error) {
      if (isTaskSchemaMissingError(insertResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: insertResult.error.message || 'Could not save task attachment.' },
        { status: 500 }
      );
    }

    const attachments = await loadTaskAttachments(adminClient, access.task.id);
    return NextResponse.json({ attachments }, { status: 201 });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not upload task attachment.' },
      { status: 500 }
    );
  }
}
