-- Artist import (2026-10-26, founder approved the mock)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- During onboarding a person types an artist's name; Urganize finds the
-- artist's public profile and brings in their past releases. Those are the
-- artist's CATALOGUE: releases that already happened.
--
-- They are not rollouts. A rollout is a release the team is planning, with a
-- plan and tasks; rollout counts, plan limits, the Home "plan a rollout" card
-- and the scoreboard all count `releases`, and 40 past singles in there would
-- make every one of them lie. So this is its own table, beside `artists`.
--
-- Decisions worth knowing before changing anything here:
--
-- 1. ONE ROW PER (artist, source, source id). Importing the same artist twice
--    is a no-op, and a re-pull refreshes the cover and date in place.
-- 2. THE SOURCE IS PUBLIC DATA (Deezer, Apple). Nothing here is the team's own
--    claim; `source` says where a row came from so a later "verified" state
--    has somewhere to start.
-- 3. cover_url IS A REMOTE URL, never copied. Covers are not stored by us.
-- 4. PRIVATE TO THE TEAM: a select policy for the workspace's own members and
--    no write policy. Every write is a service-role route.
--
-- The app degrades if this table is missing: the import saves nothing and the
-- artist page shows no catalogue.
--
-- ROLLBACK (manual):
--   drop table if exists public.artist_catalogue_releases;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.artist_catalogue_releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  source text not null
    constraint artist_catalogue_releases_source_check check (source in ('deezer', 'itunes')),
  source_id text not null
    constraint artist_catalogue_releases_source_id_check check (char_length(source_id) between 1 and 40),
  title text not null
    constraint artist_catalogue_releases_title_check check (char_length(btrim(title)) between 1 and 300),
  kind text not null default 'single'
    constraint artist_catalogue_releases_kind_check check (kind in ('single', 'ep', 'album')),
  release_date date,
  cover_url text,
  url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Also the upsert target.
create unique index if not exists artist_catalogue_releases_artist_source_key
  on public.artist_catalogue_releases(artist_id, source, source_id);

create index if not exists artist_catalogue_releases_workspace_idx
  on public.artist_catalogue_releases(workspace_id);

alter table public.artist_catalogue_releases enable row level security;

drop policy if exists "Team members read their catalogue" on public.artist_catalogue_releases;
create policy "Team members read their catalogue"
  on public.artist_catalogue_releases for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = artist_catalogue_releases.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = artist_catalogue_releases.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop trigger if exists set_artist_catalogue_releases_updated_at on public.artist_catalogue_releases;
create trigger set_artist_catalogue_releases_updated_at
  before update on public.artist_catalogue_releases
  for each row execute function public.set_updated_at();

-- Supabase stops auto-granting new public tables on 30 Oct 2026 (CLAUDE.md,
-- principle 9). RLS still decides which rows each role sees, and with no write
-- policy only the service role can write.
grant select, insert, update, delete on public.artist_catalogue_releases to authenticated, service_role;
