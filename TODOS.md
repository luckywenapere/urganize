# TODOS

Maintained by gstack /ship (auto-marks completed items) and by hand. Format:
items grouped by component, each with a **Priority:** field (P0 blocker → P4
someday), completed items move to the bottom with their ship date.

## apps/web — refactors

### Split FirstTimeOnboardingGate into gate + steps + hook
**Priority:** P1
The onboarding wizard is a single 1,022-line client component doing five jobs
(route gating, wizard state, network, tick animation, education preview).
Split into a thin gate, per-step components under
`components/onboarding/steps/`, and a co-located state/network hook — no
behavior change. Full brief: docs/optimization-report-2026-07-09.md item 29.
Risky to ship without visual verification of the wizard — pair with
authenticated QA (/setup-browser-cookies + /qa).

### Deduplicate the auth + admin-client route preamble
**Priority:** P1
~40 API route handlers repeat the same 4-line bootstrap
(requireActiveAuthenticatedUser → createAdminClient → env-error 500). Add a
`withAuthenticatedAdmin(request, handler)` helper in `app/api/_shared/auth.ts`
and migrate all call sites mechanically. Report item 33.

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

## Completed

- (History predating this file lives in git log; the file starts 2026-07-10.)
