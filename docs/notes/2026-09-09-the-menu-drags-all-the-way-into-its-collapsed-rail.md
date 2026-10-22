# The menu drags all the way into its collapsed rail (2026-09-09, v1.38.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, the day after the menu became draggable: *"make it so it is
collapsible up until it's in collapsed view - remove teamate and release count
from there as well so it matches closed and open, then team names and artist
should be on the same line as the logo, horizintally so it all matches closed
and opened"*.

Three asks, one theme: **the expanded card and the collapsed rail should read as
one thing in two sizes.** No migration, no route, no new flag — the card is
already behind `NEXT_PUBLIC_FEATURE_IDENTITY_PANEL`.

### The first ask REVERSES a decision recorded a day earlier, deliberately

`lib/sidebar-width.ts` said of `COLLAPSED_SIDEBAR_WIDTH`, in as many words,
that it is **"NOT a bound: a collapsed card is not resizable at all (64px has
no room for a label to grow into)"**, and the handle was gated
`!collapsed && bounds.resizable` to match. Both halves are now reversed on a
founder call, and the constant's comment records the reversal rather than being
edited into looking like it always said this — the old reasoning was sound, and
it is still exactly what keeps the card from rendering at any width in between.

**Five things worth knowing before editing this:**

1. **ONE threshold serves both directions.** `SIDEBAR_COLLAPSE_AT = 160`:
   cross it moving left and the card becomes the rail, cross it moving right
   and the rail comes back at `MIN_SIDEBAR_WIDTH`. A separate expand threshold
   would give the control hysteresis nobody asked for and two numbers to keep
   in step.
2. **It sits BELOW the minimum, not at it**, so collapsing takes a clear 48px
   overshoot rather than happening to anyone who drags the card as narrow as it
   goes. Through that overshoot the card is pinned at 208 and then snaps — it
   is never drawn in between, which is `MIN_SIDEBAR_WIDTH`'s own reasoning
   ("a worse version of the collapsed icon rail it already offers") doing its
   original job rather than being overridden.
3. **A COLLAPSED STATE CARRIES NO WIDTH.** `SidebarState` is a union
   (`{collapsed:true} | {collapsed:false; width}`), not a `{collapsed, width}`
   pair, and that is the point of it: the width the user dragged to has to
   survive a collapse so expanding restores it rather than the default, so a
   collapsed result that carried a width would be the one shape able to clobber
   it. Mutation-tested.
4. **A drag STARTS from what is on screen.** For a collapsed card that is the
   rail's own 64px, never the stored expanded width — otherwise the first pixel
   of movement jumps the card to a width the user cannot see. It is also why a
   nonsense coordinate returns the start state **unchanged** rather than
   clamping it: clamping 64 lands on the minimum and silently expands a card
   nobody touched. That one has its own test, and the mutation for it kills
   exactly that test and nothing else.
5. **The crossing goes through React; the width does not.** The drag still
   paints a CSS variable per frame, but a collapse is a change of SHAPE rather
   than of width, so `previewCollapsed` state is set on a CROSSING only — at
   most twice per gesture. Without it the card would sit unchanged under the
   pointer and only snap on release, which is not what "collapsible up until
   it's in collapsed view" describes.

The keyboard got the same twin (`sidebarStateFromStep`), because otherwise the
gesture would be reachable with a pointer and not without one on a control that
is deliberately keyboard-operable everywhere else: one step narrower than the
minimum collapses, widening out of the rail returns, and `End`/`Home` are now
the two real ends of the range. It does not reuse the drag's overshoot — a
keypress is deliberate where a drag can be a slip. `aria-valuemin` is the
rail's width now rather than `MIN_SIDEBAR_WIDTH`, which is simply honest: the
bottom of this control's range moved.

**The handle stays withheld when the viewport cannot pay for any movement**,
and that case needs no special pleading: it is also the case where expanding is
impossible, so nothing is lost but the footer's collapse button.

### One shared mark, which is what the other two asks really wanted

