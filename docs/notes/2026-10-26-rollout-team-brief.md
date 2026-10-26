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
