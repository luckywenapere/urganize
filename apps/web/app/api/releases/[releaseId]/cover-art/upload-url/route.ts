import { NextRequest, NextResponse } from 'next/server';
import {
  COVER_ART_CATEGORY,
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  isCoverArtFeatureEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
} from '../_shared';
import {
  ASSET_UPLOAD_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  signThumbUploadUrl,
  buildStoragePath,
  validateAssetUpload,
} from '@/lib/asset-helpers';

/**
 * Step 1 of a cover art upload: mint a signed Supabase Storage URL the
 * browser PUTs the file to directly. Mirrors the song upload-url route.
 * The category is fixed to 'cover_art' here rather than accepted from the
 * body — this endpoint exists to set a release's cover image, and taking a
 * category would make it a second, unflagged door into the whole asset
 * cabinet.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCoverArtFeatureEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => null)) as {
    file_name?: unknown;
    mime_type?: unknown;
    file_size?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  if (!fileName) {
    return NextResponse.json({ error: 'file_name is required.' }, { status: 400 });
  }

  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim() : '';
  if (!mimeType) {
    return NextResponse.json({ error: 'mime_type is required.' }, { status: 400 });
  }

  const fileSize = Number(body.file_size);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json(
      { error: 'file_size is required and must be a positive number.' },
      { status: 400 }
    );
  }

  const validation = validateAssetUpload({
    category: COVER_ART_CATEGORY,
    mime_type: mimeType,
    file_size: fileSize,
    file_name: fileName,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const storagePath = buildStoragePath(releaseId, COVER_ART_CATEGORY, fileName);

  const { data, error } = await adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message || 'Could not create the upload URL.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: storagePath,
    expires_in: ASSET_UPLOAD_URL_TTL_SECONDS,
    // The browser also PUTs a 384px display copy here (lib/image-thumb.ts)
    // so lists never paint the full master. Null: lists use the original.
    thumb_upload_url: await signThumbUploadUrl(adminClient, RELEASE_ASSETS_BUCKET, storagePath),
  });
}
