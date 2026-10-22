# Catalogue, Phase 1: the artist page and the delivery snapshot (2026-10-02, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Phase 1 of "Build order after the credits sprint". Behind `NEXT_PUBLIC_FEATURE_ARTIST_PAGE` (needs `NEXT_PUBLIC_FEATURE_WORKSPACE` too). One additive migration, `20261002100000_release_epk_snapshot.sql`, **not applied anywhere yet**. No ledger entry or version bump: they land at the flip.

### What it is

- **`/dashboard/artists`** lists every artist on the team with its counts and press kit state; **`/dashboard/artists/[artistId]`** shows that artist's rollouts (planned, out now, past), shows (coming up, past), the team and the press kit. A new nav row, page-search entry and prefetch entry carry it. With the flag on, `/dashboard/press-kits` hands over to the artist list; the kit editor at `/dashboard/press-kits/[artistId]` keeps its route, so every link to a single kit still works.
- **The artist press kit stays the one standing EPK per artist**, and a release reads it live while the release has not happened. The first time the release counts as delivered (`lib/recap-eligibility.ts`, the same rule as the directory) a daily sweep copies the three things its pitch shows from the kit (`descriptor`, `shortBio`, contact count, plus slug, state and publish time) into `release_epk_fields.kit_snapshot`, and the release reads the copy from then on. `loadPitchKit` prefers a valid snapshot and falls back to the live kit for anything it cannot read.

### Things worth knowing

1. **Most of the EPK half already existed.** The press kit draft/published split, the roll-in proposals, `presskit.draft_section` (UrgAns proposes, a person accepts, nothing saves otherwise) and the Solo/Manager gate on embedded actions were all built; the audit confirmed Solo can edit by hand and is refused the embedded generation. Phase 1 added the missing half: the artist page and the freeze on delivery.
2. **The sweep is another passenger on `/api/cron/due-date-notifications`**, for the reason the others give (two cron slots, both taken, Hobby plan). `runKitSnapshotSweep` never throws, does nothing while the pitch kit flag is off, never touches a release that already has a copy, writes at most 200 a run and names only the snapshot columns, so a story and credits are never overwritten. **The cost is up to a day**: a release delivered at noon can still pick up a bio edit made before that night's run. A read-time snapshot would turn a GET into a write.
3. **A delivered release whose artist had no kit gets nothing frozen**, and will read a kit made later. Harmless for a record that never held one, and the alternative is freezing "nothing".
4. **`snapshot_column_missing` is the sweep's answer when the migration is not applied**, and it then writes nothing. Apply the migration before turning the pitch kit flag on.
5. **Release buckets are `lib/artist-overview.ts`**: planned (date ahead or none), live (date today or within 30 days), past (older, archived, or `released` with no date). Every rollout lands in exactly one. A cancelled show is in neither show list.
6. **The team card needed its own route.** `GET /api/workspace/artists/[artistId]/team` returns who is limited to this artist (`workspace_members.artist_scope_id`) apart from who sees every artist; the members route does not carry the scope and widening it would reach every surface that reads it.
7. **A real bug fixed on the way**: `POST /api/tasks` accepted any user id as the assignee while the PATCH route refused anyone outside the team. Both now call `isTeamAssignee` (`lib/task-assignee-server.ts`), and a structural test reads both route sources.
8. **Two analytics events**, ids and counts only: `artist_page_viewed` and `artist_page_action`.

### Not built, deliberately

- No edit-in-place of the artist EPK from the artist page: it links to the existing editor.
- No artist-level financials or audience; those are Phases 4 and 5.
- `profiles.artist_name` drift is untouched (found in the audit, separate change).
- The first-release modal, the catalog grid and the release card do not link to the artist page yet.

### Verified

New tests: `lib/release-epk-snapshot.test.ts`, `release-epk-snapshot-server.test.ts` (against a fake client), `release-epk-server.test.ts`, `artist-overview.test.ts`, `artist-page.test.ts`, `task-assignee-server.test.ts`, plus two cases in `app-pages.test.ts`. **Five deliberate breaks, each caught by a named test** (no already-frozen check, archived not forced to past, snapshot ignored on read, the assignee check removed from the create route, the sweep running with the flag off). `tsc` shows only the 8 known `confirmed-action.test.ts` errors, lint adds nothing, and `next build` is green with the flags on and off with `/auth`, `/dashboard`, `/onboarding`, `/settings` and `/locked` still static; the team route answers 401 with the flag on and `{"error":"Not found."}` 404 with it off while `/api/releases` answers 401 either way.

**Not verified:** nothing has run against a real database or in a browser. No snapshot has been written, the artist pages have never rendered with real data, and the migration is unapplied.

### Activation

1. Apply `20261002100000_release_epk_snapshot.sql` (paste it from the file; it is two nullable columns).
2. Set `NEXT_PUBLIC_FEATURE_ARTIST_PAGE=true` on the Vercel `Web` project with a commit that rebuilds `apps/web`.
3. Ledger entry and version bump at the flip.
4. Check one delivered release: after the next 07:00 UTC cron its `release_epk_fields.kit_snapshot` is set, and a later bio edit no longer changes that release's pitch.
