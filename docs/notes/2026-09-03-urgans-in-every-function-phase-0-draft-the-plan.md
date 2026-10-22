# UrgAns in every function — Phase 0 + "Draft the plan" (2026-09-03, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The founder's spec puts UrgAns inside each product function under one rule:
an action produces a **draft**, a human **reviews and edits** it, and nothing
writes until they tap **Apply**. Gated to Manager, Label and Group — Solo
keeps chat only. The spec is six phases; this pass builds Phase 0 (the
foundation nothing else can start without) TOGETHER WITH the first real
action, spec 6.1 **"Draft the plan."** 6.2 "Assign the team," 6.3 "Move the
plan," 6.4 "What's late," and Phases 2–6 are explicitly deferred.

**AMENDED 2026-09-15: `release.draft_plan` stopped following this section's
opening rule.** "An action produces a draft, a human reviews and edits it, and
nothing writes until they tap Apply" described `release.draft_plan` exactly
until then — see "The plan is built, not drafted" near the end of this file
for the founder call that ended it. It is now **one-shot**: `execute()` calls
`createReleasePlan` and writes the plan straight into `tasks` in the same
request, so there is no draft row to review and no separate Apply. The
one-tap "drafting from an auto-derived intake" path described two paragraphs
below (point 2) is GONE with `buildAutoIntake`, the function that built it —
every caller must now supply the full eight-question intake, collected by the
modal or the chat interview, exactly as `POST …/plan` has always required.
The general FRAMEWORK point still holds — `oneShot` (`lib/urgans-actions/types.ts`)
is the sanctioned way an action can skip the draft/apply split, and
`presskit.draft_section` below is unaffected and still follows the
draft-then-apply shape this section describes.

**AMENDED 2026-09-05: there are TWO registered actions, not one.** #499's
press-kit work added `presskit.draft_section` (UrgAns drafts the three prose
sections, a person accepts) and, with it, the track's second OBJECT TYPE — so
`resolveActionScope` gained a `press_kit` branch through
`ensurePressKitAccess`, and `ActionScope.release` became nullable because a kit
has none. None of that was recorded here at the time; this sentence is the
correction. Two things about the second action are worth knowing before adding
a third: it is **`team_write`, not `release.draft_plan`'s `owner_write`**,
which is honest rather than copied (every press-kit route already goes through
`ensurePressKitAccess`, and there is no owner-keyed legacy route underneath
waiting to 404 a teammate); and its registered id is **`presskit.draft_section`
with no underscore in "presskit"**, even though the object type has one, so the
readable guess is wrong and an unmatched action type would silently log
nothing.

**Two scoping calls the founder made before any of this was built, both load-
bearing for how it reads below:**

1. **The planner's existing no-invent-task rule is KEPT.** UrgAns may drop,
   re-date, reassign and reword a template task and must give a one-line
   reason for each; it never adds one. The spec's "up to 5 suggested tasks"
   idea is dropped outright — there is no template row to validate an
   invented task against, which is the exact failure mode that rule already
   exists to prevent (see "Hand-crafted release templates" above).
2. **Drafting is one tap, from an auto-derived intake**, not the existing
   seven-question modal. The seven questions survive as an optional "Tell
   UrgAns more" refine step for a manager who wants to steer the draft
   further, rather than being the only door in.

**Why this was buildable in one pass rather than greenfield:** the release
rollout planner already existed — `release_plan_drafts`, the generate/
approve/discard routes, the `PlanScene` review UI, the delta contract — built
2026-08-10 behind `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` and **never
activated** (`20260810110000_release_plan_drafts.sql` has never been applied
anywhere). "Draft the plan" is that machinery, gated, logged, and given one
tap in instead of a questionnaire. Phase 0's job is the gate and the log; it
is not a rewrite of the planner.

### Schema: `urgans_actions`

