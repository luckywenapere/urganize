import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../_shared/paywall';
import {
  RELEASE_COLLABORATORS_TABLE,
  RELEASE_EVENTS_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  requireActiveAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
} from '../../_shared';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const commandCenter = await loadReleaseCommandCenterData(adminClient!, ownership.release);
  if ('error' in commandCenter) return commandCenter.error;

  return NextResponse.json({ collaborators: commandCenter.collaborators });
}

type AddCollaboratorBody = {
  collaboratorId?: string;
  role?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const paywallResponse = await requirePaidAccess(auth.user.id, {
    feature: 'credits_tools',
    message: 'Upgrade required to add collaborators.',
  });
  if (paywallResponse) return paywallResponse;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => ({}))) as AddCollaboratorBody;
  const collaboratorId = String(body?.collaboratorId || '').trim();
  const role = String(body?.role || 'other').trim();

  if (!collaboratorId) {
    return NextResponse.json({ error: 'Collaborator id is required.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const insertResult = await adminClient!
    .from(RELEASE_COLLABORATORS_TABLE)
    .insert({
      release_id: releaseId,
      collaborator_id: collaboratorId,
      role,
      updated_at: now,
    })
    .select('id,release_id,collaborator_id,role,created_at,updated_at')
    .single();

  if (insertResult.error) {
    if (isOptionalTableMissingError(insertResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: insertResult.error.message || 'Could not add collaborator.' }, { status: 500 });
  }

  const eventInsert = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'collaborator_added',
    payload_json: {
      collaboratorId: insertResult.data.collaborator_id,
      role: insertResult.data.role,
    },
  });

  if (eventInsert.error) {
    if (isOptionalTableMissingError(eventInsert.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: eventInsert.error.message || 'Could not log collaborator event.' }, { status: 500 });
  }

  return NextResponse.json({ collaborator: insertResult.data });
}
