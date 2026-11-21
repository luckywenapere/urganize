import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  badRequest,
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  musicFolder,
  requireActiveAuthenticatedUser,
} from '../_shared';
import {
  ASSET_UPLOAD_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  sanitizeFileName,
} from '@/lib/asset-helpers';
import { validateMusicFile } from '@/lib/music/rules';

/**
 * Step 1 of putting a song on Urganize music: a signed storage URL the browser
 * PUTs the file to directly, so the audio never passes through a serverless
 * function. The folder is fixed to this rollout's music folder rather than
 * taken from the body, and the file is checked here as well as in the browser.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return badRequest('Rollout id is required.');

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;

  const body = (await request.json().catch(() => null)) as {
    file_name?: unknown;
    mime_type?: unknown;
    file_size?: unknown;
  } | null;
  if (!body) return badRequest('JSON body is required.');

  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  if (!fileName) return badRequest('file_name is required.');
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim() : '';
  const fileSize = Number(body.file_size);

  const check = validateMusicFile({ name: fileName, type: mimeType, size: fileSize });
  if (!check.ok) return badRequest(check.error);

  const storagePath = `${musicFolder(releaseId)}${randomUUID()}-${sanitizeFileName(fileName)}`;
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
  });
}
