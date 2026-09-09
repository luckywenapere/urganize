import { NextRequest, NextResponse } from 'next/server';
import {
  NOTES_TABLE,
  NOTE_COLUMNS,
  createAdminClient,
  ensureReleaseOwnership,
  isNotesFeatureEnabled,
  parseNoteBody,
  requireActiveAuthenticatedUser,
  toNote,
} from '../_shared';
import { parseArchivedPatch } from '@/lib/note-archive';

/**
 * Patches a note. Every field is optional and presence-checked with `in`, so
 * the three states of releaseId stay distinguishable:
 *   absent  → leave the link alone
 *   null    → unlink (back to a global note)
 *   string  → link, after checking the caller owns that release
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ noteId: string }> }
) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { noteId } = await context.params;
  if (!noteId) {
    return NextResponse.json({ error: 'Note id is required.' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const updates: Record<string, unknown> = {};

  if ('body' in payload) {
    const parsed = parseNoteBody(payload.body);
    if ('error' in parsed) return parsed.error;
    updates.body = parsed.body;
  }

  if ('pinned' in payload) {
    if (typeof payload.pinned !== 'boolean') {
      return NextResponse.json({ error: 'Pinned must be true or false.' }, { status: 400 });
    }
    updates.pinned = payload.pinned;
  }

  // Archive / restore. `archived` absent means "not part of this patch",
  // which is a different thing from false — conflating them would restore a
  // note every time somebody edited its body. parseArchivedPatch draws that
  // line and refuses a non-boolean, so archiving stays an explicit act.
  if ('archived' in payload) {
    const archived = parseArchivedPatch(payload.archived);
    if (archived === undefined) {
      return NextResponse.json({ error: 'Archived must be true or false.' }, { status: 400 });
    }
    // Stamped server-side. A client-supplied timestamp would let the
    // archived list be reordered by whoever sends the request.
    updates.archived_at = archived ? new Date().toISOString() : null;
  }

  let releaseIdToVerify: string | null = null;
  if ('releaseId' in payload) {
    if (payload.releaseId === null) {
      updates.release_id = null;
    } else if (typeof payload.releaseId === 'string' && payload.releaseId) {
      updates.release_id = payload.releaseId;
      releaseIdToVerify = payload.releaseId;
    } else {
      return NextResponse.json({ error: 'Rollout id must be text or null.' }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  if (releaseIdToVerify) {
    const ownership = await ensureReleaseOwnership(adminClient, releaseIdToVerify, auth.user.id);
    if ('error' in ownership) return ownership.error;
  }

  // Owner scope lives in the statement itself, so there is no read-then-write
  // window: a note belonging to someone else simply matches zero rows.
  const { data, error } = await adminClient
    .from(NOTES_TABLE)
    .update(updates)
    .eq('id', noteId)
    .eq('owner_user_id', auth.user.id)
    .select(NOTE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not save the note.' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }

  return NextResponse.json({ note: toNote(data as Record<string, unknown>) });
}

/**
 * Deletes a note. Idempotent: deleting an already-deleted (or never-owned)
 * note still reports success, so a retry after a dropped response is safe and
 * nothing leaks about whether the id exists.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ noteId: string }> }
) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { noteId } = await context.params;
  if (!noteId) {
    return NextResponse.json({ error: 'Note id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { error } = await adminClient
    .from(NOTES_TABLE)
    .delete()
    .eq('id', noteId)
    .eq('owner_user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not delete the note.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
