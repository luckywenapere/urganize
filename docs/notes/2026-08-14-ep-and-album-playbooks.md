# EP and album playbooks (2026-08-14)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Completion of v1 scope item 2, **not a scope expansion**: the six-feature list always called for a
template per release type, and EP/album were the two the "Templates needed for v1" list named and
never got.

**STATUS, corrected 2026-09-07: LIVE, and this section already said so further down, in its own "Status" bullet** ("Status: LIVE in production as of 2026-08-14 (v0.55.0)"). The opener said "Built flag-off; not yet activated" and contradicted its own section for three weeks — nothing external was needed to catch it. The ledger agrees: v0.55.0 leads *"You can plan EPs and albums now, not just singles."* Read the Status paragraph below, not this line, if the two ever disagree again.

- **What it is:** `ep_v0.1` (90 tasks, 13 weeks pre + 3 post, one lead single dropping at −42) and
  `album_v0.1` (113 tasks, 17 weeks pre + 4 post, two staggered singles at −84 and −42), each with a
  markdown source of truth beside its TS encoding, the `single-v0.3.md` / `single.ts` pattern. With
  them registered, the onboarding step-0 picker enables EP and Album, the create-release modal grows a
  type picker, and the planner drafts EP and album plans from their own playbook.
- **Flag:** `NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES`, default `false`. **No migration needed** — the
  `release_type` DB enum has always accepted `'ep'` and `'album'`.
- **Why a flag for a feature that is just data:** these are v0.1 DRAFTS. `single` went v0.1 → v0.3
  through two design partners before it was trusted, and these have had no such pass. The flag buys
  that review without holding the plumbing hostage.

**Five things worth knowing before editing this:**

1. **The loader is the ONE gate, and that is load-bearing.** `resolveTemplateSlot` in
   `lib/release-templates/loader.ts` is the only place the flag is consulted; `getTemplate` and
   `getAvailableReleaseTypes` route through it, and every consumer derives from those. So the
   onboarding picker, the modal picker, the create route's instantiation, the schedule route's 207
   path and the planner cannot disagree about whether EP and album exist. Flag off is
   behaviourally identical to before this work. Do not add a second flag read anywhere else.
2. **`getAuthoredTemplate` is flag-BLIND on purpose — do not "fix" it to use the gate.** A plan draft
   generated while the flag was on carries `ep_v0.1` task ids. If the flag is rolled back mid-draft
   and the autosave route resolved the template through the gate, it would fall back to the single
   playbook, judge every one of those ids forged, and 400 every save — losing the manager's edits.
   Hence `getDraftTemplate` (plan `_shared.ts`) for EXISTING drafts, keyed off the draft's own
   `release_type`, versus `getPlannerTemplate` for NEW ones. The regenerate-phase route reads the
   STORED draft's type, not the request's, because `resetPhaseToTemplate` re-materializes rows by
   `template_task_id`.
3. **The API validates against the DB enum, NOT against template availability.** `PlannerIntakeModal`
   already POSTs `releaseType: 'ep'` today whenever the planner flag is on, because the intake offers
   all three formats and falls back to the single playbook. A flag-aware allow-list would 400 that
   live flow. So `POST /api/releases` checks `DB_RELEASE_TYPES` (`types/releases.ts`) and template
   availability stays the loader's business. This also turns the old generic 500 on a garbage value
   into a 400.
4. **`plan/generate` now writes `releases.release_type` from the intake**, closing a real gap: a
   release created from the modal or Chappi and later planned as an album kept saying `single`, which
   the public press kit renders. Safe because a planner release carries `planner_pending`, never
   `template_pending`, so the schedule route cannot double-instantiate off the corrected type.
5. **The prompt guidance branches on provenance, and must keep doing so.** Telling the model to
   "stretch the asset work to cover more tracks" is right when an EP fell back to the single playbook
   and wrong when it is already looking at the EP playbook, where that work exists — it would
   duplicate what is in front of it. `buildGuidance` takes `fallbackToSingle` for exactly this, and
   both callers compute it rather than assuming.

- **Copy is per-playbook now.** `getTemplateStats(releaseType)` (never throws; falls back to single's
  numbers for a gated-off type, which is also what would be instantiated) feeds `SetReleaseDateCard`
  and `NewReleaseGuide`, which otherwise told an album owner their plan was 64 activities over 11
  weeks. `Release.releaseType` was added to carry it — `lib/services/release-service.ts` now selects
  the column. `FirstReleaseWin` deliberately stays single-only (its flag must not run alongside the
  planner, and it celebrates a first release, created before any picker has reason to appear).
