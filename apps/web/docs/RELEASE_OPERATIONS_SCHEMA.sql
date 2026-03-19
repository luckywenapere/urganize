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

alter table public.releases add column if not exists owner_user_id uuid null references auth.users(id) on delete cascade;
alter table public.releases add column if not exists artist_id uuid null references public.artists(id) on delete set null;
alter table public.releases add column if not exists slug text null;
alter table public.releases add column if not exists description text null;

update public.releases
set owner_user_id = coalesce(owner_user_id, user_id)
where owner_user_id is null;

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
  claimed_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collaborators_email_idx on public.collaborators(email);
create index if not exists collaborators_phone_idx on public.collaborators(phone);

create table if not exists public.release_collaborators (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  collaborator_id uuid null references public.collaborators(id) on delete set null,
  invite_name text not null default '',
  invite_contact text not null default '',
  role text not null default 'other',
  status text not null default 'pending',
  submission_token text not null unique,
  submission_sent_at timestamptz null,
  submitted_at timestamptz null,
  last_reminded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_collaborators_release_idx
  on public.release_collaborators(release_id, status, created_at);

create table if not exists public.credit_submissions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  release_collaborator_id uuid not null references public.release_collaborators(id) on delete cascade,
  legal_name text not null default '',
  stage_name text null,
  role text not null default 'other',
  email text null,
  phone text null,
  publishing_info text null,
  split_percentage numeric(5,2) null,
  pro_affiliation text null,
  ipi_number text null,
  notes text null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_collaborator_id)
);

create index if not exists credit_submissions_release_idx
  on public.credit_submissions(release_id, submitted_at desc);

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
  producer_credits_json jsonb null,
  writer_credits_json jsonb null,
  featured_artist_credits_json jsonb null,
  mixing_credits_json jsonb null,
  mastering_credits_json jsonb null,
  all_credits_json jsonb null,
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
alter table public.credit_submissions enable row level security;
alter table public.release_metadata enable row level security;
alter table public.release_events enable row level security;
