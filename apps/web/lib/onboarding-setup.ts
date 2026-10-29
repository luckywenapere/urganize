/**
 * Should a just-signed-in account be sent to the onboarding wizard
 * (/onboarding?setup=1) instead of the app?
 *
 * Why this exists (Oct 14, 2026): a brand-new person who opens
 * my.urganize.app directly lands on /auth. Typing a new email already routes
 * them to /onboarding, but "Continue with Google" created the account and
 * dropped them straight into the app, skipping onboarding v2 (plan preview,
 * opt-in, paywall, welcome). The only reroute was the card-trial gate, which is
 * off in production.
 *
 * Deliberately narrow, so nobody established is ever pulled back into the
 * wizard:
 * - onboarding not completed (the profiles default is false),
 * - the profile was created within FRESH_SIGNUP_WINDOW_MS (a sign-up happening
 *   right now, not an old account that never finished onboarding),
 * - not a curator,
 * - not an active non-owner workspace member (invited teammates ride the team
 *   they joined; owner rows exist for everyone via the lazy bootstrap).
 * Any unknown fails closed to false (land in the app as before).
 */
export const FRESH_SIGNUP_WINDOW_MS = 30 * 60 * 1000;

export type OnboardingSetupFacts = {
  onboardingCompleted: boolean | null;
  role: string | null;
  isWorkspaceMember: boolean;
  createdAtIso: string | null;
  nowMs?: number;
};

export function resolveOnboardingSetupRequired(facts: OnboardingSetupFacts): boolean {
  if (facts.onboardingCompleted !== false) return false;
  if (String(facts.role || '').toLowerCase() === 'curator') return false;
  if (facts.isWorkspaceMember) return false;
  if (!facts.createdAtIso) return false;
  const created = Date.parse(facts.createdAtIso);
  if (Number.isNaN(created)) return false;
  const now = facts.nowMs ?? Date.now();
  const age = now - created;
  return age >= -60_000 && age <= FRESH_SIGNUP_WINDOW_MS;
}
