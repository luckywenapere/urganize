import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../../../_shared/paywall';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
} from '../../../../_shared';
import {
  ensurePlaybookInitialized,
  reorderPlaybookPhase,
  toPlaybookResponse,
} from '../../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'release_playbook',
      message: 'Upgrade required to reorder the release playbook.',
    });
    if (paywallResponse) return paywallResponse;

    const { releaseId } = await context.params;
    if (!releaseId) {
      return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const orderedStepIds = Array.isArray((body as { orderedStepIds?: unknown } | null)?.orderedStepIds)
      ? ((body as { orderedStepIds?: unknown[] }).orderedStepIds || [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [];

    if (orderedStepIds.length === 0) {
      return NextResponse.json({ error: 'An ordered list of step ids is required.' }, { status: 400 });
    }

    if (new Set(orderedStepIds).size !== orderedStepIds.length) {
      return NextResponse.json({ error: 'Step ids must be unique.' }, { status: 400 });
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
    if ('error' in playbookResult) {
      return playbookResult.error;
    }

    const orderedSteps = orderedStepIds.map((stepId) =>
      playbookResult.playbook.steps.find((step) => step.id === stepId) || null
    );

    if (orderedSteps.some((step) => !step)) {
      return NextResponse.json({ error: 'One or more playbook steps could not be found.' }, { status: 400 });
    }

    const phaseKey = orderedSteps[0]?.phaseKey;
    if (!phaseKey || orderedSteps.some((step) => step?.phaseKey !== phaseKey)) {
      return NextResponse.json(
        { error: 'Playbook reorder requests must stay within a single phase.' },
        { status: 400 }
      );
    }

    const reorderResult = await reorderPlaybookPhase(
      adminClient!,
      releaseId,
      auth.user.id,
      phaseKey,
      orderedStepIds
    );
    if ('error' in reorderResult) {
      return reorderResult.error;
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('playbook_reordered', {
        release_id: releaseId,
      })
    );

    return NextResponse.json({
      playbook: toPlaybookResponse(reorderResult.playbook),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
