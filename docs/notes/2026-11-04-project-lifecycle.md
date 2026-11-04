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
2. **Tasks on a project.** `tasks.record_id` (nullable `release_id`, exactly one of the two), a team read policy through `next_records.workspace_id`, `ensureTaskAccess` and the command-center scope filter learn records, `TaskQuickCreateModal` in record mode, a Tasks block on the project page, `lib/project-suggestions.ts` (the stage lists plus one per song from `finishTaskTitle`), `create_task` takes `recordId`, a `get_project` read tool, the system prompt's project paragraph.
3. **Carry-over and one path.** The "What's next" ask moves to the artist page's Up next here, beside the new Start the next one sheet (it lost its home with Home). `completeRecordRollout` moves open project tasks onto the rollout with phase `pre_production`; the sheet says how many; `plan: 'pre_production'` is refused; `StartNextSheet` starts a project; between-releases reads open projects. Existing dateless rollouts keep working.
4. **The AI stays on the project page.** On a phone the box's conversation stays on the page (today it hands over to the AI tab); after an add, the AI offers the next jobs from the suggestion list as chips, and a yes creates them. On a computer the right panel does the same, scoped to the project.

Full plan with file paths: the session plan of 4 Nov (`C:\Users\penta\.claude\plans\we-need-in-the-goofy-wilkinson.md`).

## Measure

Unchanged from 27 Oct: weekly active teams with no rollout in progress (the "between releases" number on `/admin/metrics`), internal accounts excluded. No click data exists yet, so every ordering in the mocks is a prediction.
