import { describe, expect, it } from 'vitest';
import { buildOnboardingProgress } from './onboarding';

const release = (over: Record<string, unknown> = {}) =>
  ({ releaseDate: null, progress: { done: 0, total: 10 }, teamSize: 1, ...over }) as never;

describe('buildOnboardingProgress', () => {
  it('starts at zero with no rollouts', () => {
    const progress = buildOnboardingProgress([]);
    expect(progress.doneCount).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it('counts a step only when the thing it asks for exists', () => {
    const progress = buildOnboardingProgress([release()]);
    expect(progress.steps.map((step) => step.done)).toEqual([true, false, false, false]);
    expect(progress.percent).toBe(25);
  });

  it('finishes when all four are true, across different rollouts', () => {
    const progress = buildOnboardingProgress([
      release({ releaseDate: '2026-12-01' }),
      release({ progress: { done: 3, total: 10 } }),
      release({ teamSize: 3 }),
    ]);
    expect(progress.complete).toBe(true);
    expect(progress.percent).toBe(100);
  });

  it('leaves Bring in a teammate out, and out of the total, once a rollout has a team (Oct 17, 2026)', () => {
    const progress = buildOnboardingProgress([release({ teamSize: 2 })]);
    expect(progress.steps.map((step) => step.key)).toEqual(['rollout', 'date', 'work']);
    expect(progress.steps).toHaveLength(3);
    expect(progress.doneCount).toBe(1);
    expect(progress.percent).toBe(33);
    expect(progress.complete).toBe(false);
  });

  it('still finishes (and hides) at 3 of 3 once the teammate step has left', () => {
    const progress = buildOnboardingProgress([
      release({ releaseDate: '2026-12-01', progress: { done: 1, total: 10 }, teamSize: 2 }),
    ]);
    expect(progress.steps).toHaveLength(3);
    expect(progress.doneCount).toBe(3);
    expect(progress.complete).toBe(true);
    expect(progress.percent).toBe(100);
  });

  it('keeps Bring in a teammate, unticked, while the team is one person or unknown', () => {
    for (const teamSize of [1, 0]) {
      const progress = buildOnboardingProgress([release({ teamSize })]);
      const team = progress.steps.find((step) => step.key === 'team');
      expect(team?.done).toBe(false);
      expect(progress.steps).toHaveLength(4);
    }
  });

  it('never uses an em dash or the word workspace in a label', () => {
    for (const step of buildOnboardingProgress([]).steps) {
      expect(step.label).not.toMatch(/\u2014|workspace/i);
    }
  });
});
