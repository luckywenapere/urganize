# The activity pop-up reads like a calendar event (2026-09-05, v1.23.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request, from a screenshot of Google Calendar's event pop-up: emulate
that simplicity in Urganize's own activity viewer, reviewing the gap together
before touching code. What makes the reference simple, read off the screenshot:
icon-only actions in a top bar, the title leading with one quiet subtitle line
under it, metadata as bare **icon + value** rows with no field labels and no
boxes, and rows with no value absent entirely.

**No flag, no migration, no API change, no new route** — the back-arrow /
mobile-scene-nav / Collect-metadata precedent for a founder-driven UX rework of a
shipped surface, where revert is `git revert`. `TaskDetailPatchInput`'s five-field
whitelist and every `onSavePatch` call are untouched: no field gained or lost
editability.

**Four founder decisions, taken before any code was written:**

1. **Fields stay inline-editable and keep autosaving.** They stop *looking* like
   a form. The read-only-then-pencil model (what Calendar actually does) was
   offered and rejected: it costs a click on every edit, and the noise was coming
   from the labels and boxes, not from the fields being live.
2. **All four cuts are in scope:** labels → icons, move the invite form, hide
   empty fields, rework the header.
3. **No footer button.** Completion stays the `○` beside the title, matching how
   the activity list completes a task. A "Mark done" pill was offered — Calendar
   has one — and declined, because the pop-up would then complete tasks
   differently from the list.
4. Implied by 1 and 3: this is subtraction inside one surface.

**Six things worth knowing before editing this:**

1. **`appearance-none` is what makes a native `<select>` read as plain text.**
   Without it the OS arrow shows at rest and no amount of border removal helps.
   The same problem on the date input is solved differently, because a
   `datetime-local` keeps its own picker indicator regardless: three arbitrary
   variants hide `::-webkit-calendar-picker-indicator` at rest and reveal it on
   `group-hover` / `group-focus-within`. **Verified in the compiled CSS**, not
   from source — and the first check said they had NOT compiled, because it
   grepped `.next/static/css/`, a directory this build does not produce. The CSS
   lives in `.next/static/chunks/*.css`. `group` on `DETAIL_ROW_CLASS` is
   load-bearing for both the chevrons and that indicator.
2. **Title and subtitle are ONE child of the `space-y-6` stack.** As siblings the
   stack puts 24px between a heading and its own subtitle, and `mt-1.5` loses to
   `space-y-6`'s `> * + *` selector on specificity. They are wrapped in a plain
   `<div>` for that reason alone.
3. **The invite form's state stayed in `TaskDetailView`; only its JSX moved.**
   `TaskMemberSelect` gained an optional `footer?: ReactNode` and stays a dumb
   picker with no API dependency. The form is collapsed behind "Invite someone
   new…" so the resting menu is a clean list of people, and both new disclosure
   flags (`inviteOpen`, `notesOpen`) are reset in the existing task-change effect
   — without that, the next activity opens with the previous one's form expanded.
4. **Moving the footer fixed an a11y bug.** `role="listbox"` was on the scrolling
   container itself, and a listbox may only contain `role="option"` children, so a
   form inside it is invalid markup. The role now sits on an inner list and the
   footer is a sibling outside it. **The scroll moved with the role, onto the
   list**, so an expanded footer squeezes the list instead of being pushed off the
   bottom of the menu — the `WorkspaceNavList` move. Its height cap is
   viewport-relative (`min(24rem,60dvh)`) because the invite form grows this panel
   and a fixed rem cap can outrun a short phone.
5. **`autoFocus` on the notes textarea is keyed on `notesOpen`, not on
   visibility.** The field also renders when the activity simply has notes
   already, and autofocusing there would steal focus on every open. Safe on iOS
   because the `(pointer: coarse)` rule from v1.5.2 already forces form controls
   to 16px — below that a focused field zooms the page.
6. **`TaskDependenciesSection` lost its card**, and that was not scope creep for
   its own sake: it is a single-consumer component, and a `rounded-[24px]` bordered
   box was the one rectangle left in a pop-up that no longer draws any. Its icon
   column (`h-4` + `gap-3`) now lines its heading up with the rows above it.

**Also fixed while there, both pre-existing:** the row class hardcoded
`[color-scheme:dark]`, which forces a dark native dropdown onto a cream page in
light mode — `globals.css:190` already sets `color-scheme: light` per theme, so
dropping it is the fix (`AssetUploadControl` keeps that hardcode deliberately for
a boxed dark control; this is not that). And the component docstring claimed it
renders "Comments", which it has not since the 2026-07-23 cut.

**The skeleton moved with the layout**, per its own comment's convention: it
hardcoded the 6.5rem label column and the 120px description block, and both
stopped existing. **A near-miss worth recording:** the skeleton's wrapper and the
loaded body are byte-identical lines (`<div className="space-y-6">` at the same
indent), so a first-match anchor replaced the *body* with the skeleton. Anchor on
the last match, or on the `isLoading` guard above it.

**Left alone:** the Outcome and Attachments sections. Both are flag-off in
production, and restyling dark code in the same diff as the visible rework would
obscure it.

**Source got longer, not shorter — 656 → 734 lines.** The screen is simpler; the
file carries more comments and a real disclosure for notes. The rows themselves
went 119 → 61 and the header 56 → 33.

- **Verified:** 2349 tests (11 new in `lib/task-detail-summary.test.ts`,
  mutation-tested three ways — toning every segment, dropping the blank-skip, and
  toning a due segment that was never rendered each fail exactly their own
  tests), `eslint .` at the **exact measured baseline** (3 errors / 75 warnings,
  all pre-existing in `WorkspaceView.tsx`, measured on a clean tree first) with
  zero new findings, `tsc --noEmit` clean on the touched files, and `next build`
  green **by exit code** with `/auth`, `/onboarding`, `/settings` and `/dashboard`
  all still `○ Static`. Compiled output checked directly: the old
  `6.5rem_minmax` grid appears in **zero** client chunks, and the new row classes
  and all three picker-indicator rules are present.
- **Not verified:** nothing has rendered in a browser. This sandbox cannot mint
  an authenticated session and has no route to app.urganize.app, so the layout,
  the hover reveal, the dropdown footer and the collapsed notes rest on the build
  plus unit tests. Worth one manual pass: open an activity, change its status and
  assignee, invite someone from inside the assignee menu, add notes to an activity
  that had none, and delete from the new trash icon.
