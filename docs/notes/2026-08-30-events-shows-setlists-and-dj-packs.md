# Events: shows, setlists and DJ packs (2026-08-30)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The eleventh sanctioned scope expansion, and the one that gave the release a
sibling (see the 2026-08-30 note in "v1 scope" and the amendment to Principle
1). Phase 1 is complete in code behind `NEXT_PUBLIC_FEATURE_EVENTS`.
**LIVE in production as of 2026-09-02 (v1.20.0):** the founder flipped the flag
the same afternoon the festival-series PR (#476) merged and its migration was
applied; the version-bump commit is the rebuild that inlined it. Of the two
blockers recorded below, the mobile entry point was resolved 2026-08-30 and the
WAV ceiling remains a Supabase-billing fact, not a code gap. The manual pass at
the end of the activation checklist is the only step still open.

**What it is:** a show carries a venue, a set time, a slot length and a run of
show; one or more setlists are built against that slot with a live running
total; the songs' files go out to the DJ as a pack, one unguessable link per
recipient, with read receipts back.

**Schema:** `20260830120000_events.sql` — nine tables and four enums.
**Applied to production 2026-08-30.** Its header carries six load-bearing
decisions and is the thing to read before changing anything here; the two that
shape everything else are repeated below.

### Eight things worth knowing before editing this

1. **Song versions carry their OWN storage and do not reuse `assets`.** That
   table's `assets_scope_check` requires every row to belong to a release or a
   task — the release spine enforced in Postgres — and a back-catalog song
   belongs to neither. Weakening that constraint to serve the event side would
   degrade it for every existing asset, so `song_versions` got its own columns
   in the same private bucket instead, under a `song/<songId>/…` prefix that
   cannot collide (every release asset path starts with a release UUID).
2. **ONE access rule, three object types.** Shows, sets and songs all resolve
   through `decideReleaseAccess` — named for releases but generic in fact: it
   reads an owner id and an artist id, which is exactly what each of these
   carries. Cloning it per route group is how eleven release scenes spent a
   year drifting apart (see "Scenes opened to the team"); do not start a
   twelfth.
3. **Every row is stamped with the ARTIST'S or SHOW'S owner, never the acting
   teammate.** Every account owns a personal workspace, so a show created by a
   teammate and owned by them would sit where nobody else can read it and the
   team owner would never see the date they were told about. Same rule the
   release scenes follow for child rows.
4. **The running total refuses to say a set fits when it cannot know.**
   `summarizeSetlist` may report OVER on a partial set (unknowns can only add)
   but never ON TIME or comfortably UNDER. An unmeasured item resolves to
   `null`, never `0` — counting it as zero would silently shorten every set
   containing a song nobody has timed, which is the failure this whole surface
   exists to prevent. Both properties are mutation-tested.
5. **Per-recipient tokens ARE the read-receipt feature.** One shared URL can
   tell you somebody opened a pack; it can never tell you which somebody, and
   "the DJ has them, the engineer does not" is the only version of that
   question worth answering. The passcode is per-pack and opt-in (founder
   call); the token is per-recipient and is the only access control.
6. **Downloads go through our own route, never a storage URL.** Two reasons
   and both matter: the download has to be logged, and the file has to land as
   `01 Dorian - Lagos Nights (Clean)[102BPM][Am].mp3`. A signed Supabase URL
   arrives as a UUID, which is exactly what makes a pack useless in a dark
   booth. The leading number is what puts the folder in running order when a
   DJ drags it into Rekordbox.
7. **Revoking a recipient is SOFT, and the access log outlives them.** The log
   is the only deterrent on an unreleased track, so deleting the recipient row
   would blank the name beside every download they already made — hence
   `on delete set null` plus denormalized names. Note the log has a SELECT
   policy and no write policy at all: rows are written by the public route on
   behalf of someone with no session, and nothing in the product should let a
   signed-in user manufacture or erase a download record.

**Deliberate shortfalls against the spec, both founder calls to make:**

- **Reorder is up/down buttons, not drag.** Native HTML5 drag does not work on
  touch at all and this is used on a phone backstage; a real drag means a new
  dependency. Buttons work everywhere and are keyboard-reachable.
- **"Download all as a zip" is not built.** There is no archiver in this repo
  and the data export declined to add one on purpose. Per-track download works.

**Two things block the flag flip, and neither is a code problem:**

1. ~~No mobile entry point.~~ **RESOLVED 2026-08-30: Shows is a tab in the
   bottom bar, and it is the LAST one that fits.** Neither shape the request
   offered could host it — with `NEXT_PUBLIC_FEATURE_MOBILE_NAV` on, the topbar
   keeps only a centred logo and the help menu (that flag exists precisely to
   move nav OUT of the hardest-to-reach corner), and the one hamburger in the
   app is release-scoped inside `TasksPanel` and never renders on `/settings`.
   So it went in the bar, beside Notes, as the other global surface.

   **An overflow sheet was built first and then discarded, which is worth
   recording so nobody rebuilds it by reflex.** That design made the bar a
   fixed six with Shows, Notes and Pitches behind a More button — a reasonable
   answer to a bar that was running out of room, and the wrong one here for two
   reasons. The same day, three founder calls (#445/#446/#447) reshaped the bar
   and, in making Song and Pitches mutually exclusive, capped it at six with a
   measured seventh slot still clear (~53px at 375px against a widest label of
   ~45px). So the room existed. And demoting Notes and Pitches to reach it
   would have re-litigated arrangements the founder had just made deliberately.
   One tab uses documented headroom and touches nothing else.

   **The bar is now full.** Seven is the ceiling, worst case being Home ·
   UrgAns · + · Notes · Shows · You · (Song XOR Pitches). An EIGHTH surface
   needs the overflow sheet after all — that is the point to build it, not
   before.
2. **WAV downloads are blocked on Supabase billing, not on us.** The 40 MiB
   per-file audio ceiling exists because the free plan refuses uploads over
   50 MB. A studio master at 24-bit/48kHz runs ~16 MiB PER MINUTE and is
   rejected outright; a 4 minute WAV at 44.1/16 is ~38 MiB and only just fits.
   So packs can offer MP3 today and cannot offer WAV until that plan changes.
   The spec's WAV toggle is not buildable before then.

**Verified:** 1793 tests passing (including 27 on the events lib, 33 on the
setlist module and 15 on the pack logic); `eslint .` at 3 errors / 70 warnings
against a 3/66 baseline, the four new ones all the documented React-19
`set-state-in-effect` downgrade (three fetch-on-mount, one portal mount guard);
`next build` green by exit code in both flag states with `/auth`, `/onboarding`
and `/settings` still `○ Static`. Runtime probes in both states, rebuilding
between them: flag off every route 404s while an ungated control still 401s and
the public page reports itself unavailable; flag on they 401 and a bad token
resolves to nothing. The migration was applied to a scratch Postgres 16 and
every documented delete rule exercised with real rows — both halves of the
setlist shape constraint, all three restrict FKs refusing independently, the
release set-null keeping the song, and the log surviving recipient removal.

**NOT verified, and it is most of the surface:** nothing has run against the
production database or a real Supabase Storage bucket. No show has been booked,
no file uploaded, no pack sent, no link opened by a real DJ. This sandbox
cannot mint an authenticated session and has no network route to
app.urganize.app, so all of it rests on unit tests, the scratch-Postgres apply
and traced call paths.

**Activation checklist:** (1) ~~the migration is already applied~~ — done
2026-08-30, and the series migration `20260902100000_events_series.sql` was
applied 2026-09-02; (2) ~~solve the mobile entry point~~ — done 2026-08-30;
(3) ~~set `NEXT_PUBLIC_FEATURE_EVENTS=true` in Vercel `Web`~~ — done
2026-09-02, with the v1.20.0 bump commit as the rebuild that inlines it
(`NEXT_PUBLIC_*` is inlined at build time; a version bump touches
`apps/web/package.json`, so `turbo-ignore` rebuilds — the measured 2026-08-16
fact); (4) ~~changelog entry + minor version bump~~ — done as v1.20.0;
(5) **OPEN:** verify end to end with a real date — book a show,
build a set that runs over, upload an MP3, send it to yourself, and confirm the
receipt flips from "Not opened" to "Downloaded".

---

### A festival is a series of shows; set names are editable (2026-09-02)

Design partner Chiderah, via WhatsApp, on the day after Shows went live for
her: "can we have number of days; like for a show with 7 days 120 minutes
duration each", "in cases where it's a festival", "we can now have different
artists with their own set for a single festival" — and, a few minutes later,
the cheaper idea: "or we can simply make set names editable. Set 2 could be
'#2 Victony's setlist'." Both shipped, under the existing
`NEXT_PUBLIC_FEATURE_EVENTS` flag (no new flag: this amends a dark feature the
way EP/album were amended under theirs).

**Two founder decisions, asked before building.** (1) A festival is modelled as
a **series of linked single shows** — one `events` row per artist per day — not
a festival object with days and a lineup; the events spec names multi-day
festival routing as a non-goal, and this stays inside that line because every
row is still one artist, one slot, its own setlists and its own DJ pack, with
nothing about travel, budgets or guest lists added. (2) The artists are the
**workspace's roster artists only**; there is no free-text outside act.

**Why rename alone was not the answer, and is worth remembering:** a setlist
has no artist of its own. `SetlistBuilder` fetches
`/api/songs?artistId=<the show's artist>`, so a set renamed "Victony's setlist"
inside another artist's show would offer none of Victony's songs. One show per
artist is what makes each artist's set real; the rename is labelling.

**Four things worth knowing before editing this:**

1. **A series is a GROUPING KEY, not an object.** `20260902100000_events_series.sql`
   adds three nullable columns to `events` — `series_id` (no FK, on purpose:
   there is nothing to point at and a parent with a cascade would make "cancel
   Day 3" and "cancel the festival" one operation), `series_title`
   (denormalized onto every member so the list groups without a join, the
   `playlist_pitches` precedent) and `series_day`. Null on every existing row.
   `parseEventFields` deliberately does not accept them, so the sparse PATCH
   cannot move a show between series: which festival a show belongs to is a
   creation fact.
2. **Day N is the same WALL CLOCK, never "+24h".** `shiftLocalDays` adds
   calendar days to the `datetime-local` string and `toIsoInZone` converts each
   day in the venue's zone, so "11:00 every day" survives a daylight-saving
   change; adding 24 hours to the instant would shift every post-transition day
   by an hour, the silent set-time error `events.timezone` exists to prevent.
   Tested across the March 2026 London transition.
3. **`POST /api/events/series` mirrors `POST /api/events` step for step** —
   flag 404 first, every artist resolved against the CALLER'S roster with the
   same existence-hiding 404, every row stamped with its artist's owner, one
   batch insert, a best-effort run-of-show seed per show. Caps:
   `MAX_SERIES_DAYS = 14`, `MAX_SERIES_SHOWS = 60` (days × artists), typo guards
   rather than ceilings. A one-day series (several artists, one night) keeps the
   bare title; otherwise members are titled "Flytime Fest: Day 3" — a colon,
   not a dash, and the artist is not repeated because it is already the row's
   eyebrow.
4. **Deleting one member leaves the others** (exercised on a scratch Postgres):
   a cancelled day is a real thing. There is no "delete the festival" action
   and none is planned.

- **UI:** `CreateShowModal` gained a "One show / Several days or artists"
  radiogroup; the single-show form is unchanged, the series mode swaps the
  artist `<select>` for checkboxes (all roster artists pre-ticked, since
  "book the roster" is the common case), adds "How many days", relabels the
  start "Day 1 set starts" and books with "Book them", landing back on the
  list. `ShowsPageClient` renders `groupShowsBySeries(events)` — a standalone
  show keeps its row, a series gets a "Festival" card with "N days · M artists",
  the date range and one compact row per member (`Day n · Artist`, own time,
  own status pill). `ShowPageClient` shows `Artist · Festival` as the eyebrow
  and an "Other days and artists" link; setlists and packs are per show, which
  is the point.
- **Set rename:** the `PATCH /api/setlists/[setlistId]` route already existed
  (`parseSetlistName`, 80 chars); only the UI was missing. The set chips now
  show from the FIRST set (they waited for a second), and a Rename button turns
  the active chip into an inline input — Enter or blur saves, Escape cancels,
  empty keeps the old name. Default names stay "Main set" / "Set N".
- **Verified:** 2098 tests (14 new in `lib/events.test.ts`), `eslint .` at the
  exact post-merge 3-error / 70-warning baseline, `next build` green by exit
  code with `NEXT_PUBLIC_FEATURE_EVENTS` on and off, `/auth`, `/onboarding`,
  `/settings` still `○ Static`; runtime probe flag on → the series route 401s
  unauthenticated, flag off → 404 while `/api/releases` still 401s. The
  migration was applied to a scratch Postgres 16 on top of the events
  migration: existing rows read back with null series fields, `series_day = 0`
  is refused, deleting one member leaves its siblings, and a re-apply is a
  no-op.
- **NOT verified:** nothing has run against the production database or in a
  browser — the modal, the grouped list and the inline rename need an
  authenticated session this sandbox cannot mint. Manual pass at flag-flip:
  book "Sticks n Stones", 7 days, 120 min, two roster artists → 14 rows grouped
  on the list → open Day 3 for one artist, rename its set to "#2 Victony's
  setlist", confirm the song picker shows THAT artist's catalog and the 120-min
  total.
- **Also fixed (founder ask, same day):** an empty set read "You are 120
  minutes under 120." — `describeSetlistFit` fell through to the under-copy.
  It now says "Nothing in the set yet. You have 120 minutes to fill."; zero
  measured plus zero unmeasured can only be an empty set, since every stored
  duration is checked > 0. Tested.
- **Activation:** apply `20260902100000_events_series.sql` before
  `NEXT_PUBLIC_FEATURE_EVENTS` is flipped; the flip, ledger entry and version
  bump remain the Events feature's own activation step.
