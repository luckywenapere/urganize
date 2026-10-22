# UrgAns replies show markdown as formatting, not literal punctuation (2026-09-24, v1.42.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report, with a screenshot: a phase-breakdown reply rendered on screen
as `- **Setup:** 26 tasks`, asterisks and all. `ChappiConversation.tsx` draws
assistant text raw inside a `whitespace-pre-wrap` div, and `apps/web` has
never had any markdown handling — the system prompt's own no-markdown rule
(`lib/chappi/system-prompt.ts`, since v1.32.0) tells the model not to do
this, and the model (`openai/gpt-4o-mini`) does not reliably follow it. A
prompt-only fix had already been tried and had not held.

**Founder decisions:** text in `**double asterisks**` shows as **bold**;
every other markdown symbol is removed rather than rendered. Scope is the
**chat only** — replies, the copy button, and the deterministic status-update
branch that already renders through the same component. Text UrgAns saves
elsewhere (notes, activities, the plan, press kit sections, emails) is
explicitly OUT of scope and stays unsanitized.

**`lib/model-markup.ts` (new, pure, no React/Node imports)** is a hand-rolled,
deliberately conservative markdown-to-segments parser — no dependency added
(boring-stack rule). `parseModelMarkup(text)` returns a flat
`{text, bold}[]`; `stripModelMarkup(text)` is defined as the joined plain text
of those segments, so the two cannot drift apart. A no-markup input returns
untouched as one segment (not merely equal), which is what makes "no markup
in, no markup out" a structural guarantee: every deterministic reply UrgAns
already writes renders byte-identically to before.

**Six things worth knowing before touching this again:**

1. **`_` uses a STRICTER flanking rule than `*`, and this is a real bug this
   pass found and fixed, not a stylistic choice.** Full CommonMark treats
   punctuation (a quote, a period) as a valid emphasis boundary, which is
   exactly what makes a CommonMark-faithful parser read `"__init__.wav"` as
   emphasis around "init" — quote before the opener, period after the closer
   both count. That silently eats the underscores off a dunder filename,
   which this assistant is far more likely to write than to actually mean
   "underline" (the house convention for emphasis is `**word**`). So `_`
   only counts as a delimiter against actual whitespace or a true line
   boundary, never against punctuation alone; `*`/`~~` keep the wider rule,
   since they collide with no common identifier convention.
2. **A censored word (`f**k`, `B**** …`) and a truncated bold marker
   (`**Setup: 26 tasks`, cut off mid-reply) look identical as PLAIN TEXT
   after the fact, so the two cannot be told apart by a regex over the final
   string.** The distinction is made DURING pairing, from whether the run was
   ever a genuine delimiter candidate (`canOpen`): a wholly-unmatched 2-3
   length `*` run that WAS a candidate is dropped (the model got cut off
   mid-bold); one that never was (flanked by letters on the wrong side) is
   left exactly as typed.
3. **Bold does not span a line break** (`**Setup\n26**` stays literal) — a
   deliberate, pinned limitation. Inline markup is resolved one line at a
   time, so one unclosed `**` can never swallow a whole multi-line reply.
4. **The pairing algorithm supports a single closer run satisfying two
   different openers** (`**Do this *today***` → one bold span, no stray
   marker), the one piece of real complexity here: an opener only partially
   consumed stays on the stack rather than being popped, so a later closer
   can still use what's left of it.
5. **History sent back to the model is cleaned, not just the render.**
   `lib/chappi/runner.ts`'s new `toModelHistory()` strips markup off
   ASSISTANT turns only (never the user's own words) before they go back as
   conversation history — without this, UrgAns's own past `**` replies stay
   in front of it as an example it keeps imitating, since the raw text
   rendered on screen is also what gets resent every later turn.
6. **The reveal (word-by-word fade-in) wraps per SEGMENT, not per word.**
   `lib/chappi/reveal-tokens.ts`'s `buildRevealGroups` keeps one word counter
   running across bold and plain segments alike (so timing doesn't care where
   the bold boundary falls), and `components/chappi/ReplyText.tsx` wraps each
   segment's words together in one bold span. Wrapping bold per WORD instead
   would change the whitespace between words from un-bold to bold width the
   instant the reveal finishes, which can re-wrap a line.

`ReplyText.tsx` is its own component (not inlined into `ChappiConversation`)
so a throwaway harness page could render it standalone for a browser check
with no auth required — confirmed there, then deleted before this landed.
The system prompt (`lib/chappi/system-prompt.ts:45`) keeps its plain-text
rule but no longer quotes `**asterisks**` as the example of what it forbids
(the same em-dash-in-a-rule-about-em-dashes trap this file already records
elsewhere), and states a reason that stays true now that the renderer
handles bold: markdown handed to a TOOL (a note, an activity, a press kit
section) is still saved and shown exactly as written.

**Verified:** the full vitest suite (3294 passing; the one failing file,
`vercel-ignore-build.test.ts`, is a pre-existing, unrelated PowerShell/WSL
bash-availability quirk in this sandbox, not something this change touched —
confirmed via `git status` showing the file untouched), `eslint .` at the
exact 3-error/78-warning baseline (all three pre-existing in
`WorkspaceView.tsx`) with zero new findings in any touched file, `tsc
--noEmit` clean apart from the 8 documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code**
with `/auth`, `/onboarding`, `/settings` and `/dashboard` all still
`○ Static`. **Three mutation passes, each failing exactly its own tests**:
letting `*` open after a letter (2 tests), dropping the `canOpen` guard so
any unmatched `**` gets deleted regardless of context (3 tests), and
skipping the strip in `toModelHistory` (both of its tests). **Rendered and
inspected in a real browser** (the built-in preview pane): the screenshot
reply's phase labels compute to `font-weight: 600` with zero stray
asterisks; a censored word and a dunder filename both survive with their
punctuation intact; an unclosed `**` at a simulated cutoff drops cleanly; the
word-by-word reveal's delays increment continuously across bold and plain
segments with no visual jump.

**Not verified:** no live model call — this sandbox has no route to either
urganize domain, so whether `openai/gpt-4o-mini` still occasionally reaches
for other markdown this parser doesn't yet have a rule for (nested lists, a
markdown table with more exotic alignment syntax) rests on the parser's
conservative "when in doubt, leave it as plain text" design rather than on
having observed a live reply. Worth one look after deploy: ask UrgAns a
phase-breakdown question on a real rollout and confirm the labels render bold
with a working copy button.

**Noticed but explicitly out of scope, flagged rather than fixed:** the press
kit "Draft this section" action passes the model's raw string straight to
`parseDraftOutput`, whose signature expects an already-parsed object — every
run of that action ends in a 502. It is dark today behind
`NEXT_PUBLIC_FEATURE_URGANS_ACTIONS`, unrelated to this fix's scope, and is
being flagged as a separate follow-up task rather than folded in here.
