create table if not exists public.release_songs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  song_id uuid not null references public.song_library_songs(id) on delete cascade,
  track_number integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, song_id)
);

create index if not exists release_songs_release_idx
  on public.release_songs(release_id, track_number, created_at);

create index if not exists release_songs_song_idx
  on public.release_songs(song_id);

alter table public.release_songs enable row level security;
