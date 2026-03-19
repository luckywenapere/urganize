create extension if not exists pgcrypto;

create table if not exists public.credit_collection_links (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz null
);

create index if not exists credit_collection_links_release_id_idx
  on public.credit_collection_links(release_id);

create table if not exists public.contributor_submissions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  collection_link_id uuid not null references public.credit_collection_links(id) on delete cascade,
  legal_full_name text not null default '',
  credited_name text not null default '',
  email text not null default '',
  phone_number text not null default '',
  role_type text not null default 'other',
  contribution_notes text not null default '',
  performing_name_if_different text not null default '',
  pro_affiliation text not null default '',
  ipi_cae_number text not null default '',
  publisher_name text not null default '',
  split_percentage numeric(5,2) null,
  is_split_confirmed boolean not null default false,
  country text not null default '',
  social_handle text not null default '',
  additional_notes text not null default '',
  submission_status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contributor_submissions_release_id_idx
  on public.contributor_submissions(release_id);

create index if not exists contributor_submissions_link_id_idx
  on public.contributor_submissions(collection_link_id);

create table if not exists public.credit_finalizations (
  release_id uuid primary key references public.releases(id) on delete cascade,
  is_finalized boolean not null default false,
  finalized_at timestamptz null,
  finalized_by_user_id uuid null references auth.users(id) on delete set null
);

alter table public.credit_collection_links enable row level security;
alter table public.contributor_submissions enable row level security;
alter table public.credit_finalizations enable row level security;
