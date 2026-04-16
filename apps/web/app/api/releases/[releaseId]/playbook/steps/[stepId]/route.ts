import { NextRequest, NextResponse } from 'next/server';
import { parseReleasePlaybookPhaseKey } from '@/lib/release-playbook';
import { requirePaidAccess } from '../../../../../_shared/paywall';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
} from '../../../../_shared';
import {
  buildMissingPlaybookSchemaResponse,
  ensurePlaybookInitialized,
  ensurePlaybookStepOwnership,
  isPlaybookSchemaMissingError,
  RELEASE_PLAYBOOK_STEPS_TABLE,
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
  context: { params: Promise<{ releaseId: string; stepId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'release_playbook',
      message: 'Upgrade required to edit playbook steps.',
    });
    if (paywallResponse) return paywallResponse;

    const { releaseId, stepId } = await context.params;
    if (!releaseId || !stepId) {
      return NextResponse.json({ error: 'Release id and step id are required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const hasTitle = Object.prototype.hasOwnProperty.call(body || {}, 'title');
    const hasDescription = Object.prototype.hasOwnProperty.call(body || {}, 'description');
    const hasCompleted = Object.prototype.hasOwnProperty.call(body || {}, 'isCompleted');
    const hasPosition = Object.prototype.hasOwnProperty.call(body || {}, 'position');
    const hasPhaseKey = Object.prototype.hasOwnProperty.call(body || {}, 'phaseKey');

    if (!hasTitle && !hasDescription && !hasCompleted && !hasPosition && !hasPhaseKey) {
      return NextResponse.json({ error: 'No playbook changes were provided.' }, { status: 400 });
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    const stepOwnership = await ensurePlaybookStepOwnership(adminClient!, releaseId, auth.user.id, stepId);
    if ('error' in stepOwnership) {
      return stepOwnership.error;
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (hasTitle) {
      const title = String((body as { title?: unknown } | null)?.title || '').trim();
      if (!title) {
        return NextResponse.json({ error: 'Step title is required.' }, { status: 400 });
      }
      updates.title = title;
    }

    if (hasDescription) {
      const descriptionValue = String((body as { description?: unknown } | null)?.description || '').trim();
      updates.description = descriptionValue ? descriptionValue : null;
    }

    let completionTarget: boolean | null = null;
    if (hasCompleted) {
      const rawCompleted = (body as { isCompleted?: unknown } | null)?.isCompleted;
      if (typeof rawCompleted !== 'boolean') {
        return NextResponse.json({ error: 'Completion state must be true or false.' }, { status: 400 });
      }

      completionTarget = rawCompleted;
      updates.is_completed = rawCompleted;
      updates.completed_at = rawCompleted
        ? stepOwnership.step.completed_at || new Date().toISOString()
        : null;
    }

    if (hasPosition) {
      const position = Number((body as { position?: unknown } | null)?.position);
      if (!Number.isInteger(position) || position < 1) {
        return NextResponse.json({ error: 'Position must be a positive integer.' }, { status: 400 });
      }
      updates.position = position;
    }

    if (hasPhaseKey) {
      const phaseKey = parseReleasePlaybookPhaseKey((body as { phaseKey?: unknown } | null)?.phaseKey);
      if (!phaseKey) {
        return NextResponse.json({ error: 'A valid playbook phase is required.' }, { status: 400 });
      }
      updates.phase_key = phaseKey;
    }

    const { error } = await adminClient!
      .from(RELEASE_PLAYBOOK_STEPS_TABLE)
      .update(updates)
      .eq('id', stepId)
      .eq('release_id', releaseId)
      .eq('user_id', auth.user.id);

    if (error) {
      if (isPlaybookSchemaMissingError(error)) {
        return buildMissingPlaybookSchemaResponse();
      }
      return NextResponse.json(
        { error: error.message || 'Could not update the playbook step.' },
        { status: 500 }
      );
    }

    const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
    if ('error' in playbookResult) {
      return playbookResult.error;
    }

    if (completionTarget === true) {
      captureServerAnalyticsEvent(
        posthogServer,
        auth.user.id,
        createPostHogEvent('playbook_step_completed', {
          release_id: releaseId,
          step_id: stepOwnership.step.id,
          step_title: String(updates.title || stepOwnership.step.title || ''),
          is_custom: stepOwnership.step.is_custom,
        })
      );
    } else if (completionTarget === false) {
      captureServerAnalyticsEvent(
        posthogServer,
        auth.user.id,
        createPostHogEvent('playbook_step_uncompleted', {
          release_id: releaseId,
          step_id: stepOwnership.step.id,
        })
      );
    }

    return NextResponse.json({
      playbook: toPlaybookResponse(playbookResult.playbook),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; stepId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'release_playbook',
      message: 'Upgrade required to delete playbook steps.',
    });
    if (paywallResponse) return paywallResponse;

    const { releaseId, stepId } = await context.params;
    if (!releaseId || !stepId) {
      return NextResponse.json({ error: 'Release id and step id are required.' }, { status: 400 });
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    const stepOwnership = await ensurePlaybookStepOwnership(adminClient!, releaseId, auth.user.id, stepId);
    if ('error' in stepOwnership) {
      return stepOwnership.error;
    }

    const { error } = await adminClient!
      .from(RELEASE_PLAYBOOK_STEPS_TABLE)
      .delete()
      .eq('id', stepId)
      .eq('release_id', releaseId)
      .eq('user_id', auth.user.id);

    if (error) {
      if (isPlaybookSchemaMissingError(error)) {
        return buildMissingPlaybookSchemaResponse();
      }
      return NextResponse.json(
        { error: error.message || 'Could not delete the playbook step.' },
        { status: 500 }
      );
    }

    const playbookResult = await ensurePlaybookInitialized(adminClient!, releaseId, auth.user.id);
    if ('error' in playbookResult) {
      return playbookResult.error;
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('playbook_step_deleted', {
        release_id: releaseId,
        was_default: !stepOwnership.step.is_custom,
      })
    );

    return NextResponse.json({
      deletedStep: {
        id: stepOwnership.step.id,
        isCustom: stepOwnership.step.is_custom,
      },
      playbook: toPlaybookResponse(playbookResult.playbook),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
