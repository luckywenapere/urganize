# Bulk mark as done (2026-10-24, v1.169.0)

From a user interview (22 Oct 2026): a manager could not mark several activities done at once, and every tick opened "Done. How did it go?", so finishing a batch meant confirming one by one. Founder approved the mock (Select in the list, floating bar, one toast) on 24 Oct 2026.

## How it works
- `TasksPanel` has a **Select** button (page bar on a computer, beside Group by on a phone, its own row when no rollout is scoped). Select mode swaps each row's round tick for a square box; a tap picks the row instead of opening it. Escape, Cancel or switching rollout leaves select mode.
- Only open rows can be picked (`isSelectableTask`): not done, cancelled, locked or unsynced.
- The floating bar (`N selected · Select all · Mark done`) calls `useTaskStore.completeTasks(ids)`.
- `completeTasks` runs each id through `completeTask(id, { quiet: true })` in parallel, so the blocker check, optimistic flip, PATCH and cascade unlock are the same code as a single tick. `quiet` turns off all three bottom surfaces (undo toast, outcome sheet, cover art ask). Then ONE toast covers the batch (`completionToast.taskIds`), and its Undo reopens every id.
- Parallel is safe for cascades: each call's optimistic flip is synchronous after its token read, so a dependent of two picked tasks unlocks on the second call.

## Not done (on purpose)
- **Timeline**: it has no ticks at all; completion there is the pop-up. Adding select mode to Timeline needs its own mock.
- Home's task stack: untouched.
- No bulk API route: N PATCHes, same as N ticks. Fine at today's list sizes; add a batch route if a list ever holds hundreds of open rows.
- The outcome check-in is skipped for bulk completions, so those tasks get no outcome rating.

## Verified
Type-check only. Not rendered in a browser.

## v1.170.0 (same day)
- Timeline gets Select mode (mock approved 2026-10-24): same Select button and bar as the list, now shared in `components/tasks/BulkSelect.tsx`. In select mode a tap on a label, bar, dot or week-list row picks it; nothing drags. Milestones, locked, done and cancelled work cannot be picked.
- UrgAns gets `complete_tasks` (taskIds[], up to 50): runs `TaskService.completeTaskWithCascade` per id in order, skips and reports blocked ones. Also on the MCP allow-list (not confirmation-gated, same as `complete_task`).
- Founder direction: UrgAns should be able to do anything a user can do in the app. Gap audit in progress.