One row per action run — who asked, on what, what came back, what it cost,
and whether it was applied, discarded or failed. `20260903100000_urgans_actions.sql`.
**Not applied anywhere yet.** Three actor columns, each answering a different
question: `owner_user_id` is whose team this counts against and whose child
rows get stamped (the release owner, matching the "child rows are stamped
with the release owner, never the acting teammate" rule every other
team-aware scene follows); `actor_user_id` is who actually tapped the button
— can differ from the owner; `workspace_id` is the owner's team, for the
guard's 24h rolling count and the admin aggregate, `on delete set null` (a
deleted workspace's history of what it drafted is worth keeping, the
`billing_events` precedent). `status` is a real Postgres CHECK
(`drafted | applied | discarded | failed`) because the Apply claim is a state
machine over exactly those four values; `action_type`, `object_type` and
`plan_at_time` are free text so a new action or a re-cut tier needs no
migration. `object_id` carries no foreign key — it is polymorphic (today
always a release id) and a deleted object must keep its log. RLS on, zero
policies: service-role only, via the three action routes.

### Nine things worth knowing before touching any of this

1. **The metering split is the whole reason this scales.** `'urgans_embedded_action'`
   (`lib/billing-events.ts`) is a DIFFERENT billing-event type from
   `'urgans_action'`, the type the existing 40/150-per-month chat ceiling
   counts (`checkUrgansAllowance` in `lib/urgans-usage.ts`). Drafting a plan
   from inside a release must never spend a Manager's monthly chat budget —
   the two features happen to share one gateway call underneath, but they are
   billed on separate meters. `lib/urgans-actions/registry-guard.test.ts`
   makes this a structural guarantee, not a comment: it comment-strips every
   file under `lib/urgans-actions/**` and `app/api/urgans/actions/**` and
   fails the build if the literal string `'urgans_action'` (or
   `recordUrgansAction`) appears anywhere in them.
2. **A separate, DAILY guard protects against runaway usage regardless of
   plan.** `lib/urgans-actions/guard.ts`'s `decideEmbeddedActionsGuard`
   refuses at `EMBEDDED_ACTIONS_DAILY_CAP = 100` actions per team per rolling
   24h (a named constant, no env override — the spec's own "config value"
   wording), with the spec's exact refusal copy: *"UrgAns is busy. Try again
   in a bit."* `guard-server.ts`'s `checkEmbeddedActionsGuard` counts via
   `countBillingEventsSince` (fails open to 0 on a read error — the
   established fail-open contract every other tier/seat/release counter in
   this codebase already follows) and fires at most one `urgans_guard_tripped`
   founder alert per team per 24h (`shouldAlertGuardTrip`).
