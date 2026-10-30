-- An artist remembers their streaming profile (2026-10-30, #882, founder
-- approved mock docs/mocks/catalogue-import).
--
-- Adding an artist now starts with a search of Deezer and Apple Music. The
-- profile picked is kept here so their released music (artist_catalogue_releases)
-- can be checked again for new drops, at most once a day, when someone opens
-- the artist. No new table: four nullable columns on artists.

alter table public.artists
  add column if not exists streaming_source text,
  add column if not exists streaming_source_id text,
  add column if not exists catalogue_sync boolean not null default true,
  add column if not exists catalogue_synced_at timestamptz;

alter table public.artists drop constraint if exists artists_streaming_source_check;
alter table public.artists
  add constraint artists_streaming_source_check
  check (streaming_source is null or streaming_source in ('deezer', 'itunes'));

alter table public.artists drop constraint if exists artists_streaming_source_id_check;
alter table public.artists
  add constraint artists_streaming_source_id_check
  check (streaming_source_id is null or streaming_source_id ~ '^[0-9]{1,40}$');
