import { NextRequest, NextResponse } from 'next/server';
import {
  createMusicServiceClient,
  loadStreamableTrack,
  optionalUserId,
  recordPlay,
} from '@/lib/music/server';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_ID_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Count one play. PUBLIC: the player calls it once a listener has heard 30
 * seconds, signed in or not. It always answers 204, because a listener cannot
 * do anything about a play that was not counted and must never see an error
 * for it.
 *
 * Only a song that is live can collect plays, so an unpublished or taken down
 * song cannot be pumped by calling this directly. One listener adds one play to
 * one song per half hour (lib/music/rules.ts shouldCountPlay).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await context.params;
  if (!trackId || !UUID_SHAPE.test(trackId)) return new NextResponse(null, { status: 204 });

  const adminClient = createMusicServiceClient();
  if (!adminClient) return new NextResponse(null, { status: 204 });

  const body = (await request.json().catch(() => null)) as { anonId?: unknown } | null;
  const anonId =
    typeof body?.anonId === 'string' && ANON_ID_SHAPE.test(body.anonId) ? body.anonId : null;
  const userId = await optionalUserId(request);

  if (await loadStreamableTrack(adminClient, trackId)) {
    await recordPlay(adminClient, { trackId, userId, anonId });
  }
  return new NextResponse(null, { status: 204 });
}
