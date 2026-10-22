# Collect metadata: three closed cards on entry (2026-08-25)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, second time on this exact page: the Collect metadata scene is
"overloaded with too much information for when a user just enters that
section" — "bring down the information so that even a 5th grader would
understand what is going on there and how to use it intuitively." Round one
(2026-08-13, see the docblock at the top of `MetadataSection.tsx`) fixed the
COPY — Step 1/2/3 labels, plain-English hints, "all optional" said out loud —
but left the structure untouched: every step still rendered fully open on
entry, so a first visit painted an intro line, three headers, three helper
paragraphs, all 8 fields with their hints, the explicit checkbox, Save, the
link card, and an empty-state line, all at once. Copy alone didn't fix a
volume problem.

**The fix: the three steps are now collapsed cards, closed on every entry.**
A user sees the scene header, one short intro line ("Everything music stores
need for this song, in three steps. Tap a step to open it — everything is
optional."), and three tappable cards — a plain title plus a live one-line
status chip (`N of 8 filled in`, `Link is live` / `No link yet`, `N answers` /
`No answers yet`, with `· check the shares` appended in warning tone when a
collected split doesn't total 100%). Tap a card to open it; everything inside
is exactly the round-one content, unchanged.

This reuses the house pattern rather than inventing one: the workspace task
buckets (`TasksPanel.tsx`) are collapsed-by-default `<button aria-expanded
aria-controls>` headers with a `ChevronDown` that rotates `-rotate-90` when
closed, and their own comment records the reasoning this borrows verbatim:
"The header counts carry the signal at a glance; opening a bucket is a
deliberate act."

**Three things a later change will be tempted to get wrong:**

1. **No smart auto-open of "the next incomplete step."** That would re-dump
   the 8-field grid on exactly the first-time user this complaint is about.
   All three cards start closed, unconditionally, every time the scene mounts.
2. **The open/closed state is session-only `useState`, deliberately NOT
   persisted** like the task buckets are (no `lib/persisted-state` key).
   Buckets are a daily working view a user curates over many visits; Metadata
   is visited occasionally and the complaint was specifically about *entry* —
   every entry has to start calm, not resume wherever the user last left it.
3. **A load error hides all three cards behind ONE error box.** Before this
   there were two identical Retry boxes (Step 1 and Step 2) plus a Step 3
   whose empty-state copy quietly lied during an error. It's one fetch for the
   whole scene, so one error state covers it — and it also avoids editing a
   form seeded from `EMPTY_FORM` mid-error, which risks saving blanks over
   real data.

**Not touched:** every handler, the fetch/cache logic, the dirty-form ref,
genre prediction, the `window.confirm` copy, `SubmissionCard`, the `Field`
helper, and the scene chrome (`ReleaseScenePanel`'s header/back-control, the
entry-point pills, the topbar) — this is a render-layer restructure of
`MetadataSection.tsx` alone. `ReleaseSectionSkeletons.tsx` is also untouched:
`MetadataFieldsSkeleton` and `ShareLinkCardSkeleton` keep their exact shape
and their exact `border-stroke-default bg-bg-surface` tokens, and the real
content boxes inside each open card were deliberately kept on those same
tokens (a first draft tried `border-stroke-subtle bg-bg-elevated` to visually
separate the nested box from its new outer card, then reverted it — that
would have made loaded content flash a different shade than the frozen
skeleton the instant data arrives). No flag change, no migration, no API
change.

**Verified:** `vitest run` and `eslint .` at the unchanged baseline (3 errors
/ 66 warnings, all pre-existing in `WorkspaceView.tsx`), `next build` green by
exit code, `/auth`, `/onboarding`, `/settings` still `○ Static`. **Not
verified:** the scene has never been opened in a browser — it needs an
authenticated session with a real release, which this sandbox cannot mint and
has no network route to. The change is markup-only over unchanged handlers,
so the risk is visual rather than behavioral; worth one live pass: open
Collect metadata, confirm three closed cards with correct statuses, open Step
1, fill a field, Save, and watch the chip move.
