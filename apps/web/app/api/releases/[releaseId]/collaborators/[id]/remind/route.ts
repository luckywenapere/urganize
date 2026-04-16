import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../../../_shared/paywall';
import {
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from '../../../../_shared';

const buildSubmissionUrl = (request: NextRequest, token: string) => `${request.nextUrl.origin}/credits/${token}`;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const paywallResponse = await requirePaidAccess(auth.user.id, {
    feature: 'credits_tools',
    message: 'Upgrade required to invite collaborators.',
  });
  if (paywallResponse) return paywallResponse;

  const { releaseId, id } = await context.params;
  if (!releaseId || !id) return NextResponse.json({ error: 'Collaborator id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const now = new Date().toISOString();
  const updateResult = await adminClient!
    .from(RELEASE_COLLABORATORS_TABLE)
    .update({ last_reminded_at: now, updated_at: now })
    .eq('id', id)
    .eq('release_id', releaseId)
    .select('id,submission_token')
    .maybeSingle();

  if (updateResult.error) {
    if (isOptionalTableMissingError(updateResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: updateResult.error.message || 'Could not update reminder.' }, { status: 500 });
  }

  if (!updateResult.data?.submission_token) {
    return NextResponse.json({ error: 'Collaborator not found.' }, { status: 404 });
  }

  const eventInsert = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'reminder_sent',
    payload_json: {
      releaseCollaboratorId: id,
      remindedAt: now,
    },
  });

  if (eventInsert.error) {
    if (isOptionalTableMissingError(eventInsert.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventInsert.error.message || 'Could not log reminder event.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    submissionUrl: buildSubmissionUrl(request, String(updateResult.data.submission_token)),
  });
}
