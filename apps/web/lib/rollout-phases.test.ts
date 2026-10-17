import { describe, expect, it } from 'vitest';
import {
  formatPhaseDates,
  groupTasksByRolloutPhase,
  phaseForLine,
  phasesForStrip,
  readTaskPhase,
  resolveTaskPhase,
  rolloutPhaseForOffset,
  summarizeRolloutPhases,
  withTaskPhase,
} from './rollout-phases';
import { derivePlanPhase } from './release-planning';

const RELEASE = '2026-11-20';
const DAY = 86_400_000;
const at = (offset: number) => new Date(Date.UTC(2026, 10, 20) + offset * DAY).toISOString();

describe('rolloutPhaseForOffset', () => {
  it('folds the four plan phases into three on the same boundaries', () => {
    expect(rolloutPhaseForOffset(-60)).toBe('pre_release');
    expect(rolloutPhaseForOffset(-8)).toBe('pre_release');
    expect(rolloutPhaseForOffset(-7)).toBe('release');
    expect(rolloutPhaseForOffset(0)).toBe('release');
    expect(rolloutPhaseForOffset(7)).toBe('release');
    expect(rolloutPhaseForOffset(8)).toBe('post_release');
    for (let offset = -120; offset <= 60; offset += 1) {
      const plan = derivePlanPhase(offset);
      const rollout = rolloutPhaseForOffset(offset);
      if (plan === 'release_week') expect(rollout).toBe('release');
      else if (plan === 'post_release') expect(rollout).toBe('post_release');
      else expect(rollout).toBe('pre_release');
    }
  });
});

describe('stored phase', () => {
  it('reads only a valid phase', () => {
    expect(readTaskPhase({ phase: 'release' })).toBe('release');
    expect(readTaskPhase({ phase: 'release_week' })).toBeNull();
    expect(readTaskPhase(null)).toBeNull();
    expect(readTaskPhase([])).toBeNull();
  });

  it('sets and clears without touching the rest of the metadata', () => {
    const base = { template: { task_id: 'x' }, planner: { key: true } };
    expect(withTaskPhase(base, 'post_release')).toEqual({ ...base, phase: 'post_release' });
    expect(withTaskPhase({ ...base, phase: 'release' }, null)).toEqual(base);
    expect(withTaskPhase(null, 'release')).toEqual({ phase: 'release' });
  });
});

describe('resolveTaskPhase', () => {
  it('prefers the stored phase, then the date, then Pre-release', () => {
    expect(resolveTaskPhase({ phase: 'post_release', dueDate: at(-50) }, RELEASE)).toBe('post_release');
    expect(resolveTaskPhase({ phase: null, dueDate: at(-50) }, RELEASE)).toBe('pre_release');
    expect(resolveTaskPhase({ dueDate: at(2) }, RELEASE)).toBe('release');
    expect(resolveTaskPhase({ dueDate: at(30) }, RELEASE)).toBe('post_release');
    expect(resolveTaskPhase({ dueDate: null }, RELEASE)).toBe('pre_release');
    expect(resolveTaskPhase({ dueDate: at(30) }, null)).toBe('pre_release');
  });

  it('groups every task once, all three phases present', () => {
    const grouped = groupTasksByRolloutPhase(
      [{ dueDate: at(-20) }, { dueDate: at(0) }, { dueDate: at(-1), phase: 'pre_release' as const }],
      RELEASE
    );
    expect(grouped.pre_release).toHaveLength(2);
    expect(grouped.release).toHaveLength(1);
    expect(grouped.post_release).toHaveLength(0);
  });
});

