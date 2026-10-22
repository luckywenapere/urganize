# Cover art meets DSP requirements, and the task asks for it (2026-08-22)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: cover art must meet DSP requirements, and ticking off a cover
art activity should prompt for the upload (with somewhere to do it later if
they skip). Both halves extend the flag-off Cover art feature above; **still
flag-off**, same `NEXT_PUBLIC_FEATURE_COVER_ART`, no new flag, no migration,
no changelog entry (the ledger entry still lands at flag-flip).

**Not a scope expansion**, for the same reason the section above is not: this is
v1 scope item 4's *artwork*, finished rather than widened.

**What the old rules got backwards, and is the reason this was worth doing.**
Validation was size plus MIME only, and both settings were wrong in the same
direction: `ASSET_SIZE_LIMITS.cover_art` was **5 MiB** while a square
3000x3000 PNG (the Apple Music minimum, and what the playbooks tell managers to
commission) routinely runs past 10 MiB, and the MIME allowlist advertised
**WebP**, which no DSP ingests. So the product rejected exactly the files it
asks for and accepted files that cannot ship. The limit is now **25 MiB** for
`cover_art` only (`promo_image` stays at 5): safe because uploads go from the
browser straight to Storage through a signed URL, so neither Vercel's ~4.5 MB
body limit nor its timeout applies, and 25 MiB is inside Supabase's 50 MiB
per-upload cap. WebP is still *accepted* (it displays fine in-product) but is
graded down to a warning and no longer advertised.

**Five things worth knowing before editing this:**

1. **Warn, do not block, below spec — a founder call, not an oversight.**
   `lib/cover-art-dsp.ts` grades three ways: `blocked` (undecodable, not
   square, or under 640px), `warning` (square but under 3000x3000, or the wrong
   format), `ready`. A manager frequently has only the designer's draft and
   still needs it on the release card today, so blocking that would make the
   product worse than the group chat it replaces. Tightening `warning` into
   `blocked` is a product decision, not a correctness fix.
2. **Non-square blocks rather than warns**, because every DSP rejects it
   outright — there is no "use it for now" story for a 16:9 cover.
3. **The hard block is client-side only, and that is deliberate.** The picker
   measures the image (`lib/cover-art-image.ts`, the repo's FIRST image
   decoding anywhere) and refuses a blocked file; the POST handler stores the
   reported width/height as an untrusted **hint** rather than validating them,
   because validating server-side means decoding the image, which needs a
   native dependency this repo does not carry. Someone who bypasses the block
   by calling the route directly only mis-labels their own release. This is
   product guidance, not a security boundary — the `lib/chappi/tools.ts`
   posture about the model's workspace snapshot, applied here.
4. **Dimensions land in `assets.metadata.image` with NO migration** — that
   jsonb column has always existed and the cover-art POST was writing `{}` into
   it. Unrecorded stays distinct from zero: an image uploaded before this (or
   through the general Files scene) reads back as "we do not know" and shows no
   verdict, where a zero would grade as unreadable. Incidentally unblocks the
   `lib/capture-playbook/index.ts` comments that say it cannot grade artwork
   *because* `assets` stores no dimensions.
5. **`templateTaskId` is now the third piece of `metadata.template` surfaced to
   the client**, beside `taskType` and `compressedRunway`
   (`readTemplateTaskId` in `lib/tasks-server.ts`, mirroring `readTaskType`
   exactly). A completion has to know WHICH playbook step it was to offer the
   right follow-up, and nothing else carried that.

**The prompt.** `lib/cover-art-tasks.ts` holds an explicit allowlist of **nine**
playbook ids (the *draft delivered*, *final approved* and *upload to
distributor* steps of all three playbooks). The four *brief the designer* tasks
are excluded on purpose: that is when the work is COMMISSIONED, no file exists
yet, and prompting there trains the manager to dismiss the sheet. An allowlist
rather than a pattern because the three playbooks name these steps
inconsistently (`w6_cover_art_first_draft`, `w10_ep_art_draft`,
`w14_album_art_draft`) and because `templates.test.ts`'s precedent turns a
renamed template task into a failing test rather than a feature that quietly
stops firing. A task with **no** template id (manager-added) falls back to a
title match; a task WITH one never does, so an exclusion cannot be undone by
its title.

**Three bottom surfaces, still exactly one per completion.**
`useTaskStore.completeTask`'s either/or became a three-way, in priority order:
**cover art ask, then the check-in, then the undo toast**. Cover art wins
because it is the actionable one at the only moment the manager is certain to
have the file open. `coverArtPrompt` mirrors `outcomePrompt` slot for slot,
including being cleared in **both** places that one is cleared — the reopen
branch and `rollbackCompletion`. Missing either leaves a sheet asking about a
completion that no longer stands.

`components/tasks/CoverArtPromptSheet.tsx` is modelled on `TaskOutcomeSheet`
(same `z-[170]` tier, same `lockBodyScroll`, same `taskId:tick` remount, same
swipe-to-dismiss, reusing its `.task-outcome-sheet` keyframe rather than adding
a second, and **no Escape handler** — the detail pop-up owns Escape). It reuses
`useCoverArtUpload` verbatim, so the picker and the grading behave identically
to the scene. **Whether the release already has artwork is resolved in the
SHEET, not guessed in the store:** `Release.coverArtUrl` falls back to the
workspace logo, so it cannot answer "does this release have real cover art".
Skipping is a first-class answer and the copy names where the file lives
afterwards, which is the "somewhere to do it later" half of the request (the
Cover art scene, unchanged).

- **Verified:** the full vitest suite (956 passing, 24 env-gated skips, of
  which 41 are new across `cover-art-dsp.test.ts`, `cover-art-tasks.test.ts`
  and the upload suite), `eslint .` (3 errors / 65 warnings = the unchanged
  pre-existing `WorkspaceView.tsx` baseline, with **zero** findings on any file
  this touched), and `next build` green **by exit code** in both flag states
  with `/auth`, `/onboarding` and `/settings` still `○ Static`. Runtime probe
  of all four handlers: flag on they 401 unauthenticated, flag off they 404
  while `/api/releases` still 401s.
- **Not verified:** nothing has run against a real database or Storage bucket,
  and neither the sheet nor the grading has been exercised in a browser — the
  owner UI needs an authenticated session this environment cannot mint, and
  `readImageDimensions` touches `createImageBitmap`, which no test covers by
  design (its pure half is what the tests hold). Worth one manual pass at
  flag-flip: tick "Cover art final approved" on a real release and confirm the
  sheet appears in place of the check-in, upload a 3000x3000 JPEG (expect
  "Ready for the distributor"), a 1400x1400 (expect the warning AND a
  successful upload), and a 1920x1080 (expect the refusal).
