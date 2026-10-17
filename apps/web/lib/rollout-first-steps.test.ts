import { describe, expect, it } from 'vitest';
import {
  buildFirstSteps,
  isRolloutNew,
  nextFirstStep,
  shouldShowFirstSteps,
  withDismissed,
} from './rollout-first-steps';

const all = { cover: true, team: true };
const now = new Date('2026-10-15T12:00:00Z');

describe('rollout first steps (URG-293)', () => {
  it('orders cover, team and ticks from facts (no song step since Oct 17, 2026)', () => {
    const steps = buildFirstSteps({ hasCoverArt: false, hasTeam: null }, all);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['cover', false],
      ['team', false],
    ]);
    expect(nextFirstStep(steps)?.key).toBe('cover');
  });

  it('drops steps that do not exist for this person', () => {
    const steps = buildFirstSteps(
      { hasCoverArt: false, hasTeam: false },
      { cover: true, team: false }
    );
    expect(steps.map((s) => s.key)).toEqual(['cover']);
  });

  it('counts a rollout as new for 14 days', () => {
    expect(isRolloutNew('2026-10-15T11:59:00Z', now)).toBe(true);
    expect(isRolloutNew('2026-10-02T12:00:01Z', now)).toBe(true);
    expect(isRolloutNew('2026-10-01T11:59:59Z', now)).toBe(false);
    expect(isRolloutNew(null, now)).toBe(false);
    expect(isRolloutNew('not a date', now)).toBe(false);
  });

  const base = {
    isOwner: true,
    isTest: false,
    createdAt: '2026-10-15T11:00:00Z',
    now,
    dismissed: false,
    factsKnown: true,
    steps: buildFirstSteps({ hasCoverArt: false, hasTeam: false }, all),
  };

  it('shows on a new rollout with work left', () => {
    expect(shouldShowFirstSteps(base)).toBe(true);
  });

  it('disappears once every step is done', () => {
    const steps = buildFirstSteps({ hasCoverArt: true, hasTeam: true }, all);
    expect(shouldShowFirstSteps({ ...base, steps })).toBe(false);
  });

  it('stays hidden for teammates, test rollouts, dismissals, unread facts and old rollouts', () => {
    expect(shouldShowFirstSteps({ ...base, isOwner: false })).toBe(false);
    expect(shouldShowFirstSteps({ ...base, isTest: true })).toBe(false);
    expect(shouldShowFirstSteps({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowFirstSteps({ ...base, factsKnown: false })).toBe(false);
    expect(shouldShowFirstSteps({ ...base, createdAt: '2026-09-01T00:00:00Z' })).toBe(false);
    expect(shouldShowFirstSteps({ ...base, steps: [] })).toBe(false);
  });

  it('keeps the dismissed list unique and bounded', () => {
    expect(withDismissed(['a', 'b'], 'a')).toEqual(['b', 'a']);
    const many = Array.from({ length: 120 }, (_, i) => `r${i}`);
    expect(withDismissed(many, 'new')).toHaveLength(100);
  });
});
