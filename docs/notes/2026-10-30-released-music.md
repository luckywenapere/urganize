# Released music comes in with the artist (2026-10-30, v1.216.0, no flag, #882)

Oyin said the "Import past rollouts" button under the Artists list "looks off" and "doesn't work that way": old music is not a rollout, and it belongs to one artist. Mock approved the same day: `docs/mocks/catalogue-import/mock.html`.

## What changed

- **Add artist starts with a search.** The + beside the Artists tabs (desktop) and on the phone header opens `AddArtistDialog` (`components/artists/AddArtistDialog.tsx`), mounted once by `AppShell` as `AddArtistHost` and opened through `useShellStore.openAddArtist`. The tab action is `press: 'addArtist'` (the old Settings link `ADD_ARTIST_HREF` is gone). Search, choose, one check screen (photo, first covers, count, latest, first year, a "new releases by themselves" box), then Add. A new artist opens on their page. "Not on streaming yet? Add by name" posts to `/api/workspace/artists` as Settings did. The look-alike question from #865 stays ("Is this Dorian?").
- **The artist remembers the profile.** Migration `20261030120000_artist_streaming_profile.sql` (applied to live 2026-10-30, backup `artists_backup_20261030`, 67 rows): `artists.streaming_source`, `streaming_source_id`, `catalogue_sync` (default true), `catalogue_synced_at`. Written by `importArtistCatalogue` (`rememberStreamingProfile`), which also copies a Deezer artist photo into our bucket when the artist has none (Apple has no artist photo).
- **New drops come in by themselves.** `GET /api/workspace/artists/[artistId]/catalogue` returns `profile` and, when `isCatalogueSyncDue` (20 hours since the last check), runs `syncArtistCatalogue` after the reply. The row is claimed by moving `catalogue_synced_at` first, so two viewers make one call; an unreachable service clears the stamp so the next visit tries again. A release out in the last 30 days wears a "New" tag (`isNewRelease`).
- **Artist page, Out now.** A linked profile shows "From Deezer · new drops come in by themselves · Change profile". No profile but some music: "New drops do not come in by themselves yet. Find on streaming". Nothing at all: a card, "Bring in X's released music", that opens the same sheet linked to that artist.
- **Removed.** "Import past rollouts" (Artists list, desktop and phone), "Bring in past rollouts" (artist page), and `ImportReleasesDialog.tsx`. The onboarding import step is unchanged.
- **Team tab, same release:** the Invite button in the header shows on phones only (on a computer the "Invite someone" card is the way in), and the Settings tab no longer draws an empty box when team logins are off.

## Traps

- Released music is still only in `artist_catalogue_releases`, never `releases`, so it never counts as a rollout, plan limit or scoreboard number. The Artists list status ("Quiet") does not read it.
- Artists imported before this have music but no remembered profile (catalogue rows hold album ids, not the artist id), so they show the "Find on streaming" line until someone links them.
- `merge_artists` does not copy the new columns from the merged-away artist; the kept artist keeps its own profile.
- Local test database: `20261029180000_artist_merge.sql` was not in the local reset; apply it there or adding an artist fails on `created_via`.
