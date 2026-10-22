# Standing press kits (2026-09-05, LIVE as v1.24.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

**This section was back-filled 2026-09-07 and is the surface's first entry in
this file.** It shipped, went live and took two follow-up releases with no
working-notes section at all — only an `.env.example` block — the same failure
mode already flagged here for Web Push, the mobile shell, the team brief and
`workspace-summary.ts`. Written from the code rather than reconstructed from the
commit message; where the two disagree, the code won. The fullest account of the
build itself is still `3b3e002`'s commit message.

**What it is:** one standing press kit per ARTIST at one permanent public link
(`/k/{slug}`), kept current by the team. Twelve sections — header, bios, latest
release, music, assets, video, credits, numbers, press, live, contact, links —
each with its own status, its own history and its own hide toggle. Urganize fills
in what it already knows, an interview asks for the rest, photos carry their
photographer credit, and publishing is a deliberate act with one precondition.

**It REPLACES the release-scoped EPK** (the third sanctioned expansion,
2026-07-30, URG-196), so it is not a twentieth expansion of its own — it is the
same sanctioned surface, re-shaped after the release-scoped version turned out to
answer the wrong question. `lib/epk-server.ts` assembles a kit live from ONE
release on every request, so it goes stale the moment the next release lands and
an artist accumulates one link per release. A press kit is not a release
artifact; it is a standing document about an artist that press, editors and
bookers hold one permanent link to. **What makes it legal against Principle 1 is
the 2026-08-30 amendment**: the kit hangs off the ARTIST, not a release, which is
the same move Events made. It is the third object beside Release and Show, and it
reuses the artist-scoped access rule rather than growing one.

**Flag:** `NEXT_PUBLIC_FEATURE_PRESS_KITS` (default `false`, **on in
production**). Gates the side menu entry, the topbar icon, the last tab in the
mobile bar, the search catalog entry, `/dashboard/press-kits` (which bounces when
off), and every one of the ten `/api/press-kits` routes (404 when off).

**Schema:** `20260905100000_press_kits.sql` — five tables, **applied in
production**. Its header argues eight load-bearing decisions and is the thing to
read before changing any of this; the four that shape everything else are
repeated below.

### Nine things worth knowing before editing this

1. **THE KIT OWNS ITS CONTENT, and that was a founder call rather than a
   shortcut.** `artists` is a name and a slug — no bio, photo, genre, socials,
   hometown or contact exists anywhere in the schema — so every field here is
   net-new rather than a duplicate. It was deliberately NOT promoted onto
   `artists`: there is no artist-profile surface to edit it from, and a half-built
   profile only one feature writes to is worse than a contained one. If a second
   consumer ever wants an artist bio, promote it THEN, with a migration and a real
   reader.
2. **DRAFT AND PUBLISHED ARE TWO COLUMNS ON ONE ROW**, not a snapshot table.
   `content` is what the team edits; `published_content` is what `/k/{slug}`
   serves. Publishing copies one to the other, so "what changed since the last
   publish" is a straight comparison and **editing a live kit cannot change the
   public page**. A null `published_content` means that section has never been
   published and the public page skips it. `publicSections` renders published
   content only, drops hidden sections (hiding one is the whole point of being
   able to) and drops empty ones (an empty heading reads as a product fault).
3. **THE SLUG IS GLOBALLY UNIQUE, and this is the ONE public page in the product
   meant to be FOUND.** Every other public surface here is `robots: noindex`
   behind an unguessable token; someone searching an artist's name plus "press
   kit" should land on this. A per-team namespace would need the team in the URL
   and would not serve that purpose, so the first team to claim a name holds it
   and a taken slug is refused at the API. Indexing is still opt-in —
   `isKitIndexable` returns true only for `public_listed`, so `link_only` and
   `public` both work for anyone holding the link and both stay out of search.
4. **`press_kit_assets` exists because `assets` CANNOT hold an artist's photo.**
   `assets_scope_check` requires every row to belong to a release or a task, and a
   standing press photo belongs to neither. Weakening that constraint would
   degrade it for every existing asset, so this follows `song_versions`, added for
   exactly the same reason: same bucket, its own path prefix, **its own size
   ceiling**. `MAX_PRESS_PHOTO_BYTES` must never alias
   `ASSET_SIZE_LIMITS.cover_art` — that number has already silently raised two
   different avatar limits (the curator photo and the workspace logo), and there
   are tests asserting it stays separate.
