import { NextResponse, type NextRequest } from 'next/server';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { isPressPhotoUsageRight } from '@/lib/press-photo';
import {
  PRESS_KIT_ASSETS_TABLE,
  PRESS_KIT_ASSET_COLUMNS,
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  loadPressKitAssets,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
} from '../../../_shared';

/**
 * One photo on a kit: change its credit, rights or place in the order, or
 * remove it.
 */

type Context = { params: Promise<{ kitId: string; assetId: string }> };

const readText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Load the row and refuse it if it belongs to another kit.
 *
 * Access has already been checked for the KIT, so without this an id from a
 * different kit would be edited or deleted on that kit's authority. The
 * defence-in-depth check the single-asset release route carries, with
 * `kit_id` in place of `release_id`.
 */
const loadOwnedAsset = async (
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  kitId: string,
  assetId: string
): Promise<{ row: Record<string, unknown> } | { error: NextResponse }> => {
  const { data, error } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .select(PRESS_KIT_ASSET_COLUMNS)
    .eq('id', assetId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load that photo.' },
        { status: 500 }
      ),
    };
  }

  const row = asRow(data);
  if (!row.id || String(row.kit_id || '') !== kitId) {
    return { error: NextResponse.json({ error: 'Photo not found.' }, { status: 404 }) };
  }

  return { row };
};

export async function PATCH(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId, assetId } = await context.params;
  if (!kitId || !assetId) {
    return NextResponse.json({ error: 'Press kit and photo id are required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Send what you want to change.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ('photographerCredit' in body) {
    patch.photographer_credit = readText(body.photographerCredit, 160) || null;
  }

  if ('usageRights' in body) {
    const value = body.usageRights;
    patch.usage_rights = isPressPhotoUsageRight(value) ? value : readText(value, 160) || null;
  }

  if ('position' in body) {
    const position = Number(body.position);
    if (!Number.isFinite(position) || position < 0 || position > 999) {
      return NextResponse.json({ error: 'That is not a place in the order.' }, { status: 400 });
    }
    patch.position = Math.round(position);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;

  const owned = await loadOwnedAsset(adminClient, kitId, assetId);
  if ('error' in owned) return owned.error;

  const { error } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .update(patch)
    .eq('id', assetId)
    .eq('kit_id', kitId);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save that photo.' },
      { status: 500 }
    );
  }

  // The whole set comes back rather than the one row: a reorder moves two
  // photos, so returning only the one edited would leave the grid disagreeing
  // with the database until the next load.
  const result = await loadPressKitAssets(adminClient, kitId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ assets: result.assets });
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId, assetId } = await context.params;
  if (!kitId || !assetId) {
    return NextResponse.json({ error: 'Press kit and photo id are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;

  const owned = await loadOwnedAsset(adminClient, kitId, assetId);
  if ('error' in owned) return owned.error;

  // Storage object first, then the row. The recorded rule: an orphan storage
  // object is recoverable, an orphan row pointing at nothing is harder to
  // detect. A failed remove here is logged and the row still goes, because a
  // photo the manager deleted must not reappear.
  const storagePath = String(owned.row.storage_path || '');
  if (storagePath) {
    const { error: storageError } = await adminClient.storage
      .from(String(owned.row.storage_bucket || RELEASE_ASSETS_BUCKET))
      .remove([storagePath]);
    if (storageError) {
      console.error('[press-kit-assets] storage remove failed', storagePath, storageError);
    }
  }

  const { error } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .delete()
    .eq('id', assetId)
    .eq('kit_id', kitId);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove that photo.' },
      { status: 500 }
    );
  }

  const result = await loadPressKitAssets(adminClient, kitId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ assets: result.assets });
}
