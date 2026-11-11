# The song checklist (2026-11-11, v1.265.0, #1143, no flag)

Slice 1 of "one flow from song to review". Mocks: `docs/mocks/song-to-review/mock.html` (v2), approved by Oyin on 11 Nov with his yes to fold Idea and Making into one Song stage and to the 15-task checklist as drawn.

## What changed

- **`lib/song-checklist.ts`** (pure, tested): `SONG_CHECKLIST`, 15 tasks in four groups (Idea 3, Recording 4, Finishing 4, Paperwork 4). `checklistSeedRows` gives the rows a project still needs, ticked up to a song stage (recording ticks Idea; mixing ticks Idea and Recording; done ticks all but Paperwork). `groupProjectTasks` sorts a project's tasks into the groups in checklist order, with the team's own tasks under `other`. Rows are matched back by title (`sameTitle`), the same way suggestions were, so a renamed checklist task becomes an "other" task.
- **Seeding:** `seedSongChecklist` in `lib/next-records-server.ts` adds only missing titles, so it is safe to call twice; it refuses a planned or dropped project (409). `createRecord` calls it best effort for every new project (workspace route, onboarding, the AI's `add_to_record`). Onboarding passes the first song's stage (`songStage`), so a project started at Mixing opens with Idea and Recording ticked. Rows: `record_id` set, `assigned_to_user_id` null, `auto_generated` true, `metadata.checklist = { list: 'song', key, group, position }`.
- **Projects made before:** `POST /api/records/[recordId]/checklist` (through `resolveRecordsContext`, write), from the "Add the checklist" button the card shows when none of the checklist is there. No write happens on page view.
- **`ProjectTasksCard`:** "Making the song" with a progress bar, the four groups, then "Other tasks". Only the next unfinished group opens by itself; a finished group folds with a tick. "Suggested next" is gone from the card.
- **Stages on the project page, phone and computer:** Song, Release, Out, from `recordStageSteps` in `lib/record-page-data.ts` (the #1190 desktop work had it as Idea, Making, Rollout an hour earlier; folded here by Oyin's 11 Nov decision). Idea and Making both read as Song; `next_records.status` still stores `idea` and `making` (nothing in the data changed). "Start making" is gone on both; an Idea project shows Plan the rollout like a Making one.
- **A task given a day** shows it at the end of its row, red once it has passed (`isTaskLate`, from #1190).
- **`suggestProjectTasks`** (the AI's chips and `get_project`) now offers finish jobs for songs mid-way, then checklist tasks the project lacks, so the AI never offers a near-copy like "Record a demo".

## Not done here (later slices)

- "Release this song" (slice 2): the button still says Plan the rollout, and the rollout is still its own page.
- The artist page still shows an "Idea" chip and "still an idea" in Up next.
- `PRE_PRODUCTION_TASKS` stays for old pre-production rollouts and their tests; projects no longer suggest them.

## Checked

- `pnpm test`: all pass except two failures that exist on `main` without this change (`icons-registry.test.ts`: `components/releases/PlanOptionPreview.tsx`; `tours.test.ts`: reduced motion). Type check and lint clean.
- The card was rendered in a throwaway page with faked task data at 390px, dark and light, full checklist and a project made before (deleted after). **Not checked live:** no signed-in local session, so the routes against a real database were not exercised.

## v1.265.1: the approved desktop details are back

The #1190 desktop card (approved before this work) had "Tasks · 4 open, 1 done", an Add link in the heading and bold open titles. v1.265.0 dropped those on a computer. v1.265.1 puts them back around the checklist: `taskCountsLine` beside "Making the song", the Add link (`lg:` only; the phone keeps Add a task under the list), `lg:font-semibold` titles, and the #1190 card padding. Phones unchanged. Checked in a throwaway page at 1280px with fake tasks.

## v1.266.0: Pick a release day (slice 2, first part)

- The project's main button (phone and computer) says **"Pick a release day"**, not "Plan the rollout". The approved mock said "Release this song", but the rollout vocabulary rule (founder, 2026-09-09; `lib/rollout-vocabulary.test.ts`) keeps "release" for the date only, so the button names the step. The stage line then read Song, Release, Out; Oyin said yes the same day to Song, Rollout, Out (next patch).
- The sheet (mock 1.3): three Fridays to pick from, the first at least 9 weeks out (`releaseDayOptions` in `lib/release-this-song.ts`, tested), the middle one picked by default, or "Another day: pick it in the next step". A picked day goes to the planner as `prefill.releaseDate`, so the planner skips its date question. The carry-over line sits in a green box; "What the plan will use" folds under a details toggle. The button says "Make the plan".
- The AI's line when the last song is done, the Start next sheet and the onboarding hint say "Pick a release day" too.
- Not done: the mock's budget field (the planner already asks it) and "one page that changes stage" (the rollout is still its own page).
- Not rendered in a browser: the record page needs a signed-in session. Type check, lint and tests only.
