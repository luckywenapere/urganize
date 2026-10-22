# The assignee picker became a dropdown (2026-08-29, v1.5.3)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request, hours after v1.5.2: *"I don't think they should be able to
type in that place. They should just open the dropdown... whenever I click on
it, it just opens the keyboard and blocks the dropdown menu."*

`TaskMemberCombobox` was a text input that doubled as a search box, so tapping
it raised the phone keyboard over the very list being picked from. It is
deleted; `components/tasks/TaskMemberSelect.tsx` replaces it — a button trigger
over a `role="listbox"` panel, structurally `components/notes/NoteReleasePicker.tsx`
(outside-click close, Escape closes only the menu and returns focus, options
are real buttons so Tab and Enter work without roving focus).

**Search was dropped outright rather than hidden on mobile, and that is the
decision to re-read before adding it back.** The Manager tier caps a team at
four seats (`packages/pricing`, `limits.seats`), so the list is a handful of
people that a scrolling menu handles — principle 6, the case we have. A
viewport-conditional control would also mean two code paths for one picker,
which this file already records going wrong (the "three independently-correct
viewport rules leaving a band with zero entry points" note under playlist
pitching).

**It deletes a bug class rather than guarding one.** Both defects fixed in
v1.5.2 hours earlier — the seeded query filtering the list down to the current
assignee, and an empty blur persisting a real unassign — existed *only* because
the display and the filter were the same field. With no input, neither is
reachable. `filterMembersForPicker` and its 12 tests went with the component;
`ReleaseCombobox` keeps its own copy of that guard and is untouched, so the
release picker still searches (a release list genuinely can be long).

Preserved from the old component, deliberately: the "Unassigned" row as the
explicit way to clear an assignee, invited-but-not-joined members rendering
visible-but-disabled with "Pending invite" (assigning writes
`assigned_to_user_id`, which needs a real user id), the
`NEXT_PUBLIC_FEATURE_WORKSPACE` filter, and both densities. All three consumers
(`TaskDetailView`, `TaskQuickCreateModal` via `TaskUIProvider`, `PlanTaskRow`)
lost their `query` state entirely — that plumbing is gone, not merely unused.

- **Verified:** 1649 tests pass, `eslint .` at **3 errors / 65 warnings** — one
  warning BELOW the standing baseline, since the deleted component took its
  `set-state-in-effect` finding with it — `tsc --noEmit` clean apart from the
  pre-existing `confirmed-action.test.ts` errors, and `next build` green by exit
  code with `/auth`, `/onboarding`, `/settings` still `○ Static`. The compiled
  bundle was checked directly: `aria-haspopup`, `role="listbox"` and "Pending
  invite" are present, and the old "Search teammates" placeholder is gone.
- **Not verified:** not seen in a browser or on a phone — the picker needs an
  authenticated session with a real teammate, which this sandbox cannot mint.
  Worth one pass on each of the three surfaces, since the dropdown is
  absolutely positioned inside a scrolling modal in two of them.
