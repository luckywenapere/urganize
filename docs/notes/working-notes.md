# Working notes (update as v1 evolves)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

This section is for state that changes during the v1 build. Keep it current.

**Current build phase:** All six v1 phases built in code. Phases 0–4 deployed; Phase 6 is live (confirmed against production 2026-09-07); Phase 5 has been live since v0.53.0 and is confirmed against production the same day (the founder checked for the "Draft the plan" card and it is there). **NEITHER is "gated pending AI provider activation" any more** — that phrasing survived here long after both flags were flipped, and twice on 2026-09-07 a session re-derived it from this very line. Phase 3c polish non-blocking. Whole-app payment gating shipped 2026-05-28 as a meta-layer (Resolved blockers #1). Internal use runs continuously. See Phase progress above for detail.

**Workspace consolidation (complete in code 2026-06-01, pending Vercel env flip):** `apps/web` two-pane workspace at `/dashboard` (releases column ~60%, tasks panel ~40%), gated by `NEXT_PUBLIC_FEATURE_WORKSPACE`. Click a release card to scope tasks via `?release=`; clear via the ScopePill `×`. `/dashboard/releases` and `/dashboard/tasks` 308-redirect to `/dashboard` (detail at `/dashboard/releases/[releaseId]` unchanged). Sidebar collapsed to Home + Settings. LegacyDashboard preserved in `app/dashboard/page.tsx` as a one-line revert path (unset the flag → renders the old greeting/cards layout). No new data layer (reuses `useReleaseStore.loadCommandCenter`). Final step is setting `NEXT_PUBLIC_FEATURE_WORKSPACE=true` in the Vercel `Web` project's Production env — that flip is the actual ship moment. See the "Workspace consolidation deployed (2026-06-01)" block at the bottom of this file for the full DoD walkthrough.

**Workspace polish — three phases landed 2026-06-01:**
- **File storage rescued + re-homed per-release.** The `AssetSection` component + its release-scoped fetcher (`GET /api/releases/[releaseId]/assets`) and `AssetUploadControl` were already per-release (the `assets` table has a `release_id` FK; the legacy `/dashboard/tasks` page never owned files at any revision). Re-homed into the workspace via a new `components/workspace/FilesPanel.tsx` that renders inside the right column under the tasks panel: scoped → reuses AssetSection verbatim; unscoped → "Select a release to see its files." hint. FilesPanel owns its own toast state; remount via `key={scopedRelease?.id ?? 'unscoped'}` resets cleanly between scopes. **Superseded 2026-07-20 (URG-165):** files nested under Tasks read as a child of the task list, not a peer surface, so `FilesPanel.tsx` was deleted and Files got its own page, `app/dashboard/releases/[releaseId]/files/` (thin server `page.tsx` + `FilesPageClient.tsx`, the same shape as the content calendar route), reusing `AssetSection` directly. `TasksPanel`'s header now has a plain "Files" nav `Link` to that page, right next to the Calendar link, instead of a toggle that expanded an inline segment above the task buckets.
- **Bucket headers collapsible.** `TasksPanel` buckets each render a real `<button aria-expanded aria-controls>` with a `lucide ChevronDown` that rotates `-rotate-90` when collapsed. Default state (2026-06-11): every bucket closed. Per-bucket state is user-owned and persisted to localStorage (`urganize.workspace.task-buckets` via `lib/persisted-state.ts`, hydrated in a mount effect to avoid SSR mismatch); it only changes when the user toggles a header. The earlier scope-change auto-expand was removed — scoping a release updates counts but leaves bucket state alone.
- **Slim panel row variant.** `TaskRow` got a `density?: 'compact' | 'comfortable'` prop (default comfortable; release detail page keeps its existing layout). Compact: two stacked lines (checkbox + truncated title with `title=` hover, then priority dot + date + lock/milestone icon), no status badge / no assignee / no release pill, priority signal kept via `getPriorityBorderClass` left border. Spacing pass: GreetingHeader eyebrow normalized to `tracking-[0.16em]` + `mt-2` gap to match the rest of the workspace; `space-y-6` wrapper between TasksPanel and FilesPanel removed so the canonical `mt-8` section gap is the single source of spacing; FilesPanel unscoped section also given `mt-8` to match.

**What exists post-UI-cut:**
- **Pages (4 + modals):** Dashboard (greeting, release cards, due-soon tasks), Releases list, Release detail (header, task progress, task list, status update placeholder), Settings (profile, teammates via workspace members, ~~subscription~~ — **corrected 2026-08-13:** Settings had no subscription/billing section at any revision after the v1 cut, so this line was wrong when written; git history at `c533339` shows the same fourteen sections with no billing among them. A real one was added 2026-08-13, see "Settings gains a billing section" below). Modals: CreateReleaseModal, TaskQuickCreateModal, TaskDetailDrawer.
- **Sidebar nav:** Dashboard, Releases, Tasks, Settings. No descriptions, no Team page.
- **API routes:** releases (CRUD, metadata, collaborators, playbook, steps, task-groups, tasks), tasks (CRUD, attachments, comments — the caller-less reorder endpoint was deleted 2026-07-10), payments/subscriptions, auth, admin, notifications, onboarding, workspace members, ui-drafts.
- **Stores:** auth, releases, tasks, activity.
- **Removed from UI:** six-stage release pipeline (StateStepper, ExecutionSection, ReadinessBar, FocusCard), command center framing, readiness scores, full-page release creation form, workspace tasks view (`/dashboard/tasks/all`), standalone team page, organization card. XState release machine (`machines/releaseMachine.ts`) deleted.
- **Release lifecycle:** now implicit — a `status` field (draft/planning/in_progress/ready/released/archived) plus task completion progress. No staged pipeline UI.
- **Workspace members:** used for task assignment; surfaced via Settings → Teammates section. Organization management removed from UI (tables remain in DB).

**Paying users:** 3 users currently carry `profiles.is_subscribed = true` in production (theurganization, bortlen4, luckydio800 — all backfilled to `paid_at = 2026-02-28`). 1 contract in legal review (₦100k/year). 1 design partner team meeting scheduled. The earlier note of "1 paying user (₦5,000/year)" was an undercount discovered during the 2026-05-28 payment-gating deploy; reconcile when convenient.

**Last template review:** Single release template v0.3 — signed off by two design partners (2026-05-26). 64 tasks across 11 weeks (8 pre-release + 3 post-release). Markdown source: `apps/web/lib/release-templates/single-v0.3.md`. The v0.1 → v0.3 jump answered the open questions from 2026-05-23 (default duration extended to 11 weeks, missing items folded in, role assignments clarified).

**Recent inbound interest (2026-05-23):** Two users independently asked about creating a release in Urganize this week. Captured contacts; following up when v1 ships.

---

**Schema reconciliation lessons (2026-05-25):**
- Op 1 cleaned application code; Op 2 reconciled schema. Sequence matters.
- 30+ instances of drift found across columns, tables, RLS policies.
- Multiple rounds of empirical verification (count queries on production) caught issues that static audit missed.
- One runtime failure during apply (RLS policies on dropped tables blocked column drops) — fixed by reordering migration. No data lost.

---

**UI cut deployed (2026-05-25):**
- 19 component/page files deleted, ~28k lines removed, ~3.5k lines added.
- Two post-deploy bugs caught and fixed: (1) release detail params unwrapping broke in client component on Next.js 16 — fixed by switching to `useParams()` hook; (2) TaskUIProvider `loadOptions` callback had `isLoadingOptions` in its dependency array, creating an unstable reference chain that caused a re-render loop in the task drawer — fixed by switching the reentrancy guard to a ref.
- No database changes. DB columns (`state`, `readiness_score`) remain; UI just stopped surfacing them.

---

**Template infrastructure deployed (2026-05-26):**
- New module at `apps/web/lib/release-templates/`: `types.ts` (`Template`, `TemplateTask`, `ReleaseContext`), `loader.ts` (release-type → Template registry; `single` populated, EP/album/music_video null), `instantiate.ts` (`Template` + release context → `tasks` rows, batch insert), `single.ts` (`single_v0.3`, 64 tasks), `single-v0.3.md` (markdown source of truth).
- Release creation flow at `app/api/releases/route.ts` POST: after the `releases` insert, calls `getTemplate(release_type)` + `instantiateTemplate({...})`. The legacy `createDefaultReleaseTasks` call (pipeline-themed defaults) was removed. The helper itself still lives in `tasks-server.ts` as dead code — separate cleanup diff.
- Failure handling: template instantiation runs inside a try/catch that logs and continues. A release can exist without tasks if instantiation fails — `TemplateNotAvailableError` for unbuilt release types, `TemplateInstantiationError` for DB / template / date issues. Recoverable beats partial rollback for v1.
- Modal change: release date is now required (HTML `required` + `canSubmit` guard + API 400 before format check). Closes the silent-no-tasks path that `missing_release_date` would have opened.
- Task assignment: every instantiated task is assigned to the release owner via `assigned_to_user_id`. Required for the dashboard query (`TaskService.getTasksForUser` filters by `.eq('assigned_to_user_id', userId)`) to surface them. Per-task reassignment happens via the task drawer. Earlier null-assignee build (Step 3b spec) caused tasks to be inserted but invisible — fixed before pushing.
- v2 carry-overs: (1) ~~the create-release modal does not capture release type~~ **resolved 2026-08-14: the modal has a Single/EP/Album picker, rendered only when more than one playbook is switched on (so it is invisible with the EP/album flag off, which is the default). `POST /api/releases` now validates the value against the DB enum instead of letting an unknown string 500 at the Postgres boundary.** (2) Silent template failures only log to server console — no in-product surface yet. (3) `createDefaultReleaseTasks` dead-code removal pending.

---

**Payment gating deployed (2026-05-28):**
- See Resolved v1 blockers #1 for the full architecture and PR refs.
- Lessons / post-deploy notes:
  - Migration `20260528_payment_gating_trial_fields.sql` was applied during the Vercel build window after explicit risk acceptance — fortunate timing; the gate's snapshot query would have errored on every request otherwise.
  - 28-day no-card trial replaced the previous 3-day card-on-file flow at the same `POST /api/trial/start` path. `lib/trial-checkout.ts` and the `trial_claim` machinery in `/api/payments/verify` are now dead code (see Known issues for cleanup).
  - Schema migration backfilled `paid_at` for 3 existing subscribed users from `subscriptions.started_at`, added a BEFORE UPDATE trigger blocking PostgREST `authenticated`/`anon` from self-mutating trial/paid fields, and extended `subscriptions.plan` CHECK to allow `'access'`.
  - Email allowlist verified via `apps/web/lib/paywall-allowlist.test.ts` (vitest; ported from the original standalone 15-case runtime check when the test runner landed 2026-07-10).
