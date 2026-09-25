// Whether the onboarding hand-off should call POST /api/trial/start.
//
// That route 404s under BOTH billing flags:
//   - NEXT_PUBLIC_FEATURE_CARD_TRIAL — the trial then starts on /start-trial
//     once a card is added.
//   - NEXT_PUBLIC_FEATURE_HARD_PAYWALL — a team trial is granted at team
//     creation, so the no-card profile-trial route is deliberately dark
//     (see app/api/trial/start/route.ts).
//
// The wizard's runPostSignupHandoff tolerates only 400/409 back from that call,
// so a 404 throws "Not found." and strands the signup right after the account is
// created: no first release, onboarding never completes, and the welcome email
// never sends. This started happening when the hard paywall went live and the
// card trial was switched off (2026-09-10): the old code skipped the call for
// the card trial only. Skip it whenever EITHER flag is on.
//
// Pure — takes the resolved booleans rather than reading env — so it is unit
// testable. The client passes its build-time-inlined flag constants.
export function shouldStartOnboardingTrial(input: {
  cardTrialEnabled: boolean;
  hardPaywallEnabled: boolean;
}): boolean {
  return !input.cardTrialEnabled && !input.hardPaywallEnabled;
}
