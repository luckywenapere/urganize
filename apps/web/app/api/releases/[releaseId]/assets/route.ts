import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  requireActiveAuthenticatedUser,
  isOptionalTableMissingError,
} from '../../_shared';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
  isAssetCategory,
  validateAssetUpload,
} from '@/lib/asset-helpers';

const ASSETS_TABLE = 'assets';
const RELEASES_TABLE = 'releases';

type AssetRow = {
  id: string;
  owner_user_id: string;
  release_id: string | null;
  task_id: string | null;
  uploaded_by: string;
  category: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { data, error } = await adminClient
    .from(ASSETS_TABLE)
    .select('*')
    .eq('release_id', releaseId)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Assets schema is missing.' }, { status: 501 });
    }
    return NextResponse.json(
      { error: error.message || 'Could not load assets.' },
      { status: 500 }
    );
  }

  const rows = (data || []) as AssetRow[];
  const assets = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      download_url: await generateSignedUrl(
        adminClient,
        row.storage_bucket || RELEASE_ASSETS_BUCKET,
        row.storage_path,
        ASSET_SIGNED_URL_TTL_SECONDS
      ),
    }))
  );

  return NextResponse.json({ assets });
}

type AssetRecordBody = {
  storage_path?: unknown;
  category?: unknown;
  file_name?: unknown;
  file_size?: unknown;
  mime_type?: unknown;
};

/**
 * Records an asset row for a file that the client has already uploaded
 * directly to Supabase Storage using a signed upload URL (see
 * `./upload-url/route.ts`). This endpoint no longer accepts the bytes —
 * direct-to-storage bypasses Vercel's serverless body size limit.
 *
 * Verifies the upload landed at the claimed `storage_path` with the claimed
 * size before inserting the row. Re-validates category / MIME / size as
 * defense in depth (the upload-url call already validated; we don't trust the
 * client between calls). Cleans up the orphan storage object if the row
 * insert fails.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => null)) as AssetRecordBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path is required.' }, { status: 400 });
  }
  // Defense in depth: the path must live under this release's namespace.
  // Prevents a client from claiming someone else's upload as their own asset.
  if (!storagePath.startsWith(`${releaseId}/`)) {
    return NextResponse.json(
      { error: 'storage_path does not belong to this release.' },
      { status: 400 }
    );
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

  // Confirm the upload actually landed. List the parent directory and look
  // for the basename. If size metadata is reported, cross-check it.
  const lastSlash = storagePath.lastIndexOf('/');
  const dir = lastSlash > 0 ? storagePath.slice(0, lastSlash) : '';
  const basename = storagePath.slice(lastSlash + 1);

  const listResult = await adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .list(dir, { limit: 100, search: basename });

  if (listResult.error) {
    return NextResponse.json(
      { error: listResult.error.message || 'Could not verify upload.' },
      { status: 500 }
    );
  }

  const found = (listResult.data || []).find((obj) => obj.name === basename);
  const storedSize = (found?.metadata as { size?: number } | null | undefined)?.size;
  if (!found || (typeof storedSize === 'number' && storedSize !== fileSize)) {
    return NextResponse.json(
      { error: 'Upload not found at storage_path.' },
      { status: 400 }
    );
  }

  const insertResult = await adminClient
    .from(ASSETS_TABLE)
    .insert({
      owner_user_id: ownership.release.ownerUserId,
      release_id: releaseId,
      task_id: null,
      uploaded_by: auth.user.id,
      category,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_bucket: RELEASE_ASSETS_BUCKET,
      storage_path: storagePath,
      public_url: null,
      metadata: {},
    })
    .select('*')
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    // The bytes are already in storage. Drop them so the user can retry.
    const cleanup = await adminClient.storage
      .from(RELEASE_ASSETS_BUCKET)
      .remove([storagePath]);
    if (cleanup.error) {
      console.error(
        'Failed to clean up orphan storage object after asset insert failed:',
        cleanup.error
      );
    }
    return NextResponse.json(
      { error: insertResult.error?.message || 'Could not save asset row.' },
      { status: 500 }
    );
  }

  const assetRow = insertResult.data as AssetRow;

  // Promote a first cover_art upload to be the release's artwork. Subsequent
  // cover_art uploads don't overwrite an existing artwork — that decision
  // belongs to the user via a future "set as cover" action.
  if (category === 'cover_art') {
    const releaseResult = await adminClient
      .from(RELEASES_TABLE)
      .select('artwork_asset_id')
      .eq('id', releaseId)
      .maybeSingle();

    if (!releaseResult.error && !releaseResult.data?.artwork_asset_id) {
      const updateResult = await adminClient
        .from(RELEASES_TABLE)
        .update({ artwork_asset_id: assetRow.id })
        .eq('id', releaseId);
      if (updateResult.error) {
        console.error('Failed to set releases.artwork_asset_id:', updateResult.error);
      }
    }
  }

  const downloadUrl = await generateSignedUrl(
    adminClient,
    RELEASE_ASSETS_BUCKET,
    storagePath,
    ASSET_SIGNED_URL_TTL_SECONDS
  );

  return NextResponse.json(
    { asset: { ...assetRow, download_url: downloadUrl } },
    { status: 201 }
  );
}
