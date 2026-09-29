import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_MESSAGES_TABLE,
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  isReleaseChatEnabled,
  loadReleaseMessages,
  notFoundResponse,
  requireActiveAuthenticatedUser,
} from '../_shared';

const readString = (value: unknown): string => String(value || '').trim();

type UpdateMessageBody = {
  content?: unknown;
};

/**
 * Edit or delete one message. Scoped to the AUTHOR — matching
 * task_comments' PATCH/DELETE, own-row edits/deletes only, never a
 * moderator override — via `.eq('user_id', auth.user.id)` below, so a write
 * that targets someone else's message simply matches zero rows rather than
 * needing a separate ownership check.
 */

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; messageId: string }> }
) {
  if (!isReleaseChatEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, messageId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => ({}))) as UpdateMessageBody;
  const content = readString(body.content);
  if (!content) {
    return NextResponse.json({ error: 'Message content is required.' }, { status: 400 });
  }

  const updateResult = await adminClient
    .from(RELEASE_MESSAGES_TABLE)
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('release_id', releaseId)
    .eq('user_id', auth.user.id);

  if (updateResult.error) {
    return NextResponse.json(
      { error: updateResult.error.message || 'Could not update the message.' },
      { status: 500 }
    );
  }

  try {
    const messages = await loadReleaseMessages(adminClient, releaseId, auth.user.id);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load messages.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; messageId: string }> }
) {
  if (!isReleaseChatEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, messageId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const deleteResult = await adminClient
    .from(RELEASE_MESSAGES_TABLE)
    .delete()
    .eq('id', messageId)
    .eq('release_id', releaseId)
    .eq('user_id', auth.user.id);

  if (deleteResult.error) {
    return NextResponse.json(
      { error: deleteResult.error.message || 'Could not delete the message.' },
      { status: 500 }
    );
  }

  try {
    const messages = await loadReleaseMessages(adminClient, releaseId, auth.user.id);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load messages.' },
      { status: 500 }
    );
  }
}
