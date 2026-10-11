/**
 * What onboarding's "Create account & rollout" step says while it works
 * (2026-10-11, first-user flow).
 *
 * A browser test of a brand-new signup sat on "Working… / Setting up your
 * first rollout..." for most of a minute and read as frozen. The work is a
 * chain of server calls that cannot all run at once (the account has to exist
 * before the rollout can be made for it), so the fix is partly speed and
 * partly saying what is happening: one line per stage, plus a fixed note on
 * how long it takes, and a later line if a stage is still going.
 *
 * Pure, so the copy is held by a test.
 */

export type OnboardingProgressStage = 'account' | 'rollout' | 'almost';

/** Shown under the stage line for the whole wait. */
export const ONBOARDING_PROGRESS_NOTE = 'This takes under a minute.';

/** If the rollout stage is still going after this long, say we are nearly done. */
export const ONBOARDING_ALMOST_THERE_AFTER_MS = 8_000;

const MAX_TITLE_IN_COPY = 60;

export function onboardingProgressMessage(stage: OnboardingProgressStage, title: string): string {
  if (stage === 'account') return 'Creating your account…';
  if (stage === 'almost') return 'Almost there…';
  const trimmed = title.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Setting up your first rollout…';
  const shown = trimmed.length > MAX_TITLE_IN_COPY ? `${trimmed.slice(0, MAX_TITLE_IN_COPY - 1).trimEnd()}…` : trimmed;
  return `Setting up “${shown}”…`;
}

/** The invite step's two exits say what each is doing, never the other's word. */
export function inviteStepButtonLabels(finishing: 'send' | 'skip' | null): { send: string; skip: string } {
  return {
    send: finishing === 'send' ? 'Sending…' : 'Send invites & continue',
    skip: finishing === 'skip' ? 'Continuing…' : 'Skip for now',
  };
}
