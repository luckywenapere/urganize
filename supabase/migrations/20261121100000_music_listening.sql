-- Urganize music: songs a team publishes, and the plays listeners add.
--
-- An artist's team uploads a song from a rollout and publishes it. Anyone, with
-- or without an account, opens the music side and listens. Every read and write
-- goes through a server route that uses the service role, so both tables have
-- row level security on and NO policies: no signed-in browser can touch them
-- directly, which is what keeps an unpublished song, a taken down song and a
-- listener's play history private by default.
--
-- music_tracks
--   One row per song. It belongs to a rollout (release_id) and is stamped with
--   the ROLLOUT OWNER (owner_user_id), never the teammate who clicked, the same
--   rule every release scene follows for its child rows, so a song does not
--   vanish when the teammate who uploaded it leaves.
--   The audio lives in the private release-assets bucket under music/<rollout>/.
--   Listeners reach it through /api/music/tracks/<id>/stream, which signs a
--   short link only for a song that is live right now.
--   Whether a song is live is NOT stored. It is worked out from live_mode,
--   published_at, taken_down_at and the rollout's CURRENT release date
--   (lib/music/rules.ts), so moving a release date moves the song with it.
--   rights_confirmed_at is the artist ticking "I own this song or have the right
--   to publish it". The server refuses to publish without it.
--   ON DELETE CASCADE from releases: deleting a rollout for good removes its
--   songs. A rollout in the Trash (deleted_at) only hides them.
--
-- music_plays
--   One row per counted play. listener_key is a hash, never the raw id, and is
--   the signed-in user id or a random id the browser keeps, so the artist gets
--   a number and nobody gets a listening history.

create table if not exists public.music_tracks (
  id                  uuid primary key default gen_random_uuid(),
  release_id          uuid not null references public.releases(id) on delete cascade,
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  artist_id           uuid null references public.artists(id) on delete set null,
  title               text not null check (char_length(btrim(title)) between 1 and 160),
  artist_name         text not null check (char_length(btrim(artist_name)) between 1 and 160),
  explicit            boolean not null default false,
  live_mode           text not null default 'release_day'
    check (live_mode in ('release_day', 'now')),
  audio_bucket        text not null default 'release-assets',
  audio_path          text not null,
  audio_mime          text not null,
  audio_bytes         bigint not null check (audio_bytes > 0),
  file_name           text not null,
  duration_seconds    integer null check (duration_seconds is null or duration_seconds between 1 and 3600),
  rights_confirmed_at timestamptz null,
  rights_confirmed_by uuid null references auth.users(id) on delete set null,
  published_at        timestamptz null,
  taken_down_at       timestamptz null,
  created_by          uuid null references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A song can only be published once the artist has confirmed the rights.
  constraint music_tracks_published_needs_rights
    check (published_at is null or rights_confirmed_at is not null)
);

create index if not exists music_tracks_release_idx
  on public.music_tracks (release_id, created_at desc);

create index if not exists music_tracks_live_idx
  on public.music_tracks (published_at desc)
  where published_at is not null and taken_down_at is null;

drop trigger if exists music_tracks_set_updated_at on public.music_tracks;
create trigger music_tracks_set_updated_at
  before update on public.music_tracks
  for each row execute function public.set_updated_at();

create table if not exists public.music_plays (
  id               uuid primary key default gen_random_uuid(),
  track_id         uuid not null references public.music_tracks(id) on delete cascade,
  listener_user_id uuid null references auth.users(id) on delete set null,
  listener_key     text not null,
  played_at        timestamptz not null default now()
);

create index if not exists music_plays_track_idx
  on public.music_plays (track_id, played_at desc);

create index if not exists music_plays_listener_idx
  on public.music_plays (track_id, listener_key, played_at desc);

alter table public.music_tracks enable row level security;
alter table public.music_plays enable row level security;

grant select, insert, update, delete on public.music_tracks to service_role;
grant select, insert, update, delete on public.music_plays to service_role;
