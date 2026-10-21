// Device Back inside the onboarding wizard (back-gestures pass, 2026-10-21).
//
// The wizard keeps its step in React state, so the browser, the OS back-swipe
// and Android's back button all saw ONE history entry and left onboarding
// altogether from step 3. The fix is to give each question step its own entry
// (pushState while moving forward) and map a pop back to the step stored in
// that entry. Pure, so vitest holds the rules.
//
// After the account exists there is nothing to revise (handleBack already
// refuses it), so those steps push nothing and a pop is answered by putting the
// person back where they were: a finished step can never be walked back into.

import { isPostAccountStep, type OnboardingStepIndex } from './onboarding-steps';

/** The key the wizard writes on its own history entries. */
export const ONBOARDING_HISTORY_KEY = 'urgOnb';

/** The step a history entry's state names, or null for any other entry. */
export function readOnboardingHistoryStep(
  state: unknown,
  sequence: readonly OnboardingStepIndex[]
): OnboardingStepIndex | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[ONBOARDING_HISTORY_KEY];
  if (typeof value !== 'number') return null;
  return (sequence as readonly number[]).includes(value) ? (value as OnboardingStepIndex) : null;
}

/** What the wizard writes into history for a step: nothing after the account exists. */
export function historyActionForStep(input: {
  step: OnboardingStepIndex;
  /** The step the CURRENT history entry already names, or null. */
  entryStep: OnboardingStepIndex | null;
  accountCreated: boolean;
}): 'none' | 'push' | 'tag' {
  const { step, entryStep, accountCreated } = input;
  if (accountCreated || isPostAccountStep(step)) return 'none';
  if (entryStep === step) return 'none';
  // The first run on a fresh page tags the entry it is on; later changes push.
  return entryStep === null ? 'tag' : 'push';
}

/** What a pop does: go to the step it names, hold the person in place, or nothing. */
export function decidePop(input: {
  state: unknown;
  sequence: readonly OnboardingStepIndex[];
  currentStep: OnboardingStepIndex;
  accountCreated: boolean;
}): { kind: 'goto'; step: OnboardingStepIndex } | { kind: 'hold' } | { kind: 'ignore' } {
  const { state, sequence, currentStep, accountCreated } = input;
  if (accountCreated || isPostAccountStep(currentStep)) return { kind: 'hold' };
  const target = readOnboardingHistoryStep(state, sequence);
  if (target === null || target === currentStep) return { kind: 'ignore' };
  return { kind: 'goto', step: target };
}
