# The plan is built, not drafted (2026-09-15)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call, verbatim: *"Remove the plan review they should just automatically
create the plan they can edit it manally themselves if they want after it has
already been created. And the plan has to aligned with what they type or
select during the asking question stage before the plan is created. if someone
says they want a normal release no marketing then it should tailor to that,
Then to help this let's use a open ai model that can do this very well."*

Four forks were put to the founder and answered before any code changed:
finishing the interview in chat **builds the plan straight away**, no card, no
draft; a model failure **holds and asks to try again** when the manager typed
real notes (nothing is created, the answers are kept), and quietly proceeds
from the selected answers alone when they typed nothing; the planner model is
**`openai/gpt-5.4`** via RodiumAi; and "no marketing" means **the whole
campaign**, not just the optional edges of it — release day and getting the
music to stores stay in every plan regardless.

**Why the old build could not honour "no marketing" at all, measured before
writing a line of this:** the single-release playbook has 64 tasks, 37 tagged
`marketing`, and 27 of those are `optional: false`. The AI contract only let
the model drop OPTIONAL tasks and rejected the whole delta if it touched a
required one, so the most any instruction could ever remove was 10 optional
marketing tasks out of 37. The guidance was also keyed wrong — every intake,
even a well-funded one, was told "No budget: drop the optional paid promotion
tasks" — and a manager's free-text answer reached the model as "anything else
they said" with no rule that it actually bound the output. A "normal release,
no marketing" request was structurally unable to produce one.

### The exclusion model replaces "the AI decides what to drop"

`PLAN_SCOPES` (`lib/release-planning.ts`) is five buckets a manager's words map
onto — `marketing`, `press`, `paid_ads`, `events`, `physical` — each carrying a
playbook tag (`SCOPE_TAGS`) and a plain label. `KEEP_TAGS = ['release_day',
'distribution']`: a task carrying either tag survives every scope, whatever
else it is tagged, because release day and the distributor handoff ARE the
release — a rollout with no marketing still goes out and still reaches stores.
`isTaskInScope(task, scope)` is the one test: the scope's tag present, no keep
tag present.

**Removal is CODE, not a model suggestion.** The intake's `exclusions` field
(a manager's explicit "leave this out" chips) and `budget === 'none'` (which
silently adds `paid_ads`) are applied by `applyScopeExclusions` before the
model ever sees the draft. The model can still propose `exclude_scopes` from
free text — "keep it low-key, no press push" becomes a press exclusion with a
reason — but a required task can only be dropped when it falls inside a scope
the manager or the model actually named; `validatePlannerDelta` rejects the
whole delta otherwise, and a keep-tagged task can never be dropped by any
scope, ever (`lib/release-planning.test.ts` pins both, mutation-tested — see
Verified below).

### One pipeline, no draft: `createReleasePlan`

`lib/release-planning-actions-server.ts` replaces the old
`generatePlanDraft` + `approvePlanDraft` pair with one function, called from
three doors that now all do the same thing: `POST /api/releases/[id]/plan`
(the workspace card), `generate_release_plan` (the chat tool), and
`release.draft_plan` (the embedded action). In order: resolve the release
date (writing it if the intake supplied one and the row lacked it); refuse a
second plan on a release that already has one; build the deterministic
template draft and propose owners from past assignments; apply the
deterministic exclusions (intake + budget-none); ask the model for a delta
over the REMAINING tasks only; **insert-or-claim** on `release_plan_drafts`
(the row is now purely an idempotency lock and an audit trail — nothing reads
it as a document to review) so two racing requests can't both build; and
instantiate straight into `tasks` in the same call. `generate/`, `approve/`
and `regenerate-phase/` route files are deleted outright.

**The AI-failure policy is the "hold and ask to try again" fork, made
precise** (`decidePlanCreationOnAiFailure`, pure and tested): with the
gateway simply not configured, proceed untailored — the deterministic result
is still a valid plan. With a real failure (timeout, rate limit, bad output)
and the manager had typed real notes (`extra_notes` or `goal_text`), refuse
with 503 `tailoring_unavailable` **before writing anything** — the notes are
the one thing code cannot fall back to interpreting, so a manager who wrote
"keep it minimal, we're skipping the video shoot" gets told to try again
rather than getting a plan that silently ignored what they wrote. With no
typed notes, proceed with the deterministic + selected-answer result and a
warning that the rest could not be tailored.