- **`onboarding-ai-moment.ts` has a per-playbook stage map.** The six onboarding stages mean the same
  thing in every playbook, so each column is the same six gates in that playbook's own ids. The
  "playbooks are next" caveat now renders only when the chosen type really did fall back — otherwise
  it apologizes for a task that IS in the user's release.
- **Tests:** `lib/release-templates/templates.test.ts` machine-enforces the authoring constraints for
  all three playbooks (unique ids, resolvable `depends_on`, offsets inside the planner's −120…+60
  window, ≤`MAX_DRAFT_TASKS`, at least one task in each of the four `derivePlanPhase` phases, an
  event milestone on release day) plus the staggered-single invariants; `loader.test.ts` pins both
  flag states and the flag-blind accessor. `release-planning.test.ts`'s phase-coverage test is now
  parameterized over all three. 574 tests green.
- **Verified:** `pnpm test`, `pnpm lint` (0 errors, 57 warnings = unchanged baseline, confirmed by
  running lint against a stashed tree), `pnpm build`. Flag OFF and flag ON both checked against a
  real server render through a throwaway harness page: off → `available: ['single']` and EP/album
  stats falling back to 64/8/11; on → `['single','ep','album']` with EP 90/13/16 and album 113/17/21,
  and all three copy variants rendering their own numbers in the HTML. The modal picker was confirmed
  compiled into the flag-on client chunk (radiogroup + all three labels) but **its interactive
  behaviour was never observed in a browser** — the Browser pane's approval gate cannot be answered
  in a non-interactive session, and Next refuses a second dev server for a directory that already has
  one. Worth one manual pass.
- **Status: LIVE in production as of 2026-08-14 (v0.55.0)** — flag on, ledger entry and version bump
  done. The playbooks went live still at **v0.1, before the design-partner review** (founder call);
  that review can still bump them to v0.2, and the `.md` and `.ts` must move together since a test
  asserts `id` and `version` agree.
- **A `turbo-ignore` trap this flip walked into, worth knowing for every future `NEXT_PUBLIC_*`
  flip:** setting the Vercel env var did nothing on its own. The accompanying version-bump commit
  touched only `package.json` files and `packages/changelog` — which `apps/web` does not depend on —
  so `npx turbo-ignore @urganize/web` skipped the web build. The marketing site rebuilt (it *does*
  depend on the changelog package, so `/changelog` showed v0.55.0 immediately) while the product app
  kept serving the pre-flag bundle, env var set but never inlined. **A flag flip needs a commit that
  actually touches `apps/web`.** A same-commit "Redeploy" in the Vercel UI is not reliable either:
  turbo-ignore diffs against the previous deployment of that project and finds nothing.
  **Partial correction (2026-08-16, measured — do not delete this without re-measuring).** The v0.56.0
  team-logins bump was exactly the shape this bullet warns about (10 `package.json` files +
  `packages/changelog/src/index.ts`, nothing else), and `npx turbo-ignore @urganize/web
  --fallback=<last deployed web commit>` answered **"This commit affects @urganize/web · Proceeding
  with deployment"** — because `apps/web/package.json` is itself part of the `@urganize/web` package,
  so bumping its `version` marks the package changed regardless of the changelog dependency. So a
  version-bump commit IS sufficient on its own. What is NOT sufficient is the half this bullet gets
  right and is the likelier cause of the v0.55.0 miss: **a same-commit "Redeploy", or setting the env
  var with no new commit at all** — there turbo-ignore finds a zero-file diff and correctly skips.
  The reliable check before trusting any flip is to run turbo-ignore yourself with `--fallback` set to
  the commit Vercel last deployed for that project, which is what makes the answer match production's.
- **How to check a flag's live state with no account:** `GET /onboarding` and count `"Coming soon"` in
  the HTML — three means off (ep + album + music_video all gated), one means on (only music_video).
  That page server-renders its type picker from `getAvailableReleaseTypes()`, so it is a genuine probe
  of the deployed bundle. **Do not** try to prove it by grepping the client chunks for
  `["single","ep","album"]`: that string is the static `DB_RELEASE_TYPES` const in `types/releases.ts`
  and is present in both flag states — a false positive this session hit and had to walk back.
- **Remaining verification:** the create-release modal's picker has still never been exercised
  interactively (its behaviour is unobservable without an authenticated session). Worth one manual
  pass: create a real EP, set a date, and confirm the activities carry
  `metadata.template.template_id === 'ep_v0.1'`, the count is 90, and the lead-single drop renders as
  an event milestone.
