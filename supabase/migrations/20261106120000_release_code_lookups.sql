-- Finding a released song's UPC and ISRC on its own (Nov 2026, #1086).
--
-- One row per rollout: the last time we looked on streaming, what we found, and
-- what the person said about it. The codes themselves are written to
-- release_metadata only after they confirm "Yes, this is my song", so this
-- table never feeds a smart link on its own.
--
--   found      a result is waiting for the person's answer
--   not_found  nothing usable yet; looked again at most every 15 minutes
--   rejected   they said no; that result is remembered and never offered again
--   confirmed  they said yes; the codes are in release_metadata
--
-- Service role only: RLS on, no policies. Every read and write goes through
-- /api/releases/[releaseId]/find-codes, which checks team access first.

create table if not exists public.release_code_lookups (
  release_id uuid primary key references public.releases(id) on delete cascade,
  status text not null default 'not_found'
    check (status in ('found', 'not_found', 'rejected', 'confirmed')),
  candidate jsonb,
  rejected_keys text[] not null default '{}',
  matched_by text check (matched_by is null or matched_by in ('rules', 'ai')),
  attempts integer not null default 0,
  checked_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.release_code_lookups enable row level security;

drop trigger if exists set_release_code_lookups_updated_at on public.release_code_lookups;
create trigger set_release_code_lookups_updated_at
  before update on public.release_code_lookups
  for each row execute function public.set_updated_at();
