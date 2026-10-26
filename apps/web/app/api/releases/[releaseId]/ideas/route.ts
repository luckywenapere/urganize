import { NextRequest, NextResponse } from 'next/server';
import { afterResponse } from '@/lib/after-response';
import { getTranscriptionConfig } from '@/lib/chappi/config';
import { MAX_IDEA_LENGTH } from '@/lib/rollout-ideas';
import {
  IDEAS_TABLE,
  loadIdeaNotes,
  loadIdeasPeople,
  notifyIdeaAdded,
  toIdeasPeoplePayload,
} from '@/lib/rollout-ideas-server';
import { loadProfilesByIds } from '@/lib/tasks-server';
import {
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toIdeasRelease,
} from './_shared';

/**
 * A rollout's ideas (2026-10-26): GET every note plus who else is on the
 * rollout (for "Who should chime in?"), POST a new note.
 *
 * Notes are rows in release_messages. A new note pushes everyone else on the
 * rollout and emails the owner, after the reply (afterResponse), and never
 * fails the save.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);

  try {
    const [notes, people, ownerProfiles] = await Promise.all([
      loadIdeaNotes(adminClient, releaseId, auth.user.id),
      loadIdeasPeople(adminClient, release),
      loadProfilesByIds(adminClient, [release.ownerUserId]),
    ]);
    const owner = ownerProfiles.get(release.ownerUserId);
    return NextResponse.json({
      notes,
      people: await toIdeasPeoplePayload(adminClient, people, auth.user.id, release),
      ownerName: String(owner?.name || '').trim() || null,
      isOwner: release.ownerUserId === auth.user.id,
      // The mic shows only when speech can be written down.
      voice: Boolean(getTranscriptionConfig()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load the ideas.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);

  const body = (await request.json().catch(() => ({}))) as { content?: unknown };
  const content = String(body.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'Say or type the idea first.' }, { status: 400 });
  if (content.length > MAX_IDEA_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_IDEA_LENGTH} characters.` }, { status: 400 });
  }

  const insert = await adminClient
    .from(IDEAS_TABLE)
    .insert({ release_id: releaseId, user_id: auth.user.id, content })
    .select('id')
    .maybeSingle();
  if (insert.error) {
    return NextResponse.json({ error: insert.error.message || 'Could not save the note.' }, { status: 500 });
  }

  const noteId = String((insert.data as { id?: string } | null)?.id || '');
  if (noteId) {
    afterResponse('rollout idea notification', () =>
      notifyIdeaAdded(adminClient, { release, noteId, authorId: auth.user.id, content })
    );
  }

  try {
    const notes = await loadIdeaNotes(adminClient, releaseId, auth.user.id);
    return NextResponse.json({ notes }, { status: 201 });
  } catch {
    // Saved; the list just could not be read back. The card reloads it.
    return NextResponse.json({ notes: null }, { status: 201 });
  }
}
