# Timeline view (2026-08-30, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The eleventh sanctioned expansion (see the 2026-08-30 note in "v1 scope"), and
Phase 1 of the spec only: one release, read plus drag. Behind
`NEXT_PUBLIC_FEATURE_TIMELINE`, default off. **No migration, no API route, no
new table** — it is a lens on activities the workspace already has in props.

Internally the Gantt view. **In product it is Timeline**, and every user-visible
string says so.

### What the spec's two blocking questions turned out to answer

The spec called a nullable `start_date` column blocking, on the reading that
activities store only a due date. They store more than that, and the two
findings below are why this shipped without touching the schema.

1. **`duration_days` is already persisted on every generated activity**, at
   `metadata.template.duration_days` — written by `instantiate.ts` since it was
   first built and by `release-planning-server.ts` on plan approval. It reaches
   the client now as `Task.durationDays` via `readDurationDays`, the fourth
   reader of that object alongside `taskType` / `templateTaskId` /
   `compressedRunway`. A manager-added activity correctly carries none, and null
   means "we do not know", which renders as a point rather than a guess.

2. **Every activity in every playbook is either 1 day or 7 days, and nothing
   else** — single 57/7, EP 76/14, album 95/18. So ~89% of a release is
   single-day work, and a bar chart of it would be 57 one-cell stubs pretending
   to have span. **They render as markers and only genuine multi-day work
   renders as a bar.** That is not the spec's fallback rule being invoked, it is
   the shape of the data, and it is what the founder's "go ahead" chose. If a
   future playbook revision changes that ratio the view's design should be
   revisited — `release-timeline.test.ts` pins the current numbers against the
   live single playbook so the change cannot pass unnoticed.

