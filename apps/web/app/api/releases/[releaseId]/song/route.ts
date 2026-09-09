import { NextRequest, NextResponse } from 'next/server';
import {
  ASSETS_TABLE,
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isSongFeatureEnabled,
  loadReleaseSongs,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toReleaseSong,
} from './_shared';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
  validateAssetUpload,
} from '@/lib/asset-helpers';
import { SONG_CATEGORY } from '@/lib/song';

/**
 * The song on a release: read the list, record one the browser has just
 * uploaded, remove one.
 *
 * There is no handler here that accepts bytes. The file goes straight from the
 * browser to Supabase Storage through a signed URL minted by
 * `./upload-url/route.ts` — a 40 MiB master would not survive a serverless
 * request body, and streaming it through us would buy nothing.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isSongFeatureEnabled()) return notFoundResponse();

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

  const ownership = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const result = await loadReleaseSongs(adminClient, releaseId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ songs: result.songs });
}

type RecordSongBody = {
  storage_path?: unknown;
  file_name?: unknown;
  file_size?: unknown;
  mime_type?: unknown;
};

/**
 * Record a song the client has already uploaded to storage.
 *
 * Non-destructive by design: this never replaces or removes an existing song.
 * A release legitimately carries more than one master (a radio edit, a clean
 * version), the newest is treated as "the current song" wherever one is needed,
 * and anything superseded stays listed with its own Remove control. The
 * alternative — deleting the previous audio row on every upload — would destroy
 * a file the user never asked us to touch, and would do it silently.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isSongFeatureEnabled()) return notFoundResponse();

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

  const body = (await request.json().catch(() => null)) as RecordSongBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path is required.' }, { status: 400 });
  }
  // Defense in depth: the path must live under this release's namespace, so a
  // client cannot claim someone else's upload as this release's song.
  if (!storagePath.startsWith(`${releaseId}/`)) {
    return NextResponse.json(
      { error: 'storage_path does not belong to this rollout.' },
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

  // Re-validated even though upload-url already did: we do not trust the client
  // between two calls it makes separately.
  const validation = validateAssetUpload({
    category: SONG_CATEGORY,
    mime_type: mimeType,
    file_size: fileSize,
    file_name: fileName,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Confirm the bytes actually landed where the client says they did, at the
  // size it claims — otherwise a caller could mint rows for files that do not
  // exist. Storage has no stat(), so this lists the parent and matches the
  // basename.
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
      owner_user_id: ownership.release.ownerUserId,
      release_id: releaseId,
      task_id: null,
      uploaded_by: auth.user.id,
      category: SONG_CATEGORY,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_bucket: RELEASE_ASSETS_BUCKET,
      storage_path: storagePath,
      public_url: null,
      metadata: {},
    })
    .select('id,release_id,file_name,file_size,mime_type,storage_bucket,storage_path,created_at')
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    // The bytes are already up. Drop them so a retry does not leak an orphan
    // against the storage quota.
    const cleanup = await adminClient.storage.from(RELEASE_ASSETS_BUCKET).remove([storagePath]);
    if (cleanup.error) {
      console.error('[song] failed to clean up orphaned upload:', cleanup.error);
    }
    return NextResponse.json(
      { error: insertResult.error?.message || 'Could not save the song.' },
      { status: 500 }
    );
  }

  const row = insertResult.data as Parameters<typeof toReleaseSong>[0];
  const downloadUrl = await generateSignedUrl(
    adminClient,
    RELEASE_ASSETS_BUCKET,
    storagePath,
    ASSET_SIGNED_URL_TTL_SECONDS
  );

  return NextResponse.json({ song: toReleaseSong(row, downloadUrl) }, { status: 201 });
}

/**
 * Remove one song. Takes an explicit `?songId=` rather than deleting "the
 * current one": a release can hold several, and an endpoint that guesses which
 * to destroy is the wrong shape for a destructive call.
 *
 * The row goes first, then the object. If the storage removal fails the row is
 * already gone, which is the right way round — a listed song whose bytes are
 * missing is a broken download button, while an unlisted object is only quota.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isSongFeatureEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const songId = (request.nextUrl.searchParams.get('songId') || '').trim();
  if (!songId) {
    return NextResponse.json({ error: 'songId is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // Scoped to this release AND to the audio category, so the song endpoint can
  // never be used to delete a contract or the cover art.
  const { data: existing, error: lookupError } = await adminClient
    .from(ASSETS_TABLE)
    .select('id,storage_bucket,storage_path')
    .eq('id', songId)
    .eq('release_id', releaseId)
    .eq('category', SONG_CATEGORY)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: lookupError.message || 'Could not load the song.' },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json({ error: 'Song not found.' }, { status: 404 });
  }

  const { error: deleteError } = await adminClient
    .from(ASSETS_TABLE)
    .delete()
    .eq('id', songId)
    .eq('release_id', releaseId);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || 'Could not remove the song.' },
      { status: 500 }
    );
  }

  const storagePath = String(existing.storage_path || '');
  if (storagePath) {
    const cleanup = await adminClient.storage
      .from(String(existing.storage_bucket || '') || RELEASE_ASSETS_BUCKET)
      .remove([storagePath]);
    if (cleanup.error) {
      console.error('[song] row deleted but storage object remains:', cleanup.error);
    }
  }

  return NextResponse.json({ ok: true });
}
