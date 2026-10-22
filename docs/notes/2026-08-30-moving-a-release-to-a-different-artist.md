# Moving a release to a different artist (2026-08-30, v1.7.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The correction for a mistake the roster made possible. The create-release
picker preselects the first artist, so filing a release under the wrong one
became reachable on 2026-08-30 with no way to fix it short of deleting the
release. `POST /api/releases/[releaseId]/artist` is that fix. **No migration.**

**Five things worth knowing before editing this:**

1. **The write set is the whole correctness story: the link plus TWO cached
   names.** `releases.artist_id`, `releases.artist_name` and
   `release_metadata.primary_artist_name` — the same three places
   `renameWorkspaceArtist` touches, and they must stay in step. Dropping either
   cache does not throw; the release just shows the old artist's name everywhere
   while being filed under the new one, which is worse than an error because
   nothing looks wrong. Both are mutation-tested in `lib/artists-server.test.ts`.
2. **A DEDICATED ROUTE, and the reason is stronger than the archive route's.**
   The release PATCH is a full-row replace that DELIBERATELY refuses to touch the
   artist: with the workspace flag on it ignores `body.artistName` and rewrites
   the existing value, precisely so the edit form cannot desync the cached name
   from the link. Accepting an artist there would reopen what that guard exists
   to prevent.
3. **OWNER-ONLY, which is a decision rather than copied convention.** Every other
   release-scene route group became team-aware in v1.5.1, but moving a release
   CHANGES WHO CAN SEE IT — an artist-scoped teammate sees exactly the releases
   whose `artist_id` matches their scope, so this hands the release to one
   person's view and takes it from another's. It belongs with the other
   owner-only release-row mutations (PATCH, DELETE, schedule, archive), and the
   dialog says the visibility part out loud before the confirm button.
4. **`stores/useArtistRosterStore.ts` is the shared roster**, and it exists
   because three surfaces needed the same list: the create-release picker, the
   "Change artist" action's visibility rule, and the dialog. It also RETIRES the
   per-open fetch the modal shipped with a day earlier. **Deliberately not folded
   into `useWorkspaceIdentityStore`** even though that carries `artistCount` from
   the same endpoint: the identity card is behind
   `NEXT_PUBLIC_FEATURE_IDENTITY_PANEL`, which defaults OFF, so reading the
   roster from it would make the picker vanish in a default deployment.
5. **Everything still fails open.** An empty or unloaded roster hides the action
   and the picker, which is the pre-roster behaviour; the action additionally
   requires more than one artist, so a one-artist team never sees a control that
   could only tell it no.

- The route validates the target against the CALLER'S roster rather than reading
  the artist row and comparing workspaces after, so an artist on another team is
  indistinguishable from one that does not exist — the rename route's shape.
  `primaryWorkspaceId` is safe here despite resolving to a JOINED team for
  someone who owns no releases: this caller owns THIS release.
- Reassigning to the current artist returns `changed: false` rather than writing.
- Fixed in passing: the release PATCH still pointed at `/api/workspace/artist`,
  deleted the day before.

### The delete analysis, and what was built from it (v1.8.0)

**`releases.artist_id` IS NOT DECLARED IN ANY MIGRATION.** The only mention
across `supabase/migrations/` is a plpgsql local variable; the column exists in
production and `20260602010000` sets it NOT NULL, but its original definition —
**including its foreign key to `artists`** — was never captured.
Pre-reconciliation drift. Anything that ever recreates this column must
re-declare that constraint, or it vanishes silently.

**ANSWERED against production, 2026-08-30, and the answer was a third case
neither prediction covered.** The constraint is
`releases_artist_id_fkey` with `confdeltype = 'n'` — **`ON DELETE SET NULL`** —
**while the column itself is NOT NULL.** Those two contradict each other, and
that contradiction IS the current behaviour:

- **An artist with no releases deletes cleanly.**
- **An artist WITH releases cannot be deleted at all.** Postgres fires the SET
  NULL, the resulting UPDATE violates the not-null constraint, and the whole
  DELETE aborts. Nothing is orphaned and nothing is destroyed — so the safe
  outcome holds, **but by accident**, and it surfaces as a raw not-null
  violation rather than anything a user can act on.

**THE LANDMINE, and the reason this is written down.** The foreign key DECLARES
set-null as the intent; only the column's NOT NULL is stopping it. Relax that
NOT NULL — or recreate the column without it, which the drift above makes easy —
and every one of those refusals silently becomes a real set-null on live
releases, with no error anywhere. A null `artist_id` then fails every
`=== scope` comparison, so artist-scoped teammates lose those releases without a
trace, and nothing on screen looks wrong because the artist NAME is cached on
the release row. Do not treat the current refusal as a guarantee.

