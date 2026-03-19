import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  RELEASE_NOTES_SQL,
  RELEASE_NOTES_TABLE,
} from './_shared';
import { normalizeReleaseNoteInput, validateReleaseNoteInput } from '@/lib/release-notes';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const releaseId = String(request.nextUrl.searchParams.get('releaseId') || '').trim();

  if (releaseId) {
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;
  }

  const notesQuery = adminClient
    .from(RELEASE_NOTES_TABLE)
    .select('id,user_id,release_id,title,content,note_type,is_pinned,created_at,updated_at')
    .eq('user_id', auth.user.id)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (releaseId) {
    notesQuery.eq('release_id', releaseId);
  }

  const [{ data: notesData, error: notesError }, { data: releasesData, error: releasesError }] = await Promise.all([
    notesQuery,
    adminClient
      .from('releases')
      .select('id,title,artist_name')
      .eq('user_id', auth.user.id)
      .order('release_date', { ascending: true, nullsFirst: false }),
  ]);

  const error = notesError || releasesError;
  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Release notes table is missing.', sql: RELEASE_NOTES_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not load notes.' }, { status: 500 });
  }

  const releaseById = new Map(
    (releasesData || []).map((release) => [String(release.id), release])
  );

  return NextResponse.json({
    notes: (notesData || []).map((note) => {
      const linkedRelease = releaseById.get(String(note.release_id || ''));
      return {
        id: String(note.id || ''),
        userId: String(note.user_id || ''),
        releaseId: String(note.release_id || ''),
        title: String(note.title || ''),
        content: String(note.content || ''),
        noteType: String(note.note_type || ''),
        isPinned: Boolean(note.is_pinned),
        createdAt: String(note.created_at || ''),
        updatedAt: String(note.updated_at || ''),
        releaseTitle: String(linkedRelease?.title || ''),
        releaseArtistName: String(linkedRelease?.artist_name || ''),
      };
    }),
    releaseOptions: (releasesData || []).map((release) => ({
      id: String(release.id || ''),
      title: String(release.title || ''),
      artistName: String(release.artist_name || ''),
      label: `${String(release.title || '')} - ${String(release.artist_name || '')}`,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const note = normalizeReleaseNoteInput(body?.note);
  const validationError = validateReleaseNoteInput(note);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (note.releaseId) {
    const ownership = await ensureReleaseOwnership(adminClient, note.releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;
  }

  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from(RELEASE_NOTES_TABLE)
    .insert({
      user_id: auth.user.id,
      release_id: note.releaseId || null,
      title: note.title,
      content: note.content,
      note_type: note.noteType || null,
      is_pinned: note.isPinned,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Release notes table is missing.', sql: RELEASE_NOTES_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not create note.' }, { status: 500 });
  }

  return NextResponse.json({ noteId: String(data?.id || '') });
}
