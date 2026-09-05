import { NextResponse, type NextRequest } from 'next/server';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import {
  PRESS_KIT_ASSETS_TABLE,
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
} from '../../../../_shared';

/**
 * A short lived URL that saves one photo under its real name.
 *
 * The DJ pack download pattern, for the same two reasons. The URL is minted
 * HERE, on click, rather than rendered into the page, so a tab left open all
 * day does not hold a set of live URLs. And it carries a download name, so the
 * file lands as "artist-press-shot.jpg" rather than a UUID, which is the
 * difference between a photo an editor can file and one they rename by hand.
 *
 * No bytes pass through this function. That is deliberate and worth keeping:
 * nothing in this codebase proxies a file, and a route that buffered a set of
 * print-resolution photos would be the first, against a response size ceiling
 * nobody here has measured.
 */

const DOWNLOAD_URL_TTL_SECONDS = 300;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kitId: string; assetId: string }> }
) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId, assetId } = await context.params;
  if (!kitId || !assetId) {
    return NextResponse.json({ error: 'Press kit and photo id are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, false);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .select('id,kit_id,file_name,storage_bucket,storage_path')
    .eq('id', assetId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not prepare that download.' },
      { status: 500 }
    );
  }

  const row = asRow(data);
  // Same defence-in-depth as the edit route: access was checked for the kit,
  // so an id from another kit must not resolve on this kit's authority.
  if (!row.id || String(row.kit_id || '') !== kitId) {
    return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from(String(row.storage_bucket || RELEASE_ASSETS_BUCKET))
    .createSignedUrl(String(row.storage_path || ''), DOWNLOAD_URL_TTL_SECONDS, {
      download: String(row.file_name || 'press-photo'),
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message || 'Could not prepare that download.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: String(row.file_name || 'press-photo'),
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}
