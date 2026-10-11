import { describe, expect, it } from 'vitest';
import {
  ALL_INTAKE_STEPS,
  INTAKE_STEP,
  coveredScopes,
  decideIntakeSkips,
  intakeStepKicker,
  intakeStepPosition,
  isUsableFutureYmd,
  nextIntakeStep,
  previousIntakeStep,
  scopedRolloutIntakePrefill,
  toggleCoveredScope,
  visibleIntakeSteps,
  type StepIndex,
} from './planner-intake-steps';
import { PLAN_SCOPES } from './release-planning';

const TODAY = '2026-10-11';

/** Walk the intake the way the modal does: Continue from the first step until the end. */
function walkForward(visible: readonly StepIndex[]): StepIndex[] {
  const seen: StepIndex[] = [];
  let current: StepIndex | null = visible[0] ?? null;
  while (current !== null) {
    seen.push(current);
    current = nextIntakeStep(visible, current);
  }
  return seen;
}

function walkBack(visible: readonly StepIndex[]): StepIndex[] {
  const seen: StepIndex[] = [];
  let current: StepIndex | null = visible[visible.length - 1] ?? null;
  while (current !== null) {
    seen.push(current);
    current = previousIntakeStep(visible, current);
  }
  return seen;
}

describe('isUsableFutureYmd', () => {
  it('accepts today and later, real calendar days only', () => {
    expect(isUsableFutureYmd('2026-10-11', TODAY)).toBe(true);
    expect(isUsableFutureYmd('2026-12-01', TODAY)).toBe(true);
    expect(isUsableFutureYmd('2026-10-10', TODAY)).toBe(false);
    expect(isUsableFutureYmd('2027-02-31', TODAY)).toBe(false);
    expect(isUsableFutureYmd('2026-13-01', TODAY)).toBe(false);
    expect(isUsableFutureYmd('next friday', TODAY)).toBe(false);
    expect(isUsableFutureYmd('', TODAY)).toBe(false);
    expect(isUsableFutureYmd(null, TODAY)).toBe(false);
    expect(isUsableFutureYmd(undefined, TODAY)).toBe(false);
  });
});

describe('decideIntakeSkips', () => {
  it('asks everything when nothing is prefilled', () => {
    expect(decideIntakeSkips({ todayYmd: TODAY })).toEqual({ releaseType: false, artist: false, date: false });
  });

  it('skips the type when it was prefilled, as before', () => {
    expect(decideIntakeSkips({ prefilledReleaseType: 'ep', todayYmd: TODAY }).releaseType).toBe(true);
  });

  it('skips the date only for a usable future date', () => {
    expect(decideIntakeSkips({ prefilledReleaseDate: '2026-11-20', todayYmd: TODAY }).date).toBe(true);
    expect(decideIntakeSkips({ prefilledReleaseDate: TODAY, todayYmd: TODAY }).date).toBe(true);
    // A date that has passed is still a question: the plan needs a real anchor.
    expect(decideIntakeSkips({ prefilledReleaseDate: '2026-09-01', todayYmd: TODAY }).date).toBe(false);
    expect(decideIntakeSkips({ prefilledReleaseDate: 'soon', todayYmd: TODAY }).date).toBe(false);
  });

  it('skips the artist only when the caller vouches for a non-blank name', () => {
    expect(decideIntakeSkips({ prefilledArtistName: 'Tems', todayYmd: TODAY }).artist).toBe(true);
    expect(decideIntakeSkips({ prefilledArtistName: '   ', todayYmd: TODAY }).artist).toBe(false);
    expect(decideIntakeSkips({ prefilledArtistName: null, todayYmd: TODAY }).artist).toBe(false);
  });
});

