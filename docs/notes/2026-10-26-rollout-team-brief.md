# Rollout team brief (2026-10-26, patch 1.178.6)

The condensed Ideas panel (simple Work the plan view, rollout with no date) shows a team-readable brief instead of the owner's raw note.

- **AI writes only the goal and 2 to 3 moves** (`lib/rollout-brief.ts`, prompt + parser). Surface `status` (cheapest rung), logged as `status`, never charged.
- **Next up and Missing are code, not AI**: `nextUp` (3 open tasks, earliest due, owner or Unassigned) and `missingItems` (no release date, unassigned next tasks). Always current, never invented.
- **Saved once for the whole team** in `release_team_briefs` (service role only, RLS on, no policies). The route `POST /api/releases/[id]/ideas/brief` returns the saved copy while the fingerprint (notes + plan task titles) is unchanged, else rewrites it. Completing a task does not rewrite it.
- **Trap:** `release_briefs` already exists (a different, older feature: idea + share token). Do not reuse it.
- **Fallback:** no AI, no notes or a failed call returns `brief: null` and the card shows the owner's own words, as before. "Edit idea" opens the full card.
- Migration `20261026120000_release_team_briefs.sql` applied to production 2026-10-26 (new table, nothing to back up).
- Verified: type-check, `rollout-brief.test.ts`, route guards. Not rendered in a browser and the AI call not run against the real gateway.

## First step is the idea (patch 1.179.4)
"Your first steps" no longer starts with the cover art. The steps are now: Add your idea (done once the rollout has an idea note, read from `release_messages` by `/first-steps`), then the pinned date, then Invite your team. The idea step only exists while the Ideas card does (ideas on, plan not built yet). Its button sends `ADD_IDEA_EVENT`, which opens the card's text box; saving a note sends `IDEAS_CHANGED_EVENT`, which re-reads and ticks the step. The cover art is still a task inside the plan, later. `just-planned-cuts-guard.test.ts` fails on this Windows checkout (CRLF) with or without this change.

## New ideas update an existing plan (patch 1.181.2)
The owner can add an idea to a rollout that already has a plan and get suggested changes: tasks to ADD and open tasks to MOVE. Never deletes or rewrites a task, never touches a finished one, and saves nothing until the owner taps Apply.
- **Where:** `RolloutIdeasCard`. Planned rollout with no idea shows a slim "New idea for this plan?" row (owner only). The brief gets an "Add idea" button. Saving a note as the owner on a planned rollout asks for changes. The review panel (`IdeaChangesPanel`) lists `+` adds and `~` moves, "Not saved yet", Apply changes / Not now.
- **Rules (pure, tested):** `lib/rollout-idea-changes.ts`. The model sees tasks only as keys `t1..tN`, so it cannot name a task that is not on the board. Timing is clamped to the plan window (never before today on a dated rollout); duplicates of the board or of each other are dropped; max 5 adds and 3 moves. `cleanIdeaChanges` runs on the suggestion AND again on what the browser sends to Apply, against the board as it is then.
- **Server:** `lib/rollout-idea-changes-server.ts`; route `POST /api/releases/[id]/ideas/changes {action: 'suggest' | 'apply'}`. Owner only (team access check, then `loadOwnedRelease`); suggest also needs the same plan as UrgAns's embedded actions (`release.draft_plan`), so a Solo team gets `plan_required`. Surface `planner_quick`, logged as `plan`, NOT charged (same as the date adds).
- **Writes:** new tasks as ordinary plan rows (`metadata.planner.origin = 'idea'`, assigned to the owner); an undated rollout keeps the timing in `metadata.planner_v2.offset_days` so setting the date dates them. Moves change `due_date` (dated) or the stored offset (undated). The plan record (`release_plan_drafts.doc`) is NOT updated, unlike the date adds; the tasks are the source of truth. After Apply the page reloads the plan and the brief rewrites itself (its fingerprint covers task titles).
- **Not verified:** nothing was run against the real AI gateway or a real database; the card was not rendered in a browser.
