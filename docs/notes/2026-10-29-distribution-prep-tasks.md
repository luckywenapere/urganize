# Distribution prep as plan tasks (2026-10-29, v1.205.0, no flag, #851)

Oyin approved mock "natural tasks" on 2026-10-29. The "Before you order distribution 0 of 7" checklist card is gone from the rollout. Its work is three ordinary tasks:

| Step id | Title | Done when the check stops raising | Due |
|---|---|---|---|
| `dist_prep_details` | Set the genre, lyrics language and explicit tag | `missing_genre`, `missing_language`, `missing_explicit_flag` | release −49 (week 7, beside "Write song metadata") |
| `dist_prep_credits` | Add the songwriters to the credits | `missing_songwriter_credits` | release −49 |
| `dist_prep_artwork` | Upload the final cover art (3000 x 3000, JPG or PNG) | the four `artwork_*` codes | release −42 (week 6) |

**How.** `POST /api/releases/[id]/distribution-prep` runs `syncDistributionPrepTasks` (`lib/distribution-prep-tasks-server.ts`), decided by the pure `planDistributionPrep` (`lib/distribution-prep-tasks.ts`, tested). WorkspaceView calls it when a rollout opens, when its date changes and when a scene closes, and refreshes only if something changed. It adds a task only while its work is still to do, ticks an open one when its check passes (never reopens), and records added steps in `releases.metadata.distribution_prep_added` so a deleted task stays deleted.

**Traps, each handled and tested:**
1. The planner refuses a rollout with `auto_generated` tasks, so these are `auto_generated: false` (the pre-production seed's precedent).
2. The screen reads "no plan yet" as "every task is pre-production" (`onlyPreProductionWork`), so on a rollout with no plan they carry phase `pre_production` and move to their real phase once a plan exists.
3. The schedule route only moves generated tasks, so these follow release day themselves: `tasks.metadata.distribution_prep` holds the due date set and the release date it came from; the date moves only while nobody changed it, and is not recomputed for the same release day (a clamped "today" can still fall overdue).
4. A due date already past is clamped to today.

**What still shows on the rollout:** warnings (date tight, splits, title) and errors no task covers (title, artist), as a plain list via `issuesLeftOnRollout`, plus the distributor's answer. `missing_release_date` shows nowhere on the rollout; the Distribute scene still lists everything.

**Not verified:** nothing ran against a real database or in the browser. Guard tests that read source files fail on this Windows checkout's CRLF line endings, unrelated.
