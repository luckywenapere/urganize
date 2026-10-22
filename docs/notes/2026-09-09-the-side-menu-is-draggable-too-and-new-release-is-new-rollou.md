# The side menu is draggable too, and "New release" is "New rollout" (2026-09-09, v1.34.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: make the side menu adjustable like the UrgAns window, horizontal axis
only, and change the copy from "new release" to "new rollout". Two unrelated
asks in one message; the first is the one with consequences.

**No migration, no route, no new flag** — the card is already behind
`NEXT_PUBLIC_FEATURE_IDENTITY_PANEL`, and the rename is copy.

### The width contest is now two-way, and that is the whole of it

The rail's own module already argued why its maximum exists: it is a flex
SIBLING of `<main>`, and two release scenes swap layout on CONTAINER queries of
that centre column (Content at 45rem, Timeline at 34rem), so a column dragged
too wide silently degrades a week grid into the phone list on a desktop.
Making the OTHER column draggable turns that one-way reservation into a
negotiation, and getting it wrong is invisible on screen.

1. **`resolveRailBounds`'s second parameter is a WIDTH now, not a boolean.**
   `IDENTITY_PANEL_TOTAL = 272` was fine while the card was a fixed 240px; a
   card dragged to 420 leaves it under-reserving by 148px, and every one of
   those pixels comes out of `MAIN_MINIMUM`. **It was also 32px short at 240
   all along**, having counted the card's `mr-8` and forgotten its `ml-8` —
   both are real horizontal space, which is why `sidebarTotalWidth` exists and
   why nothing should hand this function a hand-built number.
2. **`MAIN_MINIMUM` moved into `lib/layout-columns.ts`.** It was private to
   `lib/rail-width.ts`, and a second copy in the sidebar's module is exactly
   the drift this repo keeps correcting. One floor, two columns that respect it.
3. **THE TWO CONSTRAINTS SETTLE RATHER THAN OSCILLATE, and the reason is that
   every clamp only ever shrinks.** Worked through at the tightest real case,
   1280px with both columns present: open the rail against a 420px menu and the
   menu's max drops to 304, so it shrinks; the rail's own max then recomputes
   against 304+64 and lands on 320; `<main>` comes to rest at exactly 560. No
   feedback loop, because nothing in either direction ever grows a column.
4. **`lib/sidebar-width.ts` is deliberately NOT one parameterised module with
   the rail's.** They share the floor and nothing else: opposite edges, so
   opposite drag signs; different ranges, because a nav column and a
   conversation column want different amounts of room; and only one of them
   collapses. A "which edge" flag threaded through every function is how the
   sign gets flipped by accident, which is the single failure the rail's module
   already singles out for a test. Both directions are now pinned, and a test
   asserts they run opposite ways.
5. **The menu reserves the rail's RAW stored width, not the rail's clamped
   one.** They converge on the next frame, and while they disagree this
   over-reserves — which is the safe direction, since it shrinks our own
   maximum rather than main's floor.

### Six things worth knowing before editing the control

0. **UNTIL THE VIEWPORT IS MEASURED, the stored width renders UNCLAMPED — and
   this one was a real defect caught in review rather than a precaution.** A
   viewport of 0 means "not known yet", not "too small", and the locked
   fallback's `max` is the MINIMUM, so clamping against it painted the card at
   208px and jumped it to 240 the moment the measure effect landed. **The rail
   never had to deal with this because it is CLOSED on first paint**; this card
   is visible immediately. The handle is withheld while unmeasured either way,
   so there is nothing to drag against a bound nobody has worked out yet.
1. **NO `relative` on the `<aside>`.** It is already `sticky`, which is a
   positioned ancestor, so the handle anchors to it as it is. Adding both
   leaves which one applies up to Tailwind's utility ordering — and losing
   `sticky` un-pins the whole card. (The rail's aside carries both and works
   only because Tailwind happens to emit `sticky` last; do not copy that.)
2. **The width transition is removed while dragging.** It animates `width`, so
   every frame would lag the cursor — the same trap the rail records, and the
   most likely way for this to look broken.
3. **The handle is withheld while collapsed**, as well as when the viewport
   cannot pay for any movement: 64px has nothing to grow into, and a control
   that cannot move is worse than none.
4. **The corrective clamp is skipped while collapsed.** The card is 64px then,
   so the stored expanded width is not on screen and must not be rewritten by a
   bound it is not currently subject to — otherwise collapsing on a tight
   viewport would quietly shrink the width the user chose for the expanded one.
