import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { briefImagePath, validateBriefImage } from '@/lib/brief-media';
import { briefLockedFailure } from '@/lib/idea-round-server';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../../_shared';

/**
 * Step 1 of adding a photo to the brief (#897 phase 2): a signed link the
 * browser PUTs the (already shrunk) photo to, in the private release-assets
 * bucket under brief/<release>/. Step 2 is POST /brief/references with the
 * returned path. Anyone on the team who can edit the brief; locked once it is
 * approved, like the other references.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const locked = await briefLockedFailure(admin, releaseId);
  if (locked) return briefFailure(locked);

  const body = (await request.json().catch(() => null)) as { mime_type?: unknown; file_size?: unknown } | null;
  const mimeType = typeof body?.mime_type === 'string' ? body.mime_type : '';
  const checked = validateBriefImage({ mimeType, size: Number(body?.file_size) });
  if (!checked.ok) return badRequest(checked.error);

  const storagePath = briefImagePath(releaseId, crypto.randomUUID(), mimeType);
  const { data, error } = await admin.storage.from(RELEASE_ASSETS_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not start the upload. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ upload_url: data.signedUrl, storage_path: storagePath });
}
