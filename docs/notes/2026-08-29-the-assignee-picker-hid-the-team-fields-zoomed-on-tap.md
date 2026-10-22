# The assignee picker hid the team; fields zoomed on tap (2026-08-29, v1.5.2)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Two founder reports from one sitting: assigning an activity to a teammate, the
teammate was not in the list; and tapping the box "does a weird zooming thing
... it should be stiff like a normal app everywhere."

### The picker filtered the list by the current assignee's name

`TaskMemberCombobox`'s input is BOTH the display of the current assignee and
the search box. `TaskDetailView` seeds it with `task.assignee?.name` so you can
see who owns the activity — and the filter then narrowed the dropdown to that
one person. It surfaced on "the first task" because every template-generated
activity is assigned to the release owner, so the box arrives holding the
owner's own name.

**This repo had already found and fixed this exact bug once**, in the sibling
`components/shared/ReleaseCombobox.tsx` (its comment: "the dropdown would show
ONLY the selected release — defeating the picker"). `TaskMemberCombobox` is
otherwise a near-line-for-line sibling; it just never got the guard. The rule
now lives in `filterMembersForPicker` (`lib/tasks.ts`) — **these two are the
only implementations of this guard and should stay in step.**

**Four things worth knowing before editing this:**

1. **The guard must not fire when there is no selection**, or a fresh picker
   stops filtering entirely. Mutation-tested: deleting the guard fails exactly
   the two tests written for it, and nothing else.
2. **It lives in `lib/tasks.ts`, not beside the component, because that is
   where tests can reach it.** vitest runs `environment: 'node'` and collects
   only `lib/**` and `app/**`; there are zero `.test.tsx` files in the repo and
   no jsdom or testing-library to add one with. `lib/task-sections.test.ts` is
   the precedent for testing `lib/tasks.ts` helpers this way.
3. **Blurring an empty box no longer unassigns.** It used to call
   `commitSelection(null)`, which persisted a real unassign — so tabbing
   through an assigned activity could silently drop its owner. It restores the
   display text now, matching `ReleaseCombobox.handleBlur`. Nothing is lost:
   the dropdown's explicit **Unassigned** row is the designed way to clear an
   assignee, and it is untouched.
4. **`PlanTaskRow` never seeded its query at all**, so an assigned planner
   activity rendered the "Nobody yet" placeholder — and, with the old blur
   behaviour, tabbing through that row unassigned the person. The draft is
   `string | undefined` on purpose: `undefined` means "not edited yet" and
   falls back to the live selection, so a later edit still wins.

Also, `TaskDetailView`'s seed effect is keyed on `task?.id` now rather than the
whole `task` object. The async detail fetch (and every field save) hands back a
new `task` reference for the SAME activity, which re-seeded the inputs and
clobbered whatever was being typed. **The very next effect in that file was
already keyed on `task?.id` with a comment explaining this exact hazard** — the
fix is that comment applied one effect up.

### Fields zoomed on tap

iOS auto-zooms when a focused control's text is under 16px, and **this
project's scale sits below that line almost everywhere**: `text-sm` 13px,
`text-base` 14px, and the shared `.input` class 15px via `--text-base`. Only
`text-lg` (16px) clears it — the same trap already recorded in the mobile-menu
section, where a search input had to move to `text-lg`.

One rule in `globals.css`, under `@media (pointer: coarse)`, sets form controls
to 16px. Three things are deliberate:

- **`!important` is load-bearing.** Tailwind's `text-sm` is a class selector
  and out-specifies a bare element selector, so without it the rule silently
  does nothing. Do not "clean it up".
- **`(pointer: coarse)` rather than a width breakpoint** — it targets the
  devices that actually auto-zoom, a landscape iPad and the Capacitor shell
  included, and leaves desktop untouched.
- **One rule, not ~130 hand-edited controls**, which would regress the first
  time anyone adds an input.

**The other two zoom paths were already closed and needed no code:**
`touch-action: pan-y` on `html`/`body` (and `pan-x` on `.overflow-x-auto`)
admits no zoom gesture, so pinch and double-tap were already disabled — which
is why the only symptom left was the focus auto-zoom, and why `touch-action`
could not have fixed it. Verified in the compiled CSS, not just the source.
**Do not touch the `html` rule while in that file:** its comment records that
adding `overflow-x` there broke `position: sticky` app-wide.

- **Verified:** 1596 tests (12 new in `lib/member-picker.test.ts`, mutation-
  tested), `eslint .` at the exact 3-error/66-warning baseline, `next build`
  green by exit code with `/auth`, `/onboarding`, `/settings` still `○ Static`,
  and the media query confirmed present in the MINIFIED output
  (`@media (pointer:coarse){...font-size:16px!important}`) — this repo has been
  burned twice trusting source over compiled CSS.
- **Not verified:** none of it has been seen in a browser or on a phone. The
  picker needs an authenticated session with a real teammate, which this
  sandbox cannot mint. Worth one pass: open an activity assigned to yourself,
  tap Assignee, confirm the whole team lists and nothing zooms, then type a
  partial name and confirm filtering still narrows.
