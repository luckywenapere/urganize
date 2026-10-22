# Chappi, the mascot (2026-08-30, v1.9.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The character from `chappi-model-sheet-v1.html` (Draft 01, Aug 2026), built as
one shared component and wired to real states. **Not a scope expansion:**
nothing new is stored, no route is added that a customer reaches, and no line
moves off the out-of-scope list — this is chrome on surfaces that already
shipped, the same footing as the mobile scene-nav rework and the
Collect-metadata cards. **No feature flag** (the same founder-driven-UX-rework
precedent), no migration, and no new dependency.

`packages/ui/src/Chappi.tsx` plus `chappi-constants.ts`, both exported from the
package index. Six poses — idle, pointing, thinking, celebrating, carrying,
resting.

**Every path, transform, colour and weight is copied from the sheet.** Nothing
is redrawn and nothing is approximated, so the proportions it states hold
exactly: outline 0.047 H = 7, mouth 0.054 H = 8, ear cup 0.31 H = 46, eye width
0.23 H = 34, eye centres 0.38 H = 56, body 1.70 H = 252, eye line 58% of body,
mouth line 77%, hover gap tip-to-shadow 0.23 H = 34, smallest legible size 64px
wide. If the sheet is revised, re-copy from it rather than nudging numbers.

**Seven things worth knowing before editing this:**

1. **The hands are ONE mitten placed by the sheet's own transform strings**
   (`translate(76,250) rotate(-12)`, and so on), not twelve baked paths. The
   sheet says a pose differs only in eyes, mouth and hand TRANSFORMS, and
   keeping them as transforms is what makes that literally true in the code —
   a new pose is three strings, which is the whole reason he has no arms.
2. **The shadow is part of him, not decoration.** `<ellipse cx=200 cy=372
   rx=76 ry=13>` at 45% black under a `feGaussianBlur` — the sheet's part 05,
   "he hovers, one shadow ellipse drops him onto any surface", and the reason
   the hover gap is a stated proportion. It rides INSIDE the float group, as
   in the sheet, and its blur is static: nothing here animates a filter.
3. **That filter is the only reason the component is `'use client'`.** An SVG
   filter needs an id, and the id has to be per instance: a shared literal
   works until the FIRST instance unmounts, at which point every later one
   silently loses its blur and hardens into a black ellipse — and two Chappis
   sit in the DOM at once wherever this repo splits mobile and desktop
   branches by CSS. `useId` is the fix and `useId` is a hook.
4. **Which is why the plain data lives in `chappi-constants.ts`.** A client
   module's exports reach a Server Component as opaque client references, not
   values, so a server-rendered page importing `CHAPPI_POSES` from
   `Chappi.tsx` gets a proxy it cannot map over. `/admin/chappi` is exactly
   that case and it broke the first time this was tried — the page rendered
   its nav and nothing else. Keep new constants in the constants file.
5. **The viewBox is the sheet's pose box with the hero's lower edge**, and
   `overflow: visible` on top. Neither box the sheet draws contains every
   pose: the pose box (`66 60 268 330`) crops the shadow's blur, and BOTH
   crop pointing's raised hand, which reaches x≈357 — visibly clipped in the
   sheet's own pointing card. Every pose shares this one box deliberately, so
   swapping one for another cannot resize him or shift the layout around him.
6. **`EmptyState`'s `mascot` prop is opt-in per call site, and that is a
   correctness guard rather than a style choice.** That component backs eight
   empty states and two can be on screen at once: an account with no releases
   has an empty releases column AND an empty activity list. Rendering him
   inside `EmptyState` unconditionally would put two on one screen. For the
   same reason `TasksPanel` shows him only alongside the SCOPED wording — no
   release scoped means no release list beside it that could be full.
7. **Celebrating sits on the Motion readout, deliberately NOT in a toast or a
   sheet.** Task completion already has a three-way contest for the one bottom
   surface (cover art ask, then the check-in, then the undo toast — see
   `useTaskStore.completeTask`), and a fourth claimant would either lose every
   time or push a real question off screen. `ReleaseDeliveredMark` holds the
   "every activity done" rule ONCE so the mobile strip (`WorkspaceView`) and
   the desktop one (`WorkspaceDesktopFocused`) cannot disagree. A release with
   no activities is not delivered: 0 of 0 is empty, not finished.

**On our dark theme his hood disappears, and that is correct.** `bg-bg-base` in
dark is `rgb(13,18,14)` — byte-identical to the ink he is outlined in — so he
reads as a floating cream face with the spring ear rings marking the hood. That
is exactly how the sheet's own pose cards render him (`#101710`, flat, no
glow), so no glow container is used at any in-app placement. `CHAPPI_GLOW` is
the sheet's hero stage gradient, exported for a surface that wants that
treatment; note it is a dark green wash, NOT flat forest, because forest at
full strength behind an ink hood fights the outline it is meant to reveal.

**Where he is wired:** thinking replaces the `Loader2` spinner in the UrgAns
transcript (page, dock and rail); idle on the assistant page's empty landing
(page variant only, joining the existing `flex-1` region rather than becoming a
third one — the two-region split is what three rejected attempts landed on) and
beside the onboarding greeting on step 0; resting on the releases empty state
(mobile column and desktop grid), the scoped activities empty state and the
notes empty state; celebrating at 100% Motion. `pointing` and `carrying` are
built and previewed but placed nowhere — they are for marketing surfaces.

**One copy fix the sheet forced.** Its voice rules bind every string rendered
next to him, and one of them is that he never says "workspace" ("that word
stays out of anything a customer reads"). Onboarding's signup branch said "A
few questions before we set up your workspace." Both branches now say the
authed-setup branch's line, which was already true and already clean.

**Preview:** `/admin/chappi` — all six poses at 64, 96 and 160, the dark
surface with the stage gradient, and a static row. Internal, like the rest of
`/admin`; it reads no data, so unlike its neighbours it has no backing API
acting as the guard.

- **Verified:** 1718 tests, `eslint .` at the exact measured baseline (3 errors
  / 66 warnings, all pre-existing in `WorkspaceView.tsx`, confirmed by linting a
  stashed tree), homepage lint clean, and `next build` green **by exit code**
  for both apps with `/auth`, `/onboarding`, `/settings` and `/admin/chappi` all
  `○ Static`. Rendered in a real headless Chromium and compared side by side
  against the sheet's own pose grid, served locally and screenshotted: all six
  poses match, on both the cream and the dark ground, with the onboarding
  placement checked at 900 and 375.
- **Not verified:** the four authenticated placements — the UrgAns thinking row,
  the assistant empty landing, the two empty states and the delivered mark —
  have never rendered, because this sandbox cannot mint a session and has no
  route to app.urganize.app. They rest on the component being proven, the build,
  and traced call paths. Worth one pass: ask UrgAns something and watch the
  spinner row, then finish the last activity on a release and check the Motion
  strip.
