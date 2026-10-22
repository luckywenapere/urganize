# The recap moved into the chat too (2026-09-07, v1.29.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, straight after the status update landed: *"same for the release
recap, put it in urgans"*.

**NOT the same subtraction, and that is the whole design problem.** The status
update's output is a paragraph, so moving it into the conversation was mostly
deletion — the assistant could already say it. The recap's output is two PNGs,
and no amount of prose hands those over. So this one needed a real surface:
`components/chappi/ChappiRecapCard.tsx`, the mirror image of
`ChappiSongUploadCard` — that card exists because a tool cannot be HANDED a
file, this one because a tool cannot GIVE you one.

**Only ONE of the modal's four steps needed it.** `RecapModal` ran
`loading | form | generating | preview`, and the first three were already
conversational: `get_recap` answers "is there one and what are the numbers",
the optional highlight is collected by ASKING (the tool's own description
already told the model to), and `generate_recap` is the build. Only handing the
image over could not be said in words.

**Two things the modal carried that the card deliberately does not:**

1. **No Regenerate.** Asking again IS the regenerate, and it is better, because
   the highlight is part of the request — `POST …/recap` renders both sizes and
   uploads them BEFORE it touches the row, so a replace is already safe on
   every call. A Regenerate button here would rebuild with whatever highlight
   the last turn happened to use, which is the one thing a manager would want
   to change.
2. **No stat tiles.** On the poster the figures ARE the design
   (`lib/recap-card.tsx` lays them out), so tiles above it were in-app chrome
   explaining an artifact that already says it. The status update needed its
   figures in text because a paragraph can assert a number it did not check;
   an image of the numbers cannot. The model still has them from `get_recap` if
   anyone asks.

**Five things worth knowing before editing this:**

1. **The card fetches its own signed URLs on mount, and only the release id
   travels through the tool.** Those URLs are short-lived, so carrying them in
   the tool result would put a credential in the model's context AND leave a
   link in the transcript that expires while it sits there. One read per mount,
   exactly as the modal did per open. `ChappiClientAction`'s `open_recap`
   variant carries `{ releaseId }` and nothing else for this reason.
2. **`'recap'` was taken by the status update, and reassigning it is the fix
   rather than a side effect.** `resolveIntent`'s status branch matched
   `has('status', 'update', 'report', 'summary', 'recap')` — a reasonable
   grouping while the recap had a button of its own, and wrong once the word had
   to reach a card. `recap` is now its own branch, and it **must stay BEFORE the
   release branch**: that one claims `release`, so "release recap" would
   otherwise be read as "start a new release". Mutation-tested both ways —
   deleting the branch and moving it after the release branch each fail exactly
   one named test.
