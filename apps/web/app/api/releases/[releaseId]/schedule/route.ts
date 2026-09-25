import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  parseOptionalReleaseDate,
  requireActiveAuthenticatedUser,
} from '../../_shared';
import { ensureOwnedWorkspace } from '@/lib/tasks-server';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import { RELEASE_TITLE_MAX_LENGTH } from '@/lib/release-edit';
import { alignPlanToReleaseDate } from '@/lib/release-plan-dates-server';
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
 * Sets or changes a release date — the ONE place a rollout's date changes
 * (PATCH /api/releases/[releaseId] refuses to, since 2026-09-25).
 *
 * Two things can follow a new date, and this route owns both:
 *   1. A plan-waiting rollout (URG-230) gets its plan BUILT. Instantiation is
 *      the SAME `instantiateTemplate` call the create route makes — deferred,
 *      not reimplemented — which is why the founder chose to hold the plan
 *      rather than generate it undated and back-fill.
 *   2. A rollout that already has a plan gets it MOVED so it still lines up
 *      with release day (lib/release-plan-dates-server.ts). Before 2026-09-25
 *      nothing moved: changing the date left every activity where it was, so
 *      the timeline drew the release-day posts weeks away from release day.
 *      Open activities the plan generated move by exactly as many days as the
 *      date did; finished ones and ones a person added by hand stay put. When
 *      the rollout had no date — the state UrgAns's rename bug left rollouts
 *      in — the distance is measured from the day the plan was built for,
 *      read back off the plan itself, so putting that day back moves nothing.
 *
 * Why this is not PATCH /api/releases/[releaseId]: building or moving 64
 * activities is a large side effect to bury in a generic edit. Here it is the
 * stated job.
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
      return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
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

    // Optional rename, ridden along on the same save: the date card and the
    // setup sheet offer a name field while the rollout still carries a default
    // title. Blank/absent means "leave it alone" — this route never nulls a
    // title. Cleaned exactly as the create and edit routes clean it, so three
    // doors onto one column cannot store three shapes of title.
    const titleInput =
      typeof body?.title === 'string'
        ? body.title.trim().replace(/\s+/g, ' ').slice(0, RELEASE_TITLE_MAX_LENGTH)
        : '';

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
      .select('metadata,release_type,release_date')
      .eq('id', releaseId)
      .maybeSingle();

    if (pendingResult.error) {
      return NextResponse.json(
        { error: pendingResult.error.message || 'Could not load rollout.' },
        { status: 500 }
      );
    }

    const existingMetadata = (pendingResult.data?.metadata || null) as Record<
      string,
      unknown
    > | null;
    const templatePending = readTemplatePending(existingMetadata);
    const releaseType = String(pendingResult.data?.release_type || 'single');
    // The date BEFORE this save — what an existing plan was lined up with.
    const previousDate = pendingResult.data?.release_date
      ? String(pendingResult.data.release_date).slice(0, 10)
      : null;

    // A rename only when the name actually changes, and then the slug moves
    // with it, the way the edit route moves it.
    const renaming = Boolean(titleInput) && titleInput !== ownership.release.title;

    // Write the date FIRST and independently of instantiation. If the plan
    // build fails below, the user still got the thing they asked for, and the
    // release stays `template_pending` so the card reappears and they can
    // retry — rather than losing the date to a rolled-back write.
    const updateResult = await adminClient
      .from('releases')
      .update({
        release_date: releaseDateResult.value,
        ...(renaming
          ? {
              title: titleInput,
              slug: normalizeReleaseSlug(titleInput) || ownership.release.slug,
            }
          : {}),
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

    // The edit route mirrors a rename into release_metadata.release_title (what
    // a distributor sees). This door did not, so a rollout named from the date
    // card kept "Untitled rollout" in its metadata forever. Best effort: the
    // rename itself has landed.
    if (renaming) {
      const metadataUpdate = await adminClient
        .from('release_metadata')
        .upsert(
          {
            release_id: releaseId,
            release_title: titleInput,
            primary_artist_name: ownership.release.artistName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'release_id' }
        );
      if (metadataUpdate.error) {
        console.error(
          `Release ${releaseId}: renamed, but the metadata title could not be updated.`,
          metadataUpdate.error.message
        );
      }
    }

    let activitiesCreated = 0;
    let activitiesMoved = 0;
    let activitiesNotMoved = 0;

    // An existing plan follows its release day. Skipped for a plan-waiting
    // rollout (its plan is BUILT from the new date below, so there is nothing
    // to move) and when the date did not actually change.
    if (!templatePending && previousDate !== releaseDateResult.value) {
      const alignment = await alignPlanToReleaseDate(adminClient, {
        releaseId,
        previousDate,
        nextDate: releaseDateResult.value,
        releaseType,
      });
      activitiesMoved = alignment.moved;
      activitiesNotMoved = alignment.failed;
    }

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
              'Your release date was saved, but the rollout plan could not be built. Try again from the rollout.',
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
        activities_moved: activitiesMoved,
      })
    );

    return NextResponse.json({
      releaseId,
      releaseDate: releaseDateResult.value,
      title: String(updateResult.data?.title || ''),
      activitiesCreated,
      activitiesMoved,
      // Non-zero only when some of the plan could not be moved; the caller
      // says so rather than reporting a clean move.
      activitiesNotMoved,
      templatePending: false,
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
