/**
 * Hard paywall feature switch. Function form (the isCardTrialEnabled /
 * isEpkFeatureEnabled precedent) so it works inlined into a client bundle and
 * read at request time on the server, and so tests can stub the env.
 *
 * Its own tiny module (URG-314 batch 6) so auth-store can read it without
 * pulling the whole team-billing resolver into every route's first load.
 * lib/team-billing.ts re-exports it.
 */
export const isHardPaywallEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_HARD_PAYWALL === 'true';
