# First-rollout focus (2026-10-10, always on, no flag)

> **Removed 2026-10-24 (v1.174.0).** The lock, nav dimming, bar and auto-opening dialog are deleted; the plan choice lives on in `components/releases/PlanChoiceDialog.tsx`. See `2026-10-24-lighter-rollouts.md`. Kept below as history.

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: after the guided tour, a new team should be pushed to make a
rollout before doing anything else, and choose between a plan UrgAns writes and
one they write themselves. Founder call: no flag, live at merge. **No migration, no route, nothing stored**: it is derived from
the tour's seen-mark and the release count, so it lifts the moment a rollout
exists from any path.

- **What it does.** `components/releases/FirstReleaseFocus.tsx` (mounted in
  `AppShell` beside the tour overlay) shows a standing bar, catches clicks on
  locked in-app links in the capture phase and explains instead of navigating,
  dims the locked nav (`html[data-release-focus]` in `globals.css`), and opens a
  plan-choice dialog once per session. Choosing sends `openCreate('template')`
  (UrgAns plans it; with the planner on the intake opens after creation) or
  `openCreate('blank')` (an empty rollout, no AI) through `useShellStore.createPlan`
  into `CreateReleaseModal`'s new `initialPlan` prop, which skips its own chooser.
  The server already took `plan: 'blank'`.
- **Pure logic in `lib/first-release-focus.ts`** (`decideFirstReleaseFocus`,
  `isLockedHref`), tested in `lib/first-release-focus.test.ts`.
- **This is NOT the URG-217 wall** removed 2026-08-28. It fails toward not
  locking, starts only after the tour is seen (or tours are off), never locks
  Home, Settings, billing, auth or sign-out, and every locked click offers the
  create button. Programmatic `router.push` calls are not caught, on purpose:
  the lock is a nudge with a look, not a security boundary.
- **It supersedes the ~30s first-release prompt** while on (`useFirstReleasePrompt`
  returns early), because both open the same create flow.
- **Not built:** a role check beyond curators. An invited teammate on a team
  with no rollouts sees the lock too; if that proves wrong, gate on whatever
  `canCreate` becomes (the tour still passes a literal `true`).
