# The textile character layer (2026-09-05; LIVE 2026-09-07 as v1.27.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

**Back-filled 2026-09-07, and LIVE the same day.** Behind
`NEXT_PUBLIC_FEATURE_TEXTILE` (#498, `b420acc`), which was **flipped on in
production hours after this section was written** and shipped as v1.27.0 —
see the two paragraphs below for what has and has not been seen with it on.
(This sentence said "has never been flipped" until the flip; corrected rather
than left contradicting the heading directly above it.)

**Its sibling pass is a SEPARATE section: "The house icon set" below** (#500,
`c064a00`), which ships **unflagged and is live**. They were built the same day
in the same voice and are deliberately independent — read that section's first
paragraph for why tying the icons to this flag would have been the wrong call.
Neither had a working-notes section until now; both were written from the code
rather than the commit messages, and where the two disagreed the code won.

**What this layer is:** the woven character of the founder's textile reference
— ikat weaves, Kuba cloth, gold embroidery on oxblood, Adinkra tooth borders —
applied as a class on `<html>` in `app/layout.tsx`, **without touching the
palette**. That was the finding that made it cheap: the reference board and the
Brand Bible are already the same family (ink ground, cream thread, sage and
forest), and `--status-warning` is literally the gold-thread/umber pair. What was
missing was not colour but MATERIAL — weave, edge treatment, pattern instead of
flat digital fill.

### Six things worth knowing before editing the ornament

1. **EVERY ORNAMENT COLOUR DERIVES FROM AN EXISTING TOKEN AT LOW ALPHA**
   (`--color-stroke`, `--color-status-warning`), and that is three guarantees at
   once rather than a style preference: nothing new enters the palette, **ornament
   can never be mistaken for state**, and both themes are covered for free by the
   same cascade that already flips those tokens. The `--urg-*` tokens are
   declared unconditionally (a few custom properties, cheap) and only ever
   CONSUMED under `.urg-textile`, which is what keeps flag-off byte-identical.
   **The alphas are NOT shared between themes** — ink-on-cream reads visibly
   heavier than cream-on-ink at equal opacity, so `html[data-theme='light']`
   carries its own set at roughly 0.55–0.7×, tuned against both real grounds
   rather than derived.
2. **BOTH HOOKS ALREADY EXISTED, and finding them is why this is CSS-only.**
   `body::before` was already a fixed inset hairline — the framed-cartouche motif
   hiding in plain sight — and gains an inner rule (`outline` with a NEGATIVE
   offset draws inward) plus corner ticks. `body::after` was already an ambient
   texture, but a 36px graph-paper grid **hardcoded to
   `rgba(255,255,255,…)`, which means the app's only texture has been invisible
   in paper mode for as long as it has existed**. Routing it through
   `--color-stroke` fixes that and makes it cloth: weft at 3px, warp at 4px,
   twill at 45° and 6px. The near-coprime pitches are deliberate — 36/36 locked
   into a visible checkerboard, and that difference is the difference between
   "spreadsheet" and "woven". The old grid rule is left exactly as it is,
   because it is the flag-off baseline.
3. **AN SVG `data:` URI IN `background-image` CANNOT READ CSS CUSTOM
   PROPERTIES**, so it can never be theme-aware. Where a motif is too complex for
   gradients (the tooth border, the Kuba glyph) the **SHAPE
   comes from an SVG `mask-image` and the COLOUR from a token via
   `background-color`**. Both `-webkit-` and unprefixed properties are required;
   the floor is iOS 15.4, which the app already hard-requires because Next 16's
   framework chunk uses `Object.hasOwn`.
4. **Ornament sits at `z-index: 0` behind `.app-layout` (`z-index: 1`), which
   has no background of its own.** So it shows through transparent regions, is
   occluded by any opaque card, and **can never render over text** — the
   per-token contrast budget is preserved by construction rather than by
   checking. `position: fixed` for the same reason the grid it replaces was: the
   grain reads as the surface the app is printed ON, not a pattern that scrolls.
5. **`.urg-above` exists instead of Tailwind `relative z-[1]`, and that is not
   fussiness.** A `z-index` establishes a stacking context, and with the flag OFF
   those pages must keep exactly the stacking they have today — so the marker
   class is completely inert until the layer is switched on. Same reasoning
   one level up: the ~15 copy-pasted blur-blob decorations (redeem, invite
   accept, payment callback, settings, curator join, the artist-name gate and
   both password pages) are **hidden by one `.urg-textile .urg-blob { display:
   none }` rule rather than deleted**, because soft glowing gradients are the
   opposite aesthetic to woven cloth and running both reads as two design
   systems sharing a page — but flag-off has to stay identical. **If this layer
   is ever made permanent, that is the moment to delete the blob divs and that
   rule together.**
6. **Three tiers, and the tier decides where a motif may go.** Tier 1 is the
   ambient grain on `body`'s pseudo-elements. Tier 2 is opt-in structural
   utilities (`urg-cartouche`, `urg-rule-teeth`) applied through
   the app's **shared className constants rather than per component**, which is
   why a handful of edits reach most surfaces — `components/settings/panelClass.ts`
   is the widest seam. Tier 3 is the loud one (`urg-ground-sunburst`,
   `urg-ground-ikat`, `urg-glyph-kuba`), reserved for surfaces with no dense
   content to compete with — the entrances, the public share pages, the
   first-release reveal — and always applied to a `pointer-events: none`
   absolutely-positioned CHILD, never the page element, so nothing can sit
   between a user and a control.

### Smaller ornament decisions

- **Settings gets teeth on its divider, not a keyline.** `panelClass` uses
  `urg-rule-teeth` and deliberately not `urg-cartouche`, because a keyline would
  re-draw the box the 2026-07-23 founder call removed for reading as plastic.
  The `relative` the tooth border needs as a positioning context was already
  there.
- **The empty state's dashed border becomes solid with teeth.** A dashed border
  is the universal "nothing here yet"; a finished woven edge is the right note
  for a state that is inviting the first action rather than apologising for a
  gap.
- **The cartouche uses `outline`, not a second pseudo-element or an inset
  shadow.** `body` has only `::before` and `::after` and both are spoken for; an
  inset shadow fills a band from the edge and cannot draw a hairline at an
  offset. On the element utilities it also costs no pseudo-element, so it never
  fights a component that already uses one, and it inherits the corner radius.
- **The frame's inner rule and ticks tighten with it below 768px**, because the
  frame itself goes to `inset: 10px` there and they would otherwise collide with
  the border on a phone.
- **Nothing in the layer animates**, so the `prefers-reduced-motion` clamp
  needed no additions.
- **`html` still carries no `overflow` property**, so the #318/#321 sticky
  landmine is untouched. Do not add one here.
- **The public islands get the richest treatment and break two of this layer's
  own rules on purpose** (`.epk-island`, `.credits-island`, `.capture-island`,
  `.kit-island`): the thread colours are HARDCODED cream rather than tokenised,
  because those islands deliberately do not participate in the theme cascade and
  a themed token would be the one thing on them that could flip; and the texture
  goes on `background-image` of the island element itself, because each page sets
  only `backgroundColor` inline and `::before`/`::after` stay free for the page
  components. `.kit-island` was folded in during the #499/#500 merge — the
  standing press kit is the successor to the EPK surface this rule was written
  for, and leaving it out would have given the new kit less character than the
  thing it replaced.
- **NONE OF IT PRINTS, and that reset is required rather than tidy (2026-09-07).**
  The `@media print` block far above redefines the island's own variables so
  every colour follows without a single print-specific override in the component
  — the kit island's ground goes white and its text goes ink. The ornament is the
  one thing that CANNOT follow, because its threads are hardcoded cream by the
  bullet above, so on a white sheet the grain is invisible and the gold wash is a
  faint yellow band across the top. A second `@media print` sets
  `background-image: none` on all four, placed immediately after the rule it
  corrects rather than in that block 1,600 lines earlier, so a reader editing one
  sees the other. Mostly belt-and-braces — `print-color-adjust` is `economy` by
  default, so browsers already drop backgrounds — but "Print backgrounds" is a
  checkbox in every print dialog, and the press kit is the one page in this
  product designed to be printed.

### The selvedge motif was built and then deleted (2026-09-07)

**`.urg-selvedge` had ZERO consumers** — fully implemented (mask, uneven 24px
tile, both prefixes) and applied by no component, found by grepping for each
utility's consumers rather than trusting the list of them. It was recorded
rather than removed at the time, because deleting a motif is a design call and
not a cleanup; the founder made that call the same day and it is gone.

**Worth knowing if a frayed bottom edge is ever wanted again:** it is one block
in git history, and the technique it used is the same one `.urg-rule-teeth`
still uses (SVG `mask-image` for the shape, a token via `background-color` for
the colour). What made it a real motif rather than a variant of the teeth is the
UNEVEN path on a wider 24px tile, so it reads as a cut edge instead of a
pattern. The word survives once in `globals.css`, in the island-pages comment
("the brocade selvedge a bolt of cloth carries") — that is prose describing the
live gold header band, not a reference to this utility.

### Status, and what was never verified

**LIVE as of 2026-09-07 (v1.27.0)** — `NEXT_PUBLIC_FEATURE_TEXTILE=true` on the
Vercel `Web` project, with the version bump as the commit that rebuilt
`apps/web` and inlined it (a `NEXT_PUBLIC_*` value is read at build time, so
setting the variable alone changes nothing until something rebuilds). The ledger
entry landed at the flip rather than at merge, per the EPK precedent.

**The order was env var first, then the rebuild**, and it matters: merged the
other way round, the rebuild carries the flag still false and the variable then
sits inert until the next commit — the trap recorded on the EP/album flip.

**SEEN IN PRODUCTION, in the default dark theme (founder, 2026-09-07):** the
grain, the frame and the entrance ray fan all render as intended on the
authenticated app. So the layer shipped on a green build and a compiled-CSS
check, and was confirmed by eye immediately after — which is what closes the
gap the paragraph below names, for dark mode.

**THE AMBIENT WEAVE WAS REACHING NONE OF THE CONTENT AREA, found 2026-09-07 by
rendering paper mode locally with the flag on.** The layer sits on `body::after`
at `z-index: 0` and `.app-layout` sits at `1`, so anything inside it with an
opaque background covers it entirely — and **every** page wrapper carried
`bg-bg-base`: auth, onboarding, locked, redeem, start-trial, the `<main>` on
dashboard/settings/admin, TeamWall, CuratorShell, ArtistNameGate and four
skeletons, 24 sites in 21 files. Measured on `/auth` at 1280px: the wrapper
spanned x=38.4 to 1241.6, so the grain and the frame showed only in the ~38px
margins either side. Proved rather than inferred — cranking the weave to bright
red at 90% still rendered a flat field, and the same 340x170 clip of empty field
went **571 bytes (flat) to 13,142 light / 24,821 dark** once the wrappers were
made transparent.

**What was visible all along, and why "texture is showing" was true anyway:** the
cartouche frame and corner ticks live in those margins, and every Tier 3 moment
(the ray fans, the ikat and sunburst grounds) is a child element INSIDE the
wrapper, so it paints above it. The two loudest parts worked; the subtlest and
most pervasive one did not arrive.

`body` already carries `bg-bg-base`, and neither `.app-body` nor `.app-layout`
sets a background, so removing it from a wrapper **changes no colour** in either
theme or either flag state — verified: with the flag OFF the same clip is 571
bytes before and after, because the pre-textile grid it uncovers is
`rgba(255,255,255,0.018)` at `opacity: 0.18`, an effective 0.3% and
sub-perceptible. **`lib/textile-ground-guard.test.ts` holds the rule**, because
the symptom is ornament that silently does not arrive rather than anything that
looks broken.

**That guard was wrong twice before it was right, and both mistakes are worth
knowing.** It stripped block comments before line comments, so the line comment
at `WorkspaceView.tsx:923` mentioning the legacy `/plan/*` route group opened a
comment the non-greedy regex closed 300 lines later — eating 431 real lines and
**hiding three of the 24 offenders while passing**. The counting check then
written to catch that cried wolf on `AdminNav.tsx` and `AdminPageSkeleton.tsx`,
whose comment BODIES mention `/admin/*`; a `/*` inside an already-open comment is
text, and no count of the two sequences can tell the difference. Both are gone in
favour of a single-pass scanner that also preserves newlines, so reported line
numbers are the real ones rather than indices into a stripped copy.

**PAPER MODE IS CONFIRMED IN PRODUCTION (founder, 2026-09-07), and it reads
SOFTER than dark rather than heavier** — the lower light alphas (`.02` against
dark's `.03`) did their job, so the worry this file carried about ink on cream
needs no tuning. That closes the half nobody had ever seen: the ambient ground
was hardcoded `rgba(255,255,255,…)` from the day it was written, so it had been
invisible in light theme for as long as it existed, and flag-on light mode was
its first appearance anywhere.

**THE ISLANDS ARE VERIFIED TOO, which closes this layer's last open item
(founder, 2026-09-07).** All four island classes were first rendered locally
against the real compiled stylesheet, and all four resolve the gold header wash
plus the warp/weft/twill grain, with the ground staying `rgb(13, 18, 14)` even
under a `light` root class — so the dark-lock holds, which was the likeliest
thing to have broken. Measured on empty ground beside the content column: 19,851
bytes inside the gold band and 7,312 below it, against the 571-byte flat
baseline. That pass is also what found the print gap in the bullet above, and
the before/after on one harness is the evidence for the fix. **Then the founder
printed a REAL published press kit and the sheet came back clean**, which is
what takes this past the harness: a real page, real content, real cover art, and
the print reset doing its job on paper rather than under emulated media.

**Read what that does and does not settle.** It confirms `/k/{slug}` — a real
kit, at print and therefore on screen — and it says nothing about `/credits/` or
`/capture/`, which have their own content and their own layouts and have still
only been seen as bare classes. Their thread colours are hardcoded cream rather
than tokenised, on purpose (those islands do not participate in the theme
cascade), so neither theme tells you anything about how they look, and the print
reset covers all four by construction rather than by having been checked on each.

**The paragraph below is the build-time record and is kept as written.**

**What the pass recorded at build time**, worth trusting because it names its
method: the eslint baseline was measured **by stashing rather than assuming**
and matched exactly; the build was green in BOTH flag states with `/auth`,
`/onboarding`, `/settings` and `/locked` all still `○ Static` and the auth form
still server-rendered; and **the compiled CSS was checked rather than the
source**, which is this repo's standing habit for anything CSS-dependent and
the only way to catch a minifier collapsing a declaration.

**Not verified at build time:** the authenticated surfaces and the public island
pages need a live session and a real share token, which this sandbox has neither
of. Both manual passes it was waiting on have since been done in production and
are recorded above — paper mode, where the ambient texture had been invisible
since it was written, and a real published press kit at print. `/credits/` and
`/capture/` are the remainder, and only because nobody has had reason to open
one.
