import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadPublicPack, logPackAccess } from '@/lib/dj-pack-server';

export const dynamic = 'force-dynamic';

/** Long enough to start a download on a bad connection, short enough that a
 *  URL copied out of the network tab is not a lasting handout. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * One track, handed over.
 *
 * UNAUTHENTICATED BY DESIGN — the token is the whole access control, exactly
 * as it is for the press kit and the credits form. Everything downstream is
 * therefore resolved FROM the token: the caller names a file, and it is
 * honoured only if that file is one of the tracks this token's set sends.
 * Without that check a valid token would be a key to every file in the
 * database. A cancelled show or an expired link serves nothing.
 *
 * The signed URL carries a download name, so the file lands as
 * "01 Dorian - Lagos Nights (Clean)[102BPM][Am].mp3" rather than a UUID. That
 * naming is the difference between a pack a DJ uses and one they re-sort by
 * hand at the venue.
 *
 * TWO WAYS TO ASK. `mode=redirect` answers with a redirect straight to the
 * file, which is what the pack page's plain links use: a link works with no
 * JavaScript at all, in any browser, which matters on a phone in a dark booth.
 * A failure sends the DJ back to the pack page with a line saying so, never to
 * a page of raw JSON. Without the mode it answers JSON, as it always has, so a
 * pack page already open in someone's browser from before this change keeps
 * working.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const versionId = request.nextUrl.searchParams.get('versionId')?.trim() || '';
  const redirectMode = request.nextUrl.searchParams.get('mode') === 'redirect';

  const fail = () => {
    if (!redirectMode || !token) {
      return NextResponse.json({ error: 'This link is not available.' }, { status: 404 });
    }
    const back = NextResponse.redirect(
      new URL(`/pack/${encodeURIComponent(token)}?download=failed`, request.url),
      303
    );
    back.headers.set('Cache-Control', 'no-store');
    return back;
  };

  if (!token || !versionId) return fail();

  const pack = await loadPublicPack(token);
  if (pack.state !== 'ok') return fail();

  // The requested file has to be one of THIS pack's tracks.
  const track = pack.tracks.find((entry) => entry.kind === 'song' && entry.versionId === versionId);
  if (!track) return fail();

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return fail();

  try {
    const client = createClient(url, key, { auth: { persistSession: false } });

    const versionResult = await client
      .from('song_versions')
      .select('storage_bucket,storage_path')
      .eq('id', versionId)
      .maybeSingle();

    const version = versionResult.data as Record<string, unknown> | null;
    if (!version) return fail();

    const signed = await client.storage
      .from(String(version.storage_bucket || 'release-assets'))
      .createSignedUrl(String(version.storage_path || ''), DOWNLOAD_URL_TTL_SECONDS, {
        download: track.downloadName,
      });

    if (signed.error || !signed.data?.signedUrl) return fail();

    await logPackAccess({
      packId: pack.packId,
      recipientId: pack.recipientId,
      recipientName: pack.recipientName,
      action: 'downloaded_track',
      songTitle: track.title,
      versionLabel: track.versionLabel,
      songVersionId: versionId,
    });

    if (redirectMode) {
      const onward = NextResponse.redirect(signed.data.signedUrl, 303);
      // The redirect carries a live signed URL, so nothing may keep a copy.
      onward.headers.set('Cache-Control', 'no-store');
      return onward;
    }
    return NextResponse.json({ url: signed.data.signedUrl, fileName: track.downloadName });
  } catch {
    return fail();
  }
}
