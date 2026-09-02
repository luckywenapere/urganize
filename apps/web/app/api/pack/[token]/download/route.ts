import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadPublicPack, logPackAccess } from '@/lib/dj-pack-server';

export const dynamic = 'force-dynamic';

/** Long enough to start a download on a bad connection, short enough that a
 *  URL copied out of the network tab is not a lasting handout. */
const DOWNLOAD_URL_TTL_SECONDS = 300;

const notAvailable = () =>
  NextResponse.json({ error: 'This link is not available.' }, { status: 404 });

/**
 * Mints a short-lived URL for one track, and records the download.
 *
 * UNAUTHENTICATED BY DESIGN — the token is the whole access control, exactly
 * as it is for the press kit and the credits form. Everything downstream is
 * therefore resolved FROM the token: the caller names a version id, and it is
 * honoured only if that version is actually in the set this token points at.
 * Without that check a valid token would be a key to every file in the
 * database.
 *
 * The signed URL carries a download name, so the file lands as
 * "01 Dorian - Lagos Nights (Clean)[102BPM][Am].mp3" rather than a UUID. That
 * naming is the difference between a pack a DJ uses and one they re-sort by
 * hand at the venue.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const versionId = request.nextUrl.searchParams.get('versionId')?.trim() || '';
  if (!token || !versionId) return notAvailable();

  const pack = await loadPublicPack(token);
  if (pack.state !== 'ok') return notAvailable();

  // The requested file has to be one of THIS pack's tracks.
  const track = pack.tracks.find((entry) => entry.versionId === versionId);
  if (!track) return notAvailable();

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return notAvailable();

  try {
    const client = createClient(url, key, { auth: { persistSession: false } });

    const versionResult = await client
      .from('song_versions')
      .select('storage_bucket,storage_path')
      .eq('id', versionId)
      .maybeSingle();

    const version = versionResult.data as Record<string, unknown> | null;
    if (!version) return notAvailable();

    const signed = await client.storage
      .from(String(version.storage_bucket || 'release-assets'))
      .createSignedUrl(String(version.storage_path || ''), DOWNLOAD_URL_TTL_SECONDS, {
        download: track.downloadName,
      });

    if (signed.error || !signed.data?.signedUrl) return notAvailable();

    await logPackAccess({
      packId: pack.packId,
      recipientId: pack.recipientId,
      recipientName: pack.recipientName,
      action: 'downloaded_track',
      songTitle: track.title,
      versionLabel: track.versionLabel,
      songVersionId: versionId,
    });

    return NextResponse.json({ url: signed.data.signedUrl, fileName: track.downloadName });
  } catch {
    return notAvailable();
  }
}
