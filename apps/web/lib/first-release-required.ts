/**
 * "This user has no releases and must create one before using the app"
 * (URG-217).
 *
 * A user with zero releases has nothing to do in the product — every surface
 * (activities, files, calendar, press kit, metadata) hangs off a release. So
 * CreateReleaseModal drops its exits and the dashboard auto-opens it. This
 * predicate is the single gate for both behaviors.
 *
 * FAIL OPEN ON EVERY UNCERTAINTY. A wrong `true` locks someone out of the
 * product behind a modal they cannot dismiss, so anything short of positive
 * proof of "loaded successfully, genuinely zero" must return false.
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
   * flight, FirstTimeOnboardingGate owns this moment: it already forces a
   * first release at its step 3, and its z-9998 full-screen overlay plus its
   * own body-scroll lock would fight ours if we opened underneath it. */
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