describe('visibleIntakeSteps and navigation', () => {
  it('walks all seven with nothing skipped (a note or a chip with no prefill)', () => {
    const visible = visibleIntakeSteps({ releaseType: false, artist: false, date: false });
    expect(visible).toEqual([...ALL_INTAKE_STEPS]);
    expect(walkForward(visible)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(intakeStepKicker(visible, 0)).toBe('Question 1 of 7');
    expect(intakeStepKicker(visible, 6)).toBe('Question 7 of 7');
  });

  it('keeps the create-modal shape: type prefilled, six questions', () => {
    const visible = visibleIntakeSteps({ releaseType: true, artist: false, date: false });
    expect(visible).toEqual([1, 2, 3, 4, 5, 6]);
    expect(intakeStepKicker(visible, 1)).toBe('Question 1 of 6');
    expect(intakeStepKicker(visible, 6)).toBe('Question 6 of 6');
  });

  it('asks only the four unanswered questions for a first plan from onboarding', () => {
    const skips = decideIntakeSkips({
      prefilledReleaseType: 'single',
      prefilledReleaseDate: '2026-12-04',
      prefilledArtistName: 'Tems',
      todayYmd: TODAY,
    });
    const visible = visibleIntakeSteps(skips);
    expect(visible).toEqual([
      INTAKE_STEP.ready,
      INTAKE_STEP.goal,
      INTAKE_STEP.budget,
      INTAKE_STEP.cover,
    ]);
    expect(walkForward(visible)).toEqual([3, 4, 5, 6]);
    expect(walkBack(visible)).toEqual([6, 5, 4, 3]);
    expect(visible.map((step) => intakeStepKicker(visible, step))).toEqual([
      'Question 1 of 4',
      'Question 2 of 4',
      'Question 3 of 4',
      'Question 4 of 4',
    ]);
  });

  it('never steps Back onto a skipped question, whatever the mix', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const skips = { releaseType: Boolean(mask & 1), artist: Boolean(mask & 2), date: Boolean(mask & 4) };
      const visible = visibleIntakeSteps(skips);
      const skipped = ALL_INTAKE_STEPS.filter((step) => !visible.includes(step));
      for (const step of [...walkForward(visible), ...walkBack(visible)]) {
        expect(skipped).not.toContain(step);
      }
      // Forward visits every visible step exactly once, in order, and the
      // last one has no next (that is when the modal builds the plan).
      expect(walkForward(visible)).toEqual(visible);
      expect(nextIntakeStep(visible, visible[visible.length - 1])).toBeNull();
      expect(previousIntakeStep(visible, visible[0])).toBeNull();
      // The four questions nothing else asks are always asked.
      expect(visible).toEqual(expect.arrayContaining([3, 4, 5, 6]));
    }
  });

  it('counts position over the visible list only', () => {
    const visible: StepIndex[] = [2, 3, 4, 5, 6];
    expect(intakeStepPosition(visible, 2)).toBe(1);
    expect(intakeStepPosition(visible, 6)).toBe(5);
  });

  it('moves forward to the next visible step from a step that is not in the list', () => {
    const visible: StepIndex[] = [3, 4, 5, 6];
    expect(nextIntakeStep(visible, 1)).toBe(3);
    expect(previousIntakeStep(visible, 1)).toBeNull();
  });
});

describe('what the plan covers', () => {
  it('starts with every scope covered when nothing is excluded', () => {
    expect(coveredScopes([])).toEqual([...PLAN_SCOPES]);
  });

  it('is the inverse of exclusions', () => {
    expect(coveredScopes(['paid_ads', 'physical'])).toEqual(['marketing', 'press', 'events']);
    expect(coveredScopes([...PLAN_SCOPES])).toEqual([]);
  });

  it('unticking a covered scope excludes it, ticking it again covers it', () => {
    const afterUntick = toggleCoveredScope([], 'paid_ads');
    expect(afterUntick).toEqual(['paid_ads']);
    expect(coveredScopes(afterUntick)).not.toContain('paid_ads');
    expect(toggleCoveredScope(afterUntick, 'paid_ads')).toEqual([]);
  });

  it('keeps exclusions in scope order and free of duplicates', () => {
    let exclusions = toggleCoveredScope([], 'physical');
    exclusions = toggleCoveredScope(exclusions, 'marketing');
    expect(exclusions).toEqual(['marketing', 'physical']);
    expect(toggleCoveredScope(['physical', 'physical'], 'press')).toEqual(['press', 'physical']);
  });
});

describe('scopedRolloutIntakePrefill', () => {
  it('passes what the rollout knows', () => {
    expect(
      scopedRolloutIntakePrefill({ releaseType: 'album', releaseDate: '2026-12-04', artistName: ' Tems ' })
    ).toEqual({ releaseType: 'album', releaseDate: '2026-12-04', artistName: 'Tems' });
  });

  it('trims a timestamp to its calendar day and keeps a past date as a starting answer', () => {
    expect(scopedRolloutIntakePrefill({ releaseDate: '2026-01-02T00:00:00Z' })).toEqual({
      releaseDate: '2026-01-02',
    });
  });

  it('leaves out what the planner cannot use', () => {
    expect(
      scopedRolloutIntakePrefill({ releaseType: 'music_video', releaseDate: 'tbc', artistName: 'Unknown artist' })
    ).toEqual({});
    expect(scopedRolloutIntakePrefill({ releaseType: null, releaseDate: null, artistName: '' })).toEqual({});
  });
});
