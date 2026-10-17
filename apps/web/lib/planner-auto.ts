import type { ReadyItem, ReleasePlanIntake } from './release-planning';

/**
 * Auto-plan at the end of onboarding (URG, 2026-10-17, Oyin approved the mocks
 * in mocks/auto-plan).
 *
 * The rollout onboarding creates on the "UrgAns recommendations" path builds
 * its plan by itself, on the server, while the manager is still on the
 * paywall, welcome and invite screens. They land on a rollout that already
 * has its plan, instead of four more questions.
 *
 * The state lives on `releases.metadata.planner_auto` (no migration):
 *   running  claimed before the model is asked, so a second caller (a retry,
 *            a second tab) sees it and does nothing
 *   done     the plan landed
 *   failed   the build gave up; the rollout shows "Your plan didn't build."
 * A `running` claim older than PLANNER_AUTO_STALE_MS with no plan counts as
 * failed: the function was cut off before it could say so.
 *
 * Pure and client-safe: the server writes live in planner-auto-server.ts.
 */

export const PLANNER_AUTO_KEY = 'planner_auto';

/** A running build older than this with no plan is treated as failed (90 s). */
export const PLANNER_AUTO_STALE_MS = 90_000;

/** How often the landing rollout asks whether the plan has landed. */
export const PLANNER_AUTO_POLL_MS = 3_000;

export type PlannerAutoStateName = 'running' | 'done' | 'failed';

export type PlannerAutoState = {
  state: PlannerAutoStateName;
  /** ISO time the build was claimed. */
  started_at: string;
  finished_at?: string;
  /** Why it failed, for the analytics and for a support look. */
  code?: string;
  /** Where the auto build came from. Only onboarding today. */
  source: 'onboarding';
};

/** On by default ("always ship them on"); NEXT_PUBLIC_FEATURE_PLAN_AUTO=false turns it off. */
export function isPlannerAutoEnabled(): boolean {
  return String(process.env.NEXT_PUBLIC_FEATURE_PLAN_AUTO ?? '').trim().toLowerCase() !== 'false';
}

export function readPlannerAuto(metadata: unknown): PlannerAutoState | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[PLANNER_AUTO_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const state = record.state;
  if (state !== 'running' && state !== 'done' && state !== 'failed') return null;
  const startedAt = typeof record.started_at === 'string' ? record.started_at : '';
  if (!startedAt) return null;
  return {
    state,
    started_at: startedAt,
    ...(typeof record.finished_at === 'string' ? { finished_at: record.finished_at } : {}),
    ...(typeof record.code === 'string' && record.code ? { code: record.code } : {}),
    source: 'onboarding',
  };
}

export function writePlannerAuto(
  metadata: Record<string, unknown> | null | undefined,
  value: PlannerAutoState
): Record<string, unknown> {
  return { ...(metadata ?? {}), [PLANNER_AUTO_KEY]: value };
}

/** A running claim nobody finished: the function died or timed out. */
export function isPlannerAutoStale(auto: PlannerAutoState | null, now: number = Date.now()): boolean {
  if (!auto || auto.state !== 'running') return false;
  const started = Date.parse(auto.started_at);
  if (!Number.isFinite(started)) return true;
  return now - started > PLANNER_AUTO_STALE_MS;
}

/**
 * What the landing rollout shows for a rollout with no activities yet.
 * `null` = this rollout is not auto-planning (the ordinary "Plan the rollout"
 * card applies).
 */
export type PlannerAutoView = 'generating' | 'failed' | null;

export function plannerAutoView(auto: PlannerAutoState | null, now: number = Date.now()): PlannerAutoView {
  if (!auto) return null;
  if (auto.state === 'failed') return 'failed';
  if (auto.state === 'running') return isPlannerAutoStale(auto, now) ? 'failed' : 'generating';
  // 'done' with no activities on screen yet: the list is about to reload.
  return 'generating';
}

/**
 * The intake an auto build uses: what onboarding asked (type, artist, date,
 * what is already done) plus the planner's own defaults, goal "new listeners"
 * and no budget, and no typed text, so the build can never be refused for
 * notes UrgAns could not read.
 */
export function buildAutoPlanIntake(input: {
  releaseType: string | null | undefined;
  artistName: string | null | undefined;
  releaseDate: string;
  readyToday?: ReadyItem[];
}): ReleasePlanIntake {
  const type = input.releaseType === 'ep' || input.releaseType === 'album' ? input.releaseType : 'single';
  return {
    version: 2,
    release_type: type,
    artist_name: String(input.artistName ?? '').trim().slice(0, 120),
    date_mode: 'fixed',
    release_date: input.releaseDate.slice(0, 10),
    ready_today: input.readyToday ?? [],
    goal: 'new_listeners',
    budget: 'none',
  };
}
