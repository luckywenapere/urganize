import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_EVENTS_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  rebuildReleaseMetadataSnapshot,
} from '../../../_shared';

export async function POST(
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

  const rebuildResult = await rebuildReleaseMetadataSnapshot(adminClient!, ownership.release);
  if ('error' in rebuildResult) return rebuildResult.error;

  const eventResult = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'metadata_updated',
    payload_json: {
      rebuiltAt: new Date().toISOString(),
      submissionCount: rebuildResult.submissions.length,
    },
  });

  if (eventResult.error) {
    if (isOptionalTableMissingError(eventResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventResult.error.message || 'Could not log metadata event.' }, { status: 500 });
  }

  return NextResponse.json({ metadata: rebuildResult.metadata });
}
