# Tracks And Share Links Migration

Run this SQL once in the Supabase SQL editor before using release audio uploads and private listen links.

```sql
create extension if not exists pgcrypto;

do $$ begin
  create type public.track_status as enum ('processing', 'ready', 'error');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid null references public.releases(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_url text not null,
  file_size integer not null default 0,
  duration_seconds integer null,
  mime_type text not null,
  waveform_data jsonb null default '[]'::jsonb,
  status public.track_status not null default 'processing',
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tracks add column if not exists release_id uuid null references public.releases(id) on delete set null;
alter table public.tracks add column if not exists file_size integer not null default 0;
alter table public.tracks add column if not exists duration_seconds integer null;
alter table public.tracks add column if not exists mime_type text not null default 'audio/mpeg';
alter table public.tracks add column if not exists waveform_data jsonb null default '[]'::jsonb;
alter table public.tracks add column if not exists status public.track_status not null default 'processing';
alter table public.tracks add column if not exists position integer not null default 1;
alter table public.tracks add column if not exists updated_at timestamptz not null default now();

create index if not exists tracks_release_id_idx on public.tracks(release_id, position asc, created_at asc);
create index if not exists tracks_user_id_idx on public.tracks(user_id, created_at desc);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  label text null,
  expires_at timestamptz null,
  play_count integer not null default 0,
  is_revoked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.share_links add column if not exists label text null;
alter table public.share_links add column if not exists expires_at timestamptz null;
alter table public.share_links add column if not exists play_count integer not null default 0;
alter table public.share_links add column if not exists is_revoked boolean not null default false;

create index if not exists share_links_track_id_idx on public.share_links(track_id, created_at desc);
create index if not exists share_links_user_id_idx on public.share_links(user_id, created_at desc);
create index if not exists share_links_token_idx on public.share_links(token);

alter table public.tracks enable row level security;
alter table public.share_links enable row level security;

insert into storage.buckets (id, name, public)
values ('release-audio', 'release-audio', false)
on conflict (id) do update set public = excluded.public;
```

The `release-audio` bucket should stay private. All uploads and signed listen URLs are handled server-side by the route handlers, so no public bucket policy is needed for this feature.
