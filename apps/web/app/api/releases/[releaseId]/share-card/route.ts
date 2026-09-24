import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess } from '@/lib/release-access-server';
import { loadRecapFonts } from '@/lib/recap-fonts';
import { renderShareCard } from '@/lib/social-share-card';
import { loadShareCoverArtDataUrl } from '@/lib/social-share-server';
import {
  SHARE_FORMAT_DIMENSIONS,
  describeShareTiming,
  isSocialShareEnabled,
  parseShareCardQuery,
  shareDisplayTitle,
  shareImageFileName,
  toUtcYmd,
} from '@/lib/social-share';
import { isDbReleaseType } from '@/types/releases';

// Share to socials: draw one poster for a rollout, on request (2026-09-23).
//
// A GET that returns the PNG itself, and three decisions shape it:
//
//  1. NOTHING IS STORED. Unlike the recap card, which keeps its images in the
//     bucket, a share poster is a view of the rollout as it is right now plus
//     four answers the person just gave. Storing it would mean a table, a
//     cleanup path and a stale image the moment a date moved. So there is no
//     migration and nothing to delete.
//  2. A GET, not a POST, because it reads and changes nothing. That matters
//     for more than tidiness: the paywall's read-only mode refuses writes by
//     method, and a team whose card failed must still be able to tell people
//     their song is coming.
//  3. The response is PRIVATE and never cached. It is behind a login and it
//     can carry unannounced cover art, and next/og's own default is a public,
//     year-long, immutable cache header, which is exactly wrong here. So the
//     image is rendered to bytes and sent with our own headers.
//
// Team-aware read access (any member, and a read-only guest, of a team that
// can see the rollout), through the shared helper: this group is enlisted in
// lib/release-access-guard.test.ts.

export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isSocialShareEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const parsed = parseShareCardQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const { release } = access;

  // The access summary does not carry the release type, and the eyebrow says
  // "NEW EP" or "NEW ALBUM" from it. A failed read falls back to single, the
  // type every release had before the picker existed, rather than failing the
  // image over a label.
  const { data: typeRow } = await adminClient
    .from('releases')
    .select('release_type')
    .eq('id', releaseId)
    .maybeSingle();
  const rawType = (typeRow as { release_type?: unknown } | null)?.release_type;
  const releaseType = isDbReleaseType(rawType) ? rawType : 'single';

  const { format, dateMode, extraLine, todayYmd } = parsed.value;
  const timing = describeShareTiming(release.releaseDate, dateMode, todayYmd ?? toUtcYmd());
  const { width, height } = SHARE_FORMAT_DIMENSIONS[format];
  const coverArtDataUrl = await loadShareCoverArtDataUrl(adminClient, release.artworkAssetId);

  const render = async (cover: string | null): Promise<Buffer> => {
    const fonts = await loadRecapFonts();
    const image = new ImageResponse(
      renderShareCard({
        format,
        releaseType,
        title: shareDisplayTitle(release.title),
        artistName: release.artistName,
        timing,
        extraLine,
        coverArtDataUrl: cover,
      }),
      { width, height, fonts }
    );
    return Buffer.from(await image.arrayBuffer());
  };

  let png: Buffer;
  try {
    png = await render(coverArtDataUrl);
  } catch (error) {
    if (!coverArtDataUrl) {
      console.error('[share-card] rendering failed', error);
      return NextResponse.json({ error: 'Could not make the image. Try again.' }, { status: 500 });
    }
    // A cover the renderer could not decode must cost the poster its art,
    // not the poster. The typographic layout is a designed one of its own.
    console.error('[share-card] rendering with cover art failed, retrying without it', error);
    try {
      png = await render(null);
    } catch (retryError) {
      console.error('[share-card] rendering failed', retryError);
      return NextResponse.json({ error: 'Could not make the image. Try again.' }, { status: 500 });
    }
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': `inline; filename="${shareImageFileName(release.title, format)}"`,
    },
  });
}