### The provider, and why an OpenAI model needed new plumbing

`lib/ai/provider.ts` gained `jsonSchema` (strict `json_schema` response
format, with a one-time fallback to `json_object` if a gateway 400s on the
newer shape), `reasoningEffort` (sent only to models `supportsReasoningEffort`
recognizes as accepting it — `openai/gpt-5.4` does, `openai/gpt-4o-mini` does
not — with its own one-time fallback if a gateway rejects the parameter), and
a `deadlineMs` that shortens each retry's timeout as the budget runs down and
skips a retry with under 8s left rather than starting one it cannot finish.
`lib/ai/planner-model.ts` resolves `openai/gpt-5.4` as the RodiumAi default
(env override `AI_PLANNER_MODEL` unchanged) and `'low'` as the default
reasoning effort (`AI_PLANNER_REASONING_EFFORT`). Every prompt string still
carries no model or provider name, per the existing test that forbids it.

### The scene is gone; the manager edits real activities instead

Deleted: `PlanScene.tsx`, `usePlanDraft.ts`, `PlanApproveBar.tsx`,
`PlanPhaseSection.tsx`, `PlanTaskRow.tsx`, the plan-scene skeleton, and every
`openScene('plan', …)` call. `'plan'` is out of `SceneName` entirely, so the
compiler — not a runtime check — is what caught every call site that still
assumed a review scene existed. `PlanReleaseCard` now has three states
(`fresh` → the intake, `generating` → a short wait, `failed` → try again,
answers kept) and the primary button in every one of them is the questions,
because there is nothing else to open. A new `PlanBuiltBanner` is the ONLY
place a manager learns what the model removed and why — it renders once,
dismissible, listing every dropped task's reason and every applied exclusion,
because "trust me" without a list of what changed would violate the file's
own "visible state changes" principle.

### Chat: finishing the interview is the go-ahead

