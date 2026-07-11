# TODOS

Maintained by gstack /ship (auto-marks completed items) and by hand. Format:
items grouped by component, each with a **Priority:** field (P0 blocker → P4
someday), completed items move to the bottom with their ship date.

"Report item N" references point at `docs/optimization-report-2026-07-09.md`,
a LOCAL UNTRACKED report (kept out of git by decision, 2026-07-10) — it only
exists on the machine that generated it. Each TODO below carries enough
context to act on without it.

## apps/web — refactors

### Harden onboarding wizard failure paths
**Priority:** P1
Four pre-existing failure modes in `components/onboarding/useOnboardingWizard.ts`
(all moved verbatim in the 2026-07-10 split; surfaced by adversarial review,
deferred by decision to keep that branch a pure move):
1. `handleCreateFirstRelease`: `setWorkspaceCreationName` fires before the
   `patchOnboarding` await — if the PATCH fails after the release POST
   succeeded, the user is stranded on the button-less "taking shape" overlay
   (scroll locked, no Back), and a reload + retry mints a DUPLICATE release
   (`onboarding_release_id` never persisted; POST not idempotent).
2. `handleFinishOnboarding`: the release title/date PATCH never checks
   `response.ok` — 4xx/5xx silently drops the release date, and on
   resume-after-reload it sends `title: ''` (guaranteed 400, swallowed). Also
   clobbers server state with stale local title/date.
3. Step-2 auto-advance effect: on PATCH failure the catch re-arms the effect
   → unbounded retry every ~1.2s with no backoff or cap while the API is down.
4. `loadOnboarding` has no AbortController — a route flip mid-flight can paint
   a stale error banner or resurrect nulled state.
Also INVESTIGATE: session-expiry inside the overlay leaves no actionable
escape (banner says "sign in again" but the full-screen gate has no sign-out
affordance); consider `.catch`-containment for the next/dynamic chunk-load
seam in AppShell.

### Consolidate local admin-client factories and env-error bodies
**Priority:** P3
Census from the 2026-07-10 auth dedup: six route files define their own local
admin-client factories duplicating the shared `createAdminClient`
(`webhooks/paystack` — a module-scope shadow, `user/onboarding`,
`invites/[token]`, `invites/resolve-by-email`, `auth/providers`,
`payments/verify`, `account/delete-now`), and the env-error body is
inconsistent ("Server environment is not configured" with and without a
trailing period; `billing/start-checkout` also passes the env URL instead of
`auth.supabaseUrl`). Consolidate onto the shared helper and one canonical
body. Low urgency — behavior is correct today, just duplicated.

## apps/web — data layer

### Drop releases.state and releases.readiness_score columns
**Priority:** P2
Both are six-stage-pipeline relics; writes stopped 2026-07-10 (columns ride
their NOT NULL defaults). ORDER MATTERS: `lib/services/release-service.ts`
still SELECTs both for /api/command-center — migrate that read (and the
readinessScore fields in types/releases.ts, lib/execution-types.ts,
stores/useReleaseStore.ts) BEFORE the drop migration or the dashboard 500s.

### Comment/attachment counts via DB aggregate
**Priority:** P2
`loadTaskCounts` in lib/tasks-server.ts fetches every comment/attachment row
to count in JS. Replace with a grouped-count RPC, or drop counts from list
hydration. Report item 21.

### Create default task groups at release creation
**Priority:** P2
`createDefaultReleaseTaskGroups` runs its select(+insert on first load) inside
the release-board READ path; initialization belongs in template instantiation.
Report item 20.

## apps/web — UI performance

### Re-render memoization pass on the workspace
**Priority:** P3
Ticking one checkbox re-renders the whole workspace tree: React.memo TaskRow
and WorkspaceReleaseCard, stabilize per-row handlers, compute per-release
done/total in one groupBy pass, and use narrow Zustand selectors on the pages.
Report item 26. Verify with authenticated profiling.

### Gate the onboarding demo-tick interval on gate visibility
**Priority:** P3
`useOnboardingWizard.ts`: the 950ms `demoTick` interval runs whenever
`currentStep === 1`, and `currentStep` defaults to 1 while `onboarding` is
null — so it ticks (re-rendering a null-returning gate) on routes where the
gate never shows, e.g. /auth. Pre-existing, moved verbatim in the 2026-07-10
split; deferred by decision to keep that branch a pure move. Fix: early-return
the interval effect unless the gate is actually visible at step 1.

### Tokenize the hardcoded "Without" text color in StepFourComparison
**Priority:** P3
`steps/StepFourComparison.tsx` uses `text-[rgba(226,226,226,0.72)]` (dark-theme
content-primary, hardcoded) for the "Without" rows — it won't adapt in light
theme and gets barely legible on the light row background. Pre-existing, moved
verbatim in the split. Replace with a token class (e.g. `text-content-secondary`)
and verify both themes visually.

## infrastructure

### Disconnect the legacy `urganize-website` Vercel project
**Priority:** P2
A third Vercel project (`urganize-website`) is still connected to this GitHub
repo and fails its deployment check on every commit (verified pre-existing on
main). It serves neither app.urganize.app nor www.urganize.app. Dashboard
action for the owner: Vercel → urganize-website → Settings → Git → Disconnect
(or delete the project). Removes the permanent red ✗ from every PR.

## Completed

- **2026-07-10** Deduplicate the auth + admin-client route preamble
  (`requireAuthenticatedAdmin` in `app/api/_shared/auth.ts`; 33 handlers
  across 21 route files migrated; 13 handlers that interleave params/paywall
  checks between the two calls deliberately kept the split form to preserve
  400-before-500 error precedence).
- **2026-07-10** Split FirstTimeOnboardingGate into gate + steps + hook
  (thin gate + `useOnboardingWizard.ts` + five components under
  `components/onboarding/steps/`; also deleted the old flow's 11 dead
  onboarding components).
- (History predating this file lives in git log; the file starts 2026-07-10.)
