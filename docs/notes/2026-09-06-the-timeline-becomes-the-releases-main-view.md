# The timeline becomes the release's main view (2026-09-06, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **AMENDED 2026-09-30.** Point 4 below (the rails hide for the timeline) is
> moot: the release rails were deleted with the row of pills when the rollout
> menu moved into the right-hand column, so the timeline's grid gets its room
> from the width budget instead. The Activities row now lives in that menu (and
> in the phone's release menu), still gated on the timeline flag. Everything
> else here stands.

Founder, with a phone screenshot of a scoped release (`Ohema`, MOTION 9/63):
*"Let's retire the view and let the Timeline view be the main view — it
represents how creatives think and is better and more peaceful."*

**The complaint is fair and the screenshot proves it.** Buckets ship COLLAPSED
(the 2026-06-11 default), so a release with 63 activities opened onto five
closed drawers — Catch Up (1), Due Today (1), Due This Week (9), Upcoming (43),
Done (9) — and every item on the screen was a count. Nothing on it could be
acted on without a tap.

**Not a scope expansion, no migration, no API route, no new flag.** The
timeline (2026-08-30) already existed behind `NEXT_PUBLIC_FEATURE_TIMELINE`,
which now decides which view a release LANDS on rather than merely whether the
scene is reachable. **With the flag off every path here is byte-identical to
before.** It shipped in one commit (`6c9e23e`, PR #451), untouched since, and
**has never rendered in a browser** — which is why this merges flag-off.

### Two founder decisions taken before any code

1. **The buckets survive, one tap away.** They are a scene of their own now
   (`?scene=activities`) rather than being deleted, which is what lets him see
   the timeline on his own releases before anything is thrown away.
2. **Completion stays in the pop-up.** Tapping a timeline row already called
   `onOpenTask`, and the pop-up carries the `○` beside the title (v1.23.1), so
   this needed **no code at all** — no tick-boxes were added to timeline rows,
   which would have put a control on every dot and bar in a view chosen for
   being calm.

### Six things worth knowing before editing this

1. **THE BLOCKER, and it would have been silent.** `activitiesBanner` rendered
   only inside `TasksPanel`'s non-scene branch, and that slot carries
   `kitPromptBanner ?? testReleaseBanner ?? planBanner ?? setReleaseDateBanner`.
   Making the timeline the body would have dropped the date form, the "Draft
   the plan" card and the test-release delete exit — each the ONLY path to the
   thing it offers — while the timeline's own empty states are text with **no
   button**. A dateless release would have read "Set a release date first" with
   nothing to tap. The banner is hoisted above the body now and renders for the
   MAIN VIEW, whichever that is; it stays suppressed over the named scenes,
   because a "Draft the plan" card on top of the Metadata scene is noise.
2. **The timeline renders BARE as the main view**, not through
   `ReleaseScenePanel`. That wrapper adds a "Timeline for <release>" heading and
   a back control, both wrong on the view you land on — there is nothing to go
   back from, and the release header directly above already names the release.
   The buckets have always been chromeless for the same reason.
3. **Phases now default EXPANDED** (`collapsed[phase] ?? false`). They shipped
   collapsed, which was fine for a scene you chose to open and is exactly wrong
   for a landing view: replacing five closed drawers with four closed drawers
   would have answered nothing. The narrow week list always rendered expanded
   and needed no change — it is also the better half of this feature, and the
   one the founder's phone actually gets (grouped by week, a "This week" pill,
   overdue flagged, an unscheduled section below).
4. **The rails hide for the timeline, and that is load-bearing rather than
   cosmetic.** Its grid/list swap is a container query at 34rem; leave the two
   release rails in (220 + 24 + 24 + 220 = 488px) and a 1280px desktop hands
   the timeline ~450px, silently degrading the week GRID to the phone's
   vertical list. `hideRailsForLayout` is `panelBody !== 'activities'` now.
5. **One resolver, three consumers.** `resolvePanelBody` in `lib/scene-cache.ts`
   is what the body (WorkspaceView), the lit pill (TasksPanel) and the reserved
   layout (WorkspaceSkeleton) all read, so they cannot disagree — the drift this
   module already exists to end. It never returns null: an absent, unknown or
   flag-gated-off param all mean the main view, which is what keeps a bookmark
   to `?scene=timeline` useful after a rollback instead of blank.
   **A real drift was caught mid-build by writing it this way:** the skeleton
   first mirrored the rule as `resolveMainView() !== 'activities'`, which hides
   the rails on `?scene=activities` where the real view shows them. Both now
   evaluate the identical expression.
6. **The menu slot swapped rather than gaining an entry.** `RELEASE_MENU_ORDER`
   is a closed union pinned by tests, and `'timeline'` became `'activities'` at
   the same rank: that slot has always pointed at whichever of the two views you
   are NOT looking at. It is gated on the timeline flag either way — flag off,
   the timeline is unavailable AND the buckets are already the default, so
   neither belongs. Same for the desktop pill, which now reads "Activities".

### Smaller decisions

- **The Motion bar follows the main view**, not the bucket list. It was hidden
  "while a scene is open" on the reasoning that it describes the ACTIVITY list;
  it describes the release, the founder's screenshot leads with it, and removing
  it from the landing surface was not part of the ask.
- **"New activity" follows the main view too** — gating it on `activeScene`
  would have hidden it on `?scene=activities`, the one view it most belongs to.
- **`suppressEmptyState`** lets the timeline drop its own empty states when a
  banner above already says the same thing and carries the button. Only ever
  true as the main view; opened as a scene there is no banner, so they stay.
- **`BackToMainView`** (was `BackToActivities`) derives its label, and
  `PlanScene` carries its own copy of that control which had to move with it —
  a control promising "Activities" that hands you a week grid is a lie.

### Verified

2571 tests (13 new in `scene-cache.test.ts`), `eslint .` at **exactly** the
measured clean-tree baseline of 3 errors / 78 warnings with **zero** new
findings, `tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code** in
BOTH flag states with `/auth`, `/onboarding`, `/settings` and `/dashboard` all
still `○ Static` in each. Compiled CSS checked rather than trusted from source:
the `@container (min-width:34rem)` rules driving `.tl-grid-view` /
`.tl-list-view` survive, and the skeleton's literal width classes are present —
its legend placeholders were briefly written as interpolated `w-${n}`, which
Tailwind cannot extract, so they would have rendered at zero width.
**Mutation-tested:** making `resolveMainView` ignore the flag, and making
`resolvePanelBody` stop falling back, each fail four named tests.

### NOT verified, and it is the whole risk

**Nothing has rendered in a browser, and the timeline never has.** This sandbox
cannot mint an authenticated session and has no route to app.urganize.app. The
banner hoist in particular has no unit test and cannot have one — this repo has
no component tests (node environment, no jsdom) — so it rests on a traced read
of the JSX. Do NOT try to prove the flag state by grepping the client bundle:
both ternary branches compile in, a false positive this file records five times.

### Activation

Merged with the flag OFF, so nothing changes for anyone at merge. Flip
`NEXT_PUBLIC_FEATURE_TIMELINE=true` on the Vercel `Web` project with a commit
that touches `apps/web` (the `turbo-ignore` trap); the ledger entry and version
bump land **at the flip, not at merge** — the EPK precedent, and the right call
for a view no one has seen.

**Manual pass at the flip, which is the only real verification:** open a real
release and check the week list on a phone and the grid on desktop; a DATELESS
release still offers the date form; a PLAN-LESS one still offers "Draft the
plan"; a TEST release still offers its delete exit; tap an activity and tick it
off in the pop-up; switch to Activities from the menu and back.
