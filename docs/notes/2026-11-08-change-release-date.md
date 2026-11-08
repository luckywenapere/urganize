# Change a release date (2026-11-08, v1.259.0, #1128, no flag)

Founder approved the mock (`docs/mocks/release-date-edit/`) on 8 Nov 2026.

## What it does

An owner can change a dated rollout's release date from:

- the Rollout menu: "Change release date" (phone hamburger and the computer's ⋯ after the tabs), key `release-date` in `lib/release-menu.ts`, in the unlabelled corrections group before Change artist / Archive / Delete;
- the phone header's date line ("Pre-release · drops 12 Dec"), which is a button when `onEditDate` is passed (`RolloutPhoneHeader`).

Both open `ReleaseDetailsSheet`, which the Spotify pitch banner and the Distribute checklist already opened. The sheet leads with the date, says what will move before you save, and keeps the name behind a "Rename" link.

## Rules and traps

- **The save is unchanged:** `POST /api/releases/[id]/schedule` (via `scheduleRelease`), the one place a date changes. It moves open, auto-generated activities by the difference; done ones and ones a person added stay put. The toast is still `interpretScheduleResponse`'s ("Release date set. Your 46 activities moved with it.").
- **The preview uses the same rule:** `describeDateChange` in `lib/release-date-change.ts` runs `planActivityShift` (`lib/plan-dates.ts`) over the tasks on screen. Cancelled auto-generated activities count as moving because the route moves them too.
- **Owner only, dated only.** `releaseDateAction` in `WorkspaceView` needs `scopedReleaseIsOwn` and a `releaseDate`. A rollout with no date keeps its "Set your release date" row; the menu row does not appear.
- **Past days:** the field's floor is today while release day is ahead, and none once the rollout has dropped (`earliestPickableDay`), so a wrong date on a released song can be fixed. The route always accepted past days.
- Not on the computer's page bar: the date left it on 15 Oct 2026 and stays out.
- Change artist is not in the menu (removed 18 Oct 2026), so on screen the new row sits just above Archive / Delete, not beside Change artist as the mock drew it.

## Verified

- `lib/release-date-change.test.ts` (copy, plurals, earlier/later, nothing moves, past-date floor), and the menu order/group/dialog tests updated for the new row.
- Not run live in a browser (needs a signed-in session); check on a real rollout after deploy.
