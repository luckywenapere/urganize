import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PLANNER_AUTO_STALE_MS,
  buildAutoPlanIntake,
  isPlannerAutoStale,
  plannerAutoView,
  readPlannerAuto,
  writePlannerAuto,
  type PlannerAutoState,
} from './planner-auto';
import { isAutoBuildInFlight } from './planner-auto-server';
import { parseReleasePlanIntake } from './release-planning';
import { decidePlanCreationOnAiFailure } from './release-planning-actions-server';

const T0 = Date.parse('2026-10-17T12:00:00Z');
const running = (msAgo: number): PlannerAutoState => ({
  state: 'running',
  started_at: new Date(T0 - msAgo).toISOString(),
  source: 'onboarding',
});

describe('auto-plan state (2026-10-17)', () => {
  it('round-trips through metadata without touching the other keys', () => {
    const meta = writePlannerAuto({ planner_pending: true, created_source: 'onboarding' }, running(0));
    expect(meta.planner_pending).toBe(true);
    expect(meta.created_source).toBe('onboarding');
    expect(readPlannerAuto(meta)).toEqual(running(0));
  });

  it('reads nothing from a rollout that never auto-planned or holds junk', () => {
    expect(readPlannerAuto(null)).toBeNull();
    expect(readPlannerAuto({})).toBeNull();
    expect(readPlannerAuto({ planner_auto: { state: 'nope', started_at: 'x' } })).toBeNull();
    expect(readPlannerAuto({ planner_auto: { state: 'running' } })).toBeNull();
  });

  it('counts a running claim as failed after 90 seconds', () => {
    expect(isPlannerAutoStale(running(PLANNER_AUTO_STALE_MS - 1000), T0)).toBe(false);
    expect(isPlannerAutoStale(running(PLANNER_AUTO_STALE_MS + 1000), T0)).toBe(true);
    expect(plannerAutoView(running(5_000), T0)).toBe('generating');
    expect(plannerAutoView(running(PLANNER_AUTO_STALE_MS + 1000), T0)).toBe('failed');
    expect(plannerAutoView({ ...running(0), state: 'failed', code: 'crash' }, T0)).toBe('failed');
    expect(plannerAutoView(null, T0)).toBeNull();
  });

  it('lets the plan route through once a claim is stale, and not before', () => {
    const now = Date.now();
    const fresh = writePlannerAuto(null, { state: 'running', started_at: new Date(now - 5_000).toISOString(), source: 'onboarding' });
    const stale = writePlannerAuto(null, {
      state: 'running',
      started_at: new Date(now - PLANNER_AUTO_STALE_MS - 5_000).toISOString(),
      source: 'onboarding',
    });
    expect(isAutoBuildInFlight(fresh, now)).toBe(true);
    expect(isAutoBuildInFlight(stale, now)).toBe(false);
    expect(isAutoBuildInFlight({}, now)).toBe(false);
  });
});

describe('the auto build intake', () => {
  const intake = buildAutoPlanIntake({
    releaseType: 'single',
    artistName: 'Ada Lune',
    releaseDate: '2026-11-21',
    readyToday: ['master'],
  });

  it('is a valid intake with the defaults Oyin approved: new listeners, no budget', () => {
    const parsed = parseReleasePlanIntake(intake);
    expect(parsed.ok).toBe(true);
    expect(intake).toMatchObject({ goal: 'new_listeners', budget: 'none', date_mode: 'fixed', ready_today: ['master'] });
  });

  it('carries no typed text, so a model failure can never refuse it', () => {
    expect(intake.extra_notes).toBeUndefined();
    expect(intake.goal_text).toBeUndefined();
    expect(decidePlanCreationOnAiFailure('unavailable', intake, { firstPlan: false }).action).toBe('proceed');
  });

  it('treats anything but an EP or album as a single', () => {
    expect(buildAutoPlanIntake({ releaseType: 'music_video', artistName: '', releaseDate: '2026-11-21' }).release_type).toBe('single');
    expect(buildAutoPlanIntake({ releaseType: 'ep', artistName: '', releaseDate: '2026-11-21' }).release_type).toBe('ep');
  });
});

describe('wiring (source guards)', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('starts the auto build after the reply, only for an onboarding template rollout, never a test one', () => {
    const route = read('app/api/releases/route.ts');
    expect(route).toMatch(/export const maxDuration = 60;/);
    expect(route).toMatch(/releaseSource === 'onboarding' &&\s*plannerPending &&\s*releasePlan === 'template' &&\s*!isTest/);
    expect(route).toMatch(/afterResponse\('onboarding auto plan'/);
  });

  it('has one build implementation, used by the plan route and the auto build', () => {
    expect(read('app/api/releases/[releaseId]/plan/route.ts')).toMatch(/buildRolloutPlan\(adminClient/);
    expect(read('lib/planner-auto-server.ts')).toMatch(/buildRolloutPlan\(admin/);
    expect(read('app/api/releases/[releaseId]/plan/route.ts')).not.toMatch(/createReleasePlan\(/);
  });

  it('claims before the model is asked', () => {
    const source = read('lib/planner-auto-server.ts');
    expect(source.indexOf('claimPlannerAuto(admin, releaseId')).toBeLessThan(source.indexOf('buildRolloutPlan(admin'));
  });
});
