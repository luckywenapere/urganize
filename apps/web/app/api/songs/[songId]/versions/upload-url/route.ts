import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ASSET_UPLOAD_URL_TTL_SECONDS, RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { validateSongVersionUpload } from '@/lib/song-versions';
import {
  createAdminClient,
  ensureSongAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

/**
 * Step one of three: mint a signed URL the BROWSER uploads to directly.
 *
 * Same shape as every other upload in this product, and for the same reason:
 * the bytes never pass through a serverless function, so neither Vercel's
 * ~4.5 MB request-body limit nor its timeout applies to a master.
 *
 * The storage path is `song/<songId>/…`, deliberately outside the release
 * prefixes. Every release asset path starts with a release UUID, so this
 * cannot collide — the same reasoning the workspace logo uses for its own
 * `workspace/…` prefix.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { songId } = await context.params;
  if (!songId) {
    return NextResponse.json({ error: 'A song id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const fileName = typeof body?.fileName === 'string' ? body.fileName : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : 0;

  const invalid = validateSongVersionUpload({ fileName, mimeType, fileSize });
  if (invalid) {
    return NextResponse.json({ error: invalid.message }, { status: invalid.status });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSongAccess(adminClient, songId, auth.user, true);
  if ('error' in access) return access.error;

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const storagePath = `song/${songId}/${randomUUID()}-${safeName}`;

  const { data, error } = await adminClient!.storage
    .from(RELEASE_ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not start the upload.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bucket: RELEASE_ASSETS_BUCKET,
    storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
    expiresInSeconds: ASSET_UPLOAD_URL_TTL_SECONDS,
  });
}
