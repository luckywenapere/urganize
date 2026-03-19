import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureNoteOwnership,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  RELEASE_NOTES_SQL,
  RELEASE_NOTES_TABLE,
} from '../_shared';
import { normalizeReleaseNoteInput, validateReleaseNoteInput } from '@/lib/release-notes';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ noteId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { noteId } = await context.params;
  if (!noteId) return NextResponse.json({ error: 'Note id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureNoteOwnership(adminClient, noteId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const note = normalizeReleaseNoteInput(body?.note);
  const validationError = validateReleaseNoteInput(note);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (note.releaseId) {
    const releaseOwnership = await ensureReleaseOwnership(adminClient, note.releaseId, auth.user.id);
    if ('error' in releaseOwnership) return releaseOwnership.error;
  }

  const { error } = await adminClient!
    .from(RELEASE_NOTES_TABLE)
    .update({
      release_id: note.releaseId || null,
      title: note.title,
      content: note.content,
      note_type: note.noteType || null,
      is_pinned: note.isPinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .eq('user_id', auth.user.id);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Release notes table is missing.', sql: RELEASE_NOTES_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not update note.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'saved' });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ noteId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { noteId } = await context.params;
  if (!noteId) return NextResponse.json({ error: 'Note id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureNoteOwnership(adminClient, noteId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { error } = await adminClient!
    .from(RELEASE_NOTES_TABLE)
    .delete()
    .eq('id', noteId)
    .eq('user_id', auth.user.id);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Release notes table is missing.', sql: RELEASE_NOTES_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not delete note.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'deleted' });
}
