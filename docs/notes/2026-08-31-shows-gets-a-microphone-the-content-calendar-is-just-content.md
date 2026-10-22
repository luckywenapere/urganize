# Shows gets a microphone; the content calendar is just "Content" (2026-08-31, v1.11.3)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: *"on desktop show and calendar have the same icon, change the
content calendar title to content and change the icon of shows to a
microphone."* The collision was real and literal — `ShowsIcon` in
`WorkspaceIdentityPanel` was defined as `CalendarDays`, the exact glyph the
workspace's calendar pill uses, so the identity card's Shows row and that pill
showed the same mark.

Three things worth knowing:

1. **`MicVocal`, not `Mic`.** The former is the handheld performer's mic, the
   latter a podcast condenser, and a show is someone on a stage. Note `Mic2` is
   only a deprecated alias of `MicVocal` — do not reach for it.
2. **The swap is scoped to the three NAV surfaces** — the identity card's row,
   the mobile bar's tab, and the topbar's icon. `CalendarDays` deliberately
   stays everywhere it means an actual DATE: the shows list and a show's own
   page (both render it beside the date), the create-release modal, and
   `TaskRow` / `TaskDetailView` for due dates and event milestones. The Content
   pill also keeps its calendar glyph, because that scene genuinely is a month
   grid of planned posts — what was wrong was Shows borrowing it, not the
   calendar using it.
3. **The rename moved two skeleton placeholders, and that was not cosmetic.**
   `WorkspaceSkeleton`'s outbound row documents its own rule — every width
   rounds DOWN, because a placeholder wider than the real pill shifts every
   neighbour left when the labels arrive. "Content" is a character shorter than
   "Calendar", so the w-24 reservation sized for the old label became the one
   case that row forbids; both copies (the desktop footer and the mobile
   top-tabs strip) step down to w-20. A stale comment on the Metadata
   placeholder claiming it was "the same eight characters as Calendar" was
   corrected in the same pass — Metadata is now the wider of the two.

Both label sites moved together: the pill in `TasksPanel` and
`SCENE_LABELS.calendar` in `ReleaseScenePanel`. Keeping them in step is the
lesson of the Metadata rename earlier the same day, where the pill said
"Collect metadata" and the scene heading said "Metadata" for weeks. The one
string left alone is `CalendarTabs`' `aria-label="Content calendars"`, which
names the calendar OBJECTS inside the scene rather than the scene itself.

- **Verified:** 1851 tests, `eslint .` at the exact 3-error / 70-warning
  baseline, `next build` green by exit code with the events / calendar /
  identity-panel flags on and `/auth`, `/onboarding`, `/settings` still
  `○ Static`. Compiled output checked: `"Content"` present twice (pill + scene
  label), `"Content calendar"` gone from user-facing strings entirely, and
  `CalendarDays` confirmed still imported only by the date-rendering files.
- **Not verified:** nothing rendered in a browser — no session is mintable
  here — so the microphone's visual weight beside the other nav glyphs, and the
  w-20 placeholders against the real pills, are unobserved. Worth one look on
  desktop.
