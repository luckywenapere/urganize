import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../_shared/paywall';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
} from '../../_shared';
import {
  ensurePlaybookInitialized,
  ensurePlaybookStepOwnership,
  buildMissingPlaybookSchemaResponse,
  isPlaybookSchemaMissingError,
  toPlaybookResponse,
} from './_shared';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
  if ('error' in playbookResult) {
    return playbookResult.error;
  }

  return NextResponse.json({
    release: ownership.release,
    playbook: toPlaybookResponse(playbookResult.playbook),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const paywallResponse = await requirePaidAccess(auth.user.id, {
    feature: 'release_playbook',
    message: 'Upgrade required to edit the release playbook.',
  });
  if (paywallResponse) return paywallResponse;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const rawCompleted = (body as { isCompleted?: unknown } | null)?.isCompleted;
  const stepIdCandidate = String((body as { stepId?: unknown } | null)?.stepId || '').trim();
  const itemKeyCandidate = String((body as { itemKey?: unknown } | null)?.itemKey || '').trim();

  if (typeof rawCompleted !== 'boolean') {
    return NextResponse.json({ error: 'Completion state is required.' }, { status: 400 });
  }

  if (!stepIdCandidate && !itemKeyCandidate) {
    return NextResponse.json({ error: 'Playbook step id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  let stepId = stepIdCandidate;
  if (!stepId) {
    const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
    if ('error' in playbookResult) {
      return playbookResult.error;
    }

    stepId =
      playbookResult.playbook.steps.find(
        (step) => step.templateKey === itemKeyCandidate || step.id === itemKeyCandidate
      )?.id || '';
  }

  if (!stepId) {
    return NextResponse.json({ error: 'Playbook step not found.' }, { status: 404 });
  }

  const stepOwnership = await ensurePlaybookStepOwnership(adminClient!, releaseId, auth.user.id, stepId);
  if ('error' in stepOwnership) {
    return stepOwnership.error;
  }

  const completedAt = rawCompleted
    ? stepOwnership.step.completed_at || new Date().toISOString()
    : null;

  const { error } = await adminClient!
    .from('release_playbook_steps')
    .update({
      is_completed: rawCompleted,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stepId)
    .eq('release_id', releaseId)
    .eq('user_id', auth.user.id);

  if (error) {
    if (isPlaybookSchemaMissingError(error)) {
      return buildMissingPlaybookSchemaResponse();
    }
    return NextResponse.json(
      { error: error.message || 'Could not update the release playbook.' },
      { status: 500 }
    );
  }

  const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
  if ('error' in playbookResult) {
    return playbookResult.error;
  }

  return NextResponse.json({
    playbook: toPlaybookResponse(playbookResult.playbook),
  });
}
