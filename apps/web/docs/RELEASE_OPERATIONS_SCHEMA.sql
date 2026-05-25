create extension if not exists pgcrypto;

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists artists_owner_slug_idx
  on public.artists(owner_user_id, slug);

alter table public.releases add column if not exists owner_user_id uuid not null references auth.users(id) on delete cascade;
alter table public.releases add column if not exists artist_id uuid null references public.artists(id) on delete set null;
alter table public.releases add column if not exists slug text null;
alter table public.releases add column if not exists description text null;

update public.releases
set slug = coalesce(slug, regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
where slug is null and title is not null;

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  stage_name text null,
  email text null,
  phone text null,
  default_role text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collaborators_email_idx on public.collaborators(email);
create index if not exists collaborators_phone_idx on public.collaborators(phone);

create table if not exists public.release_collaborators (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  collaborator_id uuid null references public.collaborators(id) on delete set null,
  role text not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_collaborators_release_idx
  on public.release_collaborators(release_id, created_at);

create table if not exists public.release_metadata (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references public.releases(id) on delete cascade,
  isrc text null,
  upc text null,
  primary_artist_name text not null default '',
  release_title text not null default '',
  genre text null,
  subgenre text null,
  label_name text null,
  language text null,
  explicit boolean null,
  artwork_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists release_events_release_idx
  on public.release_events(release_id, created_at desc);

alter table public.artists enable row level security;
alter table public.collaborators enable row level security;
alter table public.release_collaborators enable row level security;
alter table public.release_metadata enable row level security;
alter table public.release_events enable row level security;
