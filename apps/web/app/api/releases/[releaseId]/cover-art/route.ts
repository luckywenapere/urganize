import { NextRequest, NextResponse } from 'next/server';
import {
  ASSETS_TABLE,
  COVER_ART_CATEGORY,
  RELEASES_TABLE,
  createAdminClient,
  ensureReleaseOwnership,
  isCoverArtFeatureEnabled,
  loadCurrentCoverArt,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toReleaseCoverArt,
} from './_shared';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
  validateAssetUpload,
} from '@/lib/asset-helpers';

/**
 * The cover art on a release: read the current one, record one the browser
 * has just uploaded (replacing whatever was there), remove it entirely.
 *
 * No handler here accepts bytes — the file goes straight from the browser to
 * Supabase Storage through a signed URL from `./upload-url/route.ts`.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCoverArtFeatureEnabled()) return notFoundResponse();

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

  const result = await loadCurrentCoverArt(adminClient, releaseId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ coverArt: result.coverArt });
}

type RecordCoverArtBody = {
  storage_path?: unknown;
  file_name?: unknown;
  file_size?: unknown;
  mime_type?: unknown;
  width?: unknown;
  height?: unknown;
};

/**
 * Sanity ceiling on the client-reported pixel dimensions. Not a DSP rule (the
 * grading in lib/cover-art-dsp.ts is the rule); just a bound so a nonsense
 * number cannot be stored and rendered back.
 */
const MAX_RECORDED_EDGE = 20000;

/**
 * Read the dimensions the browser measured before uploading.
 *
 * These are a HINT, not an authority: they come from the client, and the hard
 * DSP block (not square, too small) is enforced in the picker rather than
 * here. Deliberate — validating them server-side would mean decoding the
 * image, which needs a native dependency this repo does not carry, and the
 * check is product guidance rather than a security boundary. Someone who
 * bypasses it by calling this route directly only mis-labels the artwork on
 * their own release. Anything unparseable is stored as nothing at all, which
 * reads back as "we do not know" rather than as a passing grade.
 */
