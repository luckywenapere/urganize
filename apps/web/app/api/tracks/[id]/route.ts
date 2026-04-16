import { NextRequest, NextResponse } from 'next/server';
import {
  parseTrackPosition,
  sanitizeTrackTitle,
  type UpdateTrackBody,
} from '@/lib/tracks';
import {
  TRACKS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  createSignedTrackUrl,
  ensureTrackOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  removeTrackFromStorage,
  revokeShareLinksForTrack,
  toTrack,
  type TrackRecord,
} from '../_shared';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const trackId = String(id || '').trim();
  if (!trackId) {
    return NextResponse.json({ error: 'Track id is required.' }, { status: 400 });
  }

  const ownership = await ensureTrackOwnership(adminClient, trackId, auth.user.id);
  if ('error' in ownership) {
    return ownership.error;
  }

  const body = (await request.json().catch(() => ({}))) as UpdateTrackBody;
  const title = body.title !== undefined ? sanitizeTrackTitle(body.title) : ownership.track.title;
  const position = body.position !== undefined ? parseTrackPosition(body.position) : ownership.track.position;

  if (!title) {
    return NextResponse.json({ error: 'Track title is required.' }, { status: 400 });
  }

  if (!position) {
    return NextResponse.json({ error: 'Track position is invalid.' }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from(TRACKS_TABLE)
    .update({
      title,
      position,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trackId)
    .eq('user_id', auth.user.id)
    .select('id,release_id,user_id,title,file_url,file_size,duration_seconds,mime_type,waveform_data,status,position,created_at,updated_at')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not update track.' }, { status: 500 });
  }

  const signedResult = await createSignedTrackUrl(adminClient, String(data.file_url || ''));
  if ('error' in signedResult) {
    return signedResult.error;
  }

  return NextResponse.json({
    track: toTrack(data as TrackRecord, signedResult.signedUrl),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const trackId = String(id || '').trim();
  if (!trackId) {
    return NextResponse.json({ error: 'Track id is required.' }, { status: 400 });
  }

  const ownership = await ensureTrackOwnership(adminClient, trackId, auth.user.id);
  if ('error' in ownership) {
    return ownership.error;
  }

  const revokeResult = await revokeShareLinksForTrack(adminClient, ownership.track.id);
  if ('error' in revokeResult) {
    return revokeResult.error;
  }

  const storageRemoval = await removeTrackFromStorage(adminClient, ownership.track.file_url);
  if ('error' in storageRemoval) {
    return storageRemoval.error;
  }

  const { error } = await adminClient
    .from(TRACKS_TABLE)
    .delete()
    .eq('id', ownership.track.id)
    .eq('user_id', auth.user.id);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not delete track.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    trackId: ownership.track.id,
  });
}
