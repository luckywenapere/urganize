/**
 * "This user has no releases yet" — the trigger condition for the deferred
 * first-release prompt (originally URG-217's inescapable auto-open; softened
 * 2026-08-28; since 2026-10-24 only Home's quiet card, lib/rollout-offer.ts).
 *
 * A user with zero releases has little to do in the product — every surface
 * (activities, files, calendar, press kit, metadata) hangs off a release. So
 * Home offers one quiet card (RolloutOfferCard), and
 * CreateReleaseModal reads this for its warmer first-release copy. This
 * predicate is the single condition for both.
 *
 * FAIL OPEN ON EVERY UNCERTAINTY. A wrong `true` interrupts someone with a
 * prompt they didn't need (and used to wall them in entirely), so anything
 * short of positive proof of "loaded successfully, genuinely zero" must
 * return false.
 *
 * The trap this is written to avoid: `useReleaseStore.loadCommandCenter` sets
 * `isInitialLoading: false` on BOTH success and failure, leaving `releases`
 * as `[]` and `error` populated. `releases.length === 0 && !isInitialLoading`
 * is therefore also true when the fetch FAILED — gating on that alone would
 * seal a user in on any network blip or expired session. Hence the explicit
 * `error === ''` term.
 *
 * Deliberately pure — no hooks, no store imports — so the matrix is
 * unit-testable (first-release-required.test.ts). The live reading lives in
 * components/releases/useFirstReleaseRequired.ts; importing the stores here
 * would drag lib/supabase/client into the test process, which throws without
 * env vars.
 */
export type FirstReleaseRequiredInput = {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  /** `profiles.onboarding_completed === true`. While onboarding is still in
   * flight, /onboarding owns this moment — its wizard creates the first
   * release itself before completion is stamped (runPostSignupHandoff), so
   * prompting mid-flow would talk over the flow that already does the job.
   * (An earlier revision cited FirstTimeOnboardingGate here; that gate was
   * deleted 2026-07-29.) */
  hasCompletedOnboarding: boolean;
  /** `useReleaseStore.isInitialLoading` — the command-center fetch hasn't
   * resolved yet, so a zero-length `releases` proves nothing. */
  isInitialLoading: boolean;
  /** `useReleaseStore.error` — non-empty means the load FAILED, so an empty
   * `releases` is "we don't know", not "they have none". */
  error: string;
  releaseCount: number;
};

export function isFirstReleaseRequired(input: FirstReleaseRequiredInput): boolean {
  if (!input.isAuthenticated || input.isAuthLoading) return false;
  if (!input.hasCompletedOnboarding) return false;
  if (input.isInitialLoading) return false;
  if (input.error !== '') return false;
  return input.releaseCount === 0;
}
