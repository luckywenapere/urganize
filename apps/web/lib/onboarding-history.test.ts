import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_HISTORY_KEY,
  decidePop,
  historyActionForStep,
  readOnboardingHistoryStep,
} from './onboarding-history';
import { onboardingStepSequence, ONBOARDING_STEP } from './onboarding-steps';

const sequence = onboardingStepSequence({
  workspaceEnabled: true,
  authedSetup: false,
  startFromScratch: false,
  paywallEnabled: true,
  welcomeEnabled: true,
  previewEnabled: true,
  optInEnabled: true,
});
const tag = (step: number) => ({ [ONBOARDING_HISTORY_KEY]: step });

describe('readOnboardingHistoryStep', () => {
  it('reads a step the sequence holds, and nothing else', () => {
    expect(readOnboardingHistoryStep(tag(2), sequence)).toBe(2);
    expect(readOnboardingHistoryStep(tag(99), sequence)).toBeNull();
    expect(readOnboardingHistoryStep({ [ONBOARDING_HISTORY_KEY]: '2' }, sequence)).toBeNull();
    expect(readOnboardingHistoryStep(null, sequence)).toBeNull();
    expect(readOnboardingHistoryStep('x', sequence)).toBeNull();
    expect(readOnboardingHistoryStep({ __NA: true }, sequence)).toBeNull();
  });
  it('a step left out of this sequence is not a target', () => {
    const noPreview = onboardingStepSequence({
      workspaceEnabled: true,
      authedSetup: false,
      startFromScratch: true,
      paywallEnabled: true,
      welcomeEnabled: true,
      previewEnabled: true,
      optInEnabled: true,
    });
    expect(readOnboardingHistoryStep(tag(ONBOARDING_STEP.preview), noPreview)).toBeNull();
  });
});

describe('historyActionForStep', () => {
  it('tags the first entry, then pushes one entry per forward step', () => {
    expect(historyActionForStep({ step: 0, entryStep: null, accountCreated: false })).toBe('tag');
    expect(historyActionForStep({ step: 1, entryStep: 0, accountCreated: false })).toBe('push');
    expect(historyActionForStep({ step: 1, entryStep: 1, accountCreated: false })).toBe('none');
  });
  it('writes nothing once the account exists or on a post-account step', () => {
    expect(historyActionForStep({ step: 3, entryStep: 2, accountCreated: true })).toBe('none');
    expect(historyActionForStep({ step: ONBOARDING_STEP.paywall, entryStep: 7, accountCreated: false })).toBe('none');
    expect(historyActionForStep({ step: ONBOARDING_STEP.welcome, entryStep: 7, accountCreated: false })).toBe('none');
  });
});

describe('decidePop', () => {
  it('Back from step 3 lands on the step that entry names', () => {
    expect(decidePop({ state: tag(2), sequence, currentStep: 3, accountCreated: false })).toEqual({ kind: 'goto', step: 2 });
  });
  it('ignores a pop onto an untagged entry or the step already showing', () => {
    expect(decidePop({ state: null, sequence, currentStep: 3, accountCreated: false })).toEqual({ kind: 'ignore' });
    expect(decidePop({ state: tag(3), sequence, currentStep: 3, accountCreated: false })).toEqual({ kind: 'ignore' });
  });
  it('holds the person in place once the account exists, never walking back into a finished step', () => {
    expect(decidePop({ state: tag(2), sequence, currentStep: 3, accountCreated: true })).toEqual({ kind: 'hold' });
    expect(decidePop({ state: tag(4), sequence, currentStep: ONBOARDING_STEP.paywall, accountCreated: false })).toEqual({ kind: 'hold' });
  });
});
