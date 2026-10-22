# The UrgAns rail is draggable (2026-09-07)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **AMENDED 2026-09-30.** The rail is one column with two cards now, the rollout
> menu on top and the chat under it, and the layout code below moved verbatim
> into `components/app/RightRail.tsx` (the chat card, `ChappiSidePanel.tsx`, is
> only the card). Two things changed and everything else still holds. The
> handle is withheld while the chat is closed, and `resolveRailBounds` bounds
> the CHAT's width only: with the chat closed the column is a fixed 208px menu
> that is not subject to them. Points 1 to 6 below still describe the chat.

Founder: make the AI window adjustable in width. The rail was a fixed
`clamp(360px, 31vw, 460px)`, which is a thin strip on a 2560px monitor and a
third of the screen on a 1280px laptop. Its left edge is a drag handle now,
and the width is remembered per browser. No migration, no route, no new flag
(the rail is already behind `NEXT_PUBLIC_FEATURE_CHAPPI`).

**Six things worth knowing before editing this:**

1. **THE MAXIMUM IS NOT A TASTE DECISION.** The rail is a flex SIBLING of
   `<main>`, not an overlay, so every pixel it takes comes out of the release
   view — and two scenes swap layout on CONTAINER queries of that centre
   column: the content calendar at 45rem (`.cc-scene-container`) and the
   timeline at 34rem (`.tl-scene-container`). A rail dragged too wide silently
   degrades a week grid into the phone list on a desktop. `MAIN_MINIMUM = 560`
   in `lib/rail-width.ts` is what keeps that off the default path. The
   documented trap ("the rails narrow the column without narrowing the
   viewport") is now something a user can do on purpose.
2. **`resolveRailBounds` takes `hasIdentityPanel` from the CALLER**, because
   `WorkspaceIdentityPanel` hides ITSELF between lg and xl while the rail is
   open (`railIsCompeting`). Reserving its 272px in that band would compute the
   maximum against a column that is not on screen.
3. **The width transition is REMOVED while dragging.** The `<aside>` carries
   `transition-[width,...]` at `duration-slow`, so every frame of a drag would
   lag a third of a second behind the cursor. This is the single most likely
   way for the feature to look broken, and it is one ternary.
4. **`PANEL_WIDTH` is gone, replaced by one `--urgans-rail-width` custom
   property.** It was a module const read in two places with a comment saying
   the two must never drift; a variable is the version of that which cannot.
   The drag writes that property directly and commits to React state ONCE on
   release, so a 120Hz drag is one style write per frame rather than one
   render per frame.
5. **The store write happens on drag END only.** `writePersistedState` does not
   guard `setItem`, so a per-frame write would hammer storage and throw on a
   full quota or in Safari private mode — hence the try/catch in
   `setRailWidth`, and `hydrateRailWidth` as a separate action for AppShell so
   reading a value does not immediately write it back.
6. **A stored width is validated against the ABSOLUTE range, then clamped to
   the viewport's.** A width saved on a big monitor is legitimate; rendering it
   on a laptop is not. The correction is written back to state as well as to
   the screen, or the next drag would start from a number nothing agrees with.

- **Pointer Events with `setPointerCapture`**, one path for mouse, touch and
  pen. A pointer leaving the window keeps sending events; `pointercancel`
  (an OS gesture stealing the pointer) COMMITS what the user last saw rather
  than snapping back, because the cancel was not theirs.
- **The handle is a `role="separator"`** with live `aria-valuenow/min/max`.
  Arrows move 16px, shift-arrows 64px, Home and End jump to the stops, Enter
  or Space resets to the default — the keyboard twin of the double-click
  reset. `preventDefault` fires only once a key is known to be ours, so Escape
  and Tab still belong to the page.
- **The handle is withheld entirely when `bounds.resizable` is false** (below
  lg, or a viewport too small to satisfy both minimums). A control that cannot
  move is worse than no control.
- **Verified:** 2864 tests (20 new in `lib/rail-width.test.ts`), `eslint .`
  byte-identical to the measured clean-tree baseline (3 errors / 81 warnings,
  all pre-existing) with **zero** new findings, `tsc --noEmit` clean apart from
  the documented pre-existing `confirmed-action.test.ts` errors, and
  `next build` green **by exit code** with the assistant flag on and off,
  `/auth`, `/onboarding`, `/settings` and `/dashboard` all still `○ Static` in
  each. Compiled output checked rather than trusted from source:
  `cursor:col-resize`, `touch-action:none` and `user-select:none` are all in
  the emitted CSS, and the custom property and the separator label are in the
  client chunks. **Three mutations, each killing exactly its own tests:**
  reversing the drag direction, dropping the clamp, and making the storage
  validator accept a numeric string.
- **A DRAG HAS NOW BEEN PERFORMED, in production, 2026-09-08.** The founder
  dragged the rail's left edge and it resized. That retires the "no drag has
  ever been performed" line this bullet carried at merge, and it settles more
  than the gesture: the handle rendered at all (so `resolveRailBounds` returned
  `resizable` at that viewport), the pointer capture fired, and the width
  followed the cursor — which is the transition suppression working, since with
  it left in the aside would have lagged a third of a second behind and read as
  broken. It was also the check that proved main's tip was live at all (see the
  deploy note under Deployment), so one drag answered two questions.
- **Still unexercised, and now the whole remainder:** the keyboard path (tab to
  the handle, arrows, shift-arrows, Home/End, Enter to reset), the double-click
  reset, whether a stored width survives a reload, and the re-clamp when the
  window shrinks below what the stored width allows. Also unseen at 2560px,
  where the maximum rather than the minimum is what binds. None of it rests on
  nothing — `lib/rail-width.test.ts`'s 20 cases cover every decision those
  paths make — but the wiring from a keypress to a committed width has not run.
