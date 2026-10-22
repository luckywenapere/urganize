# UrgAns release planner (2026-08-10)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The rebuild of v1 scope item 2, replacing the "Tailor plan" build this section calls never-activated (see the caveat at the end of this paragraph). **Not a scope expansion** — this IS the release rollout planner the six-feature list already called for.

**STATUS, corrected 2026-09-07: LIVE by 2026-08-14, and the migration WAS applied — "not applied anywhere yet" was wrong.** Three ledger entries describe this planner working in production, and one of them is not an announcement but a BUG REPORT from real use: v0.56.2 (2026-08-18) says the chat flow *"used to walk you through the seven rollout questions and then stop with 'there is already a release plan'"*. That message can only come from `/api/releases/[id]/plan/generate`'s `draft_exists` or `tasks_exist` branch, and `planner.ts` checks `isFlagGateOff(res)` **before** either of them — so the route was reachable, so the flag was on. Reaching that branch also means the draft row was read, so `release_plan_drafts` exists. v0.53.0 (*"drafts the plan from the playbook — no form to fill in"*) and v0.56.3 (*"six questions instead of seven"*) say the same thing less sharply. ~~**Whether it is still on today is not answerable from the repo**~~ — **ANSWERED THE SAME DAY, by the founder looking: the "Draft the plan" card is there on a release with no activities.** So the flag is on in the deployed bundle, observationally rather than by inference, which is the same grade of evidence Phase 6 got when he pressed its button. **Be precise about what that settles: the CARD proves the FLAG** — its gate is `PLANNER_ENABLED && scopedReleaseId && scopedReleaseIsOwn && (no activities || a draft waiting)`, all client-side. The migration is settled separately and by the v0.56.2 bug report above, since reaching `draft_exists` means the draft row was read. Nothing records a switch-off, and v1.21.0's three-tool switch-off does not name it. Two practical consequences: the checklist's step 1 below is probably a no-op (the migration is fully idempotent — every policy carries a `drop policy if exists`, so re-running it is the cheapest way to settle this), and the premise of "The two UrgAns doors, reconciled" needed correcting — see that section.

**An adjacent conflict this turned up:** the phrase "the never-activated 'Tailor plan' build" above is contradicted by **v0.32.0 (2026-07-26), which reads *"The AI rollout planner is now live"***, and by v0.33.0 (*"AI rollout planning and status updates now retry more reliably behind the scenes"*), which also names the STATUS-UPDATE generator as live — while Phase 5 and Phase 6 in the build-sequence section describe both as pending activation.

**Investigated 2026-09-07. `NEXT_PUBLIC_FEATURE_TAILOR_PLAN` cannot be settled from the repo — env vars are not in git — but the alarm in the first version of this note was over-broad, and the harm question IS settleable, with one query.** Four findings, in order of usefulness:

1. **THE DECISIVE TEST IS DATA, NOT THE FLAG.** The old route stamped `releases.ai_tailoring_response` with `{ ...aiResponse, tailored_at }` **after** the deletes, so a completed destructive run left a timestamped trace on the release row. The new planner writes that same column, and `tailored_at` is NOT a discriminator (it writes one too) — the old shape's `remove_task_ids` / `modify_tasks` / `rationale` keys are, since the new delta uses `drops` / `adjust_offsets`. So: `select count(*) from public.releases where ai_tailoring_response ? 'remove_task_ids';` — **zero means the destructive path never completed on any release, ever**, which is a better answer than the flag state, because the flag being on is necessary and not sufficient.
2. **What could be lost was narrower than "activities".** `validateTailoringAgainstTasks` rejected the WHOLE response if any removed id was unknown **or non-optional**, and the delete was scoped `.in('id', removeIds).eq('release_id', releaseId).eq('auto_generated', true)`. So the worst case is optional, template-generated tasks on that one release — never a required step, never a hand-added task, never another release's. The real defect was the missing confirm step, not the blast radius.
3. **Three guards stood between the flag and a delete**, and the middle one is the likely reason nothing happened even if the flag was on: `isAiConfigured()` (needs `AI_API_KEY`) → 503; a malformed structured-JSON response → 503; failed validation → 500 *"AI suggested invalid changes. No changes made."* The gateway at the time served `qwen2.5:3b`, and this file's own `.env.example` note for `AI_PLANNER_MODEL` says a model that small cannot hold a structured-JSON contract.
4. **Circumstantially it was probably never set.** `.env.example` carried it commented out as `=false` for its entire life, with the flip conditioned on *"once Anthropic API key is configured and Zuplo gateway routes AI_TAILORING_MODEL to Claude Sonnet"* — a precondition never met (no Anthropic account was ever obtained; superseded 2026-08-13 by the RodiumAi call). It was also **never registered in `turbo.json`**, unlike every other flag, and no commit ever flipped it. None of that is proof, since `NEXT_PUBLIC_*` reaches the bundle whether turbo declares it or not.

