import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isPressKitsFeatureEnabled,
  loadPublicKitPhoto,
  recordPressKitEvent,
} from '@/lib/press-kit-public-server';

/**
 * A journalist saving one photo from a public kit.
 *
 * UNAUTHENTICATED BY DESIGN, like the page it is reached from.
 *
 * Redirects to a short lived signed URL rather than returning the file, which
 * is the same call every other download in this product makes: nothing here
 * proxies bytes, and a route that buffered print resolution photos would be the
 * first. The signed URL carries a download name, so the file lands as
 * "artist-press-shot.jpg" rather than a UUID.
 *
 * A redirect rather than JSON, unlike the owner side, because this one is
 * reached by a plain link. A journalist should be able to right click it, and
 * a page with no JavaScript should still be able to hand over a photo.
 */

const DOWNLOAD_URL_TTL_SECONDS = 300;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string; assetId: string }> }
) {
  if (!isPressKitsFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { slug, assetId } = await context.params;
  const photo = await loadPublicKitPhoto(slug, assetId);
  if (!photo) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client.storage
    .from(photo.storageBucket)
    .createSignedUrl(photo.storagePath, DOWNLOAD_URL_TTL_SECONDS, {
      download: photo.fileName,
    });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // Recorded before the redirect, and awaited: a receipt nobody kept is the
  // one part of this feature the team is actually asking for. It cannot throw.
  await recordPressKitEvent({
    kitId: photo.kitId,
    action: 'downloaded_asset',
    assetId,
    assetFileName: photo.fileName,
  });

  return NextResponse.redirect(data.signedUrl, 302);
}
