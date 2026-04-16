import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../_shared/paywall';
import {
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
} from '../../_shared';
import { normalizeCollaboratorInputs, validateCollaboratorInput } from '@/lib/release-ops';

const createSubmissionToken = () => randomBytes(24).toString('base64url');

const buildSubmissionUrl = (request: NextRequest, token: string) => {
  const origin = request.nextUrl.origin;
  return `${origin}/credits/${token}`;
};

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

  return NextResponse.json({ collaborators: commandCenter.collaborators });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const paywallResponse = await requirePaidAccess(auth.user.id, {
    feature: 'credits_tools',
    message: 'Upgrade required to invite collaborators.',
  });
  if (paywallResponse) return paywallResponse;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const collaborators = normalizeCollaboratorInputs(body?.collaborators);
  if (collaborators.length === 0) {
    return NextResponse.json({ error: 'Add at least one collaborator.' }, { status: 400 });
  }

  const validationError = collaborators.map((item) => validateCollaboratorInput(item)).find(Boolean);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const now = new Date().toISOString();
  const insertResult = await adminClient!
    .from(RELEASE_COLLABORATORS_TABLE)
    .insert(
      collaborators.map((item) => ({
        release_id: releaseId,
        invite_name: item.inviteName,
        invite_contact: item.inviteContact,
        role: item.role,
        status: 'pending',
        submission_token: createSubmissionToken(),
        submission_sent_at: now,
        updated_at: now,
      }))
    )
    .select('*');

  if (insertResult.error) {
    if (isOptionalTableMissingError(insertResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: insertResult.error.message || 'Could not add collaborators.' }, { status: 500 });
  }

  const createdItems = (insertResult.data || []).map((row) => ({
    id: String(row.id || ''),
    inviteName: String(row.invite_name || ''),
    inviteContact: String(row.invite_contact || ''),
    role: String(row.role || ''),
    status: String(row.status || 'pending'),
    submissionToken: String(row.submission_token || ''),
    submissionUrl: buildSubmissionUrl(request, String(row.submission_token || '')),
  }));

  const eventInsert = await adminClient!.from(RELEASE_EVENTS_TABLE).insert(
    createdItems.flatMap((item) => [
      {
        release_id: releaseId,
        type: 'collaborator_added',
        payload_json: {
          collaboratorId: item.id,
          inviteName: item.inviteName,
          role: item.role,
        },
      },
      {
        release_id: releaseId,
        type: 'credit_link_sent',
        payload_json: {
          collaboratorId: item.id,
          inviteContact: item.inviteContact,
        },
      },
    ])
  );

  if (eventInsert.error) {
    if (isOptionalTableMissingError(eventInsert.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventInsert.error.message || 'Could not log collaborator events.' }, { status: 500 });
  }

  return NextResponse.json({ collaborators: createdItems });
}
