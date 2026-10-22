# The status update moved into the chat (2026-09-07, v1.28.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, immediately after confirming the feature works: *"this feature should
be inside urgans chat not a seperate button"*.

**Mostly a subtraction.** `generate_status_update` has been a Chappi tool since
the original twelve, and it already returned the paragraph as its summary — so
asking UrgAns for a status update worked before this change. What was wrong was
that the same capability also had a pill, a modal and ~90 lines of duplicate
fetch logic in `WorkspaceView`. Those are gone: the action, the modal mount, the
dynamic import, four pieces of state, the generator function, the
`statusUpdateAction` prop through `WorkspaceDesktopFocused` and `TasksPanel`,
the pill, the release-menu entry, the skeleton reservation, and
`components/releases/StatusUpdateModal.tsx` itself.

**Two things had to move WITH it, and they are the whole risk in this change:**

1. **The deterministic branch pointed AT the button.** `resolveIntent` has had
   a `status` keyword branch all along, and `ChappiConversation`'s handler for
   it navigated to the release and said *'Taking you to the release — use
   "Generate status update" there.'* With the pill deleted that is a pointer at
   nothing, so it **generates in the conversation now**, calling the same route
   the tool calls. That matters because it is the no-model path: production has
   run with `CHAPPI_MODEL` unset for long stretches, and this is what keeps the
   feature reachable when the agent loop is unavailable.
2. **The stat tiles were the only verification affordance**, and they died with
   the modal. `components/shared/StatTiles.tsx`' own header says the point of
   the tiles is that a reader can CHECK a generated paragraph against the data
   it was written from, and the route's comment records `stats` as read by the
   modal alone. So `describeStatusFacts` (`lib/release-status.ts`) renders the
   same figures as one line — *"Based on 12 of 64 done, 3 in progress, 2
   blocked."* — appended to the paragraph on BOTH chat paths. It mirrored
   `buildStatusTiles` exactly (same order, same never-print-a-zero rule, `''`
   when there is nothing to verify) so the line and the tiles could not
   disagree about which figures are worth showing; the tiles and their builder
   were deleted the SAME DAY when the recap followed the status update into the
   chat, so the line is the whole surface now. In agentic mode it also gives
   the model real numbers to quote instead of inferring them from prose.

**What deliberately did NOT change:** the route, its flag and the tool.
`NEXT_PUBLIC_FEATURE_STATUS_UPDATE` still gates the route, and the tool still
translates that 404 into a refusal through `isFlagGateOff` rather than a bare
404 — the release-not-yours case must not read as "the feature is off".
`components/shared/StatTiles.tsx` was ALSO left in place, on the reasoning that
`RecapModal` still used it; hours later the recap moved into the chat too and
took the modal with it, so both are now deleted — see the section below.

**One residual, stated rather than papered over:** the capability now depends on
`NEXT_PUBLIC_FEATURE_CHAPPI`. The deterministic fix covers a missing MODEL, not
a missing assistant — if UrgAns were ever switched off, the status update would
have no entry point at all. Acceptable because UrgAns is the front door and has
been on since 2026-08-03, but it is a coupling that did not exist before.

- **Verified:** 2825 tests (11 new in `lib/release-status.test.ts`, written red
  first), `eslint .` at the exact 3-error / 81-warning baseline, `tsc --noEmit`
  clean apart from the documented pre-existing `confirmed-action.test.ts`
  errors, and `next build` green **by exit code** with the status/Chappi flags
  on and with them off, `/auth`, `/onboarding`, `/settings` and `/dashboard`
  all still `○ Static` in each.
- **A near-miss worth recording:** the regex that removed the modal's
  `dynamic()` import took `RecapModal`'s declaration with it — a non-greedy
  `(?:.*\n)*?\);\n\n` ran past the first closer because the two blocks are
  adjacent with no blank line between them. `tsc` caught it. When deleting one
  of several adjacent `dynamic()` blocks, match the import path, not the shape.
- **Not verified:** nothing has rendered in a browser. Worth one pass: ask
  UrgAns for a status update on a real release and confirm the paragraph AND the
  facts line come back, then confirm the pill is gone from the release header
  and from the mobile release menu.
