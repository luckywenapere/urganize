-- =============================================================================
-- EPs and albums to stores (#1115, Nov 7, 2026)
-- =============================================================================
--
-- ADDITIVE. One new table, one new column.
--
--   1. release_tracks: the songs of a rollout, in order. A rollout with no rows
--      is a single whose one song is the rollout itself (title, ISRC, explicit
--      and credits from the rollout, as before). Once a second song is added,
--      every song has a row; song 1 is seeded from the rollout.
--      credits_mode 'rollout' = the song uses the rollout's credits;
--      'own' = credits holds the song's own [{name, roles[], masterSplit}].
--   2. distribution_submissions.track_audio: the master uploaded to TRM for
--      each song, [{trackId, sequence, assetId, fileName}]. audio_asset_id
--      still holds song 1's for singles and older rows.
--
-- Written by the server (service role) only: RLS on, no policies.
--
-- Rollback (only if no EP was sent with it):
--   alter table public.distribution_submissions drop column if exists track_audio;
--   drop table if exists public.release_tracks;
-- =============================================================================

create table if not exists public.release_tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  position integer not null,
  title text not null default '',
  version text,
  featured_artists text,
  explicit boolean,
  isrc text,
  lyrics text,
  credits_mode text not null default 'rollout' check (credits_mode in ('rollout', 'own')),
  credits jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_tracks_release_idx on public.release_tracks (release_id, position);

alter table public.release_tracks enable row level security;

drop trigger if exists release_tracks_set_updated_at on public.release_tracks;
create trigger release_tracks_set_updated_at
  before update on public.release_tracks
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.release_tracks to authenticated, service_role;

alter table public.distribution_submissions
  add column if not exists track_audio jsonb not null default '[]'::jsonb;
