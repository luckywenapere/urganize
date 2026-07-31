import { NextRequest, NextResponse } from 'next/server';
import {
  RELEASE_CREDIT_SUBMISSIONS_TABLE,
  createAdminClient,
  ensureReleaseOwnership,
  isMetadataFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; submissionId: string }> }
) {
  if (!isMetadataFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, submissionId } = await context.params;
  if (!releaseId || !submissionId) {
    return NextResponse.json({ error: 'Release id and submission id are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  // Idempotent delete: removing an already-removed submission is a success.
  const { error } = await adminClient
    .from(RELEASE_CREDIT_SUBMISSIONS_TABLE)
    .delete()
    .eq('id', submissionId)
    .eq('release_id', releaseId);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not remove the submission.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
