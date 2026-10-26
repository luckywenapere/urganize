# Release brief (2026-10-16, URG-281, v1.150.0, ships on)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

One page per rollout that the team reads instead of scrolling WhatsApp (Bamidele demo, 2026-10-12). Mocks approved by the founder (phone 390 and desktop 1440, every state). It takes the menu slot release chat left: "Read the brief", key and scene `brief`, right after "Work the plan" (`lib/release-menu.ts`, Plan group).

- **Flag:** `NEXT_PUBLIC_FEATURE_RELEASE_BRIEF`, ON when unset; only `'false'` hides it (`lib/release-brief-flag.ts`, the cancel flow's pattern). Off: no menu row, `?scene=brief` resolves to nothing, every brief route 404s, the view link reads as unavailable.
- **Stored vs derived** (`lib/release-brief.ts` is the pure half, `lib/release-brief-server.ts` the database half): four new tables in `20261016120000_release_briefs.sql` hold only what people write: the Idea, references (links; a link to an image file is kind `image` and shows as a thumbnail), one-line decisions, a 30-row edit history (trimmed on insert, autosave bursts coalesced within 10 minutes), and the view-link token. Dates (milestones and planner-key tasks, else every dated task, plus release day) and Who's on what (task `assigned_to_user_id`, the only assignee column with rows in production) are DERIVED on every read, so there is no second place to type a date.
- **Notes:** the brief reads `notes` where `release_id` is the rollout (not archived), server side, read only. The Notes surface itself is cut (v1.149.0) and stays cut; this is where that data is still visible. Note this widens who sees a note: Notes were private to their author, and in the brief every member of the rollout's team sees the notes linked to it (the founder's requirement 2).
- **Access:** RLS on, no policies (release_messages' pattern); every route gates through `ensureReleaseTeamReadAccess` / `WriteAccess` and is enlisted in `release-access-guard.test.ts`. Delete a reference or decision: its author, or the rollout owner or a team owner/admin (`canManageBriefShare`). The view-link toggle is owner or team owner/admin only.
- **UrgAns draft** is the embedded action `release.draft_brief` (draft, then Keep or Discard; metered like every embedded action; usage filed under `status`). Keep writes the Idea with revision label `UrgAns` and refuses if someone wrote an idea meanwhile.
- **View link** `/brief/[token]` (24-character token, noindex, dark-locked, /pack/[token]'s pattern): artist, title, release day, Idea, References, Dates. Never decisions, people or notes.
- **Not built:** image upload (links to images only), editing a decision, comments, notifications, real-time co-editing (last write wins).
- **Migration not applied** at build time. Until it is, the scene shows "Couldn't load the brief." (the routes answer 503).

## From the plan (2026-10-26, v1.179.0, founder approved mocks)

- **Why Draft with UrgAns failed:** the live database never had `urgans_actions` (migration `20260903100000_urgans_actions.sql` was not applied). A two-step action's run could not be logged, so the server returned an empty action id and the client rejected the draft (and Keep had no row to apply). Applied 2026-10-26 with the service_role and authenticated grants. Any two-step embedded action had the same fault.
- **Seed from the plan:** `loadPlanSeed` reads the newest approved `release_plan_drafts` row's `doc.planner_v2` and `buildBriefPlanSeed` (pure) makes an Idea (summary, goal, constraints) and decisions (win, spend, channels). No model call, no credits. The empty brief shows it as "Written from your plan" with Keep or Edit; Decisions lists the rest as "From your plan" with Keep or Drop (drops live in localStorage per rollout). "Rewrite with UrgAns" stays, and the draft prompt now gets the plan's summary (`release-draft-brief-v2`).
- **Dates for a plan with no release day:** `deriveBriefDates` shows `metadata.planner_v2` timing ("Now", "4 weeks before") and a "Pick a day" release row; `BriefDateRow.when` carries it, `date` is empty. The public `/brief/[token]` page reads it the same way.

## New-rollout flow (2026-10-26, v1.180.0, mocks approved)

- A rollout with no activities scrolls as a page on a computer and shows the plan card first (`pageScroll` in `WorkspaceDesktopFocused`), the idea and first-steps cards side by side below it. The phone order is unchanged.
- A built plan lands as `PlanLandedCard` (count, the planner's summary, the first three open steps, "Read the brief") instead of a toast. State is `planLanded` in `WorkspaceView`, cleared on dismiss.
- The idea card's notes lead the brief's suggested Idea (`buildBriefPlanSeed(doc, notes)`), with or without a plan.