3. **The entitlement is checked against the RELEASE OWNER's team, never the
   caller's own.** `lib/urgans-actions/server.ts`'s `resolveActionScope` calls
   `getWorkspaceTier(workspaceId)` — the exact same function invite-link
   redemption already uses for the identical problem — so a teammate acting
   on someone else's release is gated by THAT release's plan, not their own
   empty-shell trial. Tier resolution fails open to `'label'` (uncapped) on
   any unresolvable workspace or tier, matching every other tier check in
   this codebase (`lib/release-cap-server.ts`, `lib/seats-server.ts`,
   `lib/entitlements.ts`'s own `resolveTeamTier`).
4. **A THIRD access level, `'owner_write'`, had to be added mid-build — this
   is the one real bug this pass found in its own design before it shipped.**
   `release.draft_plan` was first declared `'team_write'` (any team member may
   run/apply/discard), on the reasoning that the release itself is
   team-visible. That is true, but the machinery the action drives is not:
   `app/api/releases/[releaseId]/plan/_shared.ts`'s `loadOwnedRelease` (behind
   `GET/PUT/DELETE /plan`, `POST /plan/approve`, `POST /plan/regenerate-phase`)
   is still owner-keyed in eight places — a DELIBERATE, RECORDED deferral (see
   `lib/release-access-guard.test.ts`'s own header: *"plan is deferred (flag
   off in prod; its draft rows are owner-keyed in 8 places)"*). A team-write
   teammate could have tapped "Draft the plan," cleared the entitlement gate,
   and then hit a 404 loading the very draft they just created — a working
   button leading to a permanent dead end. `UrgansActionAccessLevel` in
   `lib/urgans-actions/types.ts` now has three values, not two:
   `'team_write'`, `'team_read'` (declared for a future read-shaped action;
   nothing uses it yet), and `'owner_write'` — visible to the whole team (so a
   non-owner member gets the SAME 404 a stranger would, never a 403 that would
   confirm ownership) but only the exact owner may run/apply/discard.
   `resolveActionScope` resolves `'owner_write'` through TEAM READ access
   first (never write — routing through write access would 403 a read-only
   guest before the ownership check ever ran, leaking "you have some access
   here"), then checks `access.release.ownerUserId !== user.id` and returns
   the plain 404 if so. `release.draft_plan`'s `access` field is
   `'owner_write'`, not `'team_write'`. Pinned by `lib/urgans-actions/scope.test.ts`
   (7 cases, mutation-tested: the ownership compare is the only thing
   distinguishing team-write-shaped access from owner-write). **The
   consequence reaches the UI too:** `WorkspaceView.tsx`'s Plan pill and
   `PlanReleaseCard` banner are now gated on `scopedReleaseIsOwn` — offering
   either to a non-owner teammate would be a control that always 404s.
5. **`release.draft_plan`'s `apply()` ignores its own request body entirely**
   and re-reads `release_plan_drafts` fresh via `approvePlanDraft`. The review
   scene edits the draft through the pre-existing `PUT /plan` autosave, so the
   row on screen when a manager taps Approve is already the row in the
   database — carrying a copy of the run's output through the Apply call
   would risk approving something staler than what they saw.
6. **Reasons and warnings are structural, not prose UrgAns volunteers.**
   `lib/release-planning.ts`'s `PlannerAiDelta.drops` is now
   `Array<{id, reason}>` (legacy `drop_task_ids` still parses, mapped to an
   empty reason, so nothing already-shipped breaks); `validatePlannerDelta`
   rejects the WHOLE response if any drop's reason is empty or over 160
   chars, the same all-or-nothing discipline the delta contract already
   applies to a fabricated id or a non-optional drop. `DraftTask` carries
   `removed_reason`, `change_reason` and `assignee_basis`
   (`'history' | 'role' | 'ai' | 'user' | null`) — surfaced in `PlanTaskRow`
   as a line under a removed task's chip, a "Moved: …" line under a
   rescheduled one, and a provenance label next to the assignee picker
   ("From past releases" / "Role match" / "UrgAns pick"). A model role
   assignment can never overwrite a `'history'`-basis row — the deterministic
   heuristic (below) outranks the model by construction in `applyDeltaToDraft`.
   `deriveScheduleWarnings` (pure, computed at render, never stored) adds a
   before-today notice and a no-date notice; `PlanScene`'s "Decide before you
   approve" block renders these alongside the model's own `doc.ai.warnings`.
7. **The owner-history heuristic runs BEFORE any model call, and fixed a
   latent bug on the way in.** `lib/task-owners.ts`'s `proposeTaskOwners`
   ranks each task's assignee by: most-frequent past assignee for the exact
   same template step → most-frequent for the same template role → the
   release creator, with reason strings a manager can read at a glance
   (*"{name} handled this on N past releases."*). It depends on reading
   `metadata.template.task_id` correctly, and `lib/tasks-server.ts`'s
   `readTemplateTaskId` had been reading `metadata.template.template_task_id`
   instead — a key neither writer (`instantiate.ts`,
   `release-planning-server.ts`) has ever written, silently broken since the
   field was added. Fixed in passing (accepts the old key too, defensively);
   see the Timeline section above for the SAME bug's other, still-open
   consequence in `lib/cover-art-tasks.ts`, deliberately not fixed here to
   avoid burying an unrelated feature's defect inside this diff.
8. **The one-tap intake is real derivation, not a placeholder.**
   `buildAutoIntake(release)` in `lib/release-planning.ts` reads release
   type, artist name and date straight off the row, with `goal: 'unknown'`
   and `budget: 'unknown'` — a real, PARSED value (`GOALS_ACCEPTED` /
   `BUDGETS_ACCEPTED`), but never one of the seven-question modal's own radio
   choices and never named in a validation error string (a
   Chappi-relayed error containing the word "unknown" would teach the model
   to skip the question it belongs to). `buildGuidance` tells the model
   plainly not to assume a budget or a readiness stage that was never stated,
   rather than firing the "no budget, cut paid promo" line on every
   auto-drafted plan. `intake_source: 'auto' | 'answered'` rides on the
   intake and surfaces in `PlanScene` as *"UrgAns drafted this from the
   release facts alone"* with a "Tell UrgAns more" button that opens the
   SAME seven-question modal in refine mode (`PlannerIntakeModal`'s existing
   fire-and-forget submit, now posting `intake_source: 'answered'` and
   `replace: true`).
9. **Both entry points share one client and one failure surface.**
   `lib/urgans-actions/client.ts`'s `draftReleasePlan()` tries the new gated
   endpoint (`POST /api/urgans/actions`) first and falls back to the legacy,
   ungated `/plan/generate` route on a 404 — so a deployment with only
   `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` on (no regression) behaves exactly as
   it always has. `PlanReleaseCard`'s one-tap "Draft the plan" button and
   `PlannerIntakeModal`'s refine submit both call it; a `plan_required`
   refusal from EITHER writes to a new `lockedRefusal` field on
   `usePlannerStore` (the same "shared store bridges disparate ownership
   islands" reasoning the intake payload itself already uses), rendered as
   ONE `UrgansLockedSheet` mount in `WorkspaceView` regardless of which entry
   point tripped it. `usePlanDraft`'s `approve()`/`discard()` call the new
   `/urgans/actions/[actionId]/apply` / `.../discard` endpoints when
   `GET /plan`'s response carries an `actionId` (re-derived fresh on every
   load via `findLatestDraftedActionId`, never threaded through client
   state — a reload, a deep link or a draft started on another device must
   all resolve the same answer), falling back to the legacy
   `/plan/approve` / `DELETE /plan` otherwise.

### The internal admin console

`/admin/urgans` (`app/api/admin/urgans/route.ts`, `verifyAdmin`, **not**
flag-gated — the `/admin/teams` precedent, so the founder can watch it fill
before ever flipping the feature on): every `urgans_actions` row from the
last 90 days plus the three billing-event signals
(`urgans_guard_tripped`, `upgrade_prompt_shown`, `upgrade_clicked`),
aggregated in TypeScript — `lib/urgans-actions/admin-summary.ts`'s
`summarizeUrgansActions`, deliberately not a SQL view (a view defaults to
owner privileges and would need `security_invoker` for zero benefit at this
volume) — into one row per team, per month, per action type. Guard trips and
the two upgrade signals name no specific action, so they land on a shared
`(all actions)` bucket rather than being folded onto whichever action type
happened to run that month. `tokensReportedCount` tracks how many runs
actually returned a usage count, kept separate from how many drafted — a
future per-call average has to divide by the first, or it understates cost by
counting a run the gateway never reported on. A month-chip filter over the
one aggregate fetch; no server-side date param, the same "the client already
has it all" reasoning `useNotesStore` uses.

### Known gap, stated plainly rather than silently decided

**Chappi's own conversational planner tools are NOT entitlement-gated by any
of this**, and that is now a decision rather than a deferral — see "The two
UrgAns doors, reconciled" below, which also **corrects what this paragraph
used to say about the mechanism.** It claimed those tools call
`lib/release-planning-actions-server.ts`'s shared functions DIRECTLY, "the
same way `release.draft_plan`'s own `execute`/`apply` do". **They do not.**
`planner.ts` has no such import and reaches the plan through six
`callInternalApi` calls to `/api/releases/[id]/plan*` — the same legacy routes
the review scene uses. The consequence is materially different and better than
the paragraph implied: going through the routes means they DO respect
`NEXT_PUBLIC_FEATURE_RELEASE_PLANNER`'s flag gate, so with the planner off
they politely say the feature is not enabled rather than working around it.

What was true, and stayed true until 2026-09-07: they never pass through
`runUrgansAction`/`applyUrgansAction`, so they are metered under the ordinary
40/150 chat ceiling and wrote no `urgans_actions` row at all. The logging half
of that is closed now (the tools write their own rows, tagged
`source: 'chat'`); the entitlement half is deliberately left open.

### The two UrgAns doors, reconciled (2026-09-07)

There are two ways to reach every embedded action: the button inside the
product surface, and asking UrgAns for the same thing in conversation. Nothing
held them in step.

**CORRECTED 2026-09-07, and the correction is about timing rather than about
the decision.** This paragraph said "the bypass opens at activation, not
before", on the reasoning that the chat's planner tools 404 while the planner
flag is off. **That flag was already on** — the ledger has the planner working
in production from 2026-08-14, including a bug report that could only come
from a reachable route (see "UrgAns release planner"). So the chat has been
drafting plans, unlogged, for three weeks; what opens at activation is the
BUTTON door and the entitlement gate it carries, not the chat door. The gate
decision below is unaffected — the founder's call is that chat stays free on
every plan, which is precisely what has been happening. What is affected is
the sense of safety in the original framing: the observability gap was live,
not hypothetical, and the logging that closes it is still inert until
`urgans_actions` is applied and the actions flag flips, because the table it
writes to does not exist yet.

**THE GATE IS ON THE SURFACE, NOT THE CAPABILITY** (my call, delegated by the
founder). The buttons are the paid convenience; asking in chat stays available
on every plan. Four reasons, in order of weight, and they are argued at length
in `lib/urgans-actions/chat-log-server.ts`'s header because "add the
entitlement check" is exactly the tidy-up a later reader would make in good
faith:

1. **The spec's own words grant it** — "Gated to Manager, Label and Group,
   Solo keeps chat only." That sentence gives Solo the chat.
2. **`packages/pricing` SELLS Solo 40 UrgAns actions a month.** Refusing a
   whole class of them contradicts the line that advertises it.
3. **The chat door is already metered by that paid quota; the button door is
   not.** So it is a cheaper capped path, not an unmetered bypass.
4. **Principle 6.** Nothing has been abused. Removing a shipped capability to
   pre-empt a hypothetical is the anticipatory design this file forbids.

The consequence, stated plainly: a Solo team CAN get an UrgAns-drafted plan by
asking in chat. That is intended, and the console will now show it, so if it
ever stops being a good idea there will be numbers rather than a guess.
`chat-log-server.test.ts` pins the omission.

**What changed.** `urgans_actions` gained a `source` column (`button` | `chat`,
defaulting to `button`) — an amendment to the original migration rather than a
second file, because that table has never been applied anywhere. ~~Four chat
tools now log: `generate_release_plan` writes a `drafted` row, `approve_` and
`discard_release_plan` settle it, and `write_press_kit_section` writes one
already `applied`~~ **SUPERSEDED 2026-09-15 — see "The plan is built, not
drafted" near the end of this file. The plan's own review step is gone, and
`approve_release_plan`/`discard_release_plan` were deleted with it, so the
drafted-then-settled description above is no longer how any chat tool works.
Three chat tools log now, not four: `generate_release_plan` is `oneShot` and
writes ONE row that is already `applied` in the same call that builds the
plan, and `write_press_kit_section` still writes one already `applied` for
the reason below.** `/admin/urgans` groups by door, with the door sorting
LAST so the two doors onto one action sit together.

**Five things worth knowing before editing any of it:**

1. **`recordChatActionRun` reuses `resolveActionScope`** rather than reading
   anything itself. That is what stamps the OWNER's team and tier instead of
   the caller's, and what checks the caller can reach the object at all — so a
   chat row cannot be written for something they cannot see, and the two doors
   cannot disagree about whose team a run belongs to.
2. **It is gated on `isUrgansActionsEnabled()`**, the same two-flag AND
   everything else here uses. That makes the whole reconciliation **inert until
   the track is activated** — necessary, not tidy: the table does not exist
   until its migration is applied, so without the gate every chat-drafted plan
   would log an error against a missing relation.
3. **Nothing throws.** A lost log row costs a console entry; an exception
   would cost the user the answer they asked for.
4. ~~**Approve and discard re-derive the run through
   `findLatestDraftedActionId`** rather than threading an id through the
   conversation. A plan drafted from the button and approved in chat is a real
   sequence, and the transcript would know nothing about that run.~~
   **SUPERSEDED 2026-09-15: there is no approve/discard step left for the
   planner to re-derive an id for.** `findLatestDraftedActionId` was deleted
   in the same pass — it had exactly one consumer, the two chat tools this
   point described, and once they were gone the function had none. A plan
   drafted from the button and one asked for in chat are now simply two
   separate, independently-complete runs; neither refers back to the other.
5. **A real defect fixed on the way:** `runUrgansAction`'s insert hardcoded
   `object_type: 'release'`, so every embedded press-kit draft was filed as a
   release — wrong in the console's grouping, and enough that
   `findLatestDraftedActionId` (which filters on `object_type`) could never
   find a kit's own drafted run. It comes from the scope now, and
   `reconcile-guard.test.ts` fails on a literal there.

**`lib/urgans-actions/reconcile-guard.test.ts` is what ends the drift class**
rather than this instance of it. It is derived from the registry: a third
action fails the test until somebody declares either the chat tool that does
the same job or `{ tools: null, because: '...' }`. It then asserts every
declared twin really calls a log helper. A hand-written pair list would only
catch a rename, which is the mistake that produced this work.

**`write_press_kit_section` was deliberately left as-is** (founder call): it
writes on assent with no confirmation card, because the model composes the bio
in the transcript and the user reads it and says save — that IS a review step,
just not a card. It shares `DRAFT_ALLOWED_FIELDS` / `isDraftableSection` with
the embedded action (so "prose never facts" holds on both paths) and nothing
else: the embedded one owns `buildDraftMessages`, `parseDraftOutput` and
`decideDraftApply` because it calls a model of its own and has a draft→apply
window to go stale in, none of which a same-turn write has any use for.

**Out of scope, and named as such:** 6.2 "Assign the team", 6.3 "Move the
plan", 6.4 "What's late" and Phases 2–6 (founder call: reconcile only what is
built). Note the six-phase spec itself is **not in this repo** — the summary at
the top of this section is the only record of it, so a future phase should be
planned from the founder's own document rather than from here.

