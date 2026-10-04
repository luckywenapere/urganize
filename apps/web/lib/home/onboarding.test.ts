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

  it('never uses an em dash or the word workspace in a label', () => {
    for (const step of buildOnboardingProgress([]).steps) {
      expect(step.label).not.toMatch(/\u2014|workspace/i);
    }
  });
});