5. **`collapsed` moved out of local state into `stores/useSidebarStore.ts`,
   which reverses a documented call.** That note said it stayed local "because
   nothing outside this panel toggles it" — still true of WRITES, and no longer
   true of reads: `ChappiSidePanel` has to know this column's effective width,
   and that is 64px whenever it is collapsed. The storage key and version are
   unchanged, so an existing account keeps its collapsed choice. Writes are
   guarded, because `writePersistedState` does not wrap `setItem` (Safari
   private mode, full quota) and a width that cannot be saved should still
   apply for the session.

**A side effect worth knowing rather than fixing: collapsing the menu now
raises the RAIL's ceiling.** It follows from the reservation being real, and it
is the mechanical version of what the card's own comment already claimed —
that collapsing is the user's own fix for a squeezed centre column.

### The rename, and the keyword it required

"New release" → **"New rollout"** on the topbar pill, the mobile "+"
(aria-label and title), the below-`sm` column button, the create modal's
heading, the UrgAns chip and its tooltip, and the deterministic reply.

**IT IS NOT A GLOBAL FIND-AND-REPLACE, and the two strings left alone are the
line.** The release is still the release — the central object, in the schema and
in every other surface — so `ReleaseCombobox`'s "New release will be created
inline and selected automatically" stays: that hint is about a release RECORD
being created in a picker, not about the CTA. So does the changelog's own
history, which is a log. What changed is the name of the ACTION.

**The functional half: `resolveIntent` matched `'release'` and NOT `'rollout'`,
so renaming the copy alone would have broken a control.** `buildHelpReply`'s
suggestions are clickable and are fed straight back through that function, so
"Create a new rollout" would have answered with the help card it came from —
the "a control that visibly does nothing" failure this repo keeps recording.
`'rollout'`/`'roll out'` are in the release branch now, which also means
someone who reads the new button and types what it says gets the create form.
With the planner ON the planner branch above claims those words first, so the
addition is only ever reached with it off, which is exactly the state that
renders that suggestion. Pinned by a test that asserts the ACTUAL suggestion
string rather than a paraphrase, so renaming the copy again without the keyword
fails there.

**21 comment references to `"New release"` were updated too.** They quote the
control by its label, which is what a future grep for the button hits, and a
stale quoted label is the drift this file records elsewhere (the confirmation
gate named `revoke_epk_link` for months after that tool was deleted).

### Verified

**3012 tests** (27 new: 25 in `lib/sidebar-width.test.ts`, 2 on the rail's new
coupling, 2 on the router keyword), `eslint .` at **3 errors / 80 warnings**
against a measured clean-tree baseline of 3 / 81 — **one FEWER**, and the
per-file diff confirms it is a removal rather than a swap: **zero new
findings**, and the old collapse-hydration effect's `set-state-in-effect`
warning went away when it became a store action. `tsc --noEmit` clean apart
from one pre-existing stale `.next/types/validator.ts` reference to the EPK
route deleted 2026-09-05. `next build` green **by exit code** with the identity
panel and Chappi flags ON and with them OFF, `/auth`, `/onboarding`,
`/settings` and `/dashboard` all still `○ Static` in each — `/settings`
particularly, since the card is mounted app-wide and this added a store read to
it. Compiled output checked rather than trusted from source, this repo's habit
for anything CSS-dependent: `cursor:col-resize`, `touch-action:none` and
`user-select:none` are all in the emitted CSS, and "New rollout" plus the
handle's label are in the client chunks.

**Three mutation passes, each printing `APPLIED` first and each failing exactly
its own tests:** reversing the sidebar drag direction (4), making the rail
ignore the menu's real width (3), and removing the `'rollout'` keyword (1).

**NOT verified, and it is the whole remaining risk: nothing has rendered in a
browser.** This sandbox cannot mint an authenticated session and has no route
to app.urganize.app, so the handle's feel, the two columns settling against
each other, the keyboard path and the double-click reset all rest on unit tests
plus the build. Worth one pass at two widths: drag the menu wider on a 1280px
window with the UrgAns rail open and confirm neither column strands the centre;
collapse the menu and confirm the rail can then go wider; reload and confirm
the width came back. Do NOT try to check the flag from the bundle — both
ternary branches compile in, a false positive this file records six times.
