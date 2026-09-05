import { NextResponse, type NextRequest } from 'next/server';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { isPressPhotoUsageRight, validatePressPhotoFile } from '@/lib/press-photo';
import {
  PRESS_KIT_ASSETS_TABLE,
  PRESS_KIT_ASSET_COLUMNS,
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  loadPressKitAssets,
  pressKitStoragePrefix,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKitAsset,
} from '../../_shared';

/**
 * The photos on a kit: list them, and record one the browser has already
 * uploaded to storage.
 *
 * Unlike cover art, a photo is APPENDED. A kit holds a set, and `position`
 * decides the order press see them in, so recording one never disturbs another.
 *
 * No handler here accepts bytes. The file goes straight from the browser to
 * Supabase Storage through the signed URL from ./upload-url.
 */

type Context = { params: Promise<{ kitId: string }> };

/** Sanity bound on client-reported pixels, so nonsense cannot be stored and
 *  rendered back. Not the grading rule, which lives in the picker. */
const MAX_RECORDED_EDGE = 20000;

const readReportedDimensions = (body: {
  width?: unknown;
  height?: unknown;
}): { width: number; height: number } | null => {
  const width = Number(body.width);
  const height = Number(body.height);
  const usable = (value: number) =>
    Number.isFinite(value) && value > 0 && value <= MAX_RECORDED_EDGE;
  if (!usable(width) || !usable(height)) return null;
  return { width: Math.round(width), height: Math.round(height) };
};

/** Free text, capped, and trimmed. Empty means unset. */
const readCredit = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, 160) : '';

export async function GET(request: NextRequest, context: Context) {
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

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, false);
  if ('error' in access) return access.error;

  const result = await loadPressKitAssets(adminClient, kitId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ assets: result.assets });
}

export async function POST(request: NextRequest, context: Context) {
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
    storage_path?: unknown;
    file_name?: unknown;
    file_size?: unknown;
    mime_type?: unknown;
    width?: unknown;
    height?: unknown;
    photographer_credit?: unknown;
    usage_rights?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type.trim() : '';
  const fileSize = Number(body.file_size);

  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path is required.' }, { status: 400 });
  }

  // The path came back from our own upload-url handler, but it arrives here
  // through the client, so it is checked against this kit's own prefix before
  // a row is allowed to point at it. Without this a caller could record a row
  // aimed at any object in the bucket. The workspace logo PUT does the same.
  if (!storagePath.startsWith(pressKitStoragePrefix(kitId))) {
    return NextResponse.json({ error: 'That file does not belong to this kit.' }, { status: 400 });
  }

  const validation = validatePressPhotoFile({
    name: fileName,
    type: mimeType,
    size: fileSize,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { data: lastRow } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .select('position')
    .eq('kit_id', kitId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = Number(asRow(lastRow).position || 0) + 1;
  const dimensions = readReportedDimensions(body);
  const usageRights = isPressPhotoUsageRight(body.usage_rights)
    ? body.usage_rights
    : readCredit(body.usage_rights);

  const { data, error } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .insert({
      // Stamped with the KIT's owner, never the teammate who uploaded it. A
      // press photo has to outlive whoever happened to add it, and every
      // owner-scoped read and export keys off this column.
      owner_user_id: access.ownerUserId,
      kit_id: kitId,
      kind: 'press_photo',
      file_name: fileName,
      file_size: Math.round(fileSize),
      mime_type: mimeType || null,
      storage_bucket: RELEASE_ASSETS_BUCKET,
      storage_path: storagePath,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      photographer_credit: readCredit(body.photographer_credit) || null,
      usage_rights: usageRights || null,
      position: nextPosition,
    })
    .select(PRESS_KIT_ASSET_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not save the photo.' },
      { status: 500 }
    );
  }

  const result = await loadPressKitAssets(adminClient, kitId);
  const saved = 'assets' in result ? result.assets.find((asset) => asset.id === asRow(data).id) : null;

  return NextResponse.json({ asset: saved || toPressKitAsset(asRow(data), null) }, { status: 201 });
}
