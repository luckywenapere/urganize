import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEP,
  isPostAccountStep,
  lastQuestionStep,
  onboardingStepSequence,
  type OnboardingStepOptions,
} from '../onboarding-steps';

const base: OnboardingStepOptions = {
  workspaceEnabled: true,
  authedSetup: false,
  startFromScratch: false,
  paywallEnabled: true,
  welcomeEnabled: true,
  previewEnabled: true,
  optInEnabled: true,
};

describe('artist import step in the wizard order', () => {
  it('is absent unless asked for', () => {
    expect(onboardingStepSequence(base)).not.toContain(ONBOARDING_STEP.artistImport);
  });

  it('sits right after "What are you working on?" and before the account and the billing screen', () => {
    const sequence = onboardingStepSequence({ ...base, artistImport: true });
    expect(sequence.slice(0, 3)).toEqual([ONBOARDING_STEP.workingOn, ONBOARDING_STEP.artistImport, ONBOARDING_STEP.fallsApart]);
    expect(sequence.indexOf(ONBOARDING_STEP.artistImport)).toBeLessThan(sequence.indexOf(ONBOARDING_STEP.account));
    expect(sequence.indexOf(ONBOARDING_STEP.account)).toBeLessThan(sequence.indexOf(ONBOARDING_STEP.paywall));
  });

  it('stays for "Nothing planned yet"', () => {
    const sequence = onboardingStepSequence({ ...base, artistImport: true, nothingPlanned: true });
    expect(sequence.slice(0, 3)).toEqual([ONBOARDING_STEP.workingOn, ONBOARDING_STEP.artistImport, ONBOARDING_STEP.fallsApart]);
  });

  it('is a question before the account, not a post-account step, despite its id', () => {
    expect(isPostAccountStep(ONBOARDING_STEP.artistImport)).toBe(false);
    expect(isPostAccountStep(ONBOARDING_STEP.invite)).toBe(true);
  });

  it('never becomes the last question of an authed setup', () => {
    const sequence = onboardingStepSequence({ ...base, artistImport: true, authedSetup: true });
    expect(lastQuestionStep(sequence)).toBe(ONBOARDING_STEP.optIn);
    const short = onboardingStepSequence({
      ...base,
      artistImport: true,
      authedSetup: true,
      optInEnabled: false,
      previewEnabled: false,
    });
    expect(lastQuestionStep(short)).toBe(ONBOARDING_STEP.firstMove);
  });
});
