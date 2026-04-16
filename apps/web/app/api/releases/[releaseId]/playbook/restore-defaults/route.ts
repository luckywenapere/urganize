import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../../_shared/paywall';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
} from '../../../_shared';
import {
  restoreMissingDefaultPlaybookSteps,
  toPlaybookResponse,
} from '../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'release_playbook',
      message: 'Upgrade required to restore playbook defaults.',
    });
    if (paywallResponse) return paywallResponse;

    const { releaseId } = await context.params;
    if (!releaseId) {
      return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    const restoreResult = await restoreMissingDefaultPlaybookSteps(
      adminClient!,
      releaseId,
      auth.user.id
    );
    if ('error' in restoreResult) {
      return restoreResult.error;
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('playbook_defaults_restored', {
        release_id: releaseId,
      })
    );

    return NextResponse.json({
      playbook: toPlaybookResponse(restoreResult.playbook),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
