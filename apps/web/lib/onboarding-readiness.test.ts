import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ONBOARDING_READY_OPTIONS,
  deriveOnboardingStage,
  normalizeReadyToday,
  toggleOnboardingReadyItem,
} from './onboarding-readiness';
import { READY_TODAY_OPTIONS, isTaskPreCompletedByReady } from './release-planning';
import { loadOnboardingDraft } from './onboarding-draft';
import {
  INTAKE_STEP,
  decideIntakeSkips,
  intakeStepKicker,
  readyPrefillAnswers,
  visibleIntakeSteps,
} from './planner-intake-steps';
import { parseOnboardingPlannerHandoff } from './first-session';

// "What's already done?" is asked ONCE, in onboarding (2026-10-11).

describe('the onboarding readiness question', () => {
  it('uses the planner options and values exactly, so pre-completion keeps working', () => {
    expect(ONBOARDING_READY_OPTIONS).toBe(READY_TODAY_OPTIONS);
    // The planner's own data model: an onboarding answer pre-completes the
    // same playbook step a planner answer would.
    expect(isTaskPreCompletedByReady({ id: 'w8_lock_master' }, ['master'], 'single_v0.3')).toBe(true);
  });

  it('makes "None of it yet" exclusive in both directions', () => {
    expect(toggleOnboardingReadyItem(['master', 'artwork'], 'none')).toEqual(['none']);
    expect(toggleOnboardingReadyItem(['none'], 'artwork')).toEqual(['artwork']);
    expect(toggleOnboardingReadyItem(['artwork'], 'master')).toEqual(['master', 'artwork']);
    expect(toggleOnboardingReadyItem(['master', 'artwork'], 'master')).toEqual(['artwork']);
  });

  it('normalizes untrusted input', () => {
    expect(normalizeReadyToday(['distributor', 'bogus', 'master', 'master'])).toEqual(['master', 'distributor']);
    expect(normalizeReadyToday(['master', 'none'])).toEqual(['none']);
  });

  it('derives the stage the rest of the product still reads', () => {
    expect(deriveOnboardingStage([])).toBeNull();
    expect(deriveOnboardingStage(['none'])).toBe('just_starting');
    expect(deriveOnboardingStage(['artwork'])).toBe('recorded');
    expect(deriveOnboardingStage(['master'])).toBe('preparing');
    expect(deriveOnboardingStage(['master', 'artwork'])).toBe('preparing');
    expect(deriveOnboardingStage(['master', 'artwork', 'distributor'])).toBe('date_set');
  });
});

describe('the onboarding draft carries readiness', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (value: unknown) => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => JSON.stringify(value),
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
  };

  it('reads readiness and derives the stage from it', () => {
    stub({ readyToday: ['master', 'artwork', 'distributor', 'junk'], stage: 'just_starting' });
    const draft = loadOnboardingDraft();
    expect(draft.readyToday).toEqual(['master', 'artwork', 'distributor']);
    expect(draft.stage).toBe('date_set');
  });

  it('keeps an older draft stage when there is no readiness yet', () => {
    stub({ stage: 'promoting' });
    const draft = loadOnboardingDraft();
    expect(draft.readyToday).toEqual([]);
    expect(draft.stage).toBe('promoting');
  });
});

describe('the planner skips "What\'s already done?" when onboarding answered it', () => {
  const TODAY = '2026-10-11';

  it('asks three questions for a first plan from onboarding', () => {
    const visible = visibleIntakeSteps(
      decideIntakeSkips({
        prefilledReleaseType: 'single',
        prefilledReleaseDate: '2026-12-04',
        prefilledArtistName: 'Tems',
        prefilledReadyToday: ['master', 'artwork'],
        todayYmd: TODAY,
      })
    );
    expect(visible).toEqual([INTAKE_STEP.goal, INTAKE_STEP.budget, INTAKE_STEP.cover]);
    expect(visible.map((step) => intakeStepKicker(visible, step))).toEqual([
      'Question 1 of 3',
      'Question 2 of 3',
      'Question 3 of 3',
    ]);
  });

  it('"None of it yet" is an answer and also skips', () => {
    expect(decideIntakeSkips({ prefilledReadyToday: ['none'], todayYmd: TODAY }).ready).toBe(true);
  });

  it('keeps the question when nothing usable was handed over (every other entry point)', () => {
    expect(decideIntakeSkips({ todayYmd: TODAY }).ready).toBe(false);
    expect(decideIntakeSkips({ prefilledReadyToday: [], todayYmd: TODAY }).ready).toBe(false);
    expect(decideIntakeSkips({ prefilledReadyToday: ['bogus'], todayYmd: TODAY }).ready).toBe(false);
    expect(visibleIntakeSteps(decideIntakeSkips({ todayYmd: TODAY }))).toContain(INTAKE_STEP.ready);
  });

  it('turns the prefill into the planner answer', () => {
    expect(readyPrefillAnswers(['distributor', 'master', 'x'])).toEqual(['master', 'distributor']);
    expect(readyPrefillAnswers(['artwork', 'none'])).toEqual(['none']);
    expect(readyPrefillAnswers(undefined)).toEqual([]);
  });

  it('carries readiness through the onboarding hand-off', () => {
    expect(
      parseOnboardingPlannerHandoff(
        JSON.stringify({ releaseId: 'r', at: 0, readyToday: ['artwork', 'nope', 'master'] }),
        1
      )
    ).toEqual({ releaseId: 'r', at: 0, readyToday: ['master', 'artwork'] });
    expect(parseOnboardingPlannerHandoff(JSON.stringify({ releaseId: 'r', at: 0, readyToday: [] }), 1)).toEqual({
      releaseId: 'r',
      at: 0,
    });
  });
});