**ANSWERED 2026-09-07, by the founder pressing the button: the control is there and it returns a paragraph. So `NEXT_PUBLIC_FEATURE_STATUS_UPDATE` is ON and `AI_API_KEY` is set** — which retires Phase 6's "Activation pending", confirms v0.33.0's announcement, and means the two env unknowns below are both closed. **The button itself is gone as of the same day** (founder call — see "The status update moved into the chat" near the end of this file); the flag now gates the route and the `generate_status_update` tool, which is the whole surface. The investigation is kept because its central finding stands on its own:

**THE TWO ANNOUNCEMENTS ARE NOT EQUALLY CREDIBLE, which is the part worth keeping.** v0.33.0 (*"The AI status update generator is now live — read your release's current state and get a one-paragraph update ready to share"*) is a launch announcement by the same standard that settled Notes and pitching, so it should be read as strong evidence the flag was flipped on 2026-07-26. And unlike its sibling, the feature would actually have WORKED then: it calls `generatePlainTextAiOutput` with no parse and no validation gate, so a paragraph is well within the `qwen2.5:3b` the gateway served, where v0.32.0's planner needed a model that could hold a structured-JSON delta contract and would have failed validation on every call. **So the planner announcement was probably premature and the status one probably was not** — they were bundled in one sentence here until this correction, and they should not be.