5. **`press_kit_section_versions` is the FIRST history table in this schema, and
   `team_brief_sections` explicitly cut one.** The brief asked for 30 days and
   one-tap restore per section, so it is built, and the deviation is recorded in
   the migration rather than left to be rediscovered. Two rules keep it from
   exploding, both pure and unit-tested: a version is written BEFORE an autosave
   overwrites content, and it **coalesces** into the newest row when that row is
   younger than five minutes and by the same person — without which an 800ms
   debounce writes a row per keystroke. `shouldCoalesceVersion` fails toward
   writing a NEW version on every uncertainty (no history, another person, an
   unreadable or future timestamp), because an extra version costs a row and a
   missing one costs somebody their words. **Pruning happens ON WRITE, never on a
   cron** — the Vercel plan caps crons at one a day and both slots are taken.
6. **`ensurePressKitAccess` reuses `decideReleaseAccess`, and cloning it would be
   the bug.** That function is named for releases and is generic in fact: it reads
   an owner id and an artist id and consults the caller's memberships and artist
   scope. A kit carries exactly those two fields and wants exactly that rule — a
   member sees the team's kits, an artist-scoped member sees only their artist's,
   a guest is read-only, a non-member gets a 404 that does not confirm existence.
   **One rule, three object types now.** It lives in `lib/press-kit-access-server.ts`
   rather than the route group's `_shared.ts` because the embedded-actions runner
   needs it too, and a lib module importing from `app/api` points the dependency
   the wrong way.
7. **`PRESS_KIT_NOT_FOUND_MESSAGE` is `'Press kit not found.'` and must never
   become `'Not found.'`** — `lib/chappi/tool-families/shared.ts`'s `isFlagGateOff`
   reads that exact string as "the feature flag is off", so the two would become
   indistinguishable and the assistant would tell a manager the feature was
   switched off when they had simply asked about somebody else's kit. That is a
   bug this repo has already shipped once, on `generate_status_update`.
8. **AUTOFILL WRITES ONLY WHILE A SECTION'S SOURCE IS STILL `'autofill'`.** The
   moment a person types into a section the PATCH flips it to `'user'`, and the
   moment UrgAns drafts one it becomes `'ai'`; either way autofill never returns
   to it. That is what makes re-running it safe **by construction rather than by
   care**, and it is the one rule `lib/press-kit-autofill.ts` exists to keep. It
   fills six of the twelve sections (`AUTOFILLABLE_SECTIONS`: header, latest
   release, music, credits, live, contact) and the credit builder reconstructs
   each entry field by field rather than spreading its input — the submissions
   table also holds an email, a phone number, a PRO affiliation, an IPI number and
   both splits, none of which belongs on a page anyone with the link can read.
9. **`press_kit_events` has a SELECT policy and no write policy.** Rows are
   written by the public page on behalf of somebody with no session, through the
   service-role client, and nothing signed in should be able to manufacture or
   erase a view record. Know what it can and cannot answer: counts, timestamps and
   per-asset downloads, but **never WHO opened the kit** — one permanent link per
   artist forecloses the per-recipient tokens that let `dj_pack_recipients` answer
   that.

### Rolling a release in, and why it is not autofill

`lib/press-kit-rollout.ts` is the answer to the six-months-later problem: autofill
runs once and refuses any section somebody has touched, which is right for a
first fill and wrong when a release has landed and the kit still points at the
last one. It differs in exactly two ways, both deliberate:

- **IT NEVER WRITES.** It returns proposals and a person accepts each one.
- **It proposes over hand-written sections too, and says so** (`handWritten` on
  each proposal), because refusing to mention a stale release would be worse than
  offering to replace a sentence somebody wrote.

The content comes from `buildSectionContent`, the same builders autofill uses —
one set, so the two can never disagree about what a release puts on a kit. It
**excludes contacts** (`ROLLABLE_SECTIONS`), because autofill fills a contact with
a blank role on purpose (the only role the product holds for a teammate is a
permission level, not a job title), so re-proposing it would offer to replace a
contact somebody completed in the interview with an incomplete one. And
`composite()` returns EMPTY when every part is empty rather than the naive `"|"`,
which is a truthy string that would give a nameless row an identity and add it
again on every roll-in.

### Smaller decisions worth not undoing

- **Publishing has ONE precondition: a reachable contact** (`canPublishKit`). A
  press kit whose reader cannot find who to email is a dead end, and it is the one
  thing the brief makes a precondition rather than a suggestion. Checked on the
  server, not only in the button.
- **Unpublishing leaves the published copy in place**, so re-publishing is not a
  re-authoring job.
- **THE EMBARGO IS A NOTICE, NOT A GATE.** A standing kit holds the bio, the
  photos and who to email; hiding all of that behind a date would break the kit for
  the ordinary reader to protect one piece of news, and a manager who wants it dark
  already has unpublish. So `embargoNotice` renders a line press are expected to
  honour, which is what an embargo means in this trade. A past date says nothing.
