/**
 * Should a just-signed-in account be sent to the onboarding team screen
 * (/onboarding?setup=1) instead of the app?
 *
 * Why this exists (Oct 14, 2026): a brand-new person who opens
 * team.urganize.app directly lands on /auth. Typing a new email routes them to
 * /onboarding, but "Continue with Google" created the account and dropped them
 * straight into the app.
 *
 * Since #854 (29 Oct 2026) the 30-minute "fresh sign-up" window is gone:
 * nothing is asked before the account any more, so there is nothing to resume,
 * and an old account that never finished goes to the team screen on its next
 * sign-in too, as long as it owns no rollouts and its team has no records.
 * Nobody established is pulled back in:
 * - onboarding not completed (the profiles default is false),
 * - no work (an account with rollouts or records is left alone),
 * - not a curator,
 * - not an active non-owner team member (invited teammates ride the team
 *   they joined; owner rows exist for everyone via the lazy bootstrap).
 * Any unknown fails closed to false (land in the app as before).
 */
export type OnboardingSetupFacts = {
  onboardingCompleted: boolean | null;
  role: string | null;
  isWorkspaceMember: boolean;
  /** Owns rollouts, or its team has records. Null when unread. */
  ownsWork: boolean | null;
};

export function resolveOnboardingSetupRequired(facts: OnboardingSetupFacts): boolean {
  if (facts.onboardingCompleted !== false) return false;
  if (String(facts.role || '').toLowerCase() === 'curator') return false;
  if (facts.isWorkspaceMember) return false;
  if (facts.ownsWork !== false) return false;
  return true;
}
