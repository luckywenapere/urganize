# Two guided tours (2026-09-09, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request, alongside the rollout rename: show a new manager around
instead of leaving them to find out. Two short Bitwarden-style walkthroughs —
a spotlight cutout, an anchored card, "1 of 3", Next and Skip — behind
`NEXT_PUBLIC_FEATURE_TOURS`, default `false`. **No migration, no route, no new
table**: "seen" is one localStorage key per account per tour.

- **Tour A (catalog)** runs ONCE per account, unasked, on the first visit to
  `/dashboard` in a session.
- **Tour B (rollout)** is OFFERED, never auto-run: an inline card after
  **Approve plan**, which is the moment a release becomes a rollout. It
  replaces the `NewReleaseGuide` banner while the flag is on; flag off, that
  banner is byte-identical to before.

Both are replayable from the `?` help menu (`md+`) and Settings → Account —
the second is what makes replay reachable on a phone, the same reasoning that
put issue reporting there.

### Most of this was already built, and reusing it is the point

`#569`'s pullout system solves three of the four hard problems an overlay has,
and the tours reuse rather than re-derive:

- **`placeHelpTip` (`lib/help-tip-position.ts`) IS the placer.** It already
  prefers a side, flips when there is no room, clamps to a viewport margin and
  never returns a negative offset, and it has its own tests. `TourOverlay`
  calls it with `prefer: 'bottom'`. **Do not write a second one** — a duplicate
  over the same function is the drift this repo keeps correcting.
- **`HelpTip.tsx` is the model for the DOM traps**, both of which it records by
  name: portal to `document.body`, and reposition on **capture-phase** scroll.
- **`lib/help-copy.ts` is the precedent for copy living in `lib/`** with a
  guard over it — vitest reaches `lib/` and nothing else, so copy inline in a
  `.tsx` is copy no guard can hold. The steps live in `lib/tours.ts` for that
  reason, and `lib/tours.ts` is in `rollout-vocabulary.test.ts`'s guarded list.

**What `HelpTip` does NOT do, and the reason this exists at all:** it is
explicitly not a modal — no backdrop, no spotlight, `pointer-events-none` —
because it answers "what is this field" on demand. A tour answers "where am I,
what do I do first", unasked, once. They compose; neither replaces the other.
**Watch the copy overlap:** `help-copy.ts` already explains the side-menu rows
on hover, and Tour A's first two steps sit on those same anchors. The tour
points and moves on; it must not restate the pullout.

### Eight things worth knowing before editing this

1. **"On the catalog" is true by construction, not by matching a pathname.**
   `useCatalogTourAutoStart` is mounted in `WorkspaceView`, not `AppShell`, and
   that placement is the decision: it needs the scoped rollout, its activity
   count and the release list to build the contextual last step. It also
   handles a thing that would otherwise be wrong — `#568` made UrgAns the
   post-auth landing, so a first-run user does not arrive at the catalog at
   all until they tap, and a tour keyed on "landing" would fire on the wrong
   page or never.
2. **Every input to `decideCatalogTourAutoStart` is a reason NOT to start**, so
   it fails toward silence: flag off, already seen, auth unresolved, a curator,
   releases not loaded, another modal holding the body scroll lock, or an
   UrgAns conversation already in progress. That last one matters — the
   assistant is itself an activation path and must not be talked over.
3. **Seen is marked at START, not at finish.** A tour somebody walks away from
   mid-way has still been offered, and re-offering it on the next navigation is
   exactly the interruption this feature exists to avoid. Replay is how they
   ask again. **The consequence, accepted rather than engineered around:** a
   tour whose steps all fail to resolve is burned. It cannot really arise —
   Tour A's first two anchors are nav chrome that exists wherever the overlay
   is mounted, and Tour B is offered from inside the scoped rollout whose panel
   carries its anchors.
4. **The last step of Tour A is contextual**, resolved by
   `resolveCatalogTourCta` in precedence order: plan the scoped rollout
   (planner on, nothing scheduled yet), create the first one, or just open one.
   So it hands off into real work rather than ending on a shrug. Planning beats
   creating, and a mutation reversing that fails a named test.
5. **The backdrop swallows a click and does not skip.** A tour is three steps
   and an accidental tap losing it is worse than a stray click doing nothing;
   Skip is right there and says what it does. Escape does skip.
