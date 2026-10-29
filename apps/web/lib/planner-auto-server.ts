import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PLANNER_AUTO_KEY,
  buildAutoPlanIntake,
  isPlannerAutoStale,
  readPlannerAuto,
  writePlannerAuto,
  type PlannerAutoState,
} from './planner-auto';
import { buildRolloutPlan } from './release-plan-build-server';
import type { PlannerReleaseRow } from './release-planning-actions-server';
import type { PlannerOnboardingContext, ReadyItem } from './release-planning';
import type { WorkspaceMember } from '@/types/auth';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from './posthog';

/**
 * The server half of auto-plan (see lib/planner-auto.ts for the why).
 *
 * Exactly one build per rollout: the auto build CLAIMS the rollout before the
 * model is asked, with a conditional write that only succeeds while
 * metadata.planner_auto is absent. The plan route refuses while a fresh claim
 * is running, and createReleasePlan's own guards (tasks_exist, the unique plan
 * row) stay behind both.
 */

const RELEASES_TABLE = 'releases';
const RELEASE_COLUMNS =
  'id,owner_user_id,title,artist_name,release_date,release_type,release_context,metadata';

type Admin = SupabaseClient;

/** Claim the rollout for an auto build. Returns the row as claimed, or null when someone else has. */
export async function claimPlannerAuto(
  admin: Admin,
  releaseId: string,
  ownerUserId: string,
  now: number = Date.now()
): Promise<PlannerReleaseRow | null> {
  const { data, error } = await admin
    .from(RELEASES_TABLE)
    .select(RELEASE_COLUMNS)
    .eq('id', releaseId)
    .eq('owner_user_id', ownerUserId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as PlannerReleaseRow;
  if (readPlannerAuto(row.metadata)) return null;

  const claimedMetadata = writePlannerAuto(row.metadata, {
    state: 'running',
    started_at: new Date(now).toISOString(),
    source: 'onboarding',
  });
  // The condition is the lock: only one writer finds planner_auto absent.
  const claim = await admin
    .from(RELEASES_TABLE)
    .update({ metadata: claimedMetadata })
    .eq('id', releaseId)
    .eq('owner_user_id', ownerUserId)
    .is(`metadata->${PLANNER_AUTO_KEY}`, null)
    .select('id');
  if (claim.error || (claim.data || []).length !== 1) return null;
  return { ...row, metadata: claimedMetadata };
}

/** Record how an auto-planned rollout's build ended. A rollout that never auto-planned is left alone. */
export async function finishPlannerAuto(
  admin: Admin,
  releaseId: string,
  outcome: { state: 'done' | 'failed'; code?: string },
  now: number = Date.now()
): Promise<void> {
  try {
    const { data, error } = await admin.from(RELEASES_TABLE).select('metadata').eq('id', releaseId).maybeSingle();
    if (error || !data) return;
    const metadata = (data as { metadata: Record<string, unknown> | null }).metadata;
    const current = readPlannerAuto(metadata);
    if (!current) return;
    const next: PlannerAutoState = {
      ...current,
      state: outcome.state,
      finished_at: new Date(now).toISOString(),
      ...(outcome.code ? { code: outcome.code } : {}),
    };
    if (outcome.state === 'done') delete next.code;
    const update = await admin
      .from(RELEASES_TABLE)
      .update({ metadata: writePlannerAuto(metadata, next) })
      .eq('id', releaseId);
    if (update.error) console.error('[plan-auto] could not record the outcome for rollout', releaseId, update.error);
  } catch (error) {
    console.error('[plan-auto] could not record the outcome for rollout', releaseId, error);
  }
}

/**
 * Whether the plan route should hold off: an auto build claimed this rollout
 * moments ago and has not finished. A stale claim (over 90 s) does not hold
 * anything up, which is what makes "Try again" work after a crash.
 */
export function isAutoBuildInFlight(metadata: unknown, now: number = Date.now()): boolean {
  const auto = readPlannerAuto(metadata);
  return Boolean(auto && auto.state === 'running' && !isPlannerAutoStale(auto, now));
}

/**
 * Build the plan for the rollout onboarding just created, with no taps. Run
 * from POST /api/releases through afterResponse, so it never delays the
 * reply and never throws.
 */
export async function runOnboardingAutoPlan(
  admin: Admin,
  params: {
    releaseId: string;
    user: { id: string; email?: string | null };
    /** Who owns the rollout, when it is not `user` (#854: a Manager's rollout
     *  in a team they joined is owned by that team's owner). */
    ownerUserId?: string;
    readyToday: ReadyItem[];
    onboarding: PlannerOnboardingContext | null;
    /** When POST /api/releases started: the model's deadline counts from it,
     *  so the whole invocation fits the route's 60 s maxDuration. */
    requestStartedAt: number;
    loadTeam: () => Promise<{ ok: true; workspaceId: string; members: WorkspaceMember[] } | { ok: false }>;
  }
): Promise<void> {
  const { releaseId, user } = params;
  const posthog = createServerPostHogClient();
  const capture = (event: Parameters<typeof captureServerAnalyticsEvent>[2]) =>
    captureServerAnalyticsEvent(posthog, user.id, event);

  try {
    const release = await claimPlannerAuto(admin, releaseId, params.ownerUserId || user.id);
    if (!release) return;
    capture(createPostHogEvent('plan_auto_started', { release_id: releaseId }));

    const fail = async (code: string) => {
      await finishPlannerAuto(admin, releaseId, { state: 'failed', code });
      capture(createPostHogEvent('plan_auto_failed', { release_id: releaseId, code }));
    };

    if (!release.release_date) {
      await fail('missing_release_date');
      return;
    }

    const intake = buildAutoPlanIntake({
      releaseType: release.release_type,
      artistName: release.artist_name,
      releaseDate: String(release.release_date),
      readyToday: params.readyToday,
    });

    let result: Awaited<ReturnType<typeof buildRolloutPlan>>;
    try {
      result = await buildRolloutPlan(admin, {
        release,
        actor: user,
        intake,
        todayYmd: new Date().toISOString().slice(0, 10),
        startedAt: params.requestStartedAt,
        loadTeam: params.loadTeam,
        onboarding: params.onboarding,
      });
    } catch (error) {
      console.error('[plan-auto] build crashed for rollout', releaseId, error);
      await fail('crash');
      return;
    }

    if (result.ok) {
      await finishPlannerAuto(admin, releaseId, { state: 'done' });
      capture(
        createPostHogEvent('plan_auto_ready', {
          release_id: releaseId,
          // From the rollout's create request, which is within a second of the row.
          ms: Math.max(0, Date.now() - params.requestStartedAt),
          ai_applied: result.plan.aiApplied,
          task_count: result.plan.tasksCreated,
        })
      );
      return;
    }
    if (result.code === 'tasks_exist') {
      // A plan landed some other way first. Nothing failed.
      await finishPlannerAuto(admin, releaseId, { state: 'done' });
      return;
    }
    if (result.code === 'plan_in_progress') {
      // Another caller holds the plan row and will finish it.
      return;
    }
    await fail(result.code ?? `status_${result.status}`);
  } catch (error) {
    console.error('[plan-auto] failed for rollout', releaseId, error);
    await finishPlannerAuto(admin, releaseId, { state: 'failed', code: 'crash' });
  } finally {
    await shutdownServerAnalytics(posthog);
  }
}
