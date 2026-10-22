# The test path: a one-tap test release (2026-09-01; LIVE the same day, v1.16.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: *"let's create a test path so users that just want to test the
app can actually have a look at it without the pressure of running a whole real
release first, the whole test path should end with an option for them to delete
the test release if they want."* Two forks were put to the founder before
building and both answers shape everything here: entry points are **in-app
only** (the zero-release empty state and the first-release pop-up; the signup
wizard is untouched), and the exit is a **standing banner**, not a guided tour.
Behind `NEXT_PUBLIC_FEATURE_TEST_RELEASE`, default `false`. **LIVE in production
as of 2026-09-01 (v1.16.0):** the founder set the flag on the Vercel `Web`
project the same afternoon the code merged, and the v1.16.0 version-bump commit
is what made the flip take — a `NEXT_PUBLIC_*` value is inlined at build time,
the merge deploy was built before the variable existed, and `turbo-ignore` skips
a same-commit redeploy, so the flag sat set-but-inert until a commit touched
`apps/web/package.json` (the measured 2026-08-16 fact; sixth time this repo has
walked that path, first time it was done on purpose rather than discovered).
**No migration**, and **zero new read API surface** — see point 1.

**What it is:** "Try a test release" on the catalog's "No releases yet" empty
state (both viewport branches, one shared `testRelease` prop so they cannot
drift), and "Just looking? Try a test release instead" on the first-release
pop-up's chooser step. One tap POSTs a canned draft from
`lib/test-release.ts:buildTestReleaseDraft` — titled "Test release", always
`single` (the one design-partner-reviewed playbook), dated **+63 days** so all
64 activities land in the future and the buckets read naturally — with
`isTest: true` and `source: 'test_path'`. The user lands scoped to it under a
standing `TestReleaseBanner` (via TasksPanel's `activitiesBanner` slot, first in
the chain) whose "Delete test release" button opens `DeleteReleaseDialog`'s
second-ever mount. The catalog card carries a small "Test" pill.

**Seven things worth knowing before editing this:**

1. **The marker is `metadata.test_release === true`, and the read path cost
   nothing.** `lib/test-release.ts` copies `release-planner-pending.ts`'s idiom
   verbatim (top-level key, `=== true` read, spread-merge write,
   delete-on-clear). The only writer is `POST /api/releases`; nothing
   server-side reads it back after creation; the client reads it off
   `Release.metadata`, which the command-center has always shipped raw — that
   is the zero-new-API-surface claim, and it is why there is no migration.
2. **A dateless `isTest` is a 400, and that guard is load-bearing, not
   politeness.** The insert writes `metadata` through THREE mutually-exclusive
   spreads (`template_pending` / `planner_pending` / `test_release`).
   `templatePending` requires no date, so a dateless test would set two spreads
   at once — last one wins, `template_pending` silently lost, a release that
   never instantiates. The date requirement (plus point 3) is what makes the
   exclusivity provable rather than assumed; the invariant comment sits beside
   the spreads.
3. **`isTest` forces the planner OFF and the plan to `'template'`.** A test
   release must land with its full plan instantly — routing a tester into the
   planner intake is exactly the pressure this path removes, and a blank test
   release would be an empty list under a banner saying "tick activities off".
4. **A flag-off `isTest` is a LOUD 400** (`'Test releases are not switched
   on.'`), never silently ignored: dropping the field would mint an unmarked
   release titled "Test release" — no tag, no banner, no delete exit. The route
   itself stays ungated; every ordinary create keeps working. There is no
   404-probe for this flag (the POST route must stay open), so the flag's two
   states are pinned by unit tests of `isTestReleaseEnabled` plus code review
   of the 400 — and the standing trap applies: do NOT grep the client bundle
   for "Test release", both ternary branches compile in (fifth time recorded).
