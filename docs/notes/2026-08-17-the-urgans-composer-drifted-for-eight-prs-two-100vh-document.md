# The UrgAns composer drifted for eight PRs: two `100vh` document floors (2026-08-17)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, on a phone: *"the app is still allowing me scroll with the chat bar
scroll with the page it should be stationary and sticky."* Eight PRs had
already touched this surface (#305, #309, #312, #324, #326, #327, #328, and
this one). **Every one before this adjusted vertical distribution INSIDE an
already-scrollable document; none removed the scroll.** That is the whole
lesson, and it is why the fix turned out to be nowhere near the component
anyone kept editing.

- **The composer is not `sticky` and never was.** There is no `sticky`, `fixed`,
  `bottom-*`, `vh` or `dvh` class anywhere in `ChappiConversation.tsx`. The
  composer is a plain `<div className="mt-3 shrink-0">`, the last flex child of
  a column sized by `.chappi-shell-height-nav`
  (`height: calc(100dvh - 10.25rem - safe - 1px)`). Its entire claim to the
  bottom edge is *"the document cannot scroll."* And that arithmetic is
  correct — it sums to exactly `100dvh`.
- **The slack came from two ancestors.** `.app-body` and `.app-layout` still
  carried `min-height: 100vh` while everything inside was sized in `dvh`. On
  mobile `100vh` is the LARGE viewport (browser chrome collapsed), so with
  chrome showing the document was taller than the screen by the chrome's
  height, the page scrolled by exactly that, and the in-flow composer rode up.
  Both are now `100dvh`.
- **BOTH floors or the change does nothing — this is the trap that ate PR #325.**
  They are independent and each alone reproduces 100% of the symptom:
  `.app-layout`'s own floor makes it a full `100vh` tall regardless of body's,
  and body's own floor holds the document `100vh` tall regardless of
  `.app-layout`'s (`html` height is `auto`). #325 correctly diagnosed this exact
  mechanism and converted `.app-shell-frame` to `min-h-dvh` — but the frame's
  height is content-driven, so its two ancestors kept setting the document
  height over its head. **A partial conversion here is indistinguishable from
  doing nothing.** Never split this pair.
- **The codebase had already confessed.** The keyboard-open override's comment
  said `min-height: 100vh` *"would still hold the document a full LARGE viewport
  tall … **which is why there is always a little scroll to give away**"* — and
  only compensated while the keyboard was OPEN. That comment is now rewritten;
  the confession was sitting there through five failed attempts.
- **No `100vh` fallback line, and don't add one back.** The production minifier
  collapses two declarations of the same property on one rule to the last, so
  `min-height: 100vh; min-height: 100dvh;` compiles to just the dvh line
  (verified in `.next`'s compiled CSS — it *reads* like progressive enhancement
  in source and is not one; a real one needs `@supports`). It also isn't worth
  having: pre-dvh Safari is < 15.4 and this app already hard-fails below iOS
  15.4 anyway (Next 16's framework chunk uses `Object.hasOwn`), so that branch
  is unreachable, and Chrome 93–107 losing the floor is invisible because body's
  background propagates to the canvas.
- **The `min-height: 24rem` column floors are now DESKTOP-ONLY.** Below their
  breakpoints they were actively harmful: the floor binds when the calc drops
  under 384px (a viewport under ~549px for the `-nav` variant, ~485px otherwise
  — reachable on small phones in portrait and widely in landscape), and when it
  binds the column is TALLER than the space `<main>` allots, so the document
  grows and the composer drifts *by the same mechanism the dvh fix just killed*.
  Trade-off below the breakpoint: a very short viewport squeezes the transcript
  instead of overflowing the column. Right way round — the composer staying put
  is the point.
- **What was NOT done, and is the real end state:** the column still derives its
  height from hand-summed magic numbers, including a hard-coded `4rem` for a
  topbar that is actually `min-h-16` and grows if its content wraps. The
  structural fix is to route-scope the frame to a definite `height: 100dvh`,
  give `<main>` `overflow: hidden`, and make the column plain `height: 100%` so
  it derives from the flex chain and no number is assumed. Deliberately not
  bundled here: it is untestable from a sandbox, and mixing it in would have
  destroyed attribution if the symptom survived. **It remains the fix that ends
  this bug class rather than this instance.**
- **Do NOT reach for the two obvious-looking fixes.** (1) `sticky bottom-0` on
  the composer is a guaranteed no-op — the column is exactly viewport-height, so
  a sticky child has ~0px of travel inside its containing block. (2) Adding any
  `overflow` to `html` re-arms the #318/#321 landmine that broke `position:
  sticky` app-wide. `html` still carries no `overflow`, confirmed in compiled
  output, and must keep none.
- **Magnitude was cross-checked rather than assumed**, which is what raised this
  from a plausible theory to the diagnosis: measured off the founder's
  screenshot, the web viewport was ≈580 CSS px, the column should have ended at
  500px (86% down), and the composer sat at ≈379px (65%) — a ≈120px drift
  against ≈100px of predicted chrome slack (that in-app browser has both a top
  bar and a bottom toolbar, far more chrome than iOS Safari's URL bar alone).
  Also checked and NOT active on that device: the `24rem` floor needs a <549px
  viewport and this was 580px, and the topbar was a single unwrapped row.
- **Verified:** `vitest run` (705, unchanged — CSS-only, and JSDOM cannot resolve
  viewport units so a unit test here would be theater), `eslint .` (0 new
  against the 3-error/59-warning baseline), `next build` green with `/auth` and
  `/settings` still `○ Static`, plus the **compiled** CSS checked directly for
  all four facts: `.app-body` and `.app-layout` each emit `min-height:100dvh`,
  the `24rem` floors appear only inside the desktop media queries, and `html`
  has no `overflow-x`. Checking compiled output rather than source is the
  technique this repo already relies on for CSS fixes — it is how both the
  `text-lg`-vs-`text-base` zoom bug and the sticky regression were settled, and
  here it caught the minifier collapsing the fallback line mid-implementation.
- **Not verified:** no real device and no live backend from this sandbox. If it
  still drifts, one on-device read settles it at `/dashboard/urgans`: compare
  `document.documentElement.scrollHeight`, `window.innerHeight`,
  `visualViewport.height`, and the computed heights of the
  `.chappi-shell-height-nav` element and `header.sticky`. Equal heights but
  still drifting means the theory was wrong and it is iOS's visual-viewport pan
  (documented at the `.chappi-*` keyboard block), which no length unit can
  defeat — only extending the existing `fixed` pinning to keyboard-closed.
  `scrollHeight` greater than the visual viewport means something still
  overflows, and the two computed heights say which.
