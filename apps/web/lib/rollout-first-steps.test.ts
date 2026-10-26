import { describe, expect, it } from 'vitest';
import {
  buildFirstSteps,
  isRolloutNew,
  nextFirstStep,
  shouldShowFirstSteps,
  withDismissed,
} from './rollout-first-steps';

const all = { idea: true, team: true };
const now = new Date('2026-10-15T12:00:00Z');

describe('rollout first steps (URG-293)', () => {
  it('orders idea, team (the cover art is no longer a first step, Oct 26, 2026) and ticks from facts (no song step since Oct 17, 2026)', () => {
    const steps = buildFirstSteps({ hasIdea: false, hasTeam: null }, all);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['idea', false],
      ['team', false],
    ]);
    expect(nextFirstStep(steps)?.key).toBe('idea');
  });

  it('puts the pinned Confirm your release date after the idea (Oct 26, 2026)', () => {
    const steps = buildFirstSteps({ hasIdea: true, hasTeam: true }, all, { title: 'Confirm your release date' });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['idea', true],
      ['date', false],
    ]);
    expect(nextFirstStep(steps)?.key).toBe('date');
    expect(steps[1].action).toBe('Confirm the date');
    // Until the idea is added, it is the next step.
    expect(
      nextFirstStep(buildFirstSteps({ hasIdea: false, hasTeam: true }, all, { title: 'Confirm your release date' }))?.key
    ).toBe('idea');
    expect(buildFirstSteps({ hasIdea: false, hasTeam: true }, all)[0].action).toBe('Add your idea');
    // Without a pin there is no date step.
    expect(buildFirstSteps({ hasIdea: false, hasTeam: false }, all).some((s) => s.key === 'date')).toBe(false);
  });

  it('drops steps that do not exist for this person', () => {
    const steps = buildFirstSteps(
      { hasIdea: false, hasTeam: false },
      { idea: true, team: false }
    );
    expect(steps.map((s) => s.key)).toEqual(['idea']);
  });

  it('never shows Invite your team once there is a teammate, not even ticked (Oct 17, 2026)', () => {
    const steps = buildFirstSteps({ hasIdea: false, hasTeam: true }, all);
    expect(steps.map((s) => s.key)).toEqual(['idea']);
    expect(steps.some((s) => s.title === 'Invite your team')).toBe(false);
    // Unknown team still offers the step; only a known teammate hides it.
    expect(buildFirstSteps({ hasIdea: false, hasTeam: null }, all).map((s) => s.key)).toEqual([
      'idea',
      'team',
    ]);
  });

  it('renders nothing when the teammate rule leaves no steps', () => {
    const steps = buildFirstSteps({ hasIdea: false, hasTeam: true }, { idea: false, team: true });
    expect(steps).toEqual([]);
    expect(
      shouldShowFirstSteps({
        isOwner: true,
        isTest: false,
        createdAt: 'Thu 2026-10-15 12:00 PM WAT (UTC+01:00)',
        now,
        dismissed: false,
        factsKnown: true,
        steps,
      })
    ).toBe(false);
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
    steps: buildFirstSteps({ hasIdea: false, hasTeam: false }, all),
  };

  it('shows on a new rollout with work left', () => {
    expect(shouldShowFirstSteps(base)).toBe(true);
  });

  it('disappears once every step is done', () => {
    const steps = buildFirstSteps({ hasIdea: true, hasTeam: true }, all);
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
