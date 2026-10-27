# Idea round, then brief, then plan (2026-10-27, v1.193.0, NEXT_PUBLIC_FEATURE_IDEA_ROUND ships on)

Founder spec "Idea to Brief to Plan flow", mocks approved 2026-10-27 (`docs/design/idea-brief-plan-mocks.html`). A rollout starts with ideas. The owner talks or types one, asks teammates for theirs, closes the round, UrgAns merges the ideas into the existing brief page, the owner or a team admin settles disagreements and approves, and only then is the plan built, from the approved brief alone.

## Where things are
- **Pure rules, tested:** `lib/idea-round.ts` + `lib/idea-round.test.ts` (state, who sees what, everyone-in, To settle parsing, the brief as plan notes, the plan gate, the UrgAns prompt and parser, clip paths, copy).
- **Server:** `lib/idea-round-server.ts` (read and close the round, record who was asked, settle, approve, new version, the lock check, `planInputFor`, signed clip links, the brief page's extras).
- **Migration** `20261027120000_idea_round_and_brief_approval.sql`, applied to production 2026-10-27. Backups: `release_briefs_backup_20261027`, `release_messages_backup_20261027`, `release_brief_decisions_backup_20261027`, `release_brief_revisions_backup_20261027`. Round and approval columns live on `release_briefs`; `release_brief_decisions.source`; `release_messages.audio_path` / `audio_seconds`; revision block `approved`.
- **Routes:** `ideas` GET/POST (private while open, clip path, auto-close), `ideas/ask` (records who was asked), `ideas/transcribe` (keeps the clip), `ideas/round` (close), `brief` GET (adds `round` and `ideas`) and PATCH (locked when approved), brief decisions and references (locked), `brief/round` (settle, approve, new_version), `plan/v2` (the gate).
- **UrgAns action** `release.brief_from_ideas` (one shot, `team_write` but owner or team admin only, closed round only, metered like every embedded action, usage filed as `status`).
- **UI:** `RolloutIdeasCard` (round titles, lock hint, Close and write the brief, progress, Read the brief), `BriefIdeaGate` (the Brief tab shows the ideas round until it closes), `ReleaseBriefScene` (review card, To settle, Ideas list, lock, New version), `VoicePill`, `WorkspaceView` passes `onBuildPlanFromBrief`.

## Rules and decisions
- **Who runs the round:** the rollout owner or a team owner/admin (`canManageBriefShare`'s rule). They see every idea. Building the plan stays owner only, as the planner always was; an admin can approve, then the owner builds.
- **Private ideas:** while the round is open a teammate reads only their own ideas, and a new idea pushes and emails only the owner. After it closes everyone on the rollout reads them all.
- **Closing:** a tap, or by itself once everyone asked (ticked teammates, `ideas_asked_ids`) has added one. The auto-close does not spend credits: the owner's tap on the brief page writes it ("Write it from the N ideas").
- **The plan gate (`planInputFor`):** a rollout with ideas and no approved brief gets 409 `brief_not_approved` from `plan/v2`. With an approved brief, the server REPLACES the planner's notes with the brief (idea, decisions, open questions, max 1000 characters), so raw ideas never reach the planner. A rollout with no ideas plans exactly as before. A rollout that already had a built plan before this shipped reads as closed and is never gated.
- **Lock:** approved means no edits to the idea, decisions or references (server 409 and the UI hides the controls). New version unlocks; tasks are never changed by it.
- **Disagreements:** UrgAns never picks a side. Each becomes a To settle question; tapping a side adds it as a decision. Anything left unpicked at approval stays as "Still open" and goes to the planner as open.
- **Recordings:** kept in the private `release-assets` bucket under `ideas/<release>/<user>/`, played through hour-long signed links. A note may only claim a clip its author uploaded for that rollout (`isOwnIdeaAudioPath`). This reverses "the audio is NEVER stored" in the transcribe route, by the spec.

## Differences from the mocks
- **No separate Ideas tab.** The Brief tab already showed the idea screen before a rollout had an idea; it now shows the round until it closes, then the brief. Same two steps, one tab.
- The round's "N of M asked" counts teammates ticked in Ask. People invited by email are not counted until they join.
- The approved state shows the plan card only before a plan exists; it does not count the activities.

## Not built
- **Workspace ownership transfer** (in the spec, not in the mocks): workspaces already have one owner (`workspaces.owner_id`); moving it touches billing and needs its own mock.
- The v1 planner (`/plan`, `release.draft_plan`) is not gated; v2 is the live path.
- Approvals do not show in the History sheet (the header line shows the latest).

## Verified
Type-check, `idea-round.test.ts` (20 tests), the full vitest run (the 11 failures are Windows line-ending and path guards that do not read these files), lint on the changed files (no new errors). Migration applied and checked against the live schema. NOT rendered in a browser against a real rollout, and the UrgAns call was not run against the real gateway.

## Manual pass
Owner: new rollout, hold the mic, save, tick a teammate, Send. Teammate (other browser): sees only their own idea and the lock line, adds one; the round closes by itself if everyone asked is in. Owner: Close and write the brief (or Write it from the ideas on the brief), settle a question, edit a line, Approve and build the plan; the planner's notes hold the brief. Teammate: reads the locked brief. Owner: New version, edit, approve again; activities unchanged.
