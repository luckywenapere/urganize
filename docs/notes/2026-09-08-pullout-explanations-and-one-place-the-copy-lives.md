# Pullout explanations, and one place the copy lives (2026-09-08, v1.35.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask, from a screenshot of Vercel's side menu (a nav row hovered, a short
dark panel beside it saying what that page does): *"I need this kind of pullout
explanation for all the places where there are too much text, like inside the
metadata capture feature... check around every single pixel in the app... so easy
a fifth grader can use the app."*

**Not a scope expansion, no migration, no new flag** — the back-arrow /
mobile-scene-nav / Collect-metadata precedent for a founder-driven UX rework of
shipped surfaces. Revert is `git revert`.

### The fifth-grader bar is a test, not a preference

`lib/help-copy.ts` holds every explanation in the app, and
`lib/help-copy.test.ts` enforces the bar: at most 2 sentences, 18 words a
sentence, 160 characters, a full stop, no double space, and no jargon from an
explicit list. **A bar a person has to remember lasts until somebody is in a
hurry**, which is the same reasoning `lib/press-kit-copy-guard.test.ts` already
records for the house rules — and `help-copy.ts` is listed in THAT guard's FILES
too, so the em dash, the banned words and the never-says-workspace rule have one
definition rather than two.

Three properties of that guard worth keeping:

1. **`metadata` is ON the jargon list, even though a scene is named Metadata.**
   That is the point: the label already says the word, so a pullout repeating it
   explains nothing. The list is deliberately NOT "long words" — "distributor"
   and "publisher" are long and are what the things are actually called.
2. **No entry may lean on its own label.** Each carries the label it sits beside,
   and the guard refuses copy containing any of that label's words of 5+ letters.
   It is what forced "One page about the artist that you can send to writers and
   radio stations" instead of a sentence with "press kit" in it. Words under 5
   letters are skipped, or "name" and "line" would push copy into vagueness,
   which costs a beginner more than a repeated short word.
3. **A key with no call site FAILS.** Derived by scanning `components/` and
   `app/`, the mechanism that holds the tool registry and the icon set in step.
   Dead copy reads as covered in review and renders nowhere.

### The primitive, and why it portals

`components/shared/HelpTip.tsx` is two layers: `HelpTipPanel` (the positioned
panel, taking the element to point at) and `HelpTip` (a small round `i` button
that owns its own panel). Four things a later change will be tempted to get
wrong:

1. **TAP IS THE BASELINE FOR THE BUTTON; HOVER IS THE ENHANCEMENT.** A real
   `<button>` that toggles on click, so it works on a phone — most of this
   product's traffic. Hover is gated on `matchMedia('(hover: hover) and (pointer:
   fine)')` rather than a width breakpoint, because a touch laptop is wide and
   cannot hover. **The SIDE MENU is the deliberate exception and is hover-only**,
   which costs nothing: that card is `hidden lg:block` and never renders on a
   touch device at all.
2. **IT PORTALS TO `document.body`, and it has to.** Both target surfaces clip
   their own children — the side menu's nav list is `overflow-y-auto`, every
   metadata step card is `overflow-hidden` — and inside AppShell a `fixed` panel
   is broken by the `lazy-fade` transform, the trap `DeleteReleaseDialog` already
   portals around. `document.body` is read DURING RENDER, which is safe by
   construction rather than luck: `anchor` is a DOM element, so the early return
   fires during SSR and that line is unreachable. Doing it with a mount effect
   instead cost a `set-state-in-effect` warning for nothing.