**Doc-drift found on the way: the press-kits surface had NO working-notes
section in this file at all** — five tables, ten API routes, twelve sections per
kit, a public `/k/[slug]` page, its own copy guard, an embedded UrgAns action,
seven chat tools and nine build phases (#499, 2026-09-05), documented nowhere but
its `.env.example` block, having also retired the release EPK that several
sections above still described as the press-kit mechanism. Flagged here rather
than back-filled in this pass, and **written up separately on 2026-09-07 — see
"Standing press kits" near the end of this file**, which also carries the
superseded notes on the EPK section and the 2026-07-30 scope-expansion paragraph.

### Flag interplay

The surface stays entirely dark until BOTH flags are on:
`NEXT_PUBLIC_FEATURE_URGANS_ACTIONS` (new, default `false`) AND
`NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` (pre-existing, default `false`) —
`isUrgansActionsEnabled()` in `lib/urgans-actions/server.ts` is the ONE place
this AND is computed, so the run/apply/discard routes, `findLatestDraftedActionId`
and the client's fallback logic can never disagree about the combined answer.
`release.draft_plan` is worthless without a planner to draft into, and the
migration behind the planner itself has never been applied either — see the
activation checklist.

### Activation checklist

1. Apply `20260903100000_urgans_actions.sql` (this pass's).
   `20260810110000_release_plan_drafts.sql` (the planner's own) said "never
   applied" here until 2026-09-07 and the evidence says otherwise — see the
   corrected status in "UrgAns release planner". Re-running it is safe and
   idempotent, so run it anyway if you want that settled; it must be applied
   before `urgans_actions` either way, since the whole track drives it.
2. Optionally set `AI_PLANNER_MODEL` — the planner already degrades to the
   untailored playbook draft with no model configured, so this can wait.
3. Set `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER=true` AND
   `NEXT_PUBLIC_FEATURE_URGANS_ACTIONS=true` in Vercel `Web` → Production
   **with a commit that actually touches `apps/web`** — the EP/album flip's
   own recorded trap: `turbo-ignore` skips a redeploy whose diff is only
   `package.json`/changelog files, and `NEXT_PUBLIC_*` is inlined at build
   time regardless of the env var being set.
4. Changelog entry + minor version bump across all 10 `package.json` files
   AT THE FLIP, not at merge (the EPK precedent).
5. Verify end to end on a real Manager-tier release: tap "Draft the plan,"
   confirm a draft appears with reasons/warnings, edit a row, Approve, and
   check the release carries `metadata.planned_by_urgans` and the task rows
   carry `metadata.planner.approved_by`; discard a fresh draft and confirm
   nothing is left; on a Solo team confirm the locked sheet renders and
   `upgrade_prompt_shown` lands in `billing_events`; confirm the Manager
   chat counter (`GET /api/urgans/usage`) does not move after drafting; open
   `/admin/urgans` and confirm the run appears.
6. **Verify the OTHER door in the same pass** (see "The two UrgAns doors,
   reconciled" above — this is a precondition of activation, not a
   follow-up): ask UrgAns in chat to plan a DIFFERENT release and confirm a
   second `/admin/urgans` row appears under `chat`; approve it from chat and
   confirm that row moves to `applied`; ask UrgAns to write a bio and confirm
   a `presskit.draft_section` row under `chat`. Then, as a Solo team, confirm
   the button shows the locked sheet while the chat still works — and that
   the chat run is logged, because that combination is the whole reason the
   split exists.

### Verified

`./node_modules/.bin/vitest run` — 2241 passing (0 failing, 30 env-gated
skips unaffected), including the new `scope.test.ts` (7 cases, mutation-
tested) and `admin-summary.test.ts` (10 cases, mutation-tested — dropping the
`tokensReportedCount` null-guard fails exactly the test written for it).
`./node_modules/.bin/eslint .` — 3 pre-existing errors (unrelated, in
`WorkspaceView.tsx`'s single-release auto-scope ref access) plus 73 warnings
against a measured 70-warning clean-tree baseline: **all 3 new warnings are
the documented, precedented `react-hooks/set-state-in-effect` downgrade**
(two in `UrgansLockedSheet.tsx`'s mount-guard and drag-reset effects, one
matching `TeamsAdminPageClient.tsx`'s own fetch-on-mount finding byte-for-
byte). A render-time alternative to the drag-reset effect (react.dev's
"adjust state when a prop changes" pattern) was tried and reverted: this
repo's `react-hooks/refs` rule is configured as an ERROR, not a warning, and
rejects reading or writing `.current` during render even for that
officially-documented pattern — 2 warnings beat 2 errors. `tsc --noEmit`
clean apart from the 8 documented pre-existing errors in
`app/api/urgans/confirmed-action.test.ts`. `next build` green **by exit
code** in all combinations of the two flags touched (both off, both on),
with `/auth`, `/dashboard`, `/onboarding`, `/settings` all still `○ Static`
in every one. Runtime probes on rebuilt `next start` servers: with both
flags on, `POST /api/urgans/actions` and its `[actionId]/apply` /
`.../discard` siblings all 401 unauthenticated (never 404); with both off,
all three 404 with body exactly `{"error":"Not found."}`, and
`GET /api/releases/[id]/plan` 404s along with them, while the ungated
control `GET /api/releases` 401s in both states — the discrimination that
proves the gate is real rather than a routing accident. `/api/admin/urgans`
was confirmed to hit the identical `verifyAdmin` precondition
(`ADMIN_EMAILS`/service-role config) the pre-existing `/api/admin/teams`
route hits under this sandbox's placeholder env, rather than a defect
specific to the new route.

**Not verified, stated plainly:** no real database, no real model call, and
no real session — this sandbox cannot mint one and has no network route to
either urganize domain. Nothing in the activation checklist's step 5 has run
against live data. The one-tap card, the refine modal, the locked sheet, the
discard confirmation and the admin table have never rendered in a browser.