function readReportedDimensions(body: RecordCoverArtBody): {
  width: number;
  height: number;
} | null {
  const width = Number(body.width);
  const height = Number(body.height);
  const isUsable = (value: number) =>
    Number.isFinite(value) && value > 0 && value <= MAX_RECORDED_EDGE;

  if (!isUsable(width) || !isUsable(height)) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Record a cover art image the client has already uploaded to storage.
 *
 * REPLACES the release's current cover art, unlike the song route this
 * mirrors: a release has exactly one cover, so this scene's whole point is
 * "the image I just uploaded is now THE cover." The previous asset (if any)
 * is deleted outright — storage object first, then row (the single-asset
 * DELETE route's order: an orphan storage object is recoverable, an orphan
 * DB row pointing at nothing is harder to detect) — rather than left behind
 * as an untethered `cover_art`-category row the general Files scene would
 * then show with no way to tell which of two "cover arts" is real.
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
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => null)) as RecordCoverArtBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path is required.' }, { status: 400 });
  }
  if (!storagePath.startsWith(`${releaseId}/`)) {
    return NextResponse.json(
      { error: 'storage_path does not belong to this release.' },
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
    category: COVER_ART_CATEGORY,
    mime_type: mimeType,
    file_size: fileSize,
    file_name: fileName,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const reportedDimensions = readReportedDimensions(body);

  // Confirm the bytes actually landed where claimed, at the size claimed.
  const lastSlash = storagePath.lastIndexOf('/');
  const directory = lastSlash > 0 ? storagePath.slice(0, lastSlash) : '';
  const basename = storagePath.slice(lastSlash + 1);

  const listResult = await adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .list(directory, { limit: 100, search: basename });

  if (listResult.error) {
    return NextResponse.json(
      { error: listResult.error.message || 'Could not verify the upload.' },
      { status: 500 }
    );
  }

  const found = (listResult.data || []).find((object) => object.name === basename);
  const storedSize = (found?.metadata as { size?: number } | null | undefined)?.size;
  if (!found || (typeof storedSize === 'number' && storedSize !== fileSize)) {
    return NextResponse.json({ error: 'The upload was not found.' }, { status: 400 });
  }

  const insertResult = await adminClient
    .from(ASSETS_TABLE)
    .insert({
      owner_user_id: ownership.ownerUserId,
      release_id: releaseId,
      task_id: null,
      uploaded_by: auth.user.id,
      category: COVER_ART_CATEGORY,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_bucket: RELEASE_ASSETS_BUCKET,
      storage_path: storagePath,
      public_url: null,
      metadata: reportedDimensions ? { image: reportedDimensions } : {},
    })
    .select(
      'id,release_id,file_name,file_size,mime_type,storage_bucket,storage_path,created_at,metadata'
    )
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    const cleanup = await adminClient.storage.from(RELEASE_ASSETS_BUCKET).remove([storagePath]);
    if (cleanup.error) {
      console.error('[cover-art] failed to clean up orphaned upload:', cleanup.error);
    }
    return NextResponse.json(
      { error: insertResult.error?.message || 'Could not save the cover art.' },
      { status: 500 }
    );
  }

  const newAssetRow = insertResult.data as Parameters<typeof toReleaseCoverArt>[0];

  // Replace: find whatever the release currently points at and delete it —
  // storage first, then the row, so a failure leaves a recoverable orphan
  // object rather than a DB row pointing at nothing.
  const { data: releaseRow, error: releaseLookupError } = await adminClient
    .from(RELEASES_TABLE)
    .select('artwork_asset_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (!releaseLookupError) {
    const previousAssetId = releaseRow?.artwork_asset_id
      ? String(releaseRow.artwork_asset_id)
      : '';
    if (previousAssetId && previousAssetId !== newAssetRow.id) {
      const { data: previousAsset } = await adminClient
        .from(ASSETS_TABLE)
        .select('storage_bucket,storage_path')
        .eq('id', previousAssetId)
        .maybeSingle();

      if (previousAsset?.storage_path) {
        const removeResult = await adminClient.storage
          .from(String(previousAsset.storage_bucket || '') || RELEASE_ASSETS_BUCKET)
          .remove([String(previousAsset.storage_path)]);
        if (removeResult.error) {
          console.error('[cover-art] failed to remove previous storage object:', removeResult.error);
        }
      }

      const { error: deletePreviousError } = await adminClient
        .from(ASSETS_TABLE)
        .delete()
        .eq('id', previousAssetId);
      if (deletePreviousError) {
        console.error('[cover-art] failed to delete previous asset row:', deletePreviousError);
      }
    }
  } else {
    console.error('[cover-art] failed to look up previous cover art:', releaseLookupError);
  }

  const { error: updateReleaseError } = await adminClient
    .from(RELEASES_TABLE)
    .update({ artwork_asset_id: newAssetRow.id })
    .eq('id', releaseId);

  if (updateReleaseError) {
    return NextResponse.json(
      { error: updateReleaseError.message || 'Could not set the new cover art.' },
      { status: 500 }
    );
  }

  const downloadUrl = await generateSignedUrl(
    adminClient,
    RELEASE_ASSETS_BUCKET,
    storagePath,
    ASSET_SIGNED_URL_TTL_SECONDS
  );

  return NextResponse.json(
    { coverArt: toReleaseCoverArt(newAssetRow, downloadUrl) },
    { status: 201 }
  );
}

/**
 * Remove the release's cover art entirely. Idempotent (the EPK revoke
 * precedent): no current cover art is a 200 with `coverArt: null`, not a
 * 404 — a repeated tap, or a race with another tab, should not error.
 *
 * `releases.artwork_asset_id` has `ON DELETE SET NULL` (see the 2026-05-10
 * schema migration), so deleting the asset row clears the pointer at the DB
 * level — no separate UPDATE needed here.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCoverArtFeatureEnabled()) return notFoundResponse();

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

  const current = await loadCurrentCoverArt(adminClient, releaseId);
  if ('error' in current) {
    return NextResponse.json({ error: current.error }, { status: 500 });
  }
  if (!current.coverArt) {
    return NextResponse.json({ coverArt: null });
  }

  const { storagePath, id: assetId } = current.coverArt;
  if (storagePath) {
    const removeResult = await adminClient.storage.from(RELEASE_ASSETS_BUCKET).remove([storagePath]);
    if (removeResult.error) {
      return NextResponse.json(
        { error: removeResult.error.message || 'Could not delete the cover art file.' },
        { status: 500 }
      );
    }
  }

  const { error: deleteError } = await adminClient.from(ASSETS_TABLE).delete().eq('id', assetId);
  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || 'Could not remove the cover art.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ coverArt: null });
}
