# Record page on a computer (2026-11-11, v1.263.0, no flag, #1190)

Part of #1175. Mock: `docs/mocks/record-page-desktop/mock.html` (founder approved, "Yes, build it"). The page is `/dashboard/<artistId>/records/<recordId>`, one record before its rollout.

## What changed, `lg` and up only

- Content width 1120, two columns: the idea, the tracklist and the sessions on the left, the tasks card in a 400 right column.
- Header: a 136 square cover. With no picture it is a neutral flat tile that says "No cover yet" with "Add cover"; with one, "Change cover". No banner and no colour wash on desktop.
- One filled button at the top right with its reason line under it, and the ⋯ menu beside it.
- Idea, Making, Rollout are three steps on one line (`StageSteps`): a tick for done, a ringed dot for now. Not clickable, as before. Each step also says its state for a screen reader.
- Tracklist: the four bars sit under the stage names, and the title carries "1 of 3 songs done".
- Tasks card: "4 open, 1 done" beside the title, "+ Add" up in the heading, the day at the end of each row, red when it has passed.
- The loading state has the same shape (square, lines, two columns).

## How it is built

- Every desktop rule is an `lg:` class. The phone's banner, stage boxes and big button are the same markup as before with `lg:hidden`; the desktop header is `hidden lg:flex`. Nothing below `lg` changed.
- The cards stay in the phone's order in the DOM. On `lg` the wrapper is a grid: the left cards take column 1, tasks takes column 2 and spans every row. The last row is `1fr`, so a long tasks card does not push the left cards apart.
- The ⋯ menu is one function (`moreMenu`) drawn in both headers; the hidden one is `display:none`, backdrop included.
- Pure rules are in `lib/record-page-data.ts` with tests: `recordStageSteps`, `taskCountsLine`, `isTaskLate`. The phone's `StageLine` reads the same steps.
- `ProjectTasksCard` was restyled, not replaced: it keeps its own tick path (`setProjectTaskDone`), suggestions, the add form and Show done. `ArtistTasksCard` reads rollout tasks, so it was not reused.

## Calls made without the founder seeing them

- **The main button follows the stage, as it did.** Making: "Plan the rollout" with `planHint`. Idea: "Start making" stays the filled button with "Or plan the rollout now" under it (the 4 Nov 2026 decision). Planned: "Open the rollout". Enabled and disabled rules are untouched.
- **Sessions** are not in the mock (its screenshot was cut off). They sit in the left column under the tracklist.
- **Stage names** over the bars are the app's own: Idea, Recording, Mixing, Done. The mock said Recorded and Mixed.
- **The record's picked colour** no longer shows on the desktop record page when there is no picture (the mock asks for a plain tile). It still shows on phones, on the artist page and in the cover sheet, where it is picked.
- **The song count** moved into the tracklist title on desktop; the header keeps only the next session line.
- **A planned record** has no tasks card (unchanged rule), so on desktop it is a single column.
- **No chevron** at the end of a song row. The song's name still opens its sheet.
- The word "project" in this page's older copy ("More for this project", "This project is now its rollout") was left alone.

## Not checked

The real page signed in with real data, inside the real top bar and AI rail, and in dark mode. It was checked on a throwaway preview with sample data at 1024, 1280, 1440 and 390 in the light theme.
