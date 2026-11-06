-- Every artist linked to their streaming profile (Nov 2026, #1088).
--
-- The person picks the artist once (on Deezer when we can find them, which gives
-- UPCs and ISRCs for free); the server links the same artist on Spotify and
-- Apple Music itself. The smart link's code finder then looks only inside that
-- artist's own releases instead of searching streaming by name.
--
-- Deliberately NOT the existing streaming_source / streaming_source_id columns:
-- those mark the one-time old-music import as done (#890), so writing them from
-- a plain link would hide the import for an artist who never ran it.
--
-- streaming_link_skipped_at: "Not on streaming yet". The Home popup stops asking
-- about that artist until they have a rollout whose release day came after it.

alter table public.artists
  add column if not exists deezer_artist_id text,
  add column if not exists spotify_artist_id text,
  add column if not exists apple_artist_id text,
  add column if not exists streaming_linked_at timestamptz,
  add column if not exists streaming_link_skipped_at timestamptz;

alter table public.artists drop constraint if exists artists_deezer_artist_id_check;
alter table public.artists
  add constraint artists_deezer_artist_id_check
  check (deezer_artist_id is null or deezer_artist_id ~ '^[0-9]{1,40}$');

alter table public.artists drop constraint if exists artists_apple_artist_id_check;
alter table public.artists
  add constraint artists_apple_artist_id_check
  check (apple_artist_id is null or apple_artist_id ~ '^[0-9]{1,40}$');

alter table public.artists drop constraint if exists artists_spotify_artist_id_check;
alter table public.artists
  add constraint artists_spotify_artist_id_check
  check (spotify_artist_id is null or spotify_artist_id ~ '^[A-Za-z0-9]{1,64}$');

-- An artist whose old music was already brought in is already linked.
update public.artists
set deezer_artist_id = streaming_source_id,
    streaming_linked_at = coalesce(catalogue_synced_at, now())
where streaming_source = 'deezer' and streaming_source_id is not null and deezer_artist_id is null;

update public.artists
set apple_artist_id = streaming_source_id,
    streaming_linked_at = coalesce(catalogue_synced_at, now())
where streaming_source = 'itunes' and streaming_source_id is not null and apple_artist_id is null;
