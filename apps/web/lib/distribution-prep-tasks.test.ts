import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_PREP_TASKS,
  issuesLeftOnRollout,
  planDistributionPrep,
  prepDueDate,
  readPrepAutoRecord,
  type PrepExistingTask,
} from './distribution-prep-tasks';
import type { DistributionIssueCode } from './distribution-rules';

// Noon in Lagos on Thu 29 Oct 2026.
const NOW = new Date('2026-10-29T11:00:00.000Z');
const RELEASE = '2027-01-15';
const DUE_49 = '2026-11-27T00:00:00.000Z';
const DUE_42 = '2026-12-04T00:00:00.000Z';
const ALL_ADDED = ['dist_prep_details', 'dist_prep_credits', 'dist_prep_artwork'];

const ALL_OPEN: DistributionIssueCode[] = [
  'missing_genre',
  'missing_language',
  'missing_explicit_flag',
  'missing_songwriter_credits',
  'artwork_missing',
];

function task(over: Partial<PrepExistingTask> & { stepId: string }): PrepExistingTask {
  return { id: `id-${over.stepId}`, status: 'todo', dueDate: null, phase: 'pre_release', auto: null, ...over };
}

function run(over: Partial<Parameters<typeof planDistributionPrep>[0]> = {}) {
  return planDistributionPrep({
    releaseDate: RELEASE,
    now: NOW,
    hasPlan: true,
    openCodes: ALL_OPEN,
    existing: [],
    added: [],
    ...over,
  });
}

describe('prepDueDate', () => {
  it('counts back from release day', () => {
    expect(prepDueDate(RELEASE, -49, NOW)).toBe(DUE_49);
    expect(prepDueDate(RELEASE, -42, NOW)).toBe(DUE_42);
  });

  it('is null with no release date', () => {
    expect(prepDueDate(null, -49, NOW)).toBeNull();
    expect(prepDueDate('', -49, NOW)).toBeNull();
  });

  it('never lands in the past: a date that has gone is today', () => {
    expect(prepDueDate('2026-11-20', -49, NOW)).toBe('2026-10-29T00:00:00.000Z');
  });
});

describe('planDistributionPrep: adding', () => {
  it('adds the three tasks to a planned, dated rollout in their plan weeks', () => {
    const plan = run();
    expect(plan.insert.map((row) => [row.def.stepId, row.dueDate, row.phase])).toEqual([
      ['dist_prep_details', DUE_49, 'pre_release'],
      ['dist_prep_credits', DUE_49, 'pre_release'],
      ['dist_prep_artwork', DUE_42, 'pre_release'],
    ]);
    expect(plan.insert[0].auto).toEqual({ due: DUE_49, releaseDate: RELEASE });
  });

  it('adds them undated, as pre-production, to a rollout with no date and no plan', () => {
    const plan = run({ releaseDate: null, hasPlan: false });
    expect(plan.insert).toHaveLength(3);
    expect(plan.insert.every((row) => row.dueDate === null && row.phase === 'pre_production')).toBe(true);
  });

  it('keeps them pre-production on a dated rollout whose plan is not built yet', () => {
    const plan = run({ hasPlan: false });
    expect(plan.insert.every((row) => row.phase === 'pre_production' && row.dueDate !== null)).toBe(true);
  });

  it('does not add a task for work already done', () => {
    const plan = run({ openCodes: ['artwork_too_small'] });
    expect(plan.insert.map((row) => row.def.stepId)).toEqual(['dist_prep_artwork']);
  });

  it('never adds a task twice, even one the team deleted', () => {
    const plan = run({ existing: [task({ stepId: 'dist_prep_details' })], added: ALL_ADDED });
    expect(plan.insert).toEqual([]);
  });
});

