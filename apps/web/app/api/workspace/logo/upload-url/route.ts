import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuthenticatedAdmin,
  ensureOwnedWorkspace,
} from '@/lib/tasks-server';
import {
  ASSET_MIME_ALLOWLIST,
  ASSET_SIZE_LIMITS,
  ASSET_UPLOAD_URL_TTL_SECONDS,
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

// The logo shares cover art's image constraints (JPEG/PNG/WebP, 5 MiB) —
// it renders in the exact same cover-art slot on release cards.
const LOGO_MIME_ALLOWLIST = ASSET_MIME_ALLOWLIST.cover_art;
const LOGO_SIZE_LIMIT = ASSET_SIZE_LIMITS.cover_art;

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
    return NextResponse.json(
      { error: `Logo must be ${formatFileSize(LOGO_SIZE_LIMIT)} or smaller.` },
      { status: 400 }
    );
  }

  try {
    const workspace = await ensureOwnedWorkspace(adminClient, auth.user);
    const storagePath = buildWorkspaceLogoStoragePath(workspace.id, fileName);

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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not prepare logo upload.' },
      { status: 500 }
    );
  }
}
