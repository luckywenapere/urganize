import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRST_PLAN_FREE_ACTION, FIRST_PLAN_FREE_LINE, isFirstPlanFree } from './first-plan';
import { isFirstPlanFreeForTeam, readFirstPlanFacts } from './first-plan-server';

const APP_ROOT = join(__dirname, '..', '..');
const code = (path: string) =>
  readFileSync(join(APP_ROOT, path), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('isFirstPlanFree', () => {
  it('is free only for the plan action, with no plan before it', () => {
    expect(isFirstPlanFree(FIRST_PLAN_FREE_ACTION, { approvedPlans: 0, plannedRollouts: 0 })).toBe(true);
  });

  it('charges once the team has any plan', () => {
    expect(isFirstPlanFree(FIRST_PLAN_FREE_ACTION, { approvedPlans: 1, plannedRollouts: 0 })).toBe(false);
    expect(isFirstPlanFree(FIRST_PLAN_FREE_ACTION, { approvedPlans: 0, plannedRollouts: 1 })).toBe(false);
  });

  it('fails toward charging when a fact is unreadable', () => {
    expect(isFirstPlanFree(FIRST_PLAN_FREE_ACTION, { approvedPlans: null, plannedRollouts: 0 })).toBe(false);
    expect(isFirstPlanFree(FIRST_PLAN_FREE_ACTION, { approvedPlans: 0, plannedRollouts: null })).toBe(false);
  });

  it('never makes another action free', () => {
    expect(isFirstPlanFree('press_kit.draft_section', { approvedPlans: 0, plannedRollouts: 0 })).toBe(false);
    expect(isFirstPlanFree('release.draft_spotify_pitch', { approvedPlans: 0, plannedRollouts: 0 })).toBe(false);
  });

  it('says so plainly', () => {
    expect(FIRST_PLAN_FREE_LINE).toBe('Your first plan is free.');
  });
});

/** A stand-in for the two head-count reads, so the server half runs for real. */
function fakeAdmin(counts: { plans: number | null; planned: number | null; fail?: boolean }) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    from(table: string) {
      const entry = { table, filters: [] as Array<[string, unknown]> };
      calls.push(entry);
      const chain = {
        select: () => chain,
        is: () => chain,
        eq: (column: string, value: unknown) => {
          entry.filters.push([column, value]);
          return chain;
        },
        then: (resolve: (value: { count: number | null; error: unknown }) => void) => {
          const count = table === 'release_plan_drafts' ? counts.plans : counts.planned;
          resolve(counts.fail ? { count: null, error: { message: 'down' } } : { count, error: null });
        },
      };
      return chain;
    },
  };
}

describe('readFirstPlanFacts / isFirstPlanFreeForTeam', () => {
  it('reads approved plans and planned rollouts for the owner', async () => {
    const admin = fakeAdmin({ plans: 0, planned: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readFirstPlanFacts(admin as any, 'owner-1')).toEqual({ approvedPlans: 0, plannedRollouts: 0 });
    const drafts = admin.calls.find((call) => call.table === 'release_plan_drafts');
    expect(drafts?.filters).toEqual(
      expect.arrayContaining([
        ['owner_user_id', 'owner-1'],
        ['status', 'approved'],
      ])
    );
    const releases = admin.calls.find((call) => call.table === 'releases');
    expect(releases?.filters).toEqual(
      expect.arrayContaining([
        ['owner_user_id', 'owner-1'],
        ['metadata->>planned_by_urgans', 'true'],
      ])
    );
  });

  it('is free for a team with nothing, charged for a team with a plan, charged on an error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = (admin: unknown, owner: string | null = 'o') => isFirstPlanFreeForTeam(admin as any, 'release.draft_plan', owner);
    expect(await run(fakeAdmin({ plans: 0, planned: 0 }))).toBe(true);
    expect(await run(fakeAdmin({ plans: 2, planned: 0 }))).toBe(false);
    expect(await run(fakeAdmin({ plans: 0, planned: 0, fail: true }))).toBe(false);
    expect(await run(fakeAdmin({ plans: 0, planned: 0 }), null)).toBe(false);
  });

  it('does not read anything for another action', async () => {
    const admin = fakeAdmin({ plans: 0, planned: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await isFirstPlanFreeForTeam(admin as any, 'press_kit.draft_section', 'o')).toBe(false);
    expect(admin.calls).toHaveLength(0);
  });
});

describe('both doors onto the planner honour the rule, server-side', () => {
  it('the gated action skips the hold for a free first plan', () => {
    const source = code('lib/urgans-actions/server.ts');
    expect(source).toMatch(/isFirstPlanFreeForTeam\(admin, action\.id, scope\.ownerUserId\)/);
    expect(source).toMatch(/firstPlanFree\s*\?\s*\{ metered: false \}\s*:\s*await beginEmbeddedRun/);
  });

  it('the plan build (route and auto build) skips the hold for a free first plan', () => {
    const source = code('lib/release-plan-build-server.ts');
    expect(source).toMatch(/isFirstPlanFreeForTeam\(admin, 'release\.draft_plan', ownerTeam\.ownerUserId\)/);
    expect(source).toMatch(/firstPlanFree\s*\?\s*\{ metered: false \}\s*:\s*await beginEmbeddedRun/);
  });

  it('the planner footer says the first plan is free instead of the cost', () => {
    const source = code('components/planner/PlannerIntakeModal.tsx');
    expect(source).toContain('useCreditBalance({ withFirstPlan: true })');
    expect(source).toMatch(/firstPlanFree === true \? FIRST_PLAN_FREE_LINE : embeddedCostLine/);
  });

  it('the credits pill re-reads after a build', () => {
    const source = code('components/planner/PlannerIntakeModal.tsx');
    expect(source).toMatch(/\.finally\(\(\) => \{[\s\S]*?invalidateUrgansUsage\(\);[\s\S]*?\}\);/);
  });
});
