# "Help me pick" a release date is a short decision list (2026-10-13, v1.120.4, no flag)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

From a prospect walkthrough: the planner's "Help me pick" filled in one date with no reason beyond runway, and he asked for something he could decide with, "e.g., avoid clashing with major artist drops". It now opens a list of three Fridays a week apart, starting at the earliest one with enough runway (`suggestReleaseDate`, unchanged), each with three checks. Rules in `lib/release-date-options.ts` (pure, tested in `release-date-options.test.ts`); UI in `DateStep` (`components/planner/intake-steps.tsx`).

- **The checks:** weeks to get ready; time to pitch Spotify editorial (at least `PITCH_READY_DAYS` = 35 days out, the plan's order-distribution deadline from `lib/editorial-pitch.ts`); and whether another of the team's own rollouts lands within 6 days (`SAME_WEEK_DAYS`). The first option that passes all three is marked "Best fit"; there may be none.
- **Other rollouts** come from the catalog already in `useReleaseStore` (`datedOtherRollouts` in `PlannerIntakeModal`): not the rollout being planned, not archived, not a test rollout, only real dates. No new request. A date typed by hand gets the same clash line ("Same week as Free (Dorian). You can still pick it.").
- **What it cannot see is said, not hidden:** other artists' release dates are not in Urganize, so an info icon beside the list says to check what else drops that Friday (`DATE_OPTIONS_LIMIT_NOTE`). Do not add a "no clashes" claim about the wider market.
- **Behaviour:** Help me pick toggles the list; opening it with no date chosen selects the best fit (or the first). The cards are a radio group (arrow keys via `onRadioGroupKeyDown`). Picking sets `dateSuggested: true`, so `date_mode` analytics still read "suggested".
- **Known limit:** the date question comes before "What's already done?", so readiness changes the options only when it was prefilled (onboarding hands it over). Moving the question order is a separate call.
- **Checked on a throwaway page with made-up rollouts** (375px, light and dark), **not with a real session.**