- **`deriveSectionStatus` has three shapes, not one**, because the sections
  genuinely differ: some are a handful of fields, some a list where any entry is
  worth having, and some a list where a half-filled entry is worse than none (a
  contact with no email, a number with no date). `assets` is decided by the photo
  count, since photos are their own table and its content is always empty.
- **Published outranks everything in `deriveKitState`:** once a kit is live it
  stays live while the team edits, because the public page is serving the last
  publish. A hidden section is a decision, not a gap, so it never holds the kit
  back.
- **`sameContent` is key-order independent**, or the editor treats a
  re-serialised object as an edit and autosaves the same values back on every
  mount.
- **Press photos are graded on ONE number, the long edge**, and reaching for
  `lib/cover-art-dsp.ts` here would be the bug rather than the shortcut: its
  second tier BLOCKS anything non-square, and most press shots are landscape, so
  it would refuse the entire input this feature exists to collect. A magazine
  running a photo at page width wants about 2000px; below roughly 1000px there is
  nothing to run. Too small still UPLOADS — the manager may have nothing better
  today, and an empty Assets section is worse than a thin one.
- **Photographer credit and usage rights are per FILE, not per kit**, because
  press cannot legally run a photo without them and different shoots have
  different photographers.
- **The interview's questions are COMPUTED from what the kit already holds**, so
  nobody is asked for something autofill found and somebody who answers half and
  comes back tomorrow is asked only about the rest. Eight per pass at most —
  more than that stops being an interview and becomes the form this exists to
  avoid. Every question is skippable and captioned with what press use it for.
- **`PostPlanKitPrompt` is OFFERED, NOT FORCED**, and renders nothing unless the
  kit exists AND the roll-in has real proposals. The moment is chosen rather than
  convenient: approving a rollout plan is when a manager has just decided a
  release is real, which is exactly when a kit pointing at last year's single is
  worth knowing about. Nobody goes looking for a press kit six weeks later.
- **`applyKitToRoster`** folds a freshly-loaded kit back into the cached roster,
  so a kit you just created or published does not sit absent or stale on the tab.
  Two rules: the ROSTER decides who is on it (a kit whose artist is not listed is
  ignored rather than added), and the roster's NAME wins over the kit's copy.

### The copy guard, and two structural guards

