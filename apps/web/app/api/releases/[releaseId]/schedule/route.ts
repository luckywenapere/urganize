import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  parseOptionalReleaseDate,
  requireActiveAuthenticatedUser,
} from '../../_shared';
import { ensureOwnedWorkspace } from '@/lib/tasks-server';
import { readTemplatePending, writeTemplatePending } from '@/lib/release-template-pending';
import { instantiateTemplate } from '@/lib/release-templates/instantiate';
import { getTemplate } from '@/lib/release-templates/loader';
import type { ReleaseType } from '@/lib/release-templates/types';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

/**
 * Sets a release date, and builds the rollout plan if this release has been
 * waiting on one (URG-230).
 *
 * Why this exists rather than reusing PATCH /api/releases/[releaseId]:
 *   1. That handler is a PUT in PATCH's clothing — it writes the whole row,
 *      so omitting `description` nulls it, and it hard-requires `title`.
 *      A date-only save through it would mean the client echoing back fields
 *      it has no business resending.
 *   2. Building 64 activities is a large, surprising side effect to bury in a
 *      generic update handler. Here it's the stated job.
 *
 * Instantiation is the SAME `instantiateTemplate` call the create route makes
 * — deferred, not reimplemented. Nothing is re-dated and no existing activity
 * is touched, which is the whole reason the founder chose to hold the plan
 * rather than generate it undated and back-fill.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await requireActiveAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const { releaseId } = await context.params;
    if (!releaseId) {
      return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      releaseDate?: unknown;
      title?: unknown;
    };

    const releaseDateInput = String(body?.releaseDate || '').trim();
    if (!releaseDateInput) {
      return NextResponse.json({ error: 'Release date is required.' }, { status: 400 });
    }

    const releaseDateResult = parseOptionalReleaseDate(releaseDateInput);
    if (releaseDateResult.error || !releaseDateResult.value) {
      return NextResponse.json(
        { error: releaseDateResult.error || 'Release date is invalid.' },
        { status: 400 }
      );
    }

    // Optional rename, ridden along on the same save: the card offers a name
    // field when the release still carries DEFAULT_RELEASE_TITLE, and this is
    // the only rename path in the app. Blank/absent means "leave it alone" —
    // this route never nulls a title.
    const titleInput = String(body?.title || '').trim().slice(0, 140);

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    // `metadata` and `release_type` aren't in ensureReleaseOwnership's shared
    // column list (used by many routes) — read them here rather than widening
    // that select. The metadata row is re-read here (not carried from the
    // client) so the clear below is a true read-modify-write and can't drop
    // another key.
    const pendingResult = await adminClient
      .from('releases')
      .select('metadata,release_type')
      .eq('id', releaseId)
      .maybeSingle();

    if (pendingResult.error) {
      return NextResponse.json(
        { error: pendingResult.error.message || 'Could not load release.' },
        { status: 500 }
      );
    }

    const existingMetadata = (pendingResult.data?.metadata || null) as Record<
      string,
      unknown
    > | null;
    const templatePending = readTemplatePending(existingMetadata);
    const releaseType = String(pendingResult.data?.release_type || 'single');

    // Write the date FIRST and independently of instantiation. If the plan
    // build fails below, the user still got the thing they asked for, and the
    // release stays `template_pending` so the card reappears and they can
    // retry — rather than losing the date to a rolled-back write.
    const updateResult = await adminClient
      .from('releases')
      .update({
        release_date: releaseDateResult.value,
        ...(titleInput ? { title: titleInput } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', releaseId)
      .select('id,title,release_date')
      .single();

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message || 'Could not save the release date.' },
        { status: 500 }
      );
    }

    let activitiesCreated = 0;

    if (templatePending) {
      try {
        const workspace = await ensureOwnedWorkspace(adminClient, auth.user);
        const template = getTemplate(releaseType as ReleaseType);
        await instantiateTemplate({
          template,
          releaseId,
          releaseDate: releaseDateResult.value,
          workspaceId: workspace.id,
          ownerUserId: auth.user.id,
          supabaseClient: adminClient,
        });
        activitiesCreated = template.tasks.length;

        // Only cleared on success. A failure leaves the flag set so the card
        // stays up and the user can try again, instead of the release
        // silently ending up with no plan and no way back to one.
        await adminClient
          .from('releases')
          .update({ metadata: writeTemplatePending(existingMetadata, false) })
          .eq('id', releaseId);
      } catch (templateError) {
        console.error(
          `Release ${releaseId}: date saved but deferred template instantiation failed.`,
          templateError
        );
        return NextResponse.json(
          {
            releaseDate: releaseDateResult.value,
            activitiesCreated: 0,
            templatePending: true,
            error:
              'Your release date was saved, but the rollout plan could not be built. Try again from the release.',
          },
          { status: 207 }
        );
      }
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('release_date_set', {
        release_id: releaseId,
        // Distinguishes "filled in a date they'd skipped" from the
        // set-at-creation case the create route already reports.
        deferred: true,
        activities_created: activitiesCreated,
      })
    );

    return NextResponse.json({
      releaseId,
      releaseDate: releaseDateResult.value,
      title: String(updateResult.data?.title || ''),
      activitiesCreated,
      templatePending: false,
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
