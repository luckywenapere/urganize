# Pitching gets a page; press kits move to Settings (2026-09-09, v1.36.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Two founder messages, one PR. A third in the same batch — "fold shows to be
possible inside per release" — was **withdrawn before any code was written**
("shows should be seperate, i change my mind"), so shows are untouched; the
research that went into it is worth keeping and is at the end of this section.

### Press kits left every menu (founder: "only accessible through settings")

Removed from all four surfaces that carried it: the identity card's nav row,
the topbar icon, the mobile bar's trailing tab, and `lib/app-pages.ts`'s search
catalog. `lib/prefetch-routes.ts` lost it too, since it is no longer a nav
destination and `/settings` is already a base route.

**THE PAGES DID NOT MOVE, and that was the whole design decision.** They still
live at `/dashboard/press-kits`, reached from one new `PressKitsSection` in
Settings → Profile. Moving the route under `/settings` was the other option
and is materially worse: it breaks `PostPlanKitPrompt`'s "Open the press kit"
CTA, any UrgAns `navigate` action pointed there, and every bookmark, and it
would put a heavy client page with its own modals and stores inside a route
whose skeleton contract requires it stay `○ Static`.

Three things worth knowing:

1. **The search catalog entry went, but findability did not.** "Press kit",
   "epk" and "bio" now match SETTINGS, through its keyword list — the same
   mechanism that already makes "billing" find Settings, and for the same
   stated reason ("a manager looking for their card details types 'billing',
   and nothing in the app is labelled that"). Settings is the honest answer to
   those words now. A test asserts both halves: no press-kits page entry with
   the flag ON, and those three queries reaching `/settings`.
2. **It sits in the Profile tab rather than Account** because a kit belongs to
   an artist on the roster, which is what the artist rows in that tab are
   already about. Above `ReleasesSection`, which is destructive and stays last.
   (That tab's label became **Profile** in v1.35.0; its file is still
   `tabs/WorkspaceTab.tsx`, so the code name and the label disagree by design.)
3. **`PostPlanKitPrompt` was deliberately left alone.** It is a contextual,
   self-suppressing banner after a plan is approved (it renders nothing unless
   the kit exists and has real proposals), not app chrome — and it is the one
   moment a manager has a reason to think about a kit at all.

### Pitching became app-wide, which needed a page first

The founder asked for pitching in the phone's bottom bar, the desktop side
menu and the top bar. **That was not buildable as asked, and the reason is the
useful part: the team side of pitching was a release SCENE** (`?scene=pitch`),
so every entry point to it required a release already scoped. A menu item
pointing at it had nowhere to go. The only pitching entry in the nav was the
dual-account crossing to `/curator`, which is the opposite direction.

So `/dashboard/pitching` is new: every pitch this team has sent, grouped by
release with each curator's answer, plus a composer that sends a new one once
you pick the release. **The release scene stays** (founder call) — one tap from
the release you are working on, and both surfaces render the same two
components, so they cannot drift into offering different fields.

**Seven things worth knowing before editing this:**

1. **THE TEAM-WIDE READ IS FILTERED TWICE, and the second filter is the one
   that matters.** `releaseOwnerIds` is a TEAM boundary, not a per-release one,
   so `.in('owner_user_id', ownerIds)` alone would hand an artist-scoped
   teammate every pitch their team ever sent, including for releases they are
   not allowed to see. The referenced releases are loaded in one query and each
   row goes through the shared `decideReleaseAccess` — named for releases and
   generic in fact, the same rule the events list uses for the same reason.
   Cloning it as SQL is how eleven route groups drifted apart.
2. **That filter FAILS CLOSED**, unlike nearly every counter in this app. A
   release that cannot be read back is one this caller should not be told
   about; the cost of being wrong is showing somebody another artist's work
   rather than refusing an action they could retry.
3. **A pitch whose release was deleted survives on the owner check alone.**
   `playlist_pitches.release_id` is `on delete set null`, so a pitch outlives
   its release by design, the curator may still answer, and hiding the row
   would lose that answer. `groupPitchesByRelease` collects them into one last
   group and the page labels it "Release removed".
4. **`SENT_PITCH_COLUMNS` gained `release_id`, and `lib/pitching-columns-guard.test.ts`
   exists because of it.** The curator's own list (`CURATOR_PITCH_COLUMNS`)
   carries no release, owner or playlist id ON PURPOSE, so their read path
   cannot follow anything back into a team's data. The two lists are now nearly
   identical, which makes "share one constant" a tempting and completely wrong
   tidy-up that no comment could stop. Mutation-tested: adding `release_id` to
   the curator list fails.
5. **`groupPitchesByRelease` keys on the release ID, never the title.** Two
   releases can share a name, and merging them would show one release the
   other's answers. Ordered by each group's NEWEST pitch rather than by release
   date, so the release actually being worked on rises to the top. Both
   mutation-tested, along with the orphan group's position.
6. **The page reads NO search params**, so it stays `○ Static` (verified in the
   build) and needs no Suspense boundary — the trap recorded for `/auth` and
   for `MobileNavBar`. The release picker's value is DERIVED rather than seeded
   by an effect: the manager's choice when they have made one, the first
   release otherwise, falling back again if a chosen release disappears from
   the catalog. An effect would have cost a `set-state-in-effect` warning AND
   left a render where nothing was selected and the composer sat disabled.
7. **The two pitching entries must stay distinguishable.** `/dashboard/pitching`
   is Pitching, glyph `Radio` (the release pill's own mark); `/curator` is
   Playlist pitches, glyph `Inbox`. The mobile bar's labels are `sr-only`, so
   the glyph is the whole visual difference — and that bar's curator label was
   widened from the bare "Pitches" to the fuller "Playlist pitches" so a screen
   reader does not hear two near-identical names in one bar. That also fixed a
   pre-existing disagreement, since the side menu already called it that.

- **The nav count is FLAT in every surface**, which is what made this cheap:
  Pitching took the slot Press kits left, in all three. The mobile bar's worst
  case is still seven (Home, UrgAns, Notes, Shows, Pitching, Directory, and
  Playlist pitches for a dual account); the topbar's control count is unchanged,
  so its documented width budget still holds.
- **Two real bugs fixed in the assistant's `list_pitches`, both silent.** It
  sent `?release=` where the route reads `releaseId`, so **that tool answered
  400 on every call it has ever made**; and it read `pitch.curatorReply` where
  the payload's field is `reply`, so the curator's answer — the only thing worth
  asking it for — would have come back null even once the request worked.
  `releaseId` is optional there now, matching the route, so "what have we
  pitched" is answerable at all.
- **`SentPitch` gained two fields additively** (`releaseId`, `releaseTitle`), so
  persisted `pitch` scene payloads from before this still parse; the scene does
  not read either.

### Verified

**3015 tests** (22 new: the grouping and scope helpers in `lib/pitching.test.ts`,
the column guard, and the two nav-list suites), `eslint .` at **3 errors / 82
warnings** against a **measured** clean-tree baseline of 3 / 81 — the one new
warning is the fetch-on-mount `set-state-in-effect` downgrade, confirmed
byte-identical in shape by linting `TeamsAdminPageClient.tsx` rather than
asserting the precedent. `tsc --noEmit` clean apart from the documented
pre-existing `confirmed-action.test.ts` errors. `next build` green **by exit
code** with both flags on and with both off, `/auth`, `/onboarding`,
`/settings`, `/dashboard` and `/dashboard/pitching` all `○ Static` in each.

Runtime probes on `next start`, rebuilding between flag states because
`NEXT_PUBLIC_*` is inlined at build time even server-side: **flag off**, the
team-wide `GET /api/pitching/pitches` returns **404** with body exactly
`{"error":"Not found."}` while the ungated `/api/releases` **401**s; **flag
on**, both the team-wide and the per-release form **401** unauthenticated. That
404-vs-401 discrimination is what proves the gate rather than a routing
accident.

**Four mutation passes, each killing exactly its own tests** and each printing
`APPLIED` first (the recorded lesson that a mutation which never landed is
indistinguishable from a survivor): grouping by title instead of id, orphans
first, orphans dropped entirely, and `release_id` added to the curator column
list.

**A FIXTURE BUG CAUGHT BY ITS OWN TESTS, worth recording because it is the
second instance of this shape in this repo.** Two of the new grouping tests
failed on first run and the implementation was correct: the fixture built its
nullable fields with `??`, which coalesces an explicit `null` to the default —
so the two cases named after a deleted release and an unresolved title were
never actually passing null. It uses `'field' in over` now. The directory's
Phase 5 hit the mirror image (a fixture ordered so "last wins" accidentally
picked the right row).

### NOT verified

**Nothing has rendered in a browser.** This sandbox cannot mint a session and
has no route to app.urganize.app, so the page, the picker, the grouped list,
the Settings row and all three nav entries rest on the build, the unit tests
and traced call paths. **No pitch has been sent and no team-wide read has run
against a real database**, so the double filter in point 1 has never been
exercised with real rows — which is the one thing most worth a real pass.

Manual pass at merge: open Pitching from each of the three menus; confirm the
list groups by release and a curator's reply shows; send a pitch and confirm it
appears in the right group; open Settings → Profile → Press kits and confirm
the page opens; confirm no Press kits row, icon or tab remains anywhere; and on
a dual account confirm Pitching and Playlist pitches are both present and go to
different places.

### Shows inside a release: researched, then withdrawn

Recorded so the next person asking does not re-derive it. **There is no
release↔event edge in the schema at all**: `events` carries `artist_id` and no
`release_id`, and the only join is `songs.release_id` → `setlist_items.song_id`
— a path nothing on the release side populates, because the release "Song"
scene writes to `assets` rather than to `public.songs`. So a per-release Shows
scene could only ever have listed the release's ARTIST'S shows, identically for
two releases by the same artist.

It would have been cheap to build (`GET /api/events` takes no params, loads the
whole accessible set and filters in memory, and `CreateShowModal` already
accepts a one-artist array), and it runs straight into three dated decisions:
the 2026-08-30 scope expansion that made Event a SIBLING of Release rather than
a child, Principle 1's amendment recording that, and
`WorkspaceIdentityPanel`'s own comment that Shows "is not a release scene and
never carries `?release=`". Adding one is a founder call against that record,
not a default — and the founder withdrew it.
