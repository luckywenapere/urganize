import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from '../../../_shared';
import { requireEntitlement } from '@/lib/entitlements';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';

const ASSETS_TABLE = 'assets';

// Feature flag (URG-182): same flag as the parent assets routes.
const isFilesFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; assetId: string }> }
) {
  if (!isFilesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, assetId } = await context.params;
  if (!releaseId || !assetId) {
    return NextResponse.json(
      { error: 'Release id and asset id are required.' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // file_management is paid-tier (URG-178) — live entitlement check on top
  // of the NEXT_PUBLIC_FEATURE_FILES master switch above.
  const entitlement = await requireEntitlement(
    'fileManagement',
    auth.user.id,
    auth.user.email,
    adminClient
  );
  if ('error' in entitlement) return entitlement.error;

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const fetchResult = await adminClient
    .from(ASSETS_TABLE)
    .select('id, release_id, storage_bucket, storage_path')
    .eq('id', assetId)
    .maybeSingle();

  if (fetchResult.error) {
    if (isOptionalTableMissingError(fetchResult.error)) {
      return NextResponse.json({ error: 'Assets schema is missing.' }, { status: 501 });
    }
    return NextResponse.json(
      { error: fetchResult.error.message || 'Could not load asset.' },
      { status: 500 }
    );
  }

  if (!fetchResult.data) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  }

  // Defense in depth: confirm the asset belongs to the URL's release.
  if (fetchResult.data.release_id !== releaseId) {
    return NextResponse.json(
      { error: 'Asset does not belong to this release.' },
      { status: 404 }
    );
  }

  const bucket = String(fetchResult.data.storage_bucket || RELEASE_ASSETS_BUCKET);
  const storagePath = String(fetchResult.data.storage_path || '');

  // Storage delete first. If this fails, leave the DB row in place so a retry
  // can finish the job — orphan storage is recoverable; an orphan DB row
  // pointing at nothing is harder to detect.
  if (storagePath) {
    const removeResult = await adminClient.storage.from(bucket).remove([storagePath]);
    if (removeResult.error) {
      return NextResponse.json(
        { error: removeResult.error.message || 'Could not delete storage object.' },
        { status: 500 }
      );
    }
  }

  const deleteResult = await adminClient.from(ASSETS_TABLE).delete().eq('id', assetId);
  if (deleteResult.error) {
    return NextResponse.json(
      { error: deleteResult.error.message || 'Could not delete asset row.' },
      { status: 500 }
    );
  }

  // releases.artwork_asset_id has ON DELETE SET NULL — the FK auto-clears
  // the column when this asset row is deleted. No explicit update needed.
  return new NextResponse(null, { status: 204 });
}
