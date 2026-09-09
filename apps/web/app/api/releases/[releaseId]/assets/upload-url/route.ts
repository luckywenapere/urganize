import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  requireActiveAuthenticatedUser,
} from '../../../_shared';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import {
  ASSET_UPLOAD_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  buildStoragePath,
  isAssetCategory,
  validateAssetUpload,
} from '@/lib/asset-helpers';

type UploadUrlBody = {
  category?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  file_size?: unknown;
};

// Feature flag (URG-182): same flag as the parent assets routes.
const isFilesFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isFilesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

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

  const body = (await request.json().catch(() => null)) as UploadUrlBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const category = body.category;
  if (!isAssetCategory(category)) {
    return NextResponse.json(
      { error: 'category is required and must be one of the asset_category enum values.' },
      { status: 400 }
    );
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
    category,
    mime_type: mimeType,
    file_size: fileSize,
    file_name: fileName,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const storagePath = buildStoragePath(releaseId, category, fileName);

  const { data, error } = await adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message || 'Could not create signed upload URL.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: storagePath,
    expires_in: ASSET_UPLOAD_URL_TTL_SECONDS,
  });
}
