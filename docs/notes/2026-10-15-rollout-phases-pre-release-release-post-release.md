# Rollout phases: Pre-release, Release, Post-release (2026-10-15, URG-292)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A rollout's activities group under three phases, each header showing its dates and progress (done of total, cancelled left out) and a "Now" badge on the phase today falls in, so a manager sees where a release stands at a glance. Live with no flag (founder rule: new features ship on).

- **One definition:** `lib/rollout-phases.ts`. Boundaries are `derivePlanPhase`'s folded from four to three (Setup + Pre-release = Pre-release, up to day -8; Release = days -7 to +7; Post-release = day +8 on), so the plan review, next-moves and these headers never disagree.
- **The phase field is `tasks.metadata.phase`, not a column** (same precedent as `metadata.planner.key`): no migration, no backfill. A stored phase wins; with none, the phase follows the task's date relative to release day (so every task from before this got a sensible phase on read, and moves when its date moves); an undated task with none reads as Pre-release.
- **Who writes it:** playbook instantiation (`release-templates/instantiate.ts`, from `offset_days`) and approved UrgAns plans (`release-planning-server.ts`, from `offset_days`). A person sets or clears it in the task detail's Phase row ("from its date" clears); `PATCH /api/tasks/[id]` accepts `phase` (one of the three or null) and merges it into metadata like `planKey`.
- **Where it shows:** the timeline groups its rows by these three (it was four plan phases) with a three-card phase strip above the grid at every width; the activity list (scoped rollout) groups by phase by default with a "Group by Phase / Status" toggle that keeps the old status buckets one tap away (choice and per-phase collapse persisted in localStorage). Phase headers count the whole plan, not just the short list.
- **Not done:** the phone timeline's week list still groups by week (the strip above it carries the phases); AI chat tools that create single tasks write no phase, so those follow their date.
