import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuthenticatedAdmin,
  loadWorkspaceAccessContext,
} from '@/lib/tasks-server';
import {
  ASSET_MIME_ALLOWLIST,
  ASSET_UPLOAD_URL_TTL_SECONDS,
  MAX_WORKSPACE_LOGO_BYTES,
  RELEASE_ASSETS_BUCKET,
  formatFileSize,
} from '@/lib/asset-helpers';
import { buildWorkspaceLogoStoragePath } from '@/lib/workspace-logo';

// Gated by NEXT_PUBLIC_FEATURE_WORKSPACE, same as /api/workspace/artist —
// the logo only surfaces on flag-on workspace UI. Returns 404 when off.
const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

type UploadUrlBody = {
  file_name?: unknown;
  mime_type?: unknown;
  file_size?: unknown;
};

// The logo shares cover art's image FORMATS — it renders in the same slot on
// release cards — but NOT its size ceiling. See MAX_WORKSPACE_LOGO_BYTES for
// why the two must not share a number.
const LOGO_MIME_ALLOWLIST = ASSET_MIME_ALLOWLIST.cover_art;
const LOGO_SIZE_LIMIT = MAX_WORKSPACE_LOGO_BYTES;

export async function POST(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const body = (await request.json().catch(() => null)) as UploadUrlBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  if (!fileName) {
    return NextResponse.json({ error: 'file_name is required.' }, { status: 400 });
  }

  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim() : '';
  if (!LOGO_MIME_ALLOWLIST.includes(mimeType)) {
    console.error('[workspace-logo] rejected: mime', { mimeType, userId: auth.user.id });
    return NextResponse.json(
      { error: `Logo must be an image. Allowed: ${LOGO_MIME_ALLOWLIST.join(', ')}.` },
      { status: 400 }
    );
  }

  const fileSize = Number(body.file_size);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json(
      { error: 'file_size is required and must be a positive number.' },
      { status: 400 }
    );
  }
  if (fileSize > LOGO_SIZE_LIMIT) {
    console.error('[workspace-logo] rejected: too large', { fileSize, userId: auth.user.id });
    return NextResponse.json(
      { error: `Logo must be ${formatFileSize(LOGO_SIZE_LIMIT)} or smaller.` },
      { status: 400 }
    );
  }

  try {
    // MUST be the same resolver the recording PUT uses (see
    // app/api/workspace/logo/route.ts). This route used to mint under
    // ensureOwnedWorkspace — the workspace the user OWNS — while the PUT
    // validates the path against loadWorkspaceAccessContext's
    // primaryWorkspaceId, and those two deliberately diverge: a user who owns
    // zero releases and belongs to someone else's team gets the JOINED
    // workspace as their primary (lib/tasks-server.ts, a 2026-07-23 founder
    // decision so an invitee's Teammates list shows their real team). For that
    // person the bytes uploaded fine and the record call then rejected its own
    // signed path with "storage_path does not belong to this workspace",
    // leaving an orphaned object behind. Never let the mint and the check use
    // different resolvers.
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      console.error('[workspace-logo] no workspace for user', { userId: auth.user.id });
      return NextResponse.json({ error: 'No workspace found.' }, { status: 404 });
    }
    const storagePath = buildWorkspaceLogoStoragePath(access.primaryWorkspaceId, fileName);

    const { data, error } = await adminClient.storage
      .from(RELEASE_ASSETS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      console.error('[workspace-logo] could not sign upload:', error?.message, {
        userId: auth.user.id,
      });
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
  } catch (error) {
    console.error(
      '[workspace-logo] upload-url threw:',
      error instanceof Error ? error.message : error,
      { userId: auth.user.id }
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not prepare logo upload.' },
      { status: 500 }
    );
  }
}