The counts paragraph is gone, and the logo, team name and artist are one
`flex items-center gap-3` row at the collapsed state's 40px mark. That left the
two branches rendering the same thing, so they now genuinely are the same
thing: `TeamMark` is one implementation with a `className` for the collapsed
`mx-auto`. `min-w-0` on the text column is load-bearing — without it the column
takes its content's width and pushes the mark out instead of truncating.

**The dedup proved itself in the lint numbers rather than by inspection:** the
file went from five findings to one, and the whole repo from the measured
3-error/81-warning baseline to 3/77. Two of those four came from collapsing two
`<img>` copies into one. The other two came from a real bug the copies were
hiding — **`// eslint-disable-next-line` was sitting above a two-line
explanation, so it landed on a comment and suppressed nothing while the rule
fired anyway.** Both original copies had it. The directive has to be the line
DIRECTLY above the element; the explanation goes above the directive.

Also fixed in passing: the panel's own JSDoc had drifted **above the helper
functions**, so it read as documentation for whichever one came first, and it
still promised "a couple of at-a-glance counts" (just removed) and pointed at
"Settings -> Workspace identity" (renamed Profile by the 2026-09-09 positioning
pass). Moved to the function it documents and corrected.

`WorkspaceSkeleton` needed no change, checked rather than assumed: it reserves
only the identity panel's PRESENCE (breakpoint shifts for its own release
rails), never the identity block's internals. The in-file skeleton branch is
what the loading-skeleton-sync rule applies to here, and it moved to the same
row shape.

### Verified

**3131 tests** (net +12: 18 new, 6 retired with `sidebarWidthFromDrag`), so a
baseline of **3119**. Re-measured on the merged tree, and the numbers here are
NOT the ones this work was verified against before merging — three PRs landed on
`main` while the branch was open (#571's rollout rename, #572's Pitching page,
#573), which is also why it ships as v1.38.0 rather than the v1.36.0 it was
written as. The delta is derived rather than stashed this time, and it is safe to
derive: `lib/sidebar-width.test.ts` is the ONLY test file that differs from
`main`, at 37 tests against its 25. `eslint .` at **3 errors / 77 warnings**
against a measured 3/81 — measured on this tree by swapping `main`'s copy of the
panel in, linting it (5 findings), and swapping mine back (1), confirming the
change is a reduction rather than a swap and **zero** new findings.
`tsc --noEmit` clean apart from the documented
pre-existing `confirmed-action.test.ts` errors. `next build` green **by exit
code** with the identity panel flag ON and OFF, `/auth`, `/onboarding`,
`/settings` and `/dashboard` all still `○ Static` in each — `/settings`
particularly, since this added state to a component mounted app-wide, and the
`ScopedArtistLine` Suspense isolation that keeps those static was left alone.
Compiled chunks confirm the panel's counts copy is gone rather than merely
hidden. One "active rollout" string does survive in the bundle and is a
different surface — `DashboardPageClient`'s own line, the LegacyDashboard kept
as the documented revert path — so grep for it expecting exactly that one hit.

**Five mutations, each printing `APPLIED` first and each killing exactly its own
tests:** the collapse comparison reversed, the threshold moved up to the
minimum, a collapsed outcome carrying a width, a nonsense coordinate clamping
instead of holding, and the keyboard step's direction flipped while collapsed.

**A probe error of my own, recorded because the shape recurs.** A first pass
reported `space-y-1.5` MISSING from the compiled CSS and nearly sent me fixing
a non-bug: the probe matched `.<class>{`, and `space-y-*` compiles as
`.space-y-1\.5>:not([hidden])~:not([hidden]){…}` — a child selector, so the
pattern could never match. Same class of mistake as the multi-byte
box-drawing grep this file already records. **Check what the utility actually
compiles to before believing it is absent.**

### Not verified

**Nothing has rendered in a browser.** This sandbox cannot mint an
authenticated session and has no route to app.urganize.app, so the feel of
dragging into the rail and back out, the live crossing under the pointer, the
one-row identity block at the 208px minimum, and the keyboard path all rest on
unit tests plus the build. Worth one pass: drag the menu's right edge left until
it collapses, drag it back out, and confirm the width you had before the
collapse is what returns.
