# Mobile scene navigation: top tabs + a folded "more" menu (2026-08-16)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request, via screenshot reference (Vercel's `Logs` page: a persistent
tab strip right under the page title, then a search box and a hamburger
control revealing the rest of that page's actions). The old mobile layout —
"every pill in one wrapping block stuck to the bottom of the screen"
(2026-08-14) — is gone below `lg`. **Desktop is untouched**: the header row
and footer row in `TasksPanel.tsx` render the exact same pills in the exact
same order as before this change.

**The new mobile shape, entirely inside `TasksPanel.tsx`. Corrected the same
day (2026-08-17, founder feedback from live use) — the numbers below are the
CURRENT shape, not the shape it originally shipped in; see the correction
notes after each list for what changed and why:**

1. **Top tabs** (a new row, right below the desktop-only header row's
   position, `lg:hidden`): Calendar, Collect metadata, Pitch — all three are
   scene toggles, so all three light up via `aria-pressed` when their scene
   is open, and none of them hides while another is showing (see "Four
   things worth knowing", point 1). Horizontally scrollable
   (`overflow-x-auto` with the usual gutter-matching `-mx-4 px-4` bleed)
   since even three pills, including the long "Collect metadata" label,
   don't reliably fit a 375px screen. **Press kit and Release recap are NOT
   among these** — see the folded menu below.
2. **A standalone row** at the base of the panel (same sticky footer
   position the old dock used, with no border or background of its own —
   see the rectangle correction below) — now just the search and hamburger
   icon buttons that reveal the folded menu (see the sixth correction
   below for why New activity and Pitch, its original two permanent pills,
   are both gone from here).
3. **A folded "more" menu**, entered via a search icon-button or a hamburger
   icon-button at the trailing end of that row (either opens the same panel,
   and NEITHER auto-focuses the search field — see the zoom correction
   below): a search box plus a filterable list holding everything else the
   old dock used to show — Plan (while it exists), Cover art, Song, Files,
   Status update, Release recap, **Press kit**, Fan capture.

**Six corrections made the same day, from live use on a real phone — the
first zoom fix (below) shipped WRONG and had to be corrected again a few
hours later; read the second bullet before touching font sizes here again,
and the fifth before touching `<html>`'s CSS overflow rules:**

- **The search input had `autoFocus`, and on iOS Safari a field under 16px
  zooms the whole page the instant it's focused** — so tapping the hamburger
  (which only meant to open the menu) also zoomed the page. First fix:
  `autoFocus` removed entirely (both trigger buttons now just open the menu;
  the user taps into the field themselves to type), plus the input's text
  size moved from `text-sm` to `text-base` as a second, independent guard.
- **That second guard was wrong and the zoom kept happening.** `text-base` in
  THIS project's own type scale (`packages/config/tailwind/preset.js`) is
  **14px**, not Tailwind's stock 16px — still under the threshold. The real
  fix is `text-lg`, the first step in this preset's scale that actually
  clears 16px (verified in the compiled CSS: `.text-lg{font-size:16px;...}`
  vs `.text-base{font-size:14px;...}`). **Whenever a fix here depends on a
  Tailwind size utility hitting a specific pixel value, check this preset's
  `fontSize` table first — its scale is shifted down from Tailwind's
  defaults across the board, not just at this one step.** Also added
  `touch-manipulation` to both trigger buttons as an independent guard
  against Safari's separate double-tap-to-zoom gesture (unrelated to focus,
  and harmless either way — it doesn't disable pinch-zoom elsewhere).
- **The standalone row (item 2 above) used to carry `border-t
  border-stroke-subtle bg-bg-base`**, which read as a boxed rectangle sitting
  under the pills rather than the pills floating on the page. Dropped
  entirely, matching the top tabs row's own borderless, backgroundless
  treatment.
- **Press kit moved from the top tabs into the folded menu**, paired with Fan
  capture at the end (the two "send this outward" items, the same pairing
  the desktop footer row already keeps them in) — it wasn't reached often
  enough to earn one of the three permanent tab slots.
- **The mobile dock (and the folded menu panel inside it) stopped sticking to
  the screen entirely**, reported the same day a completely unrelated PR
  ("Lock document to vertical panning to stop swipe-induced page drift", #318)
  gave `<html>` an explicit `overflow-x: hidden` for the first time —
  `<body>` already had it and stickiness worked fine, so the regression
  tracks to the ROOT element specifically. This is the textbook WebKit/Safari
  trigger for `position: sticky` breaking on descendants: any ancestor with
  an explicit non-`visible` `overflow`, root included, can do it. Fixed by
  removing `overflow-x: hidden` from the `html` rule in `globals.css` — the
  other two properties that rule added (`overscroll-behavior-x: none`,
  `touch-action: pan-y`) stay, since neither touches the CSS overflow/
  scrolling-box model the way `overflow-x` does (they only govern touch-
  gesture recognition and scroll-chaining at a boundary), and `touch-action:
  pan-y` was already the mechanism that PR's own comment called "the actual
  fix" for the swipe-drift bug in the first place — `overflow-x: hidden` on
  `html` was always the redundant, riskier half of it. **If the swipe-drift
  bug ever reappears, do NOT reach for `overflow-x: hidden` on `html` again
  without re-testing sticky positioning on a real phone first** — the two
  bugs trade off against each other through this exact property.
- **Recap and Pitch swapped places, and New activity was retired entirely
  (later the same day, a founder request rather than a bug fix like the five
  above).** Recap moved from the top tabs into the folded menu — it opens a
  modal, not a scene, so grouping it with the folded menu's other non-scene
  AI action (Status update) reads better than trailing a strip of things that
  DO light up. Pitch moved the other way, from the standalone row into the
  top tabs — it's a scene toggle exactly like Calendar and Collect metadata,
  so it belongs among them rather than in a row of its own. The standalone
  row's other occupant, New activity/Activities, was removed outright rather
  than moved: `MobileNavBar`'s center "+" button — previously always "New
  release" — is now contextual, opening the task quick-create modal directly
  (via `useTaskUI().openQuickCreate`) when `/dashboard?release=<id>` is the
  current URL, and falling back to "New release" everywhere else. A second,
  release-scoped "new activity" entry point in `TasksPanel` itself became
  redundant once the FAB covered it. The FAB reads `?release=` fresh at CLICK
  time via `window.location.search` (the same deliberate, Suspense-free
  pattern `handleUrgAnsClick` in this file already used) rather than
  subscribing reactively, so the ACTION is always correct regardless of
  render timing; its `aria-label`/`title` deliberately stay a static "New
  release" rather than trying to mirror this, since a render-time read of the
  same URL could go stale on the one transition that matters most (scoping a
  release while already on `/dashboard`, a same-pathname `router.replace`
  nothing in this component subscribes to) — a label that's sometimes wrong
  is worse than one that's honestly generic. Losing the "Activities"
  back-from-a-scene affordance costs nothing functionally: every scene's own
  entry point, top tab or folded-menu item alike, is already a toggle, so
  re-tapping it closes the scene just as well (one extra tap for a
  folded-menu item, since that reopens the menu first). Desktop is
  untouched — its header row still renders `activitiesToggleButton`,
  `pitchButton` and `recapButton` unconditionally, exactly as before; none of
  this touches it, since "the plus icon in the middle" only exists in
  `MobileNavBar`, which never renders at `lg`+.

**Four things worth knowing before editing this again:**

1. **The top tabs deliberately do NOT hide while another scene is open**,
   unlike the desktop footer's Calendar/Press kit pair (which still
   disappears while any scene is showing, via `showOutboundPills` — untouched
   on desktop). A tab strip's whole point is that every tab stays reachable
   with the active one highlighted, matching the reference screenshot (all
   tabs visible, "Logs" lit); hiding tabs while browsing one would break that
   metaphor. All three top tabs (Calendar, Metadata, Pitch as of the sixth
   correction above) are scene toggles and so all light up the same way —
   unlike Recap before it moved out, none of them needs special-casing for a
   modal-opening, never-lights-up item any more.
2. **The folded menu's items are DATA, not pre-rendered JSX**
   (`MoreMenuAction = { key, label, icon, onClick, disabled? }`), specifically
   so its search box can filter on a real `label` string. This is also why
   `statusUpdateAction`/`recapAction` — the two AI actions ported from the
   removed release detail page — changed shape: `TasksPanel` used to receive
   them as a single pre-rendered `extraActions: ReactNode` blob from
   `WorkspaceView`; they are now a typed `TaskPanelAction = { label, onClick,
   disabled? }` object each, so this component can place them in whichever
   zone fits the current width (desktop row for both; the folded-menu row
   for both on mobile, as of the sixth correction above — Recap used to get
   a top tab instead) and still have a label to search against.
   `WorkspaceDesktopFocused` forwards the same two objects verbatim
   (`panelStatusUpdateAction`/`panelRecapAction`, the `panelExtraActions` name
   it replaces).
3. **The folded menu's own action list is deliberately NOT memoized.** Each
   entry's `onClick` closes over `toggleScene`, which itself closes over the
   current `activeScene` — memoizing the array on flags/data that don't
   include `activeScene` would risk serving a stale closure (open a
   different scene, then tap a folded item, and it could toggle against a
   scene that is no longer the open one). Eight items at most, so
   recomputing the array every render costs nothing worth guarding with
   `useMemo`.
4. **Plan and Recap are the two folded items this skeleton can't reserve**,
   for the same reason Plan alone was never reserved in the old dock:
   whether either renders depends on release/draft/task data the skeleton
   runs before it has. The search/hamburger icon-button pair IS still
   reserved whenever any of the six FLAG-known items (Cover art, Song,
   Files, Status update, Press kit, Fan capture) exist — Plan's and Recap's
   own presence or absence doesn't change whether those controls belong in
   the row, only whether tapping them turns up one of the two data-dependent
   items.

**Reused, not rebuilt:** every underlying feature flag, scene-toggle function
(`toggleScene`), and eligibility rule (`showPlanPill`, `isRecapEligible`) is
untouched — this is a pure repositioning of existing buttons across zones,
not a new capability. The one genuinely new piece of wiring is
`MobileNavBar` reaching `useTaskUI()` for its FAB — an existing, already
app-wide mechanism (`NotificationsBell.tsx` already consumes it the same
way), not a new store or a new prop threaded through `AppShell`. No new
flag, no migration, no ledger entry (internal chrome rework, not a v1 scope
item).

### Song became a bottom-bar tab (2026-08-30)

Founder: on mobile, put Song in the bottom navigation bar, after the plus
button and before "You" — "it's currently hidden inside the menu." It was
reachable on a phone only from the folded "more" drawer. Same class of change
as the pass above (chrome repositioning, no new flag, no migration, **no
ledger entry**), so the same rules apply; four things about it are worth
knowing:

1. **`MobileNavBar` now reads `useSearchParams`, and it MUST stay inside its
   own `<Suspense>`.** Song is a release SCENE, not a global page, so this is
   the one tab whose destination depends on the URL. That hook in a statically
   prerendered client component bails out to the nearest boundary, and this bar
   is mounted app-wide by `AppShell` including on `/settings` — the
   `ScopedArtistLine` pattern in `WorkspaceIdentityPanel`, for the identical
   reason. Verified: `/auth`, `/onboarding` and `/settings` are still
   `○ Static` in both flag states. Do not lift the hook into the bar body; the
   two click handlers deliberately read `window.location.search` at click time
   instead, and that is not an inconsistency — they need one answer on demand,
   this tab needs a subscription.
2. **The tab renders in every case, scoped or not** — `?release=<id>&scene=song`
   when a release is scoped, the catalog otherwise (which is where you pick
   one). A tab that appeared only while scoped would reflow the whole bar on
   every scope change, which is the same layout shift the Pitches tri-state
   read already avoids.
3. **It STAYS in the folded menu — this is an addition, not the MOVE that
   Calendar and Press kit made.** The bar is gated on
   `NEXT_PUBLIC_FEATURE_MOBILE_NAV` and the folded menu is not, so emptying the
   menu would tie Song's mobile reachability to a second flag and leave a
   viewport/flag band with no entry point at all — the compounding failure
   recorded under "Crossing between the two portals", which this repo has
   already shipped once.
4. **Seven slots is the ceiling, and it is now measured rather than assumed.**
   All four optional tabs at once (Song + Notes + Pitches) gives 375 / 7 =
   ~53px per slot against a widest label of "Pitches" at ~45px and a 48px
   center button. An eighth needs a different shape for that bar, not another
   `flex-1`.

**Not verified:** nothing rendered on a phone — this sandbox cannot mint an
authenticated session and has no route to app.urganize.app — so the tab rests
on the build gates plus the compiled bundle carrying it. Note the usual trap
applies here too: grepping the client chunks for "Song" proves nothing about
the flag, since both ternary branches compile in.

**Verified:** `vitest run` (687 passing, unchanged — no test exercises this
mobile chrome directly), `eslint .` (0 errors, 59 warnings — unchanged
baseline), and `next build` green with every relevant pill flag ON and with
them all OFF, confirmed by grepping the flag-on client bundle for the top tab
and folded-menu labels (including "Press kit" landing in the TasksPanel chunk
rather than the top-tabs' three) and confirming `autoFocus` no longer appears
anywhere in that same chunk. The `text-lg`-not-`text-base` fix, and the
sticky-positioning fix, were both confirmed against the actual COMPILED CSS,
not just the source class/rule: `.text-lg{font-size:16px;...}` vs
`.text-base{font-size:14px;...}`, and the compiled `html{...}` rule confirmed
to no longer contain `overflow-x` while still carrying `overscroll-behavior-x`
and `touch-action` — the same verification method is the one to reuse if a
CSS-dependent fix here is ever doubted again. The sixth correction (Recap ↔
Pitch swap, New activity retired) was verified the same way: `vitest run` and
`eslint .` unchanged, `next build` green in both flag states with `/auth` and
`/settings` still `○ Static`, and the flag-on bundle confirmed to still
contain "Pitch" and "New release" (the FAB's now-static label). **Not
verified:** nothing has run in an actual mobile browser — the corrections
above (the zoom, twice; the sticky positioning; the rectangle; the
reordering; the sixth correction's tab swap and FAB retargeting) came from
the founder's own live use or from static/build-time checks, which is not
the same as tapping through the actual mobile chrome; there may be more of
it. Worth one real device or narrow-viewport pass before calling this
settled — in particular, the FAB's contextual behavior when scoping/
unscoping a release while already on `/dashboard` (the one transition its
own click-time-fresh-read design is built to get right) has not been
exercised on a real device.

### The search button searches activities now (2026-08-31, v1.12.0)

Founder, with a screenshot of Vercel's mobile search overlay as the reference:
*"On the mobile hamburger menu search should not show when that menu is open at
all — only clicking on search opens the search function… (search should be able
to search for tasks)."*

**The two icon buttons at the base of the mobile dock opened the SAME panel**,
and that panel carried a search box above the menu list — so the only thing
"search" could ever match was those eight menu labels. A release has 64-113
activities and not one of them was findable. Now they are two surfaces: the
hamburger opens the menu and only the menu, with no field in it; the search
button opens a field over real results.

**Not a scope expansion and no new flag** — the same chrome-repositioning
footing as the 2026-08-16 redesign this corrects, and search is deliberately
UNFLAGGED because it searches activities every scoped release has rather than a
gated feature. Revert is `git revert`.

**Six things worth knowing before editing this:**

1. **The ranking lives in `lib/task-search.ts`, not in the component, because
   that is where tests can reach it.** `vitest.config.ts` collects
   `lib/**/*.test.ts` and there are no component tests in this repo, so inline
   ranking would have been untestable. Three tiers: title starts with the query,
   then every term somewhere in the title, then every term across title +
   description. Terms are whitespace-split and order-independent, so "art cover"
   finds "Cover art final approved" — the playbooks' titles are long phrases and
   remembering their word order is not something to require. **Mutation-tested:**
   dropping the starts-with tier, dropping the done-last tiebreak, and making an
   empty query match everything each fail exactly the one test written for them.
2. **Tier 2 (description) exists because the playbooks put the useful words in
   the body** — "Begin curator outreach", "split sheet" — so a title-only search
   misses activities a manager remembers by their content. It ranks last so a
   body mention never outranks a name, and a row that got in that way shows its
   first body line so it can say why it is there.
3. **Completed activities sort after live ones WITHIN a tier, never across
   tiers.** A playbook release accumulates dozens of done rows that would
   otherwise crowd out live work; but the tiers are about what was typed, so a
   done title match still beats a live description match. Both halves are
   pinned.
4. **An empty query returns NOTHING and the surface says "Type to find an
   activity."** Painting the unfiltered list would make the search surface
   indistinguishable from the buckets above it and from the menu the founder
   asked to separate it from. `parseSearchTerms` returning `[]` is the contract
   that enforces it — `matchesSearchTerms` also refuses to match on no terms, so
   the release-tool half cannot drift the other way.
5. **`autoFocus` is BACK on this field, and it is safe only because the field is
   `text-lg`.** It was removed 2026-08-17 when the field was 13px and focusing
   it on open zoomed the page on iOS; the zoom needs a font under 16px, and
   `text-lg` is the first step in THIS preset that clears it (`base` is 14px
   here — a previous fix shipped as `text-base` and the zoom kept happening). A
   button labelled Search that opens a field you must then tap is half a
   control. **If this field's size is ever reduced, remove `autoFocus` in the
   same edit.**
6. **The bucket line on each result is derived from the SAME grouping pass the
   buckets render from** (`sectionKeyByTaskId`, built off `sections`), so a
   result's "Overdue" can never disagree with the list the user closed to
   search.

- **The panel stays at the bottom of the screen**, unlike the reference
  screenshot's top-anchored overlay. The dock is thumb-reachable, and moving a
  phone's primary control into the top corner is the exact thing
  `NEXT_PUBLIC_FEATURE_MOBILE_NAV` exists to undo. It is also not a modal: no
  Escape handler, no scroll lock, no new z-tier — the repo's Escape contention
  and scroll-lock-skews-measurements traps are both avoided by construction.
- **One `openMobilePanel` selector rather than two booleans**, so the menu and
  the search cannot both be open — they occupy the same slot, and two at once
  would stack into a full-screen sheet nobody designed.
- **Group headings ("Activities", "Release tools") render only when BOTH kinds
  of result are present**, since a heading exists to disambiguate and there is
  nothing to disambiguate with one group. The reference has none at all.
- **The skeleton's two dock circles now follow different rules** (the
  loading-skeleton-sync rule): search is reserved unconditionally, because it
  renders whenever the release has an activity and a playbook release has
  64-113, while the menu keeps its flag-known check. A genuinely activity-less
  release briefly reserves one 32px circle that never arrives — the same
  magnitude of imprecision Plan and Recap already accept there.
- **Verified:** 1873 tests (22 new in `lib/task-search.test.ts`, three of them
  mutation-tested), `eslint .` at the exact measured baseline (3 errors / 70
  warnings, all pre-existing in `WorkspaceView.tsx`) — one new warning appeared
  and was fixed rather than accepted: an `eslint-disable` for
  `jsx-a11y/no-autofocus`, a rule this config does not enable, so the directive
  itself was dead. `next build` green **by exit code** with every folded-menu
  flag on and with them all off, `/auth`, `/onboarding`, `/settings` still
  `○ Static` in each, and the search copy confirmed present in the compiled
  client chunks.
- **Not verified:** nothing has rendered on a phone. This sandbox cannot mint an
  authenticated session and has no route to app.urganize.app, so the layout, the
  keyboard's interaction with a bottom-anchored panel, and `autoFocus` against a
  real iOS Safari all rest on unit tests and the build. **`autoFocus` is the one
  thing worth checking first** — if tapping Search zooms the page, that prop is
  the cause and removing it is a one-line follow-up.

### It searches pages too, and the catalog got its own bar (2026-08-31, v1.13.0)

Founder, immediately after the split above: *"Actually that search should be able
to search for any page at all then a search bar at the top of the catalog view
this one actual bar to be able to search for releases — label as so 'search
release'. That search bar at the top should also be visible on desktop view of
catalog."*

Two separate things, and the distinction between them is the design:

- **The mobile dock's search** gained a third result group, **Pages**. It is a
  palette: it lives behind an icon, appears on demand, and answers a question.
- **The catalog** gained an always-visible **"Search release"** bar that FILTERS
  the release list in place. It is not a palette; it is a control that belongs
  on screen with the list it narrows.

**Seven things worth knowing before editing either:**

1. **`lib/app-pages.ts` exists for its KEYWORDS, not its labels.** A manager
   hunting for their card details types "billing", and no page in this app is
   called that — it is a section inside Settings. Label-only matching would
   answer "No matches" to a query the product can absolutely satisfy. Same for
   "setlist" → Shows and "assistant" → UrgAns. If a page grows a section people
   will search for by name, the keyword goes here.
2. **It is deliberately NOT merged with `lib/prefetch-routes.ts`**, which lists a
   subset of the same destinations. Prefetching spends bytes on a metered
   connection so it warms only the primary nav; search costs nothing per entry so
   it should reach everything reachable. "Should this be warmed?" and "should
   this be findable?" are different questions and the two files say so in each
   other's headers.
3. **`/admin` is absent from the page catalog, as a decision.** Its availability
   comes from the workspace-identity payload, which 404s when
   `NEXT_PUBLIC_FEATURE_IDENTITY_PANEL` is off — so an `isAdmin` read there would
   be false in a default deployment and the entry would be *unreliable* rather
   than merely restricted. It is internal, reachable by a couple of accounts, and
   already pinned in their side menu.
4. **`searchReleases` returns the list UNCHANGED for an empty query — the exact
   opposite of `searchTasks`, and the difference is load-bearing.** The bar
   filters a list the user is already looking at, so an empty box means "no
   filter" and the catalog has to be all of it. The activity palette appears on
   demand, so an empty box there means "nothing asked for yet" and returning
   everything would duplicate the list underneath it. Mutation-tested in both
   directions.
5. **The filter is applied ONLY at the two catalog call sites, never to
   `releaseCards` itself.** That array also feeds `selectedCard`, `leftRail` and
   `rightRail`, so filtering it would make a scoped release vanish from its own
   focused view while somebody typed, and empty the rails beside it.
6. **The no-match state is ONE node passed to both catalog components** via a new
   `emptyState` prop on `ReleasesColumn` and `WorkspaceDesktopGrid`. Without it
   both fall through to their built-in "No releases yet / create your first
   release", which is a lie to someone who has nine releases and mistyped. One
   node means the phone and the desktop cannot word a search miss differently.
7. **`autoFocus` is on the dock's field and deliberately NOT on this bar**, and
   the reasoning is opposite rather than inconsistent: tapping a Search *button*
   is an unambiguous "I want to type", whereas this bar is simply present on the
   page, and stealing focus on arrival would put the phone keyboard over the
   catalog every time the app opened.

- **Where the bar renders, and why once.** `WorkspaceView` mounts it a single
  time above BOTH viewport branches rather than inside each. The branches are
  separate DOM subtrees (`lg:hidden` / `hidden lg:block`), so one bar per branch
  would be two copies of the markup and two copies of the state — the drift class
  this file keeps correcting. Its gate reads "neither branch is showing a focused
  release, and there is at least one release to find" rather than duplicating
  either branch's own test, which differ (mobile needs the release to resolve,
  desktop needs its card too).
- **Full width below `lg`, centred and capped at `lg`+.** The mobile catalog is
  full-width rows, so a full-width bar matches them; the desktop catalog is a
  centred grid, and `WorkspaceDesktopGrid`'s own history records that
  left-anchored chrome above that centred row "read as misaligned" (founder call,
  2026-07-23). `shrink-0` is on the wrapper because below `lg` it is a flex child
  beside a `flex-1` sibling — without it a short viewport compresses the field
  below its own `h-11`, the same failure `taskPanelPillClass` documents for pills.
- **No release-count threshold on the bar.** The ask was for a bar at the top of
  the catalog; hiding it below some number of releases would be second-guessing
  that. It is gated only on there being at least one release, because searching
  an empty catalog is meaningless and the "No releases yet" state owns that
  screen.
- **A verification claim I got wrong, recorded rather than quietly dropped.** I
  expected the flag-gated page entries to be stripped from the flag-off bundle by
  dead-code elimination, and checked for it. They are NOT: `"set list"`, a string
  unique to `lib/app-pages.ts`, is present in one chunk with
  `NEXT_PUBLIC_FEATURE_EVENTS` off. **So the bundle grep cannot verify this
  gate** — the fourth time this file has had to record that a bundle grep is a
  non-signal for a flag. The gate is a runtime `if` and the proof is
  `lib/app-pages.test.ts`, which re-imports the module with stubbed env and
  asserts BOTH states; that is stronger than a grep would have been anyway. The
  cost of the strings surviving is a few hundred bytes of generic product words.
- **Verified:** 1902 tests (29 new across `lib/app-pages.test.ts` and
  `lib/release-search.test.ts`), `eslint .` at the exact measured baseline (3
  errors / 70 warnings, all pre-existing in `WorkspaceView.tsx`) with zero new
  findings, and `next build` green **by exit code** with the page flags on and
  off, `/auth`, `/onboarding`, `/settings` still `○ Static` in each.
  **Mutation-tested:** making an empty query return nothing, and deleting the
  title-contains tier, each fail exactly the test written for them — and the
  second of those needed a NEW test first, because the original "title beats
  artist" case used a starts-with match and so pinned tier 0 against tier 2 while
  leaving tier 1 free to collapse into tier 2 unnoticed.
- **Not verified:** nothing has rendered in a browser at either width. The
  catalog needs an authenticated session this sandbox cannot mint, so the bar's
  placement above a centred grid, the count line, and the no-match state all rest
  on unit tests and the build.

### The top tabs are gone; the menu holds everything (2026-08-31, v1.14.0)

Founder: *"Remove all top menu pills in mobile view and put them in the hamburger
menu. In an order that makes sense to the user based on previous usage data."*

The mobile top-tabs strip — Timeline / Content / Metadata / Pitch, permanent tabs
since 2026-08-16 — is deleted. Those four are entries in the release menu at the
base of the panel, ranked among the ten already there. **Desktop is untouched:**
the same buttons still render in its header row (and Content in its footer row),
in the same order. No new flag, no migration; revert is `git revert`.

**THERE IS NO USAGE DATA, and the order does not pretend there is.**
`captureAnalyticsEvent` sends to PostHog and otherwise appends to the VIEWER'S
OWN localStorage, and `NEXT_PUBLIC_POSTHOG_KEY` is unset in production (recorded
here 2026-08-24) — so no click has ever been counted, the events that do exist
are readable only by the person who generated them, and nothing server-side
records a scene open. The ranking therefore rests on the two proxies that ARE
real and checkable, both argued in `lib/release-menu.ts`'s header: the founder's
own placement decisions across five rounds of correction (which items he promoted
to a tab, which he demoted, and the reasons he gave), and how often a rollout
returns to each surface, taken from the playbooks' own tag counts across
single_v0.3's 64 activities — marketing 37, followup 19, planning 16,
distribution 11, editorial 9, asset_production 9, analytics 7, event 5,
release_day 3. **If PostHog is ever switched on, this list is what real numbers
should be checked against.**

**Six things worth knowing before editing this:**

1. **Removing the strip stranded nothing, and that is the check to repeat.**
   Every scene renders inside `ReleaseScenePanel`, which brings its own heading
   naming the scene AND its own "Activities" back control at every width — so the
   tabs were neither the way out of a scene nor the only label saying which one
   was open. What is genuinely lost is switching scene A → scene B in one tap;
   that is two now (open the menu, pick).
2. **The strip never worked as designed anyway.** Four tabs needed roughly 356px
   against the ~343px a 375px phone offers, so it scrolled horizontally — the
   fourth was always off the side, which is not the "every tab visible at once"
   bar it was modelled on. The 2026-08-31 rename to "Metadata" bought ~50px and
   was not enough. Bringing it back means re-solving that.
3. **The ORDER lives in `lib/release-menu.ts`, not in the component**, so vitest
   can pin it — this repo has no component tests, the same reason `task-search`,
   `app-pages` and `release-search` are all lib modules. `ReleaseMenuKey` is a
   closed union, so **an entry with no ranked position fails the type-check**:
   verified by mutation (adding a `'brand-new-unranked-scene'` key produced
   `error TS2322` on that array). That compile-time refusal is what stops the
   next scene being appended to the bottom by default.
4. **The sort is belt-and-braces, not load-bearing today.** The component's array
   is already written in canonical order, so removing `orderReleaseMenu` would be
   a behavioural no-op right now and no test would catch it — said plainly rather
   than implied. What the sort buys is the future case: an entry inserted next to
   a related one still comes out where it was ranked.
5. **The open scene's row lights up** (`aria-pressed` + `bg-brand/10` + a brand
   icon), which is what the tabs used to carry. Only the scene toggles set it —
   the four modal actions (Status update, Recap, Change artist, Archive) open
   something over the page, so there is no open scene for a lit row to report,
   and `isActive` is left undefined rather than false so the attribute is omitted
   instead of announcing them as unpressed toggles.
6. **The list cap is `max-h-[50dvh]`, replacing a fixed `max-h-60`** (240px, about
   five rows). The list is up to fourteen entries, so the cap decides how much of
   the ranking is visible without scrolling. **`dvh` and not `vh`** — on a phone
   `vh` is the LARGE viewport, so a `vh` cap overshoots the space actually on
   screen, the same unit that had the UrgAns composer drifting for eight PRs.

- **A side benefit worth knowing:** the four folded-in scenes are now findable in
  the mobile SEARCH surface, which matches `moreMenuActions` on label. As top
  tabs they were in no searchable collection at all, so typing "timeline" or
  "content" found nothing.
- Two labels were corrected in the same pass, both narrower than what they open
  since v1.13.0: the menu trigger reads **"Release menu"** rather than "More"
  (it is no longer an overflow), and the search trigger matches its own field's
  "Search activities, tools and pages".
- **`WorkspaceSkeleton` moved with it** (the loading-skeleton-sync rule): the
  top-tabs placeholder row is deleted, and the menu trigger's flag-known check
  now spans all ten flag-gated entries rather than the six that used to be
  folded — leaving Timeline/Content/Pitch/Metadata out of it would have
  un-reserved the trigger in exactly the flag combination production runs
  (calendar + metadata on, the asset flags off).
- **Verified:** 1911 tests (9 new in `lib/release-menu.test.ts`), `eslint .` at
  the exact measured baseline (3 errors / 70 warnings, all pre-existing in
  `WorkspaceView.tsx`) with **zero** new findings, `tsc --noEmit` clean apart
  from the documented pre-existing `confirmed-action.test.ts` errors, and
  `next build` green **by exit code** with every release-scene flag on and with
  them all off, `/auth`, `/onboarding`, `/settings` still `○ Static` in each.
  **Three mutation passes**, each failing exactly its own target: unranked keys
  sorting to the front (1 test), no sort at all (4 tests), and the unranked-key
  type refusal above. Compiled output checked rather than trusted from source —
  `max-h-[50dvh]`, `bg-brand/10` and `text-brand` are all in the emitted CSS,
  and the removed row's distinctive wrapper classes (`overflow-x-auto px-4 pb-3
  pt-1`) appear in **zero** client chunks.
- **Not verified:** nothing has rendered on a phone. This sandbox cannot mint an
  authenticated session and has no route to app.urganize.app, so the menu at
  fourteen entries, the `50dvh` cap against a real viewport, and the lit row all
  rest on the build plus unit tests. **Do not try to check this from the bundle:**
  "Timeline" and "Content" survive in the chunks either way, because the desktop
  pills use the same strings.
