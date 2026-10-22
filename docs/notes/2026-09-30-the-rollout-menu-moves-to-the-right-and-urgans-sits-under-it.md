# The rollout menu moves to the right, and UrgAns sits under it (2026-09-30, v1.51.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, with a screenshot of Cursor's agent window (the chat in the centre, a
small vertical menu headed "On urganize" at the far right): *"chat should go
under the other right hand menu, ref cursor's ui."* On a desktop two things sat
at the "right hand": the full-height UrgAns card at the far right, and the
rollout's row of pills, a right-aligned row at the top of the centre column with
two more pills in a footer row under the activity list. They are ONE column now:
the rollout menu is a card at its top and the UrgAns chat is directly beneath
it, both on screen.

**Desktop only (lg+).** A phone keeps the folded release menu behind its
hamburger, unchanged in behaviour. **Not a scope expansion, no feature flag, no
migration**: the mobile-scene-nav and back-arrow precedent for a founder-driven
rework of a shipped surface. Revert is `git revert`, and the way to see it
before merging is the PR's Vercel preview.

### What was decided (asked before building)

| Question | Answer |
|---|---|
| Which menu | The rollout pills, including the footer pair (Content, Fan capture) |
| Which chat | UrgAns, not the team Chat |
| "Under" | Stacked, both visible |
| Phones | Unchanged |
| UrgAns closed | The menu stays as a narrow labelled column |
| Menu shape | Two columns of rows while the chat is open, one when it is not |
| New activity | A small button beside the Motion bar |
| Side cards of other rollouts | Removed, with their code |

Defaults chosen without asking, and worth challenging: 208px for the menu-only
width (not the ~256 first quoted), ONE row order shared with the phone, the
header "On {rollout title}", and no rename of the "Chat" row (see Open points).

### Ten things worth knowing before editing this

1. **The layout lives in `components/app/RightRail.tsx`, and it moved there
   verbatim.** The sticky, height-locked column, the viewport measure,
   `--urgans-rail-width`, the drag handle and its keyboard twin. The chat card,
   `ChappiSidePanel.tsx`, is only the card now. The handle is withheld while
   the chat is closed (nothing to resize), and `resolveRailBounds` bounds the
   CHAT's width only: the menu-only column is a fixed `RAIL_MENU_ONLY_WIDTH` =
   208, narrower than the narrowest chat on purpose.
