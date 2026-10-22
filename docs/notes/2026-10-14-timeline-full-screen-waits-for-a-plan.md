# Timeline full screen waits for a plan (2026-10-14, v1.122.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report: clicking a rollout with no plan opened the desktop timeline full screen with nothing on it, hiding the planner card. `WorkspaceView` now gates the auto full screen, `timelineIsFull` and the full-screen button on `timelineHasPlan` (`scopedTasks.length > 0`); it opens full screen as soon as activities exist. Held by `lib/timeline-fullscreen-guard.test.ts`. Not checked with a real session.
