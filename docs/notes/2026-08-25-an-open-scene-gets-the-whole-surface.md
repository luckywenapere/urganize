# An open scene gets the whole surface (2026-08-25)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **SUPERSEDED 2026-09-30, for Fault 1's mechanism.** The release rails, the
> `hideRailsForLayout` decision and `WorkspaceSkeleton`'s mirror of it are all
> deleted: the side cards they held were removed, so an open scene has the
> centre column to itself by construction and there is nothing left to hide.
> The width it needs is a budget now, pinned in `lib/layout-columns.test.ts`.
> Fault 2 (the link-card button row's `sm:shrink-0`) is untouched.

Founder, next day, screenshot of Collect metadata on a desktop: "fix this bug on
desktop view." Two faults, both width, one screenshot.

### Fault 1: two empty rails were holding half the surface

`hideRailsForLayout` in `WorkspaceView.tsx` dropped the release rails for the
UrgAns rail and for `?scene=calendar` **and nothing else** — on the recorded
reasoning that "the other scenes fit the normal centre column, so they leave the
rails alone (founder call)". They do not. At xl+ the two rails plus their gaps
take `220 + 24 + 24 + 220 = 488px`, so a 1280px viewport with the identity card
on leaves a scene about 450px, and `RailColumn` renders an **empty
`<div aria-hidden>`** when a rail has no cards — which is every rail on a
one-release account. Nearly half the surface was blank while an 8-field form was
crushed beside it. It is now `Boolean(activeScene)`: any open scene, same
treatment.

Three things worth keeping about that:

1. **The rails' documented purpose is about the release-CARD view** — "so the
   centered card sits in the middle, not flush against the viewport edge". A
   scene REPLACES the activity list with a working surface (a form, a month
   grid, a file list, a press-kit preview), and every one of those wants the
   width more than a sibling release card does. The back arrow and the catalog
   are still one press away.
2. **`Boolean(activeScene)`, never the raw URL param.** `activeScene` is already
   flag-gated, so a stale `?scene=capture` with that flag off correctly counts
   as no scene and keeps the rails.
3. **`WorkspaceSkeleton` had to move in the same commit** (the
   loading-skeleton-sync rule): it computed the same decision from its own
   calendar-only copy, so a refresh on any other scene URL painted 3-column
   rails that vanished the instant data resolved.

### The consolidation that made fault 1 safe to fix

That skeleton mirror would have been the FOURTH hand-rolled copy of the same
four-flag expression (`WorkspaceView` for the scene body, `TasksPanel` for which
pill is lit, `WorkspaceSkeleton` for the layout). They had **already drifted** —
TasksPanel's copy was missing `'song'` and `'coverart'` long after the real gate
had them, which its own comment admitted. So it now lives once, as
`resolveActiveScene` in `lib/scene-cache.ts` (the shared floor its header already
claims to be), and all three callers use it. A layout decision computed two ways
is exactly the bug class this fix is about.

**It gates only four scenes, deliberately.** `metadata` / `files` / `epk` /
`pitch` / `plan` are NOT gated there, matching the behaviour it replaces exactly:
those gate themselves inside `ReleaseScenePanel` and their own pills, and adding
them would change which scenes RENDER rather than consolidating a check. A test
asserts they stay open with every gated flag off, so adding one has to break that
test on purpose. Mutation-tested: deleting the calendar gate fails the suite.

### Fault 2: `sm:shrink-0` made `flex-wrap` dead code

The link card's button row is `flex flex-wrap gap-2 sm:shrink-0`, and those two
classes contradict each other: `flex-shrink: 0` pins the group at its ~350px
max-content width, so at any width ≥ `sm` it can **never** wrap — it overflows
instead, and gets clipped mid-word ("Regener…" in the screenshot). The row was
latent before and became a hard clip when the three closed cards landed the day
before with `overflow-hidden` on each.

Fixed with the precedent already recorded for TasksPanel's pills (2026-08-10):
the group loses `sm:shrink-0` so it can narrow, and each button gains
`shrink-0 whitespace-nowrap` so they move whole onto a second row rather than
compressing and breaking their own labels inside a fixed `h-9`. The URL beside
them is `flex-1` with a 0 basis, so it absorbs none of the shrinkage and keeps
truncating.

**Three identical copies**, all fixed together: `MetadataSection`, `EpkSection`,
`CaptureSection` are byte-identical in this row. Leaving two of them would be the
drift this file keeps having to correct.

**`AssetUploadControl` carries the same `sm:shrink-0` and was deliberately left
alone** — different shape (a `<select>` label sibling, not a truncating URL), a
different failure width, and `NEXT_PUBLIC_FEATURE_FILES` is off in production. It
is the same latent class if anyone widens this later.

### Verified

1278 tests (4 new in `lib/scene-cache.test.ts`, plus the calendar-gate mutation
test above), `eslint .` at the exact 3-error / 66-warning baseline (all three
errors pre-existing in `WorkspaceView.tsx`), `next build` green **by exit code**
with `/auth`, `/onboarding`, `/settings` still `○ Static`. Compiled output
checked rather than assumed — the repo's own habit for anything CSS-dependent:
the link-card `sm:shrink-0` string is down to **one** occurrence in the client
chunks (AssetUploadControl, as intended), the new wrapping button class is
present, and `.shrink-0{flex-shrink:0}` / `.whitespace-nowrap{white-space:nowrap}`
are both in the compiled CSS.

**Not verified:** none of it has been seen in a browser. The workspace needs an
authenticated session with a real release, which this sandbox cannot mint, and it
has no network route to either urganize domain. Both faults are layout-only over
unchanged handlers, so the risk is visual. Worth one live pass: open Collect
metadata on a desktop and confirm the scene now spans the full centre with no
empty columns beside it, that all three link buttons are whole, and that closing
the scene brings the release rails back.
