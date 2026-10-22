# Everything after the music (2026-09-24)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder brief: Urganize is no longer described as an "AI Music Business
Manager". You make the music; Urganize is where your team does everything
after. Three lines, the founder's, used verbatim:

- **Core line:** "Urganize is where your team does everything after the music is made."
- **Short line** (page titles, meta titles, tight bios): "Everything after the music."
- **Long description:** "You make the music. Urganize is where your team does
  everything after. Plan the release, assign the work, keep files and metadata
  in one place, pitch to curators, book shows and put the release out. For
  artists, managers and labels."

Done in two steps at the founder's request: a find-only list first (file, line,
current text, proposed text), then the edits after a "go". **No feature work, no
pricing change, no migration, no flag, and no changelog entry or version bump**,
the same class as the 2026-09-11 positioning passes: most of it is
`apps/homepage`, which the app-only scope rule excludes, and the `apps/web` half
is descriptions, an email sentence and two footers.

The copy rules the brief set, and which every string below follows: no em
dashes, fifth-grade reading level, never "workspace" in customer copy, deliver
rather than ship, rollout is the work and release is the unit (never "music
rollouts"), never "Global standard, from here." or "Let's build.", and end on
the call to action or just stop.

### What moved

- **`lib/positioning.ts` and its homepage mirror.** New `CORE_CLAUSE` ("where
  your team does everything after the music is made"), `CORE_LINE` and
  `SHORT_LINE`. `PRODUCT_CATEGORY`, `CUSTOMER_LINE` and `PROMISE` are DELETED
  rather than repointed, so nothing can keep composing the old category by
  accident. `ONE_LINER` is the short line, `SHORT_DESCRIPTION` the core line,
  `CANONICAL_DESCRIPTION` the long description, `BRAND_LINE` is "Urganize:
  Everything after the music", and `AUDIENCE` is artists, managers, labels.
  `CORE_CLAUSE` exists so a sentence that already names Urganize ("the privacy
  policy for Urganize, where your team...") can say the line without the name
  twice.
- **The homepage hero:** h1 is the short line with the accent on "after the
  music" (found in the string, not typed as fragments, with a fallback to an
  unaccented line), subhead is the core line. Rendered in headless Chromium at
  1280 and 375: one line on desktop, two on a phone, nothing clipped.
- **SEO:** homepage title is `BRAND_LINE`; `LANDING_DESCRIPTION` is the long
  description, 232 characters, so Google cuts it partway through the list of
  what the product does. Accepted rather than trimmed: the part that says what
  Urganize is always survives the cut. `applicationCategory` in the JSON-LD went
  back to schema.org's "BusinessApplication", since there is no category name
  left to carry.
- **All 19 marketing page descriptions**, plus the brand page (positioning
  paragraph = core line, press boilerplate = long description, "Who it's for"
  names labels), the "Who we are" paragraph in `/terms` and `/privacy`
  (`LAST_UPDATED` deliberately not bumped: renaming how we describe ourselves
  changes nobody's rights), `/signup`'s "Who Urganize is for" (labels added) and
  the `/pricing` lead. The pricing page's "Built for..." line follows
  `AUDIENCE_LINE` on its own and now names labels.
- **The share card** was regenerated (short line as headline, core line under
  it), looked at, written with identical bytes to both apps, and
  `SHARE_IMAGE_VERSION` bumped to `2026-09-24-everything-after-the-music`. The
  generator's accent split used to assume the accent was a PREFIX of the line
  (`MAIN_LINE.slice(ACCENT.length)`); it finds the accent anywhere now, and uses
  a margin for the word gap because Satori collapses a space at a span's edge.
- **The app:** `apps/web/app/layout.tsx`'s description is the long description,
  the manifest is the core line (unchanged wiring), the team invite email's
  second sentence is the core line (imported, so it cannot drift), and the
  public press kit and credits pages end "Made with Urganize. Everything after
  the music." instead of "the operating system for music business".
- **Docs:** `docs/store-listing.md` rewritten (Play and App Store app name is
  now just "Urganize", because "Urganize: Everything after the music" is 36
  characters against a 30 cap and cutting the founder's line to fit was the
  worse option; the short line is the Apple subtitle, 27 characters; the Play
  short description and Apple promo text are the core line; the full
  description opens with the long description and its "Who it is for" names
  labels; 1,710 characters measured). README, PROJECT_SUMMARY, REFACTOR_NOTES and
  the four `package.json` descriptions (root, web, homepage, mobile) moved too.

### UrgAns is held, on purpose

**RESOLVED 2026-09-25: UrgAns says the new line too** (founder call, the day
after: "update UrgAns to use the new line too"). The original text after this
note is the record of the one day it was held, and every item on its undo list
is done.

- **What it says now.** `ROLE` in `lib/chappi/system-prompt.ts` opens "You are
  UrgAns, the personal AI for music professionals inside Urganize, where your
  team does everything after the music is made." Asked what Urganize is, it
  answers with the core line word for word, and adds the long description word
  for word if they want more.
- **Two mechanisms, on purpose, and the comment above `ROLE` says why.** The
  opening sentence is prose, so `ROLE` still reads as one block, and the test
  holds it to `CORE_CLAUSE` (the 2026-09-11 convention for this file). The
  quoted lines are interpolated from `lib/positioning.ts` instead, because "word
  for word" is only true by construction if the words come from there. That
  also keeps the long description's "release" (the founder's word for the unit)
  in the module that owns the line, and "word for word" is what stops the model
  rewording it to "rollout" under `URGANS_COPY_RULES`.
- **The outcome prompt** (`lib/task-outcomes.ts`) introduces UrgAns and Urganize
  from `URGANS_LINE` and `CORE_CLAUSE`, retiring a third description of the
  product ("a rollout planning app for music teams").
- **Tests.** `system-prompt.test.ts` asserts against the shared constants again,
  and checks the RENDERED prompt for the old category, which the positioning
  guard cannot do: it scans source, where the quoted lines are only `${...}`
  holes. `task-outcomes.test.ts` gained the same check. In
  `positioning-guard.test.ts`, "AI Music Business Manager" is an ordinary
  RETIRED pattern now; `HELD_CATEGORY`, the one-file exemption and the tripwire
  test are deleted. Three regressions were put back one at a time (the old
  opening, dropping the quoted long description, the old outcome line) and each
  failed exactly the tests written for it, the first one failing the guard too.
- **No changelog entry or version bump,** the 2026-09-11 precedent: how UrgAns
  describes the product is prompt copy, not a feature.

**Found on the way, not fixed here: the rollout-vocabulary guard never actually
reads `ROLE`.** `lib/rollout-vocabulary.test.ts` lists
`lib/chappi/system-prompt.ts`, but `findObjectWordViolations` skips a whole
segment when any allowed phrase appears anywhere in it, which defeats the
per-match window check after it. `ROLE` is one 12,000-character template
literal that names `create_release`, and it also trips `looksLikeCode` (it
contains `);`), so it is skipped twice over. Measured by running the guard's
own rules against the file: 11 places where the prompt calls the object a
"release" in prose ("link to a release", "one release in full", "the last few
releases") are invisible to the guard that lists it. The same early-out can hide
a real hit in any long segment of the other guarded files that also says
"release date". Suggested as a separate task rather than widened into this one.

**FIXED 2026-09-25, the same day**, in its own change: see the AMENDED note on
`lib/rollout-vocabulary.test.ts` in "The object is a rollout" (2026-09-09). The
11 passages say "rollout" now, and the guard finds that kind of hit.

The brief said to flag, not rewrite, anywhere Chappi or UrgAns calls Urganize the
AI Music Business Manager. Two lines in `lib/chappi/system-prompt.ts` (the ROLE
opening and the "if you are asked what Urganize is" answer) and the outcome
prompt's self-description in `lib/task-outcomes.ts` were left exactly as they
were. So until the founder decides, **the assistant still answers "what is
Urganize?" with the old category** while every other surface says the new line.
That is known, not a bug.

Three things hold that state in place and are the undo list when the decision
lands:

1. `system-prompt.test.ts` pins the held wording as a LITERAL (it used to assert
   against `CUSTOMER_LINE`, which no longer exists). It fails when the prompt
   changes; point it back at the shared constants then.
2. `positioning-guard.test.ts` retires "AI Music Business Manager" everywhere
   through `HELD_CATEGORY`, exempting that one file by path.
3. A tripwire test in the same file asserts the prompt still contains the held
   phrase, so the exemption cannot outlive its reason. Delete the exemption in
   the same change.

A "WhatsApp plan" describing UrgAns was also named in the brief. It is not in
this repo: not in any file, filename, commit message, issue or pull request, so
there was nothing to flag.

### The guard, and why one pattern is case-sensitive

New RETIRED patterns: "Music Business AI" (the old store app name), "operating
system for music", "plan, organize and execute" (the old promise), "Let's build",
and **`/\bAI Music Manager\b/` matched case-sensitively.** The title-cased form is
how the category was written in copy; the lowercase keyword "AI music manager"
stays in `LANDING_KEYWORDS` and the store tags on purpose (nobody searches for
our new line), and a case-insensitive pattern would fail on it. The page rule now
requires every declared marketing description to say "everything after the
music" in words or through a positioning constant. "For labels" and the triple
left RETIRED with the audience change; "small labels" stays.

### A compiler trap worth knowing

On `/terms`, `{CORE_LINE} It is operated by...` rendered as "made.It is": the
compiled JSX dropped the space after the expression. The same pattern on
`/pricing` kept it; the difference is that the terms text contains HTML entities
(`&ldquo;`) later in the same text node. Fixed with an explicit `{" "}`, and
checked in the prerendered HTML. If an expression is followed by text that
contains an entity, make the space explicit.

### Left alone, deliberately

- Search keywords (`LANDING_KEYWORDS`, store tags and Apple keywords): typed,
  not read. The two label keywords removed on 2026-09-11 could return now that
  labels are in the audience; that is a founder call.
- `/for-labels` still redirects to `/pricing`, and the community page still says
  "A group chat for artists and managers running rollouts."
- Historical comments and the changelog, which are records.
- The onboarding role option "Music Manager" (a job title, not positioning) and
  the copy-scan test fixtures.

### Verified

3455 tests passing / 30 skipped (one new: the held-category tripwire), against a
measured clean-tree baseline of 3454. `eslint .` at exactly the measured
baselines (3 errors / 78 warnings in `apps/web`, 0 / 2 in `apps/homepage`).
`tsc --noEmit` clean apart from the documented `confirmed-action.test.ts` errors.
Both `next build`s green by exit code, with `/`, `/auth`, `/onboarding`,
`/settings`, `/dashboard` and `/locked` all `○ Static`. In the prerendered HTML:
the title, h1, meta description and `og:image` version are the new ones, 17 page
descriptions checked one by one (`/roadmap` renders not-found in a build without
its flag, and `/download` is dynamic, so those two were checked in source), and
the old phrases appear nowhere except the kept keywords meta tag. The generated manifest carries the core line.

### Not verified

The live sites, until the deploy lands (no route to either domain from here); a
social debugger reading the new card; the invite email in a real inbox; and the
app surfaces behind a session.
