import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  RELEASE_SONGS_SQL,
  RELEASE_SONGS_TABLE,
} from '../../../_shared';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ planId: string; songId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId, songId } = await context.params;
  if (!planId || !songId) {
    return NextResponse.json({ error: 'Plan id and song id are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { error } = await adminClient!
    .from(RELEASE_SONGS_TABLE)
    .delete()
    .eq('release_id', planId)
    .eq('song_id', songId);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Release song links table is missing.', sql: RELEASE_SONGS_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not remove song from release.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'removed' });
}