6. **No body scroll lock**, unlike every dialog in this app — the anchors live
   in scrollable panels and `scrollIntoView` has to work. Z-tiers are
   `z-[210]`/`z-[211]`: above sheets (170) and toasts (200) so neither can
   cover the card, below the heavy dialog tier so anything the user
   deliberately opens wins.
7. **A running OR requested tour holds back the first-release prompt.**
   `useFirstReleasePrompt` gained both halves: `tourBlocking` (subscribed) on
   the ARMING effect, so the ~30s countdown starts after a tour ends rather
   than running underneath it, and `tourBlocksPrompts()` as a fifth fire-time
   guard. `pendingReplay` counts, because the prompt must not fire into the gap
   between asking for a tour and landing where it runs.

### Anchors

`data-tour="…"` is a new convention — none existed before. Eight names, listed
in `TourAnchor`, carried by `MobileNavBar` (via a new optional `dataTour` prop
on `NavTab`), `AppTopbar` (both Catalog branches, all three UrgAns renderings,
the "You" link, both create buttons), `WorkspaceIdentityPanel` (derived in the
row renderer from `TOUR_ANCHOR_BY_HREF`), `PlanReleaseCard`, `TasksPanel` (the
`<aside>`, the mobile hamburger and the desktop pill row) and
`WorkspaceReleaseCard`. Several are carried in more than one place on purpose —
`pickVisibleAnchor` takes whichever one is actually on screen at the width the
tour is running at, which is what makes the same step work on a phone and at
`lg+` without a viewport branch. **They are inert with the flag off**, which is
why they are unconditional markup rather than gated.

### Verified

3190 tests, of which 27 are new in `lib/tours.test.ts` (written red-first), `eslint .` at
**3 errors / 78 warnings** against a baseline of **3 / 77** measured on a clean
`origin/main` worktree — the one new warning is `TourOverlay`'s portal mount
guard, byte-identical in shape to the finding `DeleteReleaseDialog` already
carries, and there are **zero** new errors. `tsc --noEmit` clean apart from the
documented pre-existing `confirmed-action.test.ts` errors. `next build` green
**by exit code** in BOTH flag states, with `/auth`, `/onboarding`, `/settings`
and `/dashboard` all still `○ Static` in each.

**Four mutations, each killing exactly the tests written for it** and each
printing `APPLIED` first, per the standing lesson that a mutation which never
landed is indistinguishable from a survivor: dropping the seen check (1),
making `decideCatalogTourAutoStart` ignore `bodyLocked` (1), demoting the CTA's
planner branch (2 — its own case plus the precedence one), and making
`pickVisibleAnchor` accept a zero-size rect (1). The file was restored
byte-identical after each, checked with `diff` rather than assumed — an earlier
attempt at this let three mutations stack, which made the failure counts
cumulative and meaningless.

**One defect caught in review rather than by a test, worth recording:**
`useCatalogTourAutoStart` first used the latest-ref pattern, which is a
`react-hooks/refs` ERROR in this config (a ref assigned during render). Every
input is a dependency now instead, which is cheap — `attempted` short-circuits
the effect after the first go and `consumeReplay` is a no-op with nothing
parked — and it removes a ref that had to be kept in step with props for no
gain.

### NOT verified, and it is the whole risk

**Nothing has rendered in a browser.** This sandbox cannot mint an
authenticated session and has no route to app.urganize.app, so the spotlight,
the card placement against real anchors, the capture-scroll reposition and both
replay paths all rest on unit tests plus the build. Do not try to prove the
flag from the bundle — both ternary branches compile in, a false positive this
file records six times.

**Manual pass at the flip, which is the real verification:** a fresh account
lands on UrgAns, taps through to the catalog and gets Tour A; its last step
opens the intake or the create modal; the first-release prompt does NOT appear
during it and does appear ~30s after it ends; approve a plan and the offer card
shows instead of `NewReleaseGuide`; replay both from the `?` menu on a desktop
and from Settings → Account on a phone.

### Activation

Merged flag-off, so nothing changes for anyone at merge. Flip
`NEXT_PUBLIC_FEATURE_TOURS=true` on the Vercel `Web` project with a commit that
rebuilds `apps/web` (the `turbo-ignore` trap — a version bump suffices, since
`apps/web/package.json` is part of that package). **The ledger entry and the
version bump land AT THE FLIP, not at merge** (the EPK precedent), and the
right entry is about what a person sees: a short guide showing them around the
first time.