3. **The deterministic path builds the card too, and sends no highlight.**
   Production has run with `CHAPPI_MODEL` unset for long stretches, so the
   keyword branch has to do the real thing rather than point at a button that
   no longer exists (the status update's own lesson, one day old). There is no
   model in that path to hear "say it went platinum", and the route treats the
   highlight as optional — anyone who wants one asks in a sentence, which is the
   agentic path.
4. **Outcomes are reported as transcript lines, not toasts.** `onReport` feeds
   `appendAssistantReply`, matching how the two upload cards report
   (`handleSongUploaded`): this component renders in three surfaces — the page,
   the dock and the rail — and `ChappiConversation` has no toast channel at all.
   "Saved your recap card." is also a thing the assistant just did, so the
   conversation is the right place for it.
5. **The card gets its own state slot, keyed by release.** Not shared with the
   two upload pickers: a manager can plausibly be finishing one release while
   uploading art for another, and one slot would swallow whichever card was
   already open. Like them it survives later turns (a permission card must never
   outlive its proposal; a poster is not destructive) and is cleared by "New
   chat".

**Deleted with it:** `components/releases/RecapModal.tsx`, the `recapAction`
prop through `WorkspaceDesktopFocused` and `TasksPanel`, the pill, the
release-menu entry, the `RELEASE_RECAP_ENABLED` read and modal mount in
`WorkspaceView`, and the skeleton's note about not reserving that pill.

**And two things that lost their last consumer, deleted rather than left
dead:** `components/shared/StatTiles.tsx` and `buildStatusTiles` /
`StatusTile` in `lib/release-status.ts`. Both were kept a few hours earlier on
the reasoning that `RecapModal` still used them (the v1.28.0 section said so);
with the modal gone nothing does. `describeStatusFacts` — the prose line that
replaced the tiles for the status update — survives and is now the only
verification affordance either feature has.

**`isRecapEligible` in `WorkspaceView` STAYS**, and it is worth saying why it
is not orphaned: the archive action gates on it, because "worth celebrating"
and "safe to shelve" are the same moment. It also keeps its recap name, because
that is what the shared predicate in `lib/recap-eligibility.ts` is — its other
two callers are the recap route and `lib/delivery-records.ts`.

**AND THE PATTERN STOPS HERE. The Plan pill stays a pill — founder call,
2026-09-07, asked and answered the same day.** Two AI actions moved into the
conversation on two consecutive days, which makes "so the third one goes too"
an easy and wrong inference; taking it would be re-litigating a settled call.
The reasons it is not the same move: the seven-question intake **already runs
in chat** (`generate_release_plan` collects the answers, `approve_release_plan`
commits behind a confirmation card), so the conversational half is not missing;
what the pill opens is not a modal emitting a paragraph or an image but an
editable ~60-task document with autosave, per-phase redraft and an Approve that
writes the whole plan into `tasks` — a transcript is a poor place to edit sixty
rows, and deleting the scene would leave no way to edit a draft before
approving it; and the pill is self-removing anyway (shown only while a release
has no activities or a draft is waiting), so it never becomes the permanent
chrome the other two had become.

**SUPERSEDED 2026-09-15 — half of this reasoning was overtaken by a founder
call, not disproven.** There is no review scene, no draft, no `approve_release_plan`
and no per-phase redraft any more; the pill (still a pill) now opens the
intake, and finishing it writes the plan straight into `tasks` — see "The plan
is built, not drafted" near the end of this file. The "a transcript is a poor
place to edit sixty rows" argument is moot rather than wrong, because there is
no longer a DRAFT DOCUMENT to edit before commit at all: the manager edits the
created activities through the ordinary release view, the same surface every
other task uses. What survives from this paragraph is the actual reason the
pill stays a pill — the eight-question interview itself is still a poor fit
for the transcript's own turn-taking compared to a modal's discrete steps —
and the self-removing behaviour, unchanged.

- **Verified:** 2827 tests (10 new across `lib/recap-share.test.ts` and
  `lib/chappi/intent-router.test.ts`), `eslint .` at the exact 3-error /
  81-warning baseline (all three pre-existing in `WorkspaceView.tsx`),
  `tsc --noEmit` clean apart from the documented pre-existing
  `confirmed-action.test.ts` errors, and `next build` green **by exit code**
  with the recap flag on and with it off, `/auth`, `/onboarding`, `/settings`
  and `/dashboard` all still `○ Static` in each. Four mutation passes.
- **A mutation that SURVIVED, and the test that now kills it.** Dropping
  `recapFileName`'s post-slice hyphen trim failed nothing: the cap only leaves a
  trailing hyphen when it lands exactly on a word boundary, and no fixture did.
  A 47-character title that caps on its 40th character — the hyphen after
  "deluxe" — closes it. **Trimming before slicing is not enough, and the order
  is the property**; without the second trim the file reads
  `…-deluxe--recap-story.png`.
- **A mutation that never applied, which is the reusable half.** The first
  attempt at the branch-deletion mutation asserted a pattern with a trailing
  blank line the file does not have, so the write never happened and the suite
  passed — indistinguishable from a survivor. Both later attempts print
  `APPLIED` before running. **Confirm a mutation landed before believing it
  survived** (the same lesson the directory's Phase 5 recorded for a `sed`
  indentation miss).
- **CONFIRMED IN PRODUCTION the same day: the founder asked UrgAns for a recap
  on a finished release and the card came up.** That is more than a render — the
  card only reaches that state after its own `GET …/recap` resolves and returns
  a row with a `storyImageUrl`, so the tool's new `open_recap` action fired, the
  client dispatched it, the route answered and the signed URLs came back. It
  also settles the deploy: the v1.29.0 build was triggered at 16:16 UTC and
  Vercel's account-wide deployment rate limit closed at 16:19 (see the note
  under Deployment), so this landed in the last window before it.
- **Download is confirmed too, the same day: the founder pressed it and the file
  saved.** So the payload works end to end — `shareOrDownloadImage`'s web branch
  fetched the signed URL and `recapFileName` produced a name the browser
  accepted, which is the whole reason that builder exists (a file called `blob`
  or `download.png` is what it was written to prevent).
- **Two paths remain unexercised, both narrow:** the Story/Square toggle (the
  press was on whichever size was showing, and story is the default), and the
  NATIVE share sheet, which cannot be reached until a store build ships —
  `@capacitor/share` was added but the only APK on record predates it, so
  `lib/share-file.ts`'s plugin probe degrades to opening in the system browser
  by design. Same blocker as native push: the binary.
