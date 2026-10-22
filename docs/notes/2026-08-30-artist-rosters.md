# Artist rosters (2026-08-30, v1.6.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A team can hold several artists. Founder call, taken the same day the Solo tier
advertised "Up to 5 artists" against a product that could not do it — the claim
and the capability are back in step.

**Not a scope expansion**, and barely a build: **no migration**. The schema has
allowed many artists per workspace since Migration 2 (2026-06-02) swapped the
artists unique index to a partial `(workspace_id, slug)`, and the
workspace-scoped-artists section had predicted this exact change down to the
work it would take. Three things turned out to be already built:

- **`POST /api/releases` has always accepted an artist** — an `artistId`
  authorised against workspace MEMBERSHIP (not just ownership), or an
  `artistName` it looks up or creates. The create-release modal simply never
  sent one, so the API half of "pick an artist" existed and was unreachable.
- **Artist-scoped teammates already work, and were always multi-artist.**
  `workspace_members.artist_scope_id` shipped 2026-07-23 and is enforced in
  `decideReleaseAccess` (so eleven scene route groups plus the single-release
  GET), `loadWorkspaceMembers`' task reads, the release list and the command
  centre. It was near-pointless while a team had one artist.
- **`getWorkspaceArtist`'s `.order('created_at').limit(1)`** was written as a
  defensive tiebreak and quietly became the contract: the first row is the
  team's original artist.

**Six things worth knowing before editing this:**

1. **The artists ceiling has TWO creation points, and capping one is capping
   none.** `POST /api/workspace/artists` is the one a person uses;
   the lookup-or-create branch inside `POST /api/releases` mints an artist for
   any caller that names one we have not seen. Both call `checkArtistAllowance`.
   This is the seat cap's lesson applied before it could bite rather than after.
2. **Oldest-first ordering is a contract, not a display choice.** It decides
   which artist an API call that names none is filed under, and which artist the
   identity card falls back to. Mutation-tested: reversing it fails exactly one
   named test.
3. **Everything about the roster fails open.** An unreadable count, an
   unresolvable tier, a failed roster fetch in the modal and a failed fetch in
   Settings all degrade to the pre-roster behaviour rather than to an error. The
   modal case is the sharpest: no roster means no picker and no `artistId`,
   which drops straight back onto the server's implicit-artist path, so a
   broken fetch can never block release creation.
4. **The picker renders only when there is more than one artist**, the
   release-type picker's precedent exactly. A one-artist team sees the form it
   saw before this existed, and it preselects the first artist — the one the
   server would have chosen anyway — so the picker changes what is VISIBLE,
   never what a manager gets by leaving it alone.
5. **The artist-scope invite picker reads the real roster now.** It derived its
   list from existing RELEASES, so an artist with no releases yet could not be
   scoped to — which is every artist you have just added and are about to invite
   someone to. Releases remain the fallback only while the roster is loading, so
   the picker never empties for someone who could use it a moment ago. This is
   what makes "an artist only sees their own releases" reachable; the
   enforcement behind it needed no change.
6. **The identity card names the artist of whichever release you are looking
   at** (founder call), falling back to the one artist's name, or to a count
   once there are several — naming just the first would read as "the team's
   artist". The `?release=` read sits in its own child component behind a
   Suspense boundary, matching what that file already does for its nav:
   `useSearchParams` in a statically prerendered client component bails out to
   the nearest boundary, and this card is mounted app-wide including on
   `/settings`, which must stay `○ Static`. **Do not lift that hook into the
   panel body.**

- **`/api/workspace/artist` (singular) is deleted**, not deprecated: it had one
  consumer, which now reads the plural route. Its schema-missing-fallback
  baseline entry was ratcheted out of `schema-fallback-guard.test.ts` — and that
  guard earned its keep here, failing the build when the new routes were first
  written by copying that route's error handling, which CLAUDE.md already
  records as a grandfathered baseline rather than a template. Second time that
  exact mistake has been caught by that test.
- **DELETE shipped 2026-08-30 (v1.8.0)** and only ever removes an artist
  attached to nothing — see "Removing an artist" below. **Existing releases stay
  with their original artist when a second is added** (founder call): nothing
  moves on its own, and nothing is moved by a delete either.
- **Verified:** 1682 tests (11 new in `lib/artists-server.test.ts`, plus artist
  ceiling coverage in `entitlements.test.ts` including that no pre-tier plan is
  newly capped), `eslint .` at the exact 3-error / 65-warning baseline, and
  `next build` green **by exit code** with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. Runtime probes in both flag states, rebuilding
  between them: workspace flag ON, `/api/workspace/artists` 401s
  unauthenticated and `/artists/[artistId]` 405s a GET (PATCH only); flag OFF it
  404s while the ungated `/api/releases` still 401s — that discrimination is
  what proves the gate rather than a routing accident. Two mutation tests, on
  the roster ordering and on the counter's fail-open.
- **Not verified:** nothing has run against a real database, so no artist has
  actually been added, renamed, picked on a release, or scoped to an invite.
  The owner UI needs an authenticated session this sandbox cannot mint. Worth
  one live pass: add a second artist in Settings, create a release and confirm
  the picker appears and files it correctly, invite someone scoped to the new
  artist, and confirm they see only that artist's releases.
