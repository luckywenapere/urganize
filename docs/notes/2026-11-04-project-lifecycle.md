# One lifecycle: project (Idea, Making) into rollout (2026-11-04, mocks approved)

Issue: luckywenapere/urganize#1074. Mocks: `docs/mocks/project-lifecycle/mock.html`, drawn 4 Nov 2026 in the light look and approved as drawn by Oyin the same day ("this looks good"). He singled out the AI in the UI (screens 6 and 8), which is not how the app works yet, and asked for it to be built as drawn in this work: step 4 below.

## Why

A release starts before the music exists. Today two things sit before Pre-release and never meet:

- **The next record** (27 Oct, `docs/notes/2026-10-27-next-record.md`): a `next_records` row under the artist with songs, sessions and people. Not a rollout row, on purpose. It has no tasks, so the AI cannot recommend work there, and there is no stage before Making.
- **Pre-production rollouts** (16 Oct, URG-280, `lib/pre-production.ts`): "Start the next one" made a `releases` row with no date and eight undated tasks in a `pre_production` phase. Its only entry was Home, removed on 29 Oct, so it is dead on screen and still in the code.

Oyin, 4 Nov: there is a state before people even think about making it, so it has to start as a project; from there they move into planning the activities if they decide to begin making; that side has tasks too, so the AI can recommend; and the transition into the release's pre-release, release and post-release has to be clean.

## Decisions (4 Nov 2026, Oyin)

1. **Stages live on the record row** (`next_records`), not on `releases`. Rollout counts, plan limits and the scoreboard keep counting `releases` only.
2. **The pre-production rollout is folded into the project.** One way to start the next thing. The eight seeded jobs become suggestions in the Making stage.
3. **The word on screen is project.** A project becomes a rollout when you plan it. Song stages (Idea, Recording, Mixing, Done) stay as they are.
4. **Idea moves to Making by a button, and by itself the first time work starts** (a song past Idea, or a session saved). Never back on its own; Drop is the only way down.

## The states

| Stage | Where | Enters | Leaves |
|---|---|---|---|
| Idea | `next_records.status = 'idea'` (new) | New project, onboarding "Just an idea", the "What's next" ask, the AI | Start making, or a song past Idea, or a session saved; Drop |
| Making | `next_records.status = 'making'` | From Idea, or onboarding Recording / Mixing | Plan the rollout; Drop |
| Planned | `status = 'planned'`, `release_id` set | Plan the rollout (built 27 Oct) | Never; the rollout carries on |
| Pre-production | `tasks.metadata.phase` on the rollout (exists) | The project's open tasks move over at Plan the rollout, owner and day kept; "Finish X" tasks for songs not done | A date lands and planner v2 builds the dated phases, as today |
| Pre-release, Release, Post-release | `lib/rollout-phases.ts`, unchanged | | |
| Out | `lib/recap-eligibility.ts` rule, unchanged | | Seven days later the ask fires on the artist page |

Rules: songs keep their own stages; a project's tasks are real `tasks` rows (so chasing, assignment emails, the task pop-up and the AI work with no new plumbing); done project tasks stay on the project as history; `making` does not require a song.

## Build order after his yes

1. **The Idea stage** (built 4 Nov, v1.247.0). Migration `20261104120000_next_records_idea_stage.sql` widens `next_records_status_check`, applied to production 4 Nov (backup `next_records_backup_20261104`, 13 rows). `parseRecordCreate` takes `status` (Making by default, so every older caller keeps its meaning); `startMakingIfIdea` runs on a song moved past Idea and on any session saved, conditional on `idea` so it never moves back; open-project reads use `OPEN_RECORD_STATUSES`; onboarding "Just an idea" starts at Idea; the stage line, Start making and the idea text on the project page; the Idea chip and "still an idea" in Up next on the artist page; on-screen "record" became "project". The assistant is called "AI" in copy since 3 Nov (`lib/urgans-name-guard.test.ts`), so the mocks' "UrgAns" reads "AI" in the app.
2. **Tasks on a project** (built 4 Nov, v1.248.0). Migration `20261104140000_tasks_on_projects.sql` adds `tasks.record_id` (cascade), makes `release_id` nullable with `tasks_one_owner_check` (exactly one), an index and a team read policy through `next_records`, applied to production 4 Nov. `lib/project-tasks.ts` `decideTaskOwner` is the one rule the route and the AI's `create_task` share; `taskHref` points alerts, pushes and the assignment email at the project page. `dropRowsOutsideScope`, `ensureTaskAccess` and the command center let an artist-limited member see their artist's project tasks and a rollout-limited member none. `ProjectTasksCard` on the project page (open tasks, tick, tap opens the task pop-up, "Suggested next" with Add, a quick add, done folded). `lib/project-suggestions.ts` gives the stage lists plus one finish job per song at Recording or Mixing, hiding jobs already added. New read tool `get_project`; `create_task` takes `recordId`. Found on the way: the AI box looked for project pages at `/dashboard/artists/...`, but they live at `/dashboard/<artistId>/records/<id>`, so it never knew it was on a project; `recordIdFromPath` reads both now. Kept for later: the add form is title only (owner and day are set in the task pop-up), not `TaskQuickCreateModal`.
3. **Carry-over and one path** (built 4 Nov, v1.249.0). `completeRecordRollout` moves the project's open tasks onto the rollout with phase `pre_production`, owner and day kept (`carryOverTaskUpdates`, each update conditional on the task still being the project's); done and cancelled ones stay on the project. The plan route passes the open titles to `recordLeadTasks`, so a song whose finish job is already a task is not added twice. The plan sheet says how many move (`carryOverLine`). `POST /api/releases` refuses `plan: 'pre_production'` with a plain 400; rollouts already made that way keep working. `StartNextSheet` starts a project (Just an idea or Already making it) and opens its page; event `project_started`. The Home "Next song" card was mounted nowhere and is deleted. Home now redirects to the artist list, so the What's next ask moved to the artist page's Up next (`whatsNextFor`, same 7 to 90 day window), in the state with nothing planned and no open project. No snooze there: the page is visited on purpose, unlike Home. Not done: the rollout's "Finish X" lead tasks still sit under Pre-release (the planner derives their phase from the day), where mock screen 5 drew them under Pre-production.
4. **The AI stays on the project page** (built 4 Nov, v1.250.0). On a phone the project page's box opens `ProjectChatSheet` over the page instead of moving to the AI tab, in the project's own thread (`projectSessionIdFor`, `showProjectSession`), scoped to the project. After `add_to_record` saves, its result carries a client action `offer_project_tasks` with up to two jobs from `lib/project-suggestions.ts` (`lib/project-offer.ts` writes the question and the chips), so the AI never invents a job and the chips work with no model. A chip adds the jobs through the tasks route (`source: 'ai'`); Not now leaves them under Suggested next. The prompt tells the model not to list them again. On a computer the AI drawer was already scoped to the project by the address, and shows the same chips. A failed read of the project's tasks just means no chips, never a failed add.

Full plan with file paths: the session plan of 4 Nov (`C:\Users\penta\.claude\plans\we-need-in-the-goofy-wilkinson.md`).

## Measure

Unchanged from 27 Oct: weekly active teams with no rollout in progress (the "between releases" number on `/admin/metrics`), internal accounts excluded. No click data exists yet, so every ordering in the mocks is a prediction.
