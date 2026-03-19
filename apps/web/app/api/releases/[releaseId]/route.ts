import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
  rebuildReleaseMetadataSnapshot,
} from '../_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';

const trimString = (value: unknown): string => String(value || '').trim();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const commandCenter = await loadReleaseCommandCenterData(adminClient!, ownership.release);
  if ('error' in commandCenter) return commandCenter.error;

  const computedStatus = commandCenter.readiness.readyForDistribution
    ? 'ready'
    : commandCenter.collaborators.length > 0
      ? 'in_progress'
      : 'draft';

  return NextResponse.json({
    release: {
      ...ownership.release,
      status: computedStatus,
    },
    readiness: commandCenter.readiness,
    collaborators: commandCenter.collaborators,
    metadata: commandCenter.metadata,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const title = trimString(body?.title);
  const releaseDate = trimString(body?.releaseDate);
  const description = trimString(body?.description);
  const artistName = trimString(body?.artistName) || ownership.release.artistName;
  const status = trimString(body?.status) || ownership.release.status;

  if (!title) return NextResponse.json({ error: 'Release title is required.' }, { status: 400 });
  if (!releaseDate) return NextResponse.json({ error: 'Release date is required.' }, { status: 400 });

  const releaseUpdate = await adminClient!
    .from('releases')
    .update({
      title,
      slug: normalizeReleaseSlug(title) || ownership.release.slug,
      release_date: releaseDate,
      description: description || null,
      artist_name: artistName,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', releaseId)
    .eq('owner_user_id', auth.user.id);

  if (releaseUpdate.error) {
    if (isOptionalTableMissingError(releaseUpdate.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releaseUpdate.error.message || 'Could not update release.' }, { status: 500 });
  }

  const metadataUpdate = await adminClient!
    .from(RELEASE_METADATA_TABLE)
    .upsert(
      {
        release_id: releaseId,
        primary_artist_name: artistName,
        release_title: title,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'release_id' }
    );

  if (metadataUpdate.error) {
    if (isOptionalTableMissingError(metadataUpdate.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: metadataUpdate.error.message || 'Could not update metadata.' }, { status: 500 });
  }

  const refreshedRelease = {
    ...ownership.release,
    title,
    artistName,
    releaseDate,
    description,
    status: status as typeof ownership.release.status,
  };

  const rebuildResult = await rebuildReleaseMetadataSnapshot(adminClient!, refreshedRelease);
  if ('error' in rebuildResult) return rebuildResult.error;

  const eventResult = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'metadata_updated',
    payload_json: { title, artistName, releaseDate },
  });

  if (eventResult.error) {
    if (isOptionalTableMissingError(eventResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventResult.error.message || 'Could not log metadata event.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'saved' });
}