The system prompt's interview grew from seven questions to eight — the new
one asks what to leave out, answered only when the manager plainly says so
and never suggested by the model — and reading the eight answers back for a
yes is now the ENTIRE approval step; there is nothing after it.
`approve_release_plan` and `discard_release_plan` are deleted from the tool
registry, `ChappiToolName`, and every gated-tool list in this file (the
"Currently sixteen" bullet under "The confirmation gate" is fourteen now).
`generate_release_plan` is ungated (per the founder's call) and, when called
with no `releaseId`, creates the rollout and builds its plan in one request —
the usual shape, since most of the time the release does not exist yet when
the interview starts.

### The embedded action needed a new primitive: `oneShot`

`release.draft_plan` used to run `execute()` (draft) then a separate `apply()`
(commit); now `execute()` does the whole job and there is nothing left to
apply or discard. Rather than special-case this one action,
`UrgansActionDefinition` gained `oneShot?: boolean` and `apply`/`discard`
became OPTIONAL methods (`lib/urgans-actions/types.ts`); `runUrgansAction`
checks `action.oneShot` and, on success, inserts the `urgans_actions` row
**already** `status: 'applied'` with `applied_result` set from the same
output, rather than `'drafted'` waiting for a later settle call.
`findLatestDraftedActionId`, `markChatActionApplied` and
`markChatActionDiscarded` are deleted — nothing calls them once the planner
stopped needing a settle step, and a settle function with no drafted row to
settle is a function nothing can safely reach for. `presskit.draft_section`,
the OTHER embedded action, is untouched and still uses the two-step shape —
`oneShot` is an option this framework offers, not a direction it forces every
action toward.

**Rebased 2026-09-25, after ten days of unrelated drift, and the founder
re-confirmed the direction before it landed** — this branch sat unmerged while
`main` built further ON TOP of the review step it removes: share to socials'
`shareAction`, the embedded-actions admin console, and a `share_release` tool
name landing right beside the two this section deletes
(`approve_release_plan`, `discard_release_plan`) in the same enum. None of
that changes what already shipped here; the rebase kept `shareAction` and
`share_release`, dropped `showPlanPill`/`hasPlanDraft` (the review-step pill
this section retires), and re-derived the version number rather than trusting
the branch's own stale v1.42.0 claim, which had since been taken twice over by
other work. See "Everything after the music" and the rest of this file's
2026-09-15-to-25 entries for what else moved underneath it.

### Verified

**Re-run after the rebase, numbers below are from before it and are the
build-time record — re-verified counts follow in the same order:** full
vitest suite **3689 passed, 30 skipped**, zero failures; `eslint .` **3 errors
/ 78 warnings** in `apps/web` (the same three pre-existing `WorkspaceView.tsx`
errors, and one warning FEWER than a clean `main` checkout's own 79, measured
by linting both); `tsc --noEmit` clean apart from the same 8 documented
`confirmed-action.test.ts` errors; `next build` green by exit code with
`NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` both on and off, `/auth`, `/onboarding`,
`/settings` and `/dashboard` all still `○ Static` in each; and the same
404-vs-401 runtime discrimination on `/api/releases/[id]/plan` confirmed again
post-rebase.

`vitest run` in `apps/web`: **3256 passed, 30 skipped**, zero failures.
`eslint .`: **3 errors / 77 warnings** in `apps/web` (all three errors the
documented pre-existing `WorkspaceView.tsx` ref-during-render finding, zero
new warnings) and **0 errors / 2 warnings** in `apps/homepage` (the documented
pre-existing `RoadmapPageClient.tsx` finding) — both baselines matched
exactly. `tsc --noEmit` clean in `apps/homepage`; clean in `apps/web` apart
from the 8 documented pre-existing `confirmed-action.test.ts` errors. `next
build` green **by exit code** for both apps, and `apps/web` built clean with
`NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` both on and off, `/auth`, `/onboarding`,
`/settings` and `/dashboard` all still `○ Static` in every combination.

**Runtime probes on `next start`, rebuilt between flag states:** flag off,
`POST` and `GET /api/releases/<id>/plan` both answer **404** with body exactly
`{"error":"Not found."}` while the ungated `/api/releases` still **401**s —
the discrimination that proves the gate is real rather than a routing
accident. Flag on, both methods **401** unauthenticated, so auth runs after
the flag check as designed. The three deleted routes (`/plan/generate`,
`/plan/approve`, `/plan/regenerate-phase`) return Next's own generic 404 page
in both flag states — confirming the FILES are gone, not merely gated.

**Compiled output checked directly, this repo's habit for anything the build
could silently get wrong:** the flag-on client bundle carries "Build my plan",
"Let's plan this rollout" and "UrgAns is building your plan"; it carries
**zero** live occurrences of "Review your draft plan" or "Decide before you
approve" — the one surviving hit for the first phrase is the CHANGELOG's own
v1.32.1 entry, a quotation of history that is never rewritten, not live UI
copy. The homepage's prerendered `/` carries the new FAQ answer both in the
visible accordion and in the `FAQPage` JSON-LD, and the old answer is gone.
The store listing's stated character count was remeasured with `wc -m` after
the copy changed (1,656 → 1,641) rather than estimated.

**Two mutations run, each printing `APPLIED` first, each restored
byte-identical afterward (`diff` confirmed):** dropping the keep-tag guard
inside `isTaskInScope` failed 4 tests; letting `validatePlannerDelta` accept a
required drop with no matching excluded scope failed 2. Both are the load-
bearing half of "if someone says no marketing, tailor to that" — a manager's
exclusion has to survive validation exactly as strictly as the model's own
proposed one, or the instruction is decorative.

### Not verified, and it is the whole product risk

**No live model call.** RodiumAi is egress-blocked from this sandbox and no
key is configured here, so whether `openai/gpt-5.4` actually holds the
`json_schema` contract, accepts `reasoning_effort`, and produces a plan that
genuinely omits every marketing task when asked to has never been observed —
only reasoned from the provider's own retry/fallback logic and the pipeline's
tests. **The manual pass this needs after deploy:** a single with budget
`none` and the note "a normal release, no marketing" should come back missing
roughly 30 tasks (teasers, announcements, the content shoot, briefing the
marketing lead) while keeping release-day and distribution work and every
paid-ads task; the `PlanBuiltBanner` should list every removal with a reason
in voice; a second attempt on the same release should answer "already has its
plan"; the chat interview should reach the same result end to end; and a
build should land comfortably inside the 60s route ceiling. If it does not,
`AI_PLANNER_REASONING_EFFORT=none` or falling back to `openai/gpt-5.4-mini`
are both env-only levers, no redeploy of logic required.

**Nothing has rendered in a browser.** This sandbox cannot mint an
authenticated session and has no route to app.urganize.app, so the intake's
new exclusion chips, the three `PlanReleaseCard` states, and the banner have
never been seen, only built and unit-tested.
