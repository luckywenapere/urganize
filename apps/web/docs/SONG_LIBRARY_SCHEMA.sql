create table if not exists public.song_library_songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_title text not null,
  primary_artist text not null,
  project_or_release text null,
  release_id uuid null references public.releases(id) on delete set null,
  featured_artists text[] not null default array[]::text[],
  isrc text null,
  duration text null,
  genre text null,
  language text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_library_contributors (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.song_library_songs(id) on delete cascade,
  legal_name text not null,
  credited_name text null,
  role text not null,
  email text null,
  pro_affiliation text null,
  ipi_number text null,
  split_percentage numeric(5,2) null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_library_publishing (
  song_id uuid primary key references public.song_library_songs(id) on delete cascade,
  songwriter text null,
  composer text null,
  publisher text null,
  pro_affiliation text null,
  ipi_number text null,
  ownership_split text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_library_production (
  song_id uuid primary key references public.song_library_songs(id) on delete cascade,
  producer text null,
  mixing_engineer text null,
  mastering_engineer text null,
  recording_studio text null,
  recording_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_library_administrative (
  song_id uuid primary key references public.song_library_songs(id) on delete cascade,
  copyright_owner text null,
  label text null,
  distributor text null,
  upc text null,
  territory_restrictions text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_library_notes (
  song_id uuid primary key references public.song_library_songs(id) on delete cascade,
  internal_notes text null,
  additional_metadata text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_library_songs_user_updated_idx
  on public.song_library_songs(user_id, updated_at desc);

create index if not exists song_library_songs_release_idx
  on public.song_library_songs(release_id);

create index if not exists song_library_contributors_song_idx
  on public.song_library_contributors(song_id);

alter table public.song_library_songs enable row level security;
alter table public.song_library_contributors enable row level security;
alter table public.song_library_publishing enable row level security;
alter table public.song_library_production enable row level security;
alter table public.song_library_administrative enable row level security;
alter table public.song_library_notes enable row level security;
