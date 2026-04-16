import { NextRequest, NextResponse } from 'next/server';
import { getNextPlaybookPosition, parseReleasePlaybookPhaseKey } from '@/lib/release-playbook';
import { requirePaidAccess } from '../../../../_shared/paywall';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
} from '../../../_shared';
import {
  buildMissingPlaybookSchemaResponse,
  ensurePlaybookInitialized,
  isPlaybookSchemaMissingError,
  RELEASE_PLAYBOOK_STEPS_TABLE,
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
      message: 'Upgrade required to add playbook steps.',
    });
    if (paywallResponse) return paywallResponse;

    const { releaseId } = await context.params;
    if (!releaseId) {
      return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const phaseKey = parseReleasePlaybookPhaseKey((body as { phaseKey?: unknown } | null)?.phaseKey);
    const title = String((body as { title?: unknown } | null)?.title || '').trim();
    const descriptionValue = String((body as { description?: unknown } | null)?.description || '').trim();
    const description = descriptionValue ? descriptionValue : null;

    if (!phaseKey) {
      return NextResponse.json({ error: 'A valid playbook phase is required.' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Step title is required.' }, { status: 400 });
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
    if ('error' in playbookResult) {
      return playbookResult.error;
    }

    const nextPosition = getNextPlaybookPosition(playbookResult.playbook.steps, phaseKey);
    const { error } = await adminClient!
      .from(RELEASE_PLAYBOOK_STEPS_TABLE)
      .insert({
        release_id: releaseId,
        user_id: auth.user.id,
        phase_key: phaseKey,
        template_key: null,
        title,
        description,
        is_completed: false,
        completed_at: null,
        is_custom: true,
        position: nextPosition,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      if (isPlaybookSchemaMissingError(error)) {
        return buildMissingPlaybookSchemaResponse();
      }
      return NextResponse.json(
        { error: error.message || 'Could not create the playbook step.' },
        { status: 500 }
      );
    }

    const nextPlaybookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
    if ('error' in nextPlaybookResult) {
      return nextPlaybookResult.error;
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('playbook_step_added', {
        release_id: releaseId,
      })
    );

    return NextResponse.json(
      {
        playbook: toPlaybookResponse(nextPlaybookResult.playbook),
      },
      { status: 201 }
    );
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