describe('summarizeRolloutPhases', () => {
  const tasks = [
    { dueDate: at(-40), status: 'done' },
    { dueDate: at(-10), status: 'todo', durationDays: 7 },
    { dueDate: at(-3), status: 'done' },
    { dueDate: at(0), status: 'todo' },
    { dueDate: at(1), status: 'cancelled' },
  ];

  it('counts progress, leaving cancelled work out', () => {
    const [pre, release, post] = summarizeRolloutPhases(tasks, RELEASE, new Date(at(-20)));
    expect([pre.done, pre.total, pre.percent]).toEqual([1, 2, 50]);
    expect([release.done, release.total, release.percent]).toEqual([1, 2, 50]);
    expect([post.done, post.total, post.percent]).toEqual([0, 0, 0]);
  });

  it('dates a phase by its work, or by its window when it has none', () => {
    const [pre, release, post] = summarizeRolloutPhases(tasks, RELEASE, new Date(at(-20)));
    expect(pre.startDate).toBe('2026-10-11');
    expect(pre.endDate).toBe('2026-11-16'); // a 7-day run from -10 ends at -4
    expect(release.startDate).toBe('2026-11-17');
    expect(release.endDate).toBe('2026-11-20');
    expect(post.startDate).toBe('2026-11-28');
    expect(post.endDate).toBeNull();
    expect(formatPhaseDates(post)).toBe('From 28 Nov');
    expect(formatPhaseDates(release)).toBe('17 Nov – 20 Nov');
  });

  it('marks where today is', () => {
    const states = (offset: number) =>
      summarizeRolloutPhases(tasks, RELEASE, new Date(at(offset))).map((phase) => phase.state);
    expect(states(-20)).toEqual(['current', 'upcoming', 'upcoming']);
    expect(states(3)).toEqual(['past', 'current', 'upcoming']);
    expect(summarizeRolloutPhases(tasks, null).map((phase) => phase.state)).toEqual([
      'unknown',
      'unknown',
      'unknown',
    ]);
    expect(
      summarizeRolloutPhases([{ dueDate: at(-40), status: 'done' }], RELEASE, new Date(at(3)))[0].state
    ).toBe('done');
  });

  it('never marks two phases Now at once (Oct 17, 2026: Pre-production and Pre-release)', () => {
    const withPre = [...tasks, { dueDate: null, status: 'todo', phase: 'pre_production' as const }];
    const nowCount = (offset: number) =>
      summarizeRolloutPhases(withPre, RELEASE, new Date(at(offset))).filter((phase) => phase.state === 'current')
        .length;
    expect(nowCount(-20)).toBe(1);
    expect(nowCount(3)).toBe(1);
    const [preProduction, preRelease] = summarizeRolloutPhases(withPre, RELEASE, new Date(at(-20)));
    expect([preProduction.phase, preProduction.state]).toEqual(['pre_production', 'upcoming']);
    expect(preRelease.state).toBe('current');
    expect(summarizeRolloutPhases(withPre, RELEASE, new Date(at(3)))[0].state).toBe('past');
    // Undated: Pre-production is still the work in hand.
    expect(summarizeRolloutPhases(withPre, null)[0].state).toBe('current');
  });
});

describe('the phase strip (Oct 17, 2026 just-planned cuts)', () => {
  it('drops an undated Pre-production chip and keeps a dated one', () => {
    const base = { startDate: null, endDate: null };
    expect(
      phasesForStrip([
        { phase: 'pre_production' as const, ...base },
        { phase: 'pre_release' as const, ...base },
      ]).map((summary) => summary.phase)
    ).toEqual(['pre_release']);
    expect(
      phasesForStrip([{ phase: 'pre_production' as const, startDate: '2026-10-01', endDate: null }]).length
    ).toBe(1);
  });

  it('names the current phase on the phone line, else the first still open', () => {
    expect(phaseForLine([{ state: 'past' as const }, { state: 'current' as const }])?.state).toBe('current');
    expect(phaseForLine([{ state: 'done' as const }, { state: 'upcoming' as const }])?.state).toBe('upcoming');
    expect(phaseForLine([{ state: 'done' as const }])?.state).toBe('done');
    expect(phaseForLine([])).toBeNull();
  });
});