5. **The navigation deliberately carries no `&new=1`.** The NewReleaseGuide
   consumption effect in WorkspaceView is mount-once (empty dep array), and the
   empty-state entry fires while the user is ALREADY on `/dashboard` where no
   remount happens — the guide could never show. The banner carries the
   orientation copy instead, which is better anyway: one surface both explains
   the thing and offers the way out. Relatedly, the hook AWAITS
   `loadCommandCenter({ force: true })` before pushing (a commented deviation
   from the modal's `void`): pushing early paints the still-empty catalog
   uncovered mid-fetch, and awaiting lets the auto-scope's
   arrive-already-scoped rule spend the lone-release chance cleanly.
6. **The delete exit lands on the catalog and STAYS there.** `onDeleted` runs
   `removeReleaseLocal` + force reload (the ReleasesSection pair), then
   `markCatalogRequested()` + `setScope(null, { forgetScene: true })` — without
   the intent mark, a remaining lone REAL release would auto-scope-bounce the
   user straight back into a release seconds after they deleted one (the
   v1.14.1 mechanism). The banner is gated on `scopedReleaseIsOwn` (DELETE is
   owner-only; a delete button that 404s is worse than no banner). **URG-163's
   Settings-only deletion rule gains its ONE sanctioned exception here** —
   recorded at all three comment sites (WorkspaceDesktopFocused, ReleasesSection
   docblock, the WorkspaceView mount) — and real releases keep the rule.
7. **AppShell's modal instance deliberately does NOT carry the test link**,
   unlike the two the first-release prompt opens (WorkspaceView's — failure
   renders inline in the empty state — and ChappiPageClient's — failure goes to
   `pushToast`, which works there because the page renders inside AppShell's
   ToastProvider). AppShell cannot consume the provider it mounts itself, so a
   failed create from its instance would be a silent dead tap, the one outcome
   this path must never produce; and that instance only opens from deliberate
   "+ New release" taps, not from the prompt the test path serves. The comment
   at its mount records this so it is not "unified" later.

- **Deliberately NOT suppressed:** `time_to_first_release` / `release_date_set`
  analytics still fire (segmentable — `release_created.source` is
  `'test_path'`, added to the normalizer AND the `ReleaseCreatedSource` union,
  which is a type error to skip), and a test release **counts against the
  active-release cap** — it IS an active release, the target user has zero, and
  deleting it frees the slot. **Suppressed:** `enqueueReleaseReminders` (its one
  call site is wrapped in `if (!isTest)`) — a "come back to your release" push
  about a practice release is the pressure this removes.
- **Verified:** 2011 tests (18 new in `lib/test-release.test.ts`), `eslint .` at
  the exact measured clean-tree baseline (**3 errors / 70 warnings**; the two
  findings that now print CreateReleaseModal line numbers are its pre-existing
  mount-guard/chooser-reset effects shifted by the new prop's doc lines),
  `tsc --noEmit` clean apart from the documented pre-existing
  `confirmed-action.test.ts` errors, and `next build` green **by exit code** in
  BOTH flag states with `/auth`, `/dashboard`, `/onboarding` and `/settings`
  all still `○ Static` in each. **Four mutation passes, each failing exactly
  its own tests:** blind-overwrite in `writeTestRelease` (3 failures),
  clear-writes-false instead of deleting (2), truthy read instead of `=== true`
  (1), and a 62-day lead (2) — file restored byte-identical after each.
- **Not verified:** nothing has rendered in a browser — this sandbox cannot
  mint a session and has no route to app.urganize.app — so the button stacks,
  the banner, the modal link and the delete flow rest on unit tests plus the
  traced paths above. No real POST has carried `isTest`, so the route's four
  invariants have never executed end to end.
- **Activation checklist:** (1) ~~nothing to migrate — set
  `NEXT_PUBLIC_FEATURE_TEST_RELEASE=true` on the Vercel `Web` project~~ — done
  by the founder 2026-09-01; (2) ~~changelog entry + version bump across all
  `package.json` files at the flip~~ — done as v1.16.0, and that commit is
  ALSO the rebuild that inlined the flag (see the header paragraph); (3)
  ~~revisit Settings' "Deleting a release is only available here" sentence~~ —
  reworded to "Delete a release here." in the same commit, since a test
  release's banner made "only" untrue; **(4) OPEN, and the only thing left: the
  manual pass.** On a zero-release account tap "Try a test release" → land
  scoped with the banner and 64 future activities → tick one → "Delete test
  release" → the dialog names it with the activity count → land on the catalog
  with no auto-scope bounce; repeat once via the pop-up's quiet link; once as a
  teammate on a shared test release (no banner); and confirm no come-back push
  ever arrives for it. Do not try to confirm the flag from the bundle — both
  ternary branches compile in; the button appearing is the proof.