`start_date` is therefore still the right column for **manually-added
activities and edge-dragging** (P0 #7's resize half, not built), and the spec's
"do not backfill a guessed duration" instinct still holds.

### Six things worth knowing before editing this

1. **`dueDate` is the START of the run, not the deadline.** Counter-intuitive
   given the column name, and reversing it mirrors every bar to the wrong side
   of its week. The playbooks settle it: every 7-day activity reads *"Begin
   curator/playlist outreach... Ongoing across the week"* at `offset_days: -42`,
   which is the playbook's own Week 6. So a span is
   `[dueDate, dueDate + durationDays - 1]`. Mutation-tested — reversing it fails
   exactly two named tests.
2. **The date frame is UTC, deliberately, and the tone frame is not.**
   Instantiation computes due dates as `Date.UTC(release) + offset * 86400000`,
   so reading them back with UTC components is exact and a template activity
   round-trips to its own `offset_days` (asserted against all 64 tasks of the
   live playbook). Local-time arithmetic would shift roughly half the world by a
   day. Tone, though, comes from `getTaskSectionKey`, which uses local midnight,
   because "is this overdue" is a question about the user's day. The two can
   disagree for a few hours around midnight, and that is the correct trade.
3. **Tone is inherited, never recomputed.** Deriving it from
   `getTaskSectionKey` means the timeline and the activity list cannot disagree
   about what is overdue, and it inherits two rules for free: status beats due
   date, and a compressed runway is "catch up" rather than slippage — without
   which a release created inside its own lead time would open screaming red
   about a compressed schedule rather than about anything wrong.
4. **The axis stretches to reach today, bounded.** The spec asks for an axis
   running "from the earliest activity to release day plus two weeks" AND a
   today marker "without which the whole view is decorative". Those conflict
   whenever today falls outside the scheduled span, which is the normal state of
   a release planned months ahead. So the axis reaches for today up to
   `TIMELINE_MAX_TODAY_GAP_DAYS` (84); beyond that — a release that ended two
   years ago — no marker is drawn rather than a hundred empty columns.
5. **It is out of `CacheableSceneName`, for the opposite reason to `plan`.**
   That one is excluded because it edits its payload; this one because it
   **fetches nothing at all**. There is no route to prefetch and a fetcher for it
   would have to invent a request that does not exist. Pinned by a test.
6. **Container query, not `lg:`** (`.tl-scene-container`, 34rem — the calendar's
   `.cc-*` mechanism at a lower threshold, since week columns of dots need less
   room than a month grid of post titles). The recorded trap applies here
   exactly: the UrgAns rail and the identity card narrow the centre column
   without narrowing the viewport, so a viewport gate would hand a 13-week grid
   ~450px. Below the threshold the scene renders the vertical week-by-week list,
   which is the documented mobile behaviour rather than a degraded desktop view.

### Smaller decisions

- **Drag is wide-widths-only and read-only below**, per the spec's non-goal:
  precision dragging on a 380px screen is a real source of accidental date
  changes. Tapping a row on the narrow view opens the detail pop-up, where the
  date is an ordinary input.
- **A drag snaps to whole days** (`daysForDragDelta`). The axis is ~11 weeks in a
  few hundred pixels, so a free drag lands on arbitrary timestamps and a manager
  aiming for next Tuesday misses.
- **A click and a drag are the same gesture until pointer-up**, distinguished by
  whether any whole day of movement accumulated. Zero movement opens the detail
  panel; anything else reschedules. No second editing surface is built, per P0 #6.
- **A failed reschedule snaps back and says so** — the optimistic day offset is
  dropped and the error is toasted, rather than leaving a bar somewhere the
  server never agreed to.
- **Dateless activities are listed, not dropped.** A manager-added activity often
  has no date yet, and silently omitting it from "the whole rollout on one
  screen" would make the view lie.
- **Phases come from `derivePlanPhase`**, the same definition the plan review
  scene groups by, keyed on the START of the work. Collapsed by default with a
  summary bar spanning the phase, so a shut phase still says when it runs.
  **Corrected 2026-09-06: they default EXPANDED now.** Collapsed was right for a
  scene you chose to open and exactly wrong for a landing view — the whole
  reason the buckets were retired as the main view is that they ship collapsed,
  so swapping five closed drawers for four would have answered nothing. The
  narrow week list always rendered expanded and needed no change.

### Verified

1743 tests (34 new in `lib/release-timeline.test.ts`), `eslint .` at the exact
measured baseline (**3 errors / 66 warnings**, all pre-existing in
`WorkspaceView.tsx`) with **zero new warnings** despite the drag handlers, and
`next build` green **by exit code** in both flag states with `/auth`,
`/onboarding`, `/settings` and `/dashboard` all still `○ Static`. Two mutations
were run and each failed exactly the tests written to catch it: reversing the bar
direction, and treating every activity as a bar.

### Not verified

**Nothing has rendered in a browser.** This sandbox cannot mint an authenticated
session and has no network route to app.urganize.app, so the grid, the drag
gesture, the container-query breakpoint and the mobile list rest on unit tests
plus the build. The usual trap applies to any attempt to check the flag from the
bundle: both ternary branches compile in, so grepping for "Timeline" proves
nothing — `resolveActiveScene` returning null with the flag off is the real gate
and is unit-tested in both states.

Worth one live pass at flag-flip: open a real 64-activity release, confirm the
today line lands where it should, expand a phase, drag a 7-day bar and confirm it
persists, then drag one with the network throttled to see the snap-back.

### Adjacent defect found, deliberately NOT fixed here

**RESOLVED 2026-09-03, and this section is left as the record of what it cost
while it lasted.** The UrgAns embedded-actions work fixed the key mismatch
because `lib/task-owners.ts` depends on reading it correctly; the reader now
accepts both keys, and `lib/tasks-server.ts` carries the fix note. The
directory's role map (`lib/directory-roles.ts`, 2026-09-05) is the second
feature to depend on it. The original finding follows.

**`templateTaskId` is null on every activity in the product.** Both writers store
`metadata.template.task_id` (`instantiate.ts`, `release-planning-server.ts`) and
`readTemplateTaskId` in `lib/tasks-server.ts` reads
`metadata.template.template_task_id`. They have never matched.

The consequence is in `lib/cover-art-tasks.ts`, whose design depends on the
distinction: an activity **with** a template id is matched against the nine
allow-listed playbook steps and never falls back to a title match, which is what
excludes the four "brief the designer" steps from prompting for a file that does
not exist yet. With the id always null, every activity takes the title-match
fallback, so that exclusion is not actually holding. It is dark today
(`NEXT_PUBLIC_FEATURE_COVER_ART` is off), which is why it has gone unnoticed.

Not fixed in this PR on purpose: it is a behavioural change to a different
feature, and folding it into a timeline diff would bury it. It wants its own
change, and a test asserting a round trip through the writer rather than a
hard-coded key string.
