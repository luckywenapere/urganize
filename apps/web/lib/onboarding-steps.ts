/**
 * The onboarding wizard's steps, in order (URG-251 + URG-274, 2026-10-14).
 *
 * The wizard used to walk a fixed 0..6 with `step + 1`. It now has steps that
 * only some people see (the plan preview is for template-plan users only, the
 * account step is skipped in authed-setup mode, the paywall and welcome screen
 * depend on billing mode and on whether the welcome was already seen), so the
 * order is a list computed here and Next/Back walk that list. Pure, so vitest
 * holds the rules.
 *
 * The index numbers are stable ids, not positions: "Step N of M" is the
 * position in the list, never the id.
 *
 *   -  Who are you? (URG-262, rendered in front of step 0, not numbered here)
 *   0  What are you working on?
 *   1  Where does a rollout usually fall apart?
 *   2  What's already done?
 *   3  Tell us about this rollout
 *   4  Your first move
 *   5  Your plan, week by week (read-only preview; template-plan users only)
 *   6  Stay on top of your next move (push + email opt-in, both off)
 *   7  Create your account (+ optional referral code)
 *   8  Paywall: Start my free trial (no skip, no close)
 *   9  Welcome to Urganize (once)
 *  10  Bring your team in (workspace flag; always skippable, URG-274)
 */

export type OnboardingStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const ONBOARDING_STEP = {
  workingOn: 0,
  fallsApart: 1,
  alreadyDone: 2,
  rollout: 3,
  firstMove: 4,
  preview: 5,
  optIn: 6,
  account: 7,
  paywall: 8,
  welcome: 9,
  invite: 10,
} as const satisfies Record<string, OnboardingStepIndex>;

export const ONBOARDING_STEP_TITLES: Record<OnboardingStepIndex, string> = {
  0: 'What are you working on?',
  1: 'Where does a rollout usually fall apart?',
  2: "What's already done?",
  3: 'Tell us about this rollout',
  4: 'Your first move',
  5: 'Your plan, week by week',
  6: 'Stay on top of your next move',
  7: 'Create your account',
  8: 'Start your free trial',
  9: 'Welcome to Urganize',
  10: 'Bring your team in',
};

export type OnboardingStepOptions = {
  /** NEXT_PUBLIC_FEATURE_WORKSPACE: the invite step exists only with it on. */
  workspaceEnabled: boolean;
  /** ?setup=1 for a signed-in account: no account step. */
  authedSetup: boolean;
  /** planningPreference === 'start_from_scratch': no plan preview. */
  startFromScratch: boolean;
  /** The new paywall screen (off under the retired card trial). */
  paywallEnabled: boolean;
  /** The welcome screen, false once it has been seen. */
  welcomeEnabled: boolean;
  /** The plan preview screen. */
  previewEnabled: boolean;
  /** The opt-in screen. */
  optInEnabled: boolean;
};

/** Every step this person walks, in order. */
export function onboardingStepSequence(options: OnboardingStepOptions): OnboardingStepIndex[] {
  const steps: OnboardingStepIndex[] = [
    ONBOARDING_STEP.workingOn,
    ONBOARDING_STEP.fallsApart,
    ONBOARDING_STEP.alreadyDone,
    ONBOARDING_STEP.rollout,
    ONBOARDING_STEP.firstMove,
  ];
  if (options.previewEnabled && !options.startFromScratch) steps.push(ONBOARDING_STEP.preview);
  if (options.optInEnabled) steps.push(ONBOARDING_STEP.optIn);
  if (!options.authedSetup) steps.push(ONBOARDING_STEP.account);
  if (options.paywallEnabled) steps.push(ONBOARDING_STEP.paywall);
  if (options.welcomeEnabled) steps.push(ONBOARDING_STEP.welcome);
  if (options.workspaceEnabled) steps.push(ONBOARDING_STEP.invite);
  return steps;
}

/** The step after `step`, or null at the end (or for a step not in the list). */
export function nextOnboardingStep(
  sequence: readonly OnboardingStepIndex[],
  step: OnboardingStepIndex
): OnboardingStepIndex | null {
  const index = sequence.indexOf(step);
  if (index < 0 || index >= sequence.length - 1) return null;
  return sequence[index + 1];
}

/** The step before `step`, or null at the start. */
export function previousOnboardingStep(
  sequence: readonly OnboardingStepIndex[],
  step: OnboardingStepIndex
): OnboardingStepIndex | null {
  const index = sequence.indexOf(step);
  if (index <= 0) return null;
  return sequence[index - 1];
}

/**
 * The first step after the account exists: where the hand-off goes once the
 * rollout is made. In authed-setup mode that is whatever follows the last
 * question. Null means nothing is left, so the wizard finishes.
 */
export function firstStepAfterAccount(sequence: readonly OnboardingStepIndex[]): OnboardingStepIndex | null {
  return (
    sequence.find(
      (step) =>
        step === ONBOARDING_STEP.paywall || step === ONBOARDING_STEP.welcome || step === ONBOARDING_STEP.invite
    ) ?? null
  );
}

/** The last step that is answered before the account exists (authed setup's "Create my rollout"). */
export function lastQuestionStep(sequence: readonly OnboardingStepIndex[]): OnboardingStepIndex {
  const questions = sequence.filter((step) => step < ONBOARDING_STEP.account);
  return questions[questions.length - 1] ?? ONBOARDING_STEP.firstMove;
}

/** True for the steps that come after the account exists, where Back is gone. */
export function isPostAccountStep(step: OnboardingStepIndex): boolean {
  return step > ONBOARDING_STEP.account;
}

/**
 * "Step N of M". The persona question is the first slot in front of the list,
 * so everything counts one on.
 */
export function onboardingStepKicker(
  sequence: readonly OnboardingStepIndex[],
  step: OnboardingStepIndex | 'persona'
): { number: number; total: number } {
  const total = sequence.length + 1;
  if (step === 'persona') return { number: 1, total };
  const index = sequence.indexOf(step);
  return { number: (index < 0 ? 0 : index) + 2, total };
}

/**
 * NEXT_PUBLIC_FEATURE_ONBOARDING_V2: the preview, opt-in, referral field,
 * paywall and welcome screen. ON unless set to 'false' (founder: "always ship
 * them on"), the invite gate's kill-switch pattern.
 */
export const isOnboardingV2Enabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_ONBOARDING_V2 !== 'false';
