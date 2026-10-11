import { describe, expect, it } from 'vitest';

import { EMPTY_PLANNER_INTAKE_DRAFT } from './planner-intake-draft';
import { intakeStepBlocker } from './planner-intake-validation';

const TODAY = '2026-10-11';
const draft = (over: Partial<typeof EMPTY_PLANNER_INTAKE_DRAFT> = {}) => ({
  ...EMPTY_PLANNER_INTAKE_DRAFT,
  ...over,
});

describe('intakeStepBlocker', () => {
  it('names what each required step is missing', () => {
    expect(intakeStepBlocker(0, draft(), TODAY)).toMatch(/what you are releasing/);
    expect(intakeStepBlocker(1, draft({ artistName: '   ' }), TODAY)).toMatch(/artist name/);
    expect(intakeStepBlocker(2, draft(), TODAY)).toMatch(/Help me pick/);
    expect(intakeStepBlocker(4, draft(), TODAY)).toMatch(/what matters most/);
    expect(intakeStepBlocker(5, draft(), TODAY)).toMatch(/budget/);
  });

  it('clears each step once its answer is there', () => {
    expect(intakeStepBlocker(0, draft({ releaseType: 'single' }), TODAY)).toBeNull();
    expect(intakeStepBlocker(1, draft({ artistName: 'Ayra' }), TODAY)).toBeNull();
    expect(intakeStepBlocker(2, draft({ releaseDate: TODAY }), TODAY)).toBeNull();
    expect(intakeStepBlocker(4, draft({ goal: 'new_listeners' }), TODAY)).toBeNull();
    expect(intakeStepBlocker(4, draft({ goalText: 'Get on radio' }), TODAY)).toBeNull();
    expect(intakeStepBlocker(5, draft({ budget: 'none' }), TODAY)).toBeNull();
  });

  it('says a stored date has passed rather than leaving Continue dead with no reason', () => {
    expect(intakeStepBlocker(2, draft({ releaseDate: '2026-10-10' }), TODAY)).toMatch(/passed/);
  });

  it('never blocks the optional steps', () => {
    expect(intakeStepBlocker(3, draft(), TODAY)).toBeNull();
    expect(intakeStepBlocker(6, draft(), TODAY)).toBeNull();
  });
});
