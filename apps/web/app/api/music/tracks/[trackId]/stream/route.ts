import { NextRequest, NextResponse } from 'next/server';
import { generateSignedUrl } from '@/lib/asset-helpers';
import {
  MUSIC_STREAM_TTL_SECONDS,
  createMusicServiceClient,
  loadStreamableTrack,
} from '@/lib/music/server';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The audio of one song, for the player's <audio> element. PUBLIC, like the
 * list. It answers with a redirect to a short signed storage link, and only for
 * a song that is live right now: an unpublished, scheduled, taken down or
 * trashed song is a plain 404, so a guessed id learns nothing.
 *
 * The link is never cached by anyone (a taken down song must stop at once), but
 * the browser still gets Range support from storage, so seeking works.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await context.params;
  if (!trackId || !UUID_SHAPE.test(trackId)) {
    return NextResponse.json({ error: 'Song not found.' }, { status: 404 });
  }

  const adminClient = createMusicServiceClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const file = await loadStreamableTrack(adminClient, trackId);
  if (!file) {
    return NextResponse.json({ error: 'Song not found.' }, { status: 404 });
  }

  const url = await generateSignedUrl(adminClient, file.bucket, file.path, MUSIC_STREAM_TTL_SECONDS);
  if (!url) {
    return NextResponse.json({ error: 'Could not play that song.' }, { status: 502 });
  }

  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