2. **The menu is rendered by `WorkspaceView` and portalled into a slot the
   column exposes.** Share, Change artist and Archive depend on state that
   lives in `WorkspaceView` (the owner check, roster length, recap eligibility,
   the dialogs' open flags, the toast), so a rail-hosted copy would lag the URL
   by a frame and could offer Archive for the wrong rollout. `RightRail` puts
   an empty `div` in the column and hands it to `stores/useRailMenuStore.ts`
   through the store's own `setSlot`, NOT an inline callback: that is a new
   function every render and would unmount the portalled menu each time.
3. **`RolloutMenuPortal` is mounted from exactly one place**: `WorkspaceView`,
   guarded by `isDesktopFocusedMode && isDesktopViewport && scopedReleaseSlim`.
   Not from `WorkspaceDesktopFocused` or `TasksPanel`, which both exist twice
   (the mobile and desktop branches are always both in the DOM and one is only
   CSS-hidden), so a second mount would fight for the slot.
4. **A claim, not a flag.** The column has to know a menu is coming so it can
   size itself, so the portal claims the slot in `useIsomorphicLayoutEffect`
   (before paint, so no frame paints at the old width), and the store keeps a
   LIST of owners keyed by `useId()`: `menuPresent = slot !== null &&
   owners.length > 0`. A list and not a boolean because the skeleton and the
   real menu overlap for a moment during the hand-over, and one of them
   releasing must not collapse the column for a frame. The claim depends on
   there being ROWS: with every optional feature off and no Share, Archive or
   Change artist, an empty menu must not reserve a blank 208px strip. If the
   menu throws, `GiveSlotBackOnCrash` releases the claim.
5. **One answer for the column's width, shared with the side menu.**
   `railColumnWidth({ chatOpen, menuPresent, chatWidth })` is the chat's width,
   or 208, or 0, and `railColumnTotal` adds the 32px gutter only above zero.
   `WorkspaceIdentityPanel` reads the same two functions, so the left card and
   the right column cannot disagree about how much room the column takes.
   **Consequence, planned and accepted:** at 1024 to 1279px, with a rollout
   scoped, the left card now steps aside whenever the column is on screen, where
   it used to step aside only while the chat was open. There is no room for a
   304px card and a 240px column beside a workspace that needs 560.
6. **The transition rule.** The width animates only when the column stays
   visible across the change. Opening a rollout mounts the menu, and a 280ms
   slide there would reflow `<main>` frame by frame and flip the timeline and
   calendar container queries mid-animation, so a change of `menuPresent` alone
   is instant; the chat opening or closing keeps its slide exactly as the old
   rail had it. It is state adjusted DURING render (`seen`) rather than a ref or
   an effect: a ref read in render is a lint ERROR in this repo's config, and an
   effect would paint one frame with the wrong answer first.
7. **The chat card stays mounted while closed**, `invisible` + `inert` +
   `aria-hidden`, never `display: none`: the transcript's scroll, the upload and
   recap cards and any reply still on its way live in it. **`RightRail` must NOT
   call `useSearchParams`.** It is mounted app-wide, and that hook in a
   statically prerendered client component bails the page out to its nearest
   Suspense boundary, which is what keeps `/auth`, `/onboarding`, `/settings` and
   `/dashboard` `○ Static`. Everything URL-shaped lives in the menu, which
   `WorkspaceView` renders. The rail is imported statically (so the slot is in
   the server HTML as a closed, zero-width element); the heavy chat card is
   still its own `dynamic({ ssr: false })` chunk.
8. **Two boundaries, one per card.** A chat crash closes the chat
   (`CloseChatOnCrash` subscribes to the open state, so the topbar icon does not
   reopen an empty hole) and leaves the menu standing. The menu has its own
   boundary because it is portalled OUT of the workspace but is still a React
   child of it, so a throw in the menu would otherwise take the whole
   workspace's boundary with it.
9. **One builder for the phone's list and the desktop's card.**
   `lib/rollout-menu.ts` (`buildRolloutMenu`, pure, flags passed in so its tests
   need no `stubEnv`) returns the ordered rows, and `useRolloutMenuActions` maps
   them to icons and click handlers (it is `moreMenuActionsRaw` extracted from
   `TasksPanel`, not rewritten). Both surfaces call it with a `variant`, and the
   only difference is the Notes row: "Note this" with `&new=1` on a phone,
   "Notes" as a plain link (`/dashboard/notes?release=<id>`) on a desktop.
   **The desktop order changed**, from sharing `RELEASE_MENU_ORDER`: Activities,
   Chat, Content, Pitch, Metadata, Notes, Cover art, Song, Files, Share, Fan
   capture, Change artist, Archive. Chat, Content and Pitch moved up, and
   Metadata, Cover art, Song and Files moved down. **Content and Fan capture now
   stay visible while a scene is open**; the old footer row hid them.
10. **Two columns of rows while the chat is open.** With the chat open the
    column is 320 to 720px wide and the chat needs about 22rem of its height, and
    thirteen rows in one column would leave it roughly 273px on a 900px-high
    window. The slot is capped at `clamp(9rem, 100% - 22.75rem, 50%)` (the chat's
    `min-h-[22rem]` plus the 0.75rem the menu card carries below itself) and the
    card scrolls inside it. The card is padded in on the left (`pl-3`) because the
    drag handle's 12px hit area runs the column's full height and would otherwise
    sit over the icons of the first rows.

### The width budget, and why 208

The drag bounds and `MAIN_MINIMUM` = 560 are unchanged. What is new is a budget
pinned in `lib/layout-columns.test.ts`, from `appFrameWidth`
(`min(1440, viewport - 2 * clamp(24, 3vw, 56))`) and the container-query
thresholds in `globals.css` (544px for the timeline grid, 720px for the
calendar's):

| Viewport | Main content, chat open | Main content, menu only (208) |
|---|---|---|
| 1024 | 447 | 659 |
| 1280 | about 419 (the rail clamps to 384) | 595 |
| 1440 | 534 (the list, as today) | 746 (the calendar grid, 26px to spare) |
| 1920 | 620 | 832 |

**208 is not a taste number.** It is the side menu's own minimum width, it fits
every label (about 155px needed) and it keeps the Content calendar's month grid
at a 1440 window. 256, the first figure quoted, would have flipped the calendar
to its agenda list there, and a test now fails if anyone raises the number
without noticing. **Accepted regression:** at 1280 with UrgAns CLOSED the
calendar drops to the agenda list (it was a grid, 835px wide, while the rails
were hidden for it); collapsing the left card gives it back.

### What was removed

- The row of pills at the top of `TasksPanel` and its footer row (Content, Fan
  capture), with every pill builder, `showOutboundPills` and the local flag
  constants. `taskPanelPillClass` stays, its one consumer being New activity.
- **The side cards for other rollouts**, with everything only they used:
  `RailColumn`, the three-column grid, `hideRails` / `hideRailsForLayout`,
  `leftRail` / `rightRail`, `onSelect`, and the `panel*Action` props on
  `WorkspaceDesktopFocused` (its Archive, Change artist and Share now arrive
  through the portal). Switching to another rollout is the back arrow to the
  catalog and then a tap.
- **New activity moved** to the right end of the back-arrow and Motion row. It
  shows only while the main view is showing (`resolvePanelBody`), and calls
  `openQuickCreate({ releaseId, source: 'inline' })` as before.

### Loading state

`WorkspaceSkeleton` lost its header pill placeholders, footer placeholders,
rails and `hideRails`, and gained a New activity block on the top row.
`RolloutMenuSkeletonPortal` claims the same slot and draws a placeholder card
with the real card's classes, counting its rows from the REAL builder with the
same flags. Share's presence is known from a flag; Archive and Change artist
depend on data the skeleton does not have and are not reserved, which grows
downward on arrival, the direction this file already prefers. It mounts only for
a focused desktop view on `/dashboard`, because that skeleton is also the
segment fallback for the pages under it, some of which carry a `?release=` of
their own (the notes page).

### Guards and copy

`lib/rollout-vocabulary.test.ts` lists the new menu files and
`WorkspaceDesktopFocused.tsx`, because the labels left `TasksPanel.tsx` and its
own entry would have silently stopped covering them. The rollout tour's menu step
no longer names the press kit, which left that menu on 2026-09-09.

### Open points, and follow-ups

- **The "Chat" row still says "Chat"**, on both surfaces. It is the rollout's
  TEAM chat, and it now sits directly above the UrgAns card with the same
  speech-bubble icon. Renaming it "Team chat" is a one-line change in
  `lib/rollout-menu.ts` and was left for the founder to decide.
- **At 1024 to 1279px the left card is hidden whenever a rollout is open, even
  with UrgAns closed.** The right-hand column, menu-only, is now always there on
  a rollout, and the card has always stepped aside at `lg` to `xl` while a right
  column is on screen, so its links are gone at those widths until the window is
  1280px or wider. The topbar still carries Catalog, UrgAns and (through the
  account menu) Settings, so what has no other desktop route while a rollout is
  open at those widths is **Shows and Directory**. Both are one tap away: the
  back arrow returns to the catalog, where the menu is absent, the column is
  closed and the card comes back (unless UrgAns is open, in which case the card
  has always been hidden at these widths, on any page). This is the price of the
  menu being permanent; it used to need UrgAns open. A follow-up, if wanted, is to
  collapse the card to its 64px rail there instead of hiding it. Measured, that
  keeps the timeline grid from about 1040px (the centre column is 531px at exactly
  1024, 13px under the timeline's 544px threshold) and leaves the calendar as the
  agenda list either way, so it is a real trade rather than a free win.
- `resolveRailBounds` and `resolveSidebarBounds` read the raw viewport and
  ignore the `.app-layout` gutters and the 1440 frame cap, so at 1920 a 720px
  chat leaves `<main>` near 384px. Pre-existing, and out of scope here.

### Verified

`vitest run`: **4877 passed, 30 skipped**, against 4810 on a clean tree, so 67
new tests (the new `rollout-menu`, `rail-menu-store` and `layout-columns` test
files, the extended `rail-width` and `sidebar-width` ones, and six new entries
in the vocabulary guard). `eslint .`: **3 errors / 83 warnings, the same as the
clean tree**, and compared per file rather than by the totals: every file has
the same number of findings as on the clean tree, and the only differences are
line numbers moving with the edits (`WorkspaceView.tsx` carries five, the three
pre-existing ref-in-render errors and two warnings; `WorkspaceIdentityPanel.tsx`,
`ChappiDock.tsx` and `TasksPanel.tsx` one warning each). `tsc --noEmit`: only
the 8 documented `confirmed-action.test.ts` errors. `next build` green **by exit code** with the layout flags on, and with
`/auth`, `/onboarding`, `/settings`, `/dashboard`, `/dashboard/urgans` and
`/locked` all still `○ Static`, and green again with every one of those flags
off. The new arbitrary values were checked in the COMPILED css rather than the
source: Tailwind rewrites the slot's cap to `clamp(9rem,100% - 22.75rem,50%)`,
dropping the inner `calc(`, which is valid inside `clamp`.

**Nineteen mutations, each confirmed applied and each killed by a named test**
(the lit row inverted, the phone and desktop Notes rows swapped, Content hiding
while a scene is open, an empty menu no longer empty, the id not URL-encoded,
two rows ignoring their flags, the menu-only column with no width, an open chat
ignoring its width, the gutter added to an absent column, 208 raised to 240, the
frame cap removed, the main padding forgotten, the slot ignored by
`menuPresent`, a non-idempotent claim, one release emptying every owner, and
three on the on-screen rule below). The harness that ran them prints
`APPLIED` before running and compares the file byte for byte after restoring
it, because a mutation that never landed reads as a survivor.

### Found by looking at it: the harness pass

**The layout WAS looked at, through a throwaway page**, which is the
Share-to-socials precedent and found something the tests could not. A page under
`/pitch/` (AppShell renders that prefix bare, so the page drew AppShell's own
frame classes itself) mounted the REAL `RightRail`, `RolloutMenuPortal`,
`RolloutMenu`, `ChappiSidePanel` and `WorkspaceIdentityPanel` in a fake topbar
and main. The flags were forced through a wrapper that sets `process.env` before
requiring Next's own bin (the preview launcher rejects `--env-file` in
`NODE_OPTIONS`), so no `.env` file was touched. The page, the temporary launch
entry and the stale `.next` are all gone: leaving `.next` behind would leave a
generated type reference to the deleted route, and the next `tsc` would fail on
it.

- **Every width matched the table above, to the pixel**: menu only at 1024, 1280,
  1440 and 1920 gave a centre column of 659, 595, 746 and 832; chat open gave 534
  at 1440 (the default 420px chat) and 419 at 1280.
- **The two-column menu fits at the narrowest chat.** At 320px the columns are
  148px and no label is clipped, "Archive rollout" and "Change artist" included.
- **The drag works**: the handle sits over the column's left edge at full height,
  dragging it left by 151px widened the chat from 320 to 471px, that width was
  saved, and the body cursor reset on release. `End` went to the minimum and the
  handle read `aria-valuenow` 320.
- **The rows behave**: 13 of them in the shared order, `aria-pressed` on the scene
  rows only, Notes a real link to `/dashboard/notes?release=rel-1`, and Share,
  Change artist and Archive with no `aria-pressed` at all. Pressing Song lit only
  Song and put `?release=rel-1&scene=song` in the URL, and pressing it again
  cleared both.
- **The transition rule holds at the class level**: toggling the chat left the
  0.28s width transition on, toggling only the menu removed it.
- **A real regression, found and fixed**: the left card's stored width was
  clamped and SAVED while the card was not on screen. At 1024 to 1279px the
  right-hand column, even menu-only, takes the card's place, but the card's
  effect still ran, so one visit to a narrow window turned a 240px menu into a
  208px one for good. It used to need the chat open at that width; it happens on
  every rollout there now. `sidebarIsOnScreen` in `lib/sidebar-width.ts` is the
  same rule as the card's own `hidden lg:block` / `hidden xl:block`, five tests
  pin it, three mutations (ignoring the competing column, ignoring the collapsed
  exemption, using xl for everyone) each kill exactly their own, and the write-back
  in `WorkspaceIdentityPanel` now waits for it. Re-run through 1440, 1024, 1100,
  1279, 1280, 1920 and back to 1440: nothing is saved and the card is 240px again.
  The guard in the panel is comment-guarded rather than test-guarded, since this
  repo has no component tests.
- **The skeleton card is the real card minus the two rows it does not reserve**:
  414.1px against 482.5px for 13 rows, once its header was matched to the real
  header's measured 24.5px (it was 4px short). The chat card lands at the same
  offset under either.

**A caveat for the next session that uses the Browser pane.** While the pane is
hidden, `requestAnimationFrame`, `ResizeObserver` and CSS transitions do not
run, so a readout driven by any of them goes stale and a `rAF`-based script never
settles (and keeps running in the page after the tool times out, which then
interleaves with the next script). What worked: a fresh navigation per viewport
size, an injected `transition: none` rule, and `getBoundingClientRect` for the
numbers. `tabs_context` says whether the pane is hidden, and `show_pane` cannot
show it (its panes are the diff, a file, the terminal, the PR, tasks, the plan
and artifacts).

### Not verified, and it is the real visual risk

**No real session has seen this.** The pass above used the real column, menu and
chat components, but inside a throwaway page with a faked rollout and faked
callbacks. This sandbox cannot mint an authenticated session and has no route to
app.urganize.app, so what has never run is `WorkspaceView` itself wired to a real
rollout: the real Share, Archive and Change artist dialogs and the owner and
artist-count checks that decide whether their rows show, the slot claim on a real
navigation, and a hard refresh on `?release=` or `?scene=` with the skeleton
handing over to the real menu. Also unseen: the width animation (the pane was
hidden, so transitions did not run, and only the class that switches them was
checked), the phone widths (the menu and column are `lg` and up, and a phone was
not opened), the rollout tour's highlight on the new card, and an UrgAns reply in
flight while the column opens and closes. The PR's Vercel preview is where to
look.

A pass on the preview, in this order: 1024, 1280, 1440 and 1920 with UrgAns open
and closed; toggling UrgAns through the X, the topbar icon and Ctrl/Cmd+J, and
the drag handle present only while the chat is open; every row, including Notes,
Share, Archive and Change artist on an owner account with more than one artist;
a hard refresh on `?release=` and on `?scene=`; an UrgAns draft and a reply in
flight surviving the column opening and closing; each row's flag off in turn
(`CHAPPI`, `TIMELINE`, `RELEASE_CHAT`, and the rest); below 1024, no duplicate
menu; Tour B highlighting the menu card; the tab order (menu, then chat); and
light and dark.

### Merge record

`v1.51.0` (the ledger entry and all 11 `package.json` files) was committed and
merged on 2026-09-30, after a rebase onto #644. The version number was re-read on
`origin/main` immediately before merging, as version numbers on this repo are
perishable.
