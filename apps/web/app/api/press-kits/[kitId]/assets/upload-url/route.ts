import { NextResponse, type NextRequest } from 'next/server';
import { ASSET_UPLOAD_URL_TTL_SECONDS, RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { validatePressPhotoFile } from '@/lib/press-photo';
import {
  buildPressKitStoragePath,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
} from '../../../_shared';

/**
 * Step 1 of adding a photo to a kit: mint a signed Supabase Storage URL the
 * browser PUTs the file to directly.
 *
 * No bytes pass through this function, which is the whole reason a 10 MiB
 * ceiling is safe at all — Vercel caps a request body at about 4.5 MB, and a
 * print-resolution photo goes straight past that.
 *
 * The kind is fixed to a press photo here rather than read from the body.
 * Taking one would make this a second door into the file cabinet.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ kitId: string }> }
) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId } = await context.params;
  if (!kitId) {
    return NextResponse.json({ error: 'Press kit id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;

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
  const fileSize = Number(body.file_size);

  const validation = validatePressPhotoFile({
    name: fileName,
    type: mimeType,
    size: fileSize,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const storagePath = buildPressKitStoragePath(kitId, fileName);

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