**But it cannot be settled from the repo or from anywhere else, and it is worth knowing why this one is harder than the tailor-plan question:** the route **writes nothing** (the text is ephemeral by design), there is no analytics event for it anywhere, and its gateway key `AI_API_KEY` is shared with five other consumers (the planner's three files, task outcomes, the press-kit draft action), so RodiumAi usage under that key cannot single it out either. No query, no dashboard reading, no trace.

**It has TWO env unknowns rather than one**, and they fail differently, which is what makes the check below a one-click answer rather than a dashboard trip: the flag decides whether the control renders at all (`STATUS_UPDATE_ENABLED` in `WorkspaceView.tsx`, reaching the desktop header row and the mobile release menu via `statusUpdateAction`), and `AI_API_KEY` decides what pressing it does — with the flag on and no key, `isAiConfigured()` returns a **503 "Status generation is not configured on this environment."** So: **open a scoped release and look.** No "Generate status update" control means the flag is off; the control plus that 503 means the flag is on and the key is not set; a paragraph means both are. Note the flag IS registered in `turbo.json` (unlike `TAILOR_PLAN`, which never was) and `.env.example` still documents it commented out as `=false` against a precondition — "Zuplo gateway routes to Claude Haiku" — that the 2026-08-13 RodiumAi call made obsolete rather than merely unmet.

**Why it was rebuilt rather than extended.** The old `POST .../tailor-plan` applied model output straight onto real task rows: a hard `DELETE` of the tasks the model named, then per-task description updates, with individual failures logged and skipped. Its own modal said *"Your full plan stays intact until you confirm."* There was no confirm. The draft-then-approve flow is the fix, and the whole feature is shaped around it.

**The shape.** Guided intake (7 questions, one per screen) → answers saved → a deterministic draft built from the template → UrgAns tailors that draft with a validated **delta** → the manager edits it → **Approve plan** is the only thing that writes to `tasks`.

- **Flag:** `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` (default off). Registered in `turbo.json` (the missing `STATUS_UPDATE` / `FILES` entries were added in the same pass) and `apps/web/.env.example`. The reader lives in `lib/release-planning.ts` because release creation needs it too. **Do not enable alongside `NEXT_PUBLIC_FEATURE_FIRST_WIN`**: that reveal celebrates a generated plan, and under the planner a new release has none yet (guarded in code as well as documented).
- **Model env:** `AI_PLANNER_MODEL`, read at the route and passed per call (the `AI_TAILORING_MODEL` convention it replaces).
- **The AI cannot add tasks.** (**Superseded 2026-10-11**: bounded, validated adds and per-item sanitizing; see "The first plan is hybrid" at the end of this file.) `PlannerAiDelta` has four operations — drop (optional tasks only), adjust offsets, assign a role archetype to a real member, rewrite a why-line — and no add. This is deliberate and is the load-bearing answer to "never let the AI invent tasks from scratch": an invented task has no template row to validate against. The manager adds tasks by hand instead. `validatePlannerDelta` rejects the **whole** response on any fabricated id, any non-optional drop, any unknown assignee, or an out-of-range offset; the deterministic draft then persists untouched and the copy says "No changes made."
- **Degrades all the way down.** With no model configured, `generate` returns **200** with the untailored playbook draft and `doc.ai.failure = 'not_configured'`; the scene says so plainly and hides the per-phase redraft controls. The same 200-with-a-draft path covers a timeout, a rate limit, or unusable output. Erroring at the flow's front door would be worse than handing over a plan that is already valid.
- **Phases are derived, never stored as truth.** The template carries no phase field (single.ts marks its weeks in comments; only `tags` are machine readable), so `derivePlanPhase(offset_days)` buckets into Setup / Pre-release / Release week / Post-release at −29 / −8 / +7. Every server write recomputes it, so a client cannot lie about it. The boundaries line up with the playbook's own week banners, and a test asserts all four phases stay non-empty against the live template.
- **Offsets are canonical, dates are derived.** A draft task stores `offset_days`; absolute dates are computed from the release's *current* date everywhere, so moving a release date re-flows the plan for free instead of stranding it. Editing a date in the review UI converts back to an offset. A draft can exist on a dateless release; approval requires a date.
- **Table:** `release_plan_drafts` (`20260810110000_release_plan_drafts.sql`) — one row per release (`unique(release_id)`, which is also the upsert target and the structural double-generate guard), `release_id` **cascade** (deliberately unlike notes' set-null: a draft is derived state, unreachable without its release), `status check ('draft','approved')` with approved rows **kept** as the double-approve guard and provenance record, `doc jsonb`, owner-scoped four-policy RLS.
- **Approval is the careful path.** The draft is read from the database, never from the request. The row is **claimed** with a conditional `where status='draft'` update *before* any task is inserted, and the claim is released if the insert fails, so two clicks or two tabs cannot both schedule the same plan and a failure loses nothing. Assignees are validated against `loadWorkspaceMembers`; someone who left the team falls back to the owner **with a warning rather than a refusal**, because blocking approval over another person's membership change punishes the wrong user. Both `planner_pending` and `template_pending` are cleared — the latter matters because a pre-planner release can be planned here, and leaving that flag set would let the schedule route instantiate a duplicate 64-task plan the next time its date moved.
- **Approved rows are indistinguishable from template-instantiated ones** (`lib/release-planning-server.ts`, modeled on `instantiate.ts`): same `status:'todo'` plus soft blockers, `state:'planning'`, `auto_generated:true`, and the full `metadata.template` block so event milestones, catch-up bucketing and tags keep working with no special cases. A manager-added task gets only the two keys `lib/tasks-server.ts` actually reads (`task_type`, `compressed_runway`) plus a `metadata.planner` block recording its real origin — it claims no template provenance it does not have. This **must** be an in-process batch insert: `metadata` is not in `POST /api/tasks`'s field allowlist.
- **Release creation:** a new `planner_pending` marker in `releases.metadata` (`lib/release-planner-pending.ts`), **not** a reuse of `template_pending` — that flag's machinery instantiates the whole template the moment a date lands, which is exactly what a draft flow must prevent. With the flag on, a rollout-plan release is created with **no activities**; the schedule route needs no change (a planner release never carries `template_pending`, so it just writes the date). Onboarding releases land plan-less too, which is safe because `onboarding-ai-moment` reads the template directly and all six task ids it hard-references are non-optional, so no delta can drop them.
- **Entry points:** (1) the workspace empty state — `PlanReleaseCard` renders through the `activitiesBanner` slot with `bannerReplacesEmptyState`, so it IS the panel body rather than a card above one; (2) a note — a "Make a plan" pill in `NoteEditor`'s header row, hidden when the linked release already has activities, carrying the **live** draft body (capped at 2000 characters) into question seven; (3) three UrgAns chips, which **replace** the bare "New release" chip when the flag is on, plus a `plan|rollout|campaign` keyword branch inserted **before** the `release` branch in `resolveIntent` (order there is load-bearing).
- **One intake modal, mounted by `AppShell`** and opened through `usePlannerStore`. The three entry points live in different ownership islands, and threading a callback would touch a file per entry point. The store holds the launcher payload and the set of releases with a generate call in flight — **not** the draft, which lives in `usePlanDraft` inside the scene that edits it.
- **The review scene is `?scene=plan`**, inline in the activity slot like every other release scene (the settled founder call: not a modal). It is deliberately **excluded from the scene cache** — `CacheableSceneName = Exclude<SceneName, 'plan'>` makes that a compile-time fact rather than a comment, because painting a cached copy of a document under live edits could overwrite newer text with older. Autosave follows the notes editor's discipline: an 800ms debounce, one save in flight at a time, and a loop that re-reads the pending document after each round trip so text typed mid-save goes out on the next lap instead of racing.
- **Deleted with this work:** the tailor-plan route directory, `TailorPlanModal.tsx`, `lib/release-tailoring.ts`, the dead `lib/release-plan.ts` (zero importers — a legacy free-generation parser, the very shape this file forbids), and the tailor-plan entry in `lib/schema-fallback-guard.test.ts`'s baseline (a sanctioned ratchet-down; the new route group adds none). Six comments citing "the tailor-plan precedent" now cite the plan/EPK one.
- **Tests:** `lib/release-planning.test.ts` and `lib/release-planning-server.test.ts` (79 cases) cover intake parsing, phase boundaries against the live template, the readiness date ladder, both delta gates, the regenerate merge semantics that protect hand edits, and approval's date math, dependency translation, metadata shape and assignee fallback. `lib/scene-cache.test.ts`'s "prefetches every scene" invariant became "every **cacheable** scene", plus a test pinning the plan scene out of the cache in both halves.
- **Activation checklist — SPENT, and left only as the record. Do not work it.**
  (1) ~~apply `20260810110000_release_plan_drafts.sql`~~ — applied; reaching
  `/plan/generate`'s `draft_exists` branch (v0.56.2) means the draft row was
  read. (2) `AI_PLANNER_MODEL` is optional and still is — the planner works
  without it, untailored. (3) ~~set `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER=true`~~
  — flipped on or before 2026-08-14, and confirmed still on 2026-09-07 by the card being there. (4) ~~changelog entry + version bump~~ —
  **done three times over**, v0.53.0 / v0.56.2 / v0.56.3, which is why a fourth
  entry announcing this surface would be wrong: it is not news. (5) **PARTLY
  DONE, 2026-09-07 — the founder approved a real plan and the completion
  cascade works.** So approval writes into `tasks` against the production
  database, and completing an approved task unlocks its dependents exactly as
  a template-instantiated one does. That is the parity question the field
  comparison below explicitly could not answer, and it is the half most worth
  having. Of the three steps this bullet listed as remaining when it was
  written, **two are now covered by tests and one was never a step at all** —
  see the bullets below. What is left of the third (a manager-added activity
  landing on Timeline as a marker rather than a bar) is the UI and the pixels
  only: the rule is pinned at all three links and the jsonb round trip is
  verified against a real Postgres.
- **The two write paths compared, 2026-09-07: 13 of 15 columns are identical
  in shape.** `instantiate.ts` (template) against
  `release-planning-server.ts` (approval), which is the substance of the
  manual pass above and the reason it should be quick rather than exploratory.
  Identical: `release_id`, `workspace_id`, `group_id` (null), `created_by`,
  `assigned_to` (null), `assigned_collaborator_id` (null), `title`,
  `status` ('todo'), `priority` ('none'), `state` ('planning'), `position`,
  `auto_generated` (true), `due_date`, `dependencies`. Two deliberate
  differences: `assigned_to_user_id` is always the owner on the template path
  and the resolved `assignee` on the approval path (the owner-history
  heuristic, falling back to the owner), and `description` comes from
  `task.description` versus the draft's `task.why`. `metadata.planner` is
  additive provenance. **`metadata.template` carries the same nine keys under
  the same names**, which is what matters: the three readers that classify a
  task — `readTaskType`, `readTemplateTaskId`, `readCompressedRunway` in
  `lib/tasks-server.ts` — all key off that block, so bucketing, the
  event-milestone treatment and the blocker gate have no way to tell an
  approved row from a template one. `readTemplateTaskId`'s key mismatch is
  confirmed fixed here too (it reads `task_id ?? template_task_id`).
- **The ONE real asymmetry, and it is the thing to watch on the manual pass.**
  A MANAGER-ADDED activity inside a draft (`origin !== 'template'`) gets only
  `task_type` and `compressed_runway` — no `task_id`, `duration_days`, `role`
  or `tags` — because it claims no template provenance it does not have. Two
  visible consequences, both designed: `lib/cover-art-tasks.ts` falls back to
  a title match for it, and the timeline draws it as a single-day marker
  rather than a bar (null duration means "we do not know", and an honest dot
  beats a wrong span). An approved plan can hold both kinds, so that is
  exactly where "behaves the same" legitimately stops — add one by hand before
  approving and confirm it lands as a marker. **The LOGIC and the jsonb round
  trip are both covered as of 2026-09-07** — see the bullets below — so what a
  manual pass adds now is the plan scene's UI and Timeline's pixels, not the
  rule and not the storage.
- **The asymmetry is a chain of THREE links, and checking it found that two
  were already covered and the join between them was not.** (1) The WRITER:
  `release-planning-server.test.ts` asserts a manager-added row's
  `metadata.template` has **exactly** `['compressed_runway', 'task_type']`, so
  `duration_days` being absent is proven by exhaustion rather than by a
  matching assertion somebody could weaken. (3) The RENDERER:
  `release-timeline.test.ts`'s *"treats an unknown duration as a single point
  rather than inventing one"* already passes `durationDays: null` and asserts
  `isBar` false, and its comment names this exact case. **(2) The READER was
  the hole** — the four functions in `lib/tasks-server.ts` that turn
  `metadata.template` into the fields everything classifies by were
  module-private with no test file at all. That is the worst of the three
  places to have a gap, and not hypothetically: `readTemplateTaskId` is
  precisely one of them, and it read the wrong key for months in this same
  metadata block while every surface downstream looked merely uninteresting
  rather than broken.
- **THE FOUR METADATA READERS HAVE TESTS NOW** —
  `lib/task-metadata-readers.test.ts` (19 cases, 2026-09-07). They were
  exported for it, which is the whole change to `tasks-server.ts`; nothing
  else moved. Each has a designed DEFAULT (`'task'`, `null`, `false`), so a
  broken key never throws and never renders an error — it makes every row look
  like the least interesting case, which is why the earlier bug survived so
  long and why a reader is worth pinning even when it looks trivial. The suite
  reads the two real shapes an approved plan contains: a template row resolving
  all four fields, and a manager-added one resolving to the nulls the timeline
  depends on. **Mutation-tested, and the first one is the point: reverting
  `readTemplateTaskId` to the key that was broken for months now fails four
  tests.** The other two (dropping `duration_days >= 1`, flipping
  `readTaskType`'s default) each fail exactly their own.
- **THE JSONB ROUND TRIP IS VERIFIED (2026-09-07), against a real Postgres 16
  rather than in principle.** Probed by driving the real writer
  (`buildTaskRowsFromDraft`, with a hand-added activity in the draft — the
  step the manual pass asks for), inserting the metadata it produced into a
  real `jsonb` column, selecting it back, and feeding it to the real readers.
  All three shapes survive: a manager-added row still reads
  `{taskType:'task', templateTaskId:null, durationDays:null,
  compressedRunway:false}`, and a 7-day and a 1-day template row both keep
  their duration. **Postgres confirms the keys are genuinely ABSENT rather
  than null** on the manager-added row (`metadata->'template' ? 'duration_days'`
  is false), which is the thing the timeline's marker depends on.
  Three properties of the column worth knowing, none of them a defect here:
  **jsonb REORDERS keys** (length then bytewise — a row read back has
  `["role","tags","task_id",…]` where the writer emitted
  `["template_id","template_version",…]`), so never write an order-dependent
  assertion against a row that has been to the database; the readers are key
  lookups and `release-planning-server.test.ts` sorts, so both are already
  safe. Numeric edges all read correctly through real jsonb (`7.5`→7,
  `"7"`→null, `0`→null, `null`→null, `7.0`→7 — jsonb keeps the trailing zero
  in storage and JS drops it on parse). And **jsonb stores integers beyond
  JS's safe range exactly** while `JSON.parse` rounds them
  (`9007199254740993`→`…992`) — irrelevant for a duration of 1 or 7, and a
  real trap for any future numeric field that could get large.
- **The `undefined` hazard on the writer side is closed UPSTREAM, by two
  things rather than by luck.** `JSON.stringify` DROPS a key whose value is
  `undefined`, so a template row could in principle lose its duration
  silently and render as a marker instead of a bar. It cannot: `DraftTask`
  types `duration_days: number` (required, not nullable), and the draft
  parser clamps anything non-numeric to 1 (`Math.max(1, Math.round(…))`) —
  which is the guarantee that matters, since that parser is what runs on a
  draft loaded back out of `release_plan_drafts`.
- **What the round-trip probe did NOT cover, stated plainly.** It inserted
  through `psql`, not through PostgREST — so the supabase-js hop is still
  unexercised, though it hands the same JSON bytes to the same column type.
  It was a scratch cluster, not the production database. And it says nothing
  about the plan scene's UI or Timeline's rendered pixels: **no activity has
  ever been added by hand in a browser.** Production is unreachable from the
  sandbox (the agent proxy answers 403 to CONNECT for both urganize domains),
  which is why this is a probe rather than the manual pass.
- **What the comparison canNOT settle**, since it is a read of two files: that
  the cascade actually unlocks, and that the blocker gate actually refuses.
  Those are runtime behaviours over the `dependencies` column, and the column
  is identically shaped on both paths — which is the reason to expect parity,
  not evidence of it. **Both are answered now, by different means**: the
  cascade in production (item 5 above), the gate by the tests in the next
  bullet. This bullet named a third until 2026-09-07, "that reopening actually
  re-locks", which turned out not to be behaviour this product has.
- **THE BLOCKER GATE HAS TESTS NOW, and it had NONE** —
  `lib/release-execution.test.ts` (17 cases, 2026-09-07). Worth knowing given
  what rested on it: `getTaskCompletionBlocker` is the rule deciding whether
  ticking an activity is allowed at all, it is shared by
  `useTaskStore.completeTask` and `TaskService.completeTaskWithCascade`, and
  the PATCH route deliberately enforces nothing — so it is the only thing
  standing between an agent completion and a stranded dependency chain.
  Alongside the three refusal reasons and the pass case, **three cases ask the
  planner-parity question directly**: an approved-plan row and a template row
  produce an IDENTICAL verdict; varying all four fields the two write paths
  disagree about (`assigned_to_user_id`, `description`, `templateTaskId`,
  `durationDays`) changes nothing; and a mixed graph blocks in both
  directions, which is the real shape since an approved plan holds both kinds.
  That is the structural half of the parity claim — the gate cannot read any
  field that differs, so it cannot treat the paths differently.
  Mutation-tested three ways (dropping the locked guard, not filtering done
  dependencies, treating an unresolvable dependency id as unmet), each failing
  exactly its own tests. **It is not a production round trip**, which would
  additionally prove `dependencies` survives approval's translation of draft
  ids into real row ids.
- **"Reopening re-locks its dependents" IS NOT A STEP, and this file asked for
  it before checking.** Neither path re-locks, and both say so: the store's
  reopen branch PATCHes the one row to `todo` and touches nothing else, and
  `TaskService.reopenTask` carries the reason — *"Like the store's reopen
  path, this does NOT re-lock dependents (more confusing than helpful at v1
  scale)"*. So a manual pass looking for it would report a design decision as
  a bug. What reopening does is put the row back to `todo` and leave anything
  already unlocked unlocked; unticking the checkbox is the undo, which is what
  `useTaskStore`'s own completion comments call it. **If re-locking is ever
  wanted it is a feature, not a fix** — and it needs an answer for the
  dependent somebody has already started work on.
- **Asked to "flip the planner flag on" on 2026-09-07 and it was already on.**
  Recorded because the ask was reasonable — three separate lines in this file
  said Phase 5 was still gated, one of them written that same day by a session
  correcting a DIFFERENT stale claim in the same paragraph. All three are
  reconciled now. **The check that settles it in ten seconds, without touching
  Vercel: open a release with no activities.** Flag on, the panel body is the
  "Draft the plan" card and a Plan pill sits in the header; flag off, you get
  the set-a-date card. Reading the Vercel variable alone proves nothing —
  `NEXT_PUBLIC_*` is inlined at build time, so a var set without a rebuild
  still reads as off. **The founder ran it the same day and the card is
  there**, so this is a check with a known-good answer rather than a
  suggestion: if a future session finds the set-a-date card instead, something
  changed and the flag is where to look first.
