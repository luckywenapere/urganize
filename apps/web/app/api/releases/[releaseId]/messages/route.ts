import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_MESSAGES_TABLE,
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isReleaseChatEnabled,
  loadReleaseMessages,
  notFoundResponse,
  requireActiveAuthenticatedUser,
} from './_shared';

/**
 * The chat thread on a release: read every message, post a new one.
 *
 * Visibility matches general release access exactly (owner or any member of
 * the owner's workspace, artist scope enforced) — unlike a task thread,
 * which is narrower (see hasTaskThreadAccess in lib/tasks-server.ts). The
 * PRD asks for the release thread to be visible to "everyone with release
 * access", which is exactly what ensureReleaseTeamReadAccess already grants.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isReleaseChatEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

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

type CreateMessageBody = {
  content?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isReleaseChatEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => ({}))) as CreateMessageBody;
  const content = readString(body.content);
  if (!content) {
    return NextResponse.json({ error: 'Message content is required.' }, { status: 400 });
  }

  const insertResult = await adminClient
    .from(RELEASE_MESSAGES_TABLE)
    .insert({
      release_id: releaseId,
      user_id: auth.user.id,
      content,
    })
    .select('id')
    .maybeSingle();

  if (insertResult.error) {
    return NextResponse.json(
      { error: insertResult.error.message || 'Could not send the message.' },
      { status: 500 }
    );
  }

  try {
    const messages = await loadReleaseMessages(adminClient, releaseId, auth.user.id);
    return NextResponse.json({ messages }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load messages.' },
      { status: 500 }
    );
  }
}