**The recommended rule when it is built, unchanged by the answer above but now
better founded: allow delete only for an artist with no releases AND nobody
scoped to them.** Cascading would destroy release history behind a button
labelled "delete artist"; reassigning-on-delete hides a data decision inside a
delete. Both refusals are things a manager can act on, and the scoped-member
check is what closes the `workspace_members.artist_scope_id` privacy hole (also
`ON DELETE SET NULL`, where null means FULL visibility — so deleting an artist
silently promotes a teammate scoped to them).

Note the honest scope: a typo is a rename, and an artist who left still has
releases, so delete is really "undo adding one by mistake" — which the artists
ceiling makes worth having, since on Manager a stray artist permanently costs one
of five slots.

**BUILT 2026-08-30 as `DELETE /api/workspace/artists/[artistId]` plus a Remove
control on each Settings roster row.** Four things worth knowing:

1. **THREE refusals, and each is a different kind of harm.** Releases (the
   database refuses too, now explicitly — see the migration below — but this
   makes it a sentence naming the number). Teammates scoped to this artist,
   which **nothing in the database stops** and is the quieter harm, since
   `artist_scope_id` is `ON DELETE SET NULL` and NULL means FULL visibility. And
   the LAST artist on a roster, which is not about integrity at all: that delete
   would succeed, but a team with no artist has no implicit artist for release
   creation to fall back on, so the next release would silently mint one from
   the owner's name.
2. **`countArtistDeletionBlockers` FAILS CLOSED**, deliberately unlike every
   other count in `artists-server.ts`. An unreadable count refuses the delete,
   because being wrong here destroys a link or widens someone's access — neither
   undoable — while being wrong the other way just makes a manager retry.
3. **`describeArtistDeletionBlock` is pure so the copy is testable**, and every
   refusal names a number AND says what to do about it. The scoped-member
   sentence says what would otherwise happen ("or they will start seeing every
   release") rather than only refusing. Mutation-tested both ways: failing open
   on an unreadable count, and ignoring scoped members, each fail exactly the
   tests written for them.
4. **`window.confirm`, not a bespoke dialog** — the opposite call from
   `ChangeReleaseArtistDialog`. The server refuses every removal that would
   actually lose something, so what reaches the prompt can only remove an artist
   attached to nothing: it is a slip guard, not a decision point, and it matches
   what `MetadataSection` already uses for the same weight of action.

**Migration `20260830100000_releases_artist_id_restrict.sql`** re-declares
`releases_artist_id_fkey` as `ON DELETE RESTRICT` and is **the first time
`releases.artist_id`'s constraint has ever been in version control**. It is not
destructive and backfills nothing: it only changes what happens on a delete that
already could not succeed. The `if exists` on the drop makes it safe on an
environment built purely from migrations, where the constraint never existed —
which is exactly the drift it documents. It ends in a `do $$` block that raises
if the action is not `r`, so the intent cannot quietly slip again.
**Needs applying to production**; until it is, the refusal stays the accidental
not-null one, and the app-level checks are doing the real work either way.

- **Verified (reassignment, and re-run with delete):** 1693 tests (11 new across
  both; the two cached writes and the two refusal properties all
  mutation-tested), `eslint .`
  at **3 errors / 66 warnings** — the one warning above the standing baseline is
  `ChangeReleaseArtistDialog`'s portal mount guard, byte-for-byte the finding
  `ArchiveReleaseDialog` and `DeleteReleaseDialog` already carry. `next build`
  green **by exit code** with `/auth`, `/onboarding` and `/settings` still
  `○ Static`. Runtime probe: the route 401s unauthenticated (so auth precedes any
  release read) and 405s a GET.
  Runtime probes both ways on the roster route: workspace flag ON, DELETE and
  PATCH 401 unauthenticated; flag OFF both 404 while the ungated `/api/releases`
  still 401s.
- **Not verified:** nothing has run against a real database — no release has
  actually been moved, no artist removed, and neither the dialog nor the Remove
  control has rendered. The migration is unapplied. Worth one live pass: move a
  release and confirm the catalog card, the scoped header and the identity card
  all update without a reload; then try removing an artist who has releases
  (expect a sentence naming the count), one with a teammate scoped to them, the
  last one on the roster, and finally a spare with nothing attached.
