import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  ASSET_MIME_ALLOWLIST,
  ASSET_UPLOAD_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  formatFileSize,
  sanitizeFileName,
} from '@/lib/asset-helpers';
import { MAX_CURATOR_PHOTO_BYTES } from '@/lib/pitching';
import {
  curatorPhotoPathPrefix,
  flagOffResponse,
  isPitchingFeatureEnabled,
  requireCuratorUser,
} from '../../_shared';

// Step one of the three-step signed upload the workspace logo already uses:
// this route hands back a signed URL, the client PUTs the bytes straight to
// storage, then PATCHes /api/curator/profile with the returned path.
//
// The photo lands in the private release-assets bucket under
// curator/<user_id>/photo/..., a prefix nothing else can collide with (release
// asset paths always start with a release id). Reads are signed, so the object
// is never public.

// A curator photo is a small avatar, so it takes cover art's image FORMATS but
// its own size ceiling — see MAX_CURATOR_PHOTO_BYTES for why the two must not
// share a number.
const PHOTO_MIME_ALLOWLIST = ASSET_MIME_ALLOWLIST.cover_art;
const PHOTO_SIZE_LIMIT = MAX_CURATOR_PHOTO_BYTES;

export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

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
    return NextResponse.json({ error: 'Pick a file.' }, { status: 400 });
  }

  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim() : '';
  if (!PHOTO_MIME_ALLOWLIST.includes(mimeType)) {
    return NextResponse.json(
      { error: 'Photo must be a JPEG, PNG or WebP image.' },
      { status: 400 }
    );
  }

  const fileSize = Number(body.file_size);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'That file looks empty.' }, { status: 400 });
  }
  if (fileSize > PHOTO_SIZE_LIMIT) {
    return NextResponse.json(
      { error: `Photo must be ${formatFileSize(PHOTO_SIZE_LIMIT)} or smaller.` },
      { status: 400 }
    );
  }

  const storagePath = `${curatorPhotoPathPrefix(auth.user.id)}${randomUUID()}-${sanitizeFileName(fileName)}`;

  const { data, error } = await auth.adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message || 'Could not start the upload.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: storagePath,
    expires_in: ASSET_UPLOAD_URL_TTL_SECONDS,
  });
}