`lib/press-kit-copy-guard.test.ts` holds every user-facing string in this feature
(and, since 2026-09-05, the directory's) to five rules the brief states as rules
rather than preferences — **each one broke at least once during the build and was
caught by reading**: no em dash, never "ship" (a release is DELIVERED), never
"workspace", no placeholder stat or invented number or fake quote, and job titles
rather than titles borrowed from software. **Comments are exempt on purpose**:
they are the working record and hold dates, prose and the odd quotation, so
holding them to product copy rules would either gut them or teach everyone to
work around the test.

`BANNED_COPY_WORDS` / `BANNED_COPY_CHARS` / `bannedCopyInstruction()` live in
`lib/press-kits.ts` so **the model's instruction and the guard read one list** — a
house rule stated in two places is one that ends up meaning two things.

Two more guards, both scanning real source rather than asserting a fixed list, so
a NEW route violating the rule fails too:
`lib/press-kit-assets-guard.test.ts` (the asset routes' ordering, with the import
block stripped so an import of the auth helper cannot read as auth coming before
the flag) and `lib/press-kit-public-guard.test.ts` (the public page renders
published content and never the draft, is noindex unless deliberately listed,
never puts `next/image` on a signed URL, the public asset routes scope the photo
to the kit the slug resolved to and never proxy bytes, and the view beacon never
reports whether a kit exists).

### The assistant reaches it two ways

- **`presskit.draft_section`** — the embedded UrgAns action (propose → review →
  Apply). Note its registered id has **no underscore in "presskit"** while the
  object type is `press_kit`; the readable guess is wrong. It is `team_write`,
  honestly rather than by copying `release.draft_plan`'s `owner_write`, because
  every press-kit route already goes through `ensurePressKitAccess` and there is
  no owner-keyed legacy route underneath waiting to 404 a teammate.
- **Seven chat tools** in `lib/chappi/tool-families/press-kits.ts`:
  `list_press_kits`, `get_press_kit`, `create_press_kit`, `update_press_kit`,
  `write_press_kit_section`, `publish_press_kit` (confirmation-gated — it puts an
  artist's page on the public internet) and `unpublish_press_kit`.

`write_press_kit_section` and the embedded action are **not duplication**, and the
relationship is worth knowing: both import `DRAFT_ALLOWED_FIELDS` /
`isDraftableSection` from `lib/press-kit-draft.ts`, so "prose never facts" holds
on both paths — the model may write a bio, and never a number, a press quote or a
contact. The embedded one additionally owns `buildDraftMessages`,
`parseDraftOutput` and `decideDraftApply`, because it calls a model of its own and
has a draft→apply window to go stale in. The chat one composes in the transcript
and writes on assent, which IS a review step, just not a card (founder call).
`update_press_kit`'s PATCH replaces a section's `content` object, so it must
read-then-merge — the trap recorded for every sparse-looking PATCH in this
codebase.

### The retired EPK, and why its flag stays on

**`NEXT_PUBLIC_FEATURE_EPK` now has ONE job: whether an old `/epk/[token]` link
still resolves. LEAVE IT ON.** Nothing in the app makes an EPK link any more —
the scene, its API routes and its UrgAns tools are gone — but links already sent
are sitting in press inboxes and each one renders a working page. So an old link
is never broken: `resolveEpkSuccessorPath` keeps rendering the EPK until that
artist's standing kit is **published**, and only then hands over. The old page
retires itself artist by artist as kits go live, and turning the flag off breaks
every link anyone was ever sent — that is the LAST step of the retirement rather
than part of it.

Three details of the handover:

- **It is a 307, never a 308.** A permanent redirect would be cached by the
  reader's browser forever, so unpublishing a kit would leave a journalist stuck
  on a page that had gone back to a 404 with nothing we could do about it. Same
  reasoning the release-detail stub records for its own 307.
- **`successorPathForKit` requires BOTH halves** — a slug and a publish. A kit
  with no slug has nowhere to send anyone, and an unpublished kit is a 404 the
  reader could not get out of, which is strictly worse than the page they had.
- **Every uncertainty answers null**, and null means "render the EPK". A database
  blip costs nobody their page.

Several sections above this one still describe the EPK as the press-kit mechanism
(the 2026-07-30 EPK section, the footer-pill placement history, the
scoped-header pill lists). Those are the historical record of what that surface
was and are deliberately not rewritten; this section is what is true now.

### Status and what is not recorded here

**LIVE in production**, shipped as **v1.24.0** (2026-09-05, PR #501 after the
build in #499), with two follow-ups the same week: **v1.24.1** put Press kits at
the end of the mobile bar and moved Song off it, and **v1.24.2** made the press
kits tab paint from cache while it revalidates and stopped the single-kit screen
asking the server twice. The migration is applied and the flag is on — the ledger
entry landing at all is what says so, per the EPK precedent.

**v1.26.1 (2026-09-07) cached the single-kit payload too, and the two halves are
cached DIFFERENTLY on purpose.** The roster is metadata and lives in
localStorage (`stores/usePressKitsStore.ts`, the `useNotesStore` mechanics). The
single-kit payload is memory only (`lib/press-kit-detail-cache.ts`), because
every photo in it carries a signed Supabase URL — a persisted copy would outlive
the session and hand back URLs that 403, the trap already recorded for the files,
song and capture scenes. **Its five-minute TTL is derived, not chosen:** the
server re-signs only once a URL is 80% through its hour, so a URL handed to us
can already be 2880s old, leaving a worst case of twelve minutes; five minutes
keeps the oldest one we serve at 3180s. Redo that arithmetic before raising it.
It is read PRE-PAINT (`useIsomorphicLayoutEffect`) because the map is empty on
the server, so a render-time read is a hydration mismatch and a plain effect
flashes the skeleton for a frame; and it is WRITTEN from an effect mirroring live
state rather than from `loadDetail`, which is what covers the three mutations
that update `sections` locally and never re-fetch.

**The hazard that fix had to close, and the reason to read
`canAdoptServerContent` before touching the autosave.**
`usePressKitSection`'s section-change effect early-returns on an unchanged
section id — correctly, since a changing `persistedContent` identity must not
interrupt typing. That is exactly why the plan scene is excluded from the scene
cache ("painting a cached copy of a document under live edits could overwrite
newer text with older"). So a cached body the revalidate then disagreed with
would have survived in the draft and been saved back over the server's on the
next keystroke. That effect now adopts server truth when there is nothing to
lose, and the rule fails toward KEEPING the draft: never while a save is in
flight, and never while a failed save is waiting to resend — where the save
path's own `lastFlushed` bookkeeping makes the two bodies match despite the edit
never having landed, so matching bodies alone would adopt over it.

**The build's own verification record was never written down**, and this
back-filled section deliberately does not invent one: nothing here was re-run
while writing it. What IS checkable from the repo today is that the feature
carries seven unit-tested pure modules (`press-kits`, `press-kit-autofill`,
`press-kit-rollout`, `press-kit-public`, `press-kit-draft`,
`press-kit-interview`, `press-photo`) and the three structural guards above.
If a claim about this surface matters, read the code — that is what this section
was written from.
