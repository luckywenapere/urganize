import { NextRequest, NextResponse } from 'next/server';
import { ensureReleaseOwnership } from '@/app/api/releases/_shared';
import {
  createAdminClient,
  getAuthenticatedUser,
  loadTracksForRelease,
} from '@/app/api/tracks/_shared';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { releaseId } = await context.params;
  const normalizedReleaseId = String(releaseId || '').trim();
  if (!normalizedReleaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, normalizedReleaseId, auth.user.id);
  if ('error' in ownership) {
    return ownership.error;
  }

  const tracksResult = await loadTracksForRelease(adminClient, normalizedReleaseId);
  if ('error' in tracksResult) {
    return tracksResult.error;
  }

  return NextResponse.json({
    tracks: tracksResult.tracks,
  });
}
