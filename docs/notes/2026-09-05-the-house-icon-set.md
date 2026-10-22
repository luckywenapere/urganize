# The house icon set (2026-09-05, live)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

**Back-filled 2026-09-07** (#500, `c064a00`). Thirty of the app's icons are
Urganize's own marks, drawn in the Adinkra/Kuba voice of the brand's textile
reference; the other 68 are still lucide, pulled to the house stroke weight by
one CSS rule.

**It ships UNFLAGGED, and that is the decision to understand first.** It was
built the same day as the textile ornament layer above, in the same voice, and
is deliberately NOT gated by `NEXT_PUBLIC_FEATURE_TEXTILE`: an icon swap at
identical viewBox and sizing changes no layout and no behaviour, so there is
nothing for a flag to protect — while tying it to a flag that has never been
flipped would have left the long tail mismatched indefinitely, since the
stroke-weight normalizer would have been dark too. Revert is `git revert`.

Not a scope expansion and no migration. It extends the founder's 2026-07-23
call, which pulled stock lucide out of the topbar for reading like "another
SaaS" — `BrandIcons.tsx`'s eleven music-coded marks were the pilot, and this is
the same decision applied to the icons a user actually touches.

### The design was settled by evidence, and both rejections are worth keeping

**Three directions were drawn and compared at REAL ICON SIZE before any of them
shipped**, which is the part that matters: two lost, and they lost for reasons
that would repeat.

- **"Hand-cut"** (deliberate wobble, squared terminals) was **invisible at
  24px**. Irregularity that reads across a metre of cloth does not survive a
  16px glyph. Do not reach for it again.
- **"House line"** (lucide's forms at stroke 1.8) was **indistinguishable from
  what it replaced** — the right weight, no character.

What survived is a carved-stamp voice, reduced in `components/icons/house.tsx`
to four rules: **contain it** (cut a vessel around the concept — a diamond, a
ring, an arch; the strongest Adinkra signal, and what makes `Check` and `Search`
read as marks rather than as UI), **nest it** (concentric repeats, echoing the
mudcloth panels), **four elements maximum**, and **symmetry wherever the meaning
allows** (stamps are symmetric; break it only for directional glyphs).

Stroke is **1.6 on structural geometry and 1.8 on the interior gesture** that
carries the meaning, so the container recedes and the meaning reads first. Round
caps only on interior gestures — structure is cut square.

### Six things worth knowing before adding or changing an icon

1. **THE FOUR-ELEMENT CEILING IS A HARD ONE, and a test enforces it.** The two
   glyphs that failed the comparison sheet failed by carrying five and six
   shapes: at 16px anything more turns to mud. `lib/icons-registry.test.ts`
   counts the `<path|circle|rect|ellipse|line|polygon>` elements in every mark's
   body and fails on any over four, so this is a finding held in place rather
   than a preference written down.
2. **LEGIBILITY OUTRANKS CHARACTER, and it decided real marks.** `X` is a single
   crossed path whose only concession to the voice is a square terminal, and the
   chevrons are nearly plain: a dismiss control that takes a beat to recognise
   is a worse control however handsome the mark. `Loader2` is one arc, because
   it is used with `animate-spin` at 46 call sites — the most-seen glyph in the
   app — so it stays the simplest thing in the file, with nothing to blur when
   it rotates. **Four marks were also redrawn after the first render rather than
   defended:** `Users` read as a rendering glitch, `Inbox` as a photo frame,
   `BellRing` had a stub on top, and `Loader2`'s original ghost arc added
   nothing to something judged in motion.
3. **IT IS A SHIM, not 130 hand-edited import lists.** 98 distinct icons are
   imported across ~130 files, most of them mixing covered and uncovered names,
   so everything comes from `components/icons` and **a call site only ever
   changes its import PATH** — no import splitting, no per-file judgement about
   which set a name belongs to, and no way to get that judgement wrong. Adding
   an icon means adding it to the passthrough list. Promoting one means drawing
   it in `house.tsx` and deleting it from that list, with the export name
   unchanged, so **no call site moves.**
4. **HOUSE ICONS ARE `forwardRef` COMPONENTS MATCHING LUCIDE'S EXACT TYPE, and
   that is a build requirement rather than a style.** `AdminHubClient` holds
   `{ label, icon }` rows of both kinds, and TypeScript infers the array's type
   from the FIRST entry — a plain function component and a
   `ForwardRefExoticComponent` are not assignable to one another, so the build
   failed on the first mixed array it met. Patching that one call site would
   have moved the problem, not solved it. Every mark therefore goes through one
   `icon()` factory, which also fixes `viewBox="0 0 24 24"`, `fill="none"`,
   `stroke="currentColor"`, `aria-hidden` and `focusable="false"` in a single
   place; the children are captured at module scope rather than rebuilt per
   render.
5. **THE TWO SETS STOP CLASHING THROUGH ONE CSS RULE**, not because 98 marks
   were redrawn. `.lucide { stroke-width: 1.7 }` in `globals.css` reaches the
   whole long tail, and it works for a specific reason: **lucide emits
   `stroke-width` as a PRESENTATION ATTRIBUTE** (verified in `node_modules` —
   its `defaultAttributes` carries `strokeWidth: 2`), and CSS beats presentation
   attributes in the cascade regardless of specificity. It also emits
   `class="lucide lucide-<name>"`, which is the hook. **The consequence to know:
   a call site passing `strokeWidth` arrives as an attribute too, so this rule
   overrides it** — a genuine per-icon override needs a Tailwind arbitrary class
   (`[stroke-width:2.4]`), never the prop. And the rule is deliberately NOT
   scoped under `.urg-textile`, or the long tail would mismatch until that flag
   flips.
6. **`packages/ui` is deliberately untouched.** It cannot import from
   `apps/web`, so its primitives keep whatever they already use. A shared
   primitive that wants a house mark needs the set moved into the package first,
   which is a bigger change than it looks.

### Scope was chosen on measured usage, not taste

Of the 98 icons, **48 appear in exactly one file.** The **30** carrying the
visible chrome are drawn — grouped in `house.tsx` as structure and status,
objects and actions, music and motion, direction, and people/AI/finding. The
**68** on surfaces almost nobody opens stay lucide, several of which lucide
already draws better than we would, and all of which the normalizer above pulls
into the same family. Hand-cutting 68 marks for admin tables and rare settings
rows would have been the expensive half of the work for the invisible half of
the benefit.

### The guard, and why it scans source

`lib/icons-registry.test.ts` is four cases, all reading the real files rather
than asserting a fixed list — the `tool-registry.test.ts` approach, for the same
reason: **a fixed list catches a rename and not a new file breaking the rule.**
It fails if

1. any file imports from `lucide-react` directly (which would reintroduce the
   stroke mismatch the shim exists to remove — the shim itself is exempted),
2. a name imported from the shim is not exported by it (type-only exports are
   skipped, since they are erased at runtime and `next build` type-checks
   those),
3. a house mark is not a 24-viewBox `currentColor` SVG with a `displayName`
   matching its export — and it asserts the count is exactly 30, so a deletion
   is a decision rather than a drift, and asserts the mark is an OBJECT rather
   than a function, which is what pins point 4 above, or
4. any mark exceeds the four-element ceiling.

Comments are stripped before matching, and **that was mutation-tested: a comment
merely MENTIONING `lucide-react` must not trip the rule, and does not.**

### One thing the code said and the commit message did not

**The `.lucide` rule's own comment undercounted the long tail, twice** — "the
other 66" and "all 66 at once" — where the shim's own comment and the export
list both say 68 (30 + 68 = 98). Corrected in place while writing this section:
a comment-only fix, no behaviour. A wrong count sitting beside the rule it
describes is exactly the drift this file exists to catch — though note it was
wrong in the direction that matters least, since the rule reaches every lucide
glyph regardless of how many the comment thinks there are.

### Status and verification

**Live and unflagged since 2026-09-05.** No changelog entry, and that is
deliberate rather than an omission: the swap is invisible by design — identical
geometry, identical sizing, no layout change — so an entry announcing it would
describe nothing a user could see.

**What the pass recorded at build time:** 2555 tests passing including four
structural guards, **all four mutation-tested**; eslint identical to the
clean-main baseline (82 problems, 3 errors, 79 warnings), measured by checking
out `main` in place rather than assumed; `next build` green with `/auth`,
`/dashboard`, `/onboarding` and `/settings` all still `○ Static`; and the
compiled CSS confirmed to carry `.lucide{stroke-width:1.7px}` after
minification. It was **merged with #499 (standing press kits) mid-review**,
which forced two follow-ups that were necessary rather than optional: the 97
files that PR brought in still imported lucide directly (the registry guard
caught it by design, and the re-run had to widen to the double-quoted import
sources #499 introduced), and `.kit-island` was folded into the textile island
ornament. Re-run while writing this section: the icon guard's 4 cases pass and
the full suite is green.

**Not verified, then or now:** most of the 30 marks live on authenticated
surfaces this sandbox cannot reach. The set was reviewed at 30px and 16px on a
rendered sheet, and `Mail` was confirmed live on `/auth` — which is not the same
as seeing the chrome. Worth one pass through the workspace, a task pop-up and
Settings.