3. **THE PLACEMENT DECISION IS PURE, in `lib/help-tip-position.ts`.** Prefer a
   side (the screenshot's shape) or below, flip when there is no room, clamp
   inside the viewport, never return a negative. It falls back to below when
   neither side fits, **which is what makes it responsive with no media query**.
   Note a phone does not always land there — a trigger near either edge of a
   375px screen still has room on one side, and gets it.
4. **The trigger element lives in STATE via a callback ref, not a `useRef`.** The
   panel needs it as a prop, and reading `ref.current` during render is a
   `react-hooks/refs` ERROR in this config — the rule that accounts for all three
   pre-existing errors in the repo. Writing it the obvious way added a fourth.

**Screen readers keep the sentence.** The metadata `Field` renders the same
HELP_COPY text as an `sr-only` paragraph wired to the input with
`aria-describedby`, exactly as the old visible hint was. Moving an explanation
behind a hover would otherwise have taken it away entirely from the people who
cannot see the icon; both read one entry, so they cannot drift.

### What changed, surface by surface

- **The side menu** (the screenshot's own case): all ten rows. Expanded rows had
  no explanation at all; only the collapsed rail carried a native `title`. ONE
  panel serves the whole list, because only one tip is ever visible and the rows
  are built inside a `.map` where a per-row hook would break the rules of hooks —
  so rows report which one they point at and `WorkspaceNavList` owns the panel.
  The collapsed rail is deliberately excluded: its `title` is already carrying the
  label, which matters more there, and two popups on one row is worse than either.
- **Metadata** (the named feature): nine field hints became nine pullouts, the
  scene intro went 3 sentences to 1, and each step's helper paragraph was split —
  **the visible line says what to DO, the pullout says who is asking and why**,
  complementary rather than the same sentence twice. Step 2's was four sentences,
  the worst in the file. The two `℗`/`©` labels lost their parentheses, which were
  an explanation wearing a label's clothes.
- **Settings**: four section intros of 3, 3, 4 and 5 sentences (Artists, Your
  directory record, Your data, Team brief). The team brief's rewrite also drops an
  em dash its old sentence carried.
- **The test-release banner**: 4 sentences standing permanently, one of which
  ("when you are done, delete it below") was redundant with the Delete button
  directly underneath it.

### The sweep, and what was deliberately LEFT

The founder asked for every pixel, so the whole of `components/` was scanned for
static paragraphs of 3+ sentences or 150+ characters. **27 remain, and most
should.** The classification is the useful output:

- **Consequential choices stay visible.** The metadata link paragraph was
  TRIMMED (3 sentences to 2) rather than pulled, because it is the difference
  between Close link and Regenerate, one of which kills a link that may already
  be in somebody's inbox. Same call for `DeleteReleaseDialog`,
  `ArchiveReleaseDialog` and the capture page's delete confirmation: a warning
  about something irreversible is not clutter.
- **Money and access stay visible.** `TeamWall`'s two paragraphs and the artist
  plan limit are read by somebody deciding whether to pay. Hiding terms behind a
  hover is the wrong instinct there.
- **Security detail stays visible.** `McpConnectionsSection`'s "they can see your
  releases... they cannot see your password or your card" is about third-party
  access to a workspace's data.
- **A surface whose whole job is explaining keeps explaining.**
  `NewReleaseGuide` is a one-time orientation card; a pullout inside it would be
  odd.
- **Nine were false positives of my own scan**, which sums both branches of a
  ternary — each branch of `ReportIssueDialog`, `CreateShowModal`,
  `CaptureEditor`, `TeammatesSection` and the rest is one or two sentences
  already. One match was a code comment, not copy.

**The discriminating rule, if a future pass wants one: pull an explanation when
it teaches, keep it when it warns.**

### Verified

**2998 tests** (33 new across `lib/help-copy.test.ts` and
`lib/help-tip-position.test.ts`) against a **measured** clean-tree baseline of
2965 — measured by stashing rather than trusting a figure from an earlier
session, which is what caught that the recorded 2922 was three commits stale.
`eslint .` at **exactly** the 3-error / 81-warning baseline with **zero** new
findings; the first run was 4 errors / 82 warnings and both were fixed rather
than accepted (see point 4 above and the portal-host note). `tsc --noEmit` clean
apart from the documented pre-existing `confirmed-action.test.ts` errors.
`next build` green **by exit code** with the affected flags on and with them off,
`/auth`, `/onboarding`, `/settings` and `/dashboard` all still `○ Static` in
each. Compiled CSS checked rather than trusted from source: `z-[150]`,
`max-w-[17rem]`, `align-text-bottom` and `sr-only` all present — worth noting
`z-[150]` arrives via a `PANEL_Z` const and IS still extracted, since Tailwind
scans raw file text, but that is the interpolated-class trap this repo has hit
before and is the reason to check.

**Three mutations, each killing exactly its own test** and each printing
`APPLIED` first (the recorded lesson that a mutation which never landed is
indistinguishable from a survivor): the placement flip removed, the sentence cap
raised to 99, and the jargon check reduced to a bare substring match.

**A test premise I got wrong, recorded because the arithmetic is reusable:** the
"neither side fits" case was first written with a trigger at x=20 on a 375px
screen, which DOES fit (20 + 16 + 8 + 260 = 304, against a 363 right margin). The
fixture is mid-screen now, and a second test pins the near-edge case that legitimately
takes a side.

### Not verified

**Nothing has rendered in a browser.** This sandbox cannot mint an authenticated
session and has no route to app.urganize.app, so the panel's placement against
real text, the hover on a real pointer, the tap on a real phone, and the
`sr-only` description in a real screen reader all rest on the unit tests plus the
build. Worth one pass: hover a side-menu row at 1280px and confirm the panel
lands beside the card rather than inside it, then open Metadata on a phone and
tap an `i` beside a field near the bottom of a step card — that is the case the
`overflow-hidden` portal and the flip-above branch both exist for.