describe('planDistributionPrep: ticking', () => {
  it('ticks an open task once its check passes', () => {
    const plan = run({
      openCodes: ['missing_songwriter_credits'],
      existing: [
        task({ stepId: 'dist_prep_details' }),
        task({ stepId: 'dist_prep_credits' }),
        task({ stepId: 'dist_prep_artwork', status: 'done' }),
      ],
      added: ALL_ADDED,
    });
    expect(plan.tick).toEqual(['id-dist_prep_details']);
  });

  it('keeps the details task open while any one of its three answers is missing', () => {
    const plan = run({ openCodes: ['missing_explicit_flag'], existing: [task({ stepId: 'dist_prep_details' })] });
    expect(plan.tick).toEqual([]);
  });

  it('leaves a cancelled task alone', () => {
    const plan = run({ openCodes: [], existing: [task({ stepId: 'dist_prep_details', status: 'cancelled' })] });
    expect(plan.tick).toEqual([]);
  });
});

describe('planDistributionPrep: following release day', () => {
  it('dates an undated task once a release date is set', () => {
    const plan = run({
      existing: [task({ stepId: 'dist_prep_details', auto: { due: null, releaseDate: null } })],
      added: ALL_ADDED,
    });
    expect(plan.update).toEqual([
      { id: 'id-dist_prep_details', dueDate: DUE_49, auto: { due: DUE_49, releaseDate: RELEASE } },
    ]);
  });

  it('moves a task with release day when nobody changed its date', () => {
    const plan = run({
      existing: [
        task({
          stepId: 'dist_prep_artwork',
          dueDate: '2026-11-27T00:00:00.000Z',
          auto: { due: '2026-11-27T00:00:00.000Z', releaseDate: '2027-01-08' },
        }),
      ],
      added: ALL_ADDED,
    });
    expect(plan.update[0]).toMatchObject({ dueDate: DUE_42 });
  });

  it('leaves a date a person changed', () => {
    const plan = run({
      existing: [
        task({
          stepId: 'dist_prep_artwork',
          dueDate: '2026-11-30T00:00:00.000Z',
          auto: { due: '2026-11-27T00:00:00.000Z', releaseDate: '2027-01-08' },
        }),
      ],
      added: ALL_ADDED,
    });
    expect(plan.update).toEqual([]);
  });

  it('does not touch a date it already set for this release day, so a clamped date can still fall overdue', () => {
    const plan = run({
      releaseDate: '2026-11-20',
      now: new Date('2026-11-05T11:00:00.000Z'),
      existing: [
        task({
          stepId: 'dist_prep_details',
          dueDate: '2026-10-29T00:00:00.000Z',
          auto: { due: '2026-10-29T00:00:00.000Z', releaseDate: '2026-11-20' },
        }),
      ],
      added: ALL_ADDED,
    });
    expect(plan.update).toEqual([]);
  });

  it('moves a pre-production task into its plan phase once the plan exists', () => {
    const plan = run({
      existing: [
        task({
          stepId: 'dist_prep_credits',
          phase: 'pre_production',
          dueDate: DUE_49,
          auto: { due: DUE_49, releaseDate: RELEASE },
        }),
      ],
      added: ALL_ADDED,
    });
    expect(plan.update).toEqual([{ id: 'id-dist_prep_credits', phase: 'pre_release' }]);
  });
});

describe('readPrepAutoRecord', () => {
  it('reads what was stored and nothing else', () => {
    expect(readPrepAutoRecord({ distribution_prep: { due: DUE_49, releaseDate: RELEASE } })).toEqual({
      due: DUE_49,
      releaseDate: RELEASE,
    });
    expect(readPrepAutoRecord({})).toBeNull();
    expect(readPrepAutoRecord(null)).toBeNull();
  });
});

it('every distribution code a task covers belongs to exactly one task', () => {
  const seen = DISTRIBUTION_PREP_TASKS.flatMap((def) => def.codes);
  expect(new Set(seen).size).toBe(seen.length);
});

describe('issuesLeftOnRollout', () => {
  it('keeps the warnings and only the errors no task covers', () => {
    const issue = (code: DistributionIssueCode) => ({ code });
    const left = issuesLeftOnRollout({
      errors: [issue('missing_genre'), issue('missing_release_date'), issue('missing_primary_artist'), issue('artwork_too_small')],
      warnings: [issue('release_date_tight'), issue('pitch_window_tight')],
    });
    expect(left.errors.map((row) => row.code)).toEqual(['missing_primary_artist']);
    expect(left.warnings.map((row) => row.code)).toEqual(['release_date_tight', 'pitch_window_tight']);
  });
});
