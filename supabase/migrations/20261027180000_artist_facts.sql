-- Artist facts: UrgAns's small structured memory (2026-10-27, founder said
-- "work on it" on docs/mocks/artist-memory/mock.html)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- One fact per row: an artist, a topic, what it says, where it came from (said
-- in chat or set by hand), who, and when. UrgAns reads them into its context
-- and the planner reads them before it writes a plan.
--
-- 1. ONE ROW PER ARTIST AND TOPIC, except topic 'other' (up to 10, enforced in
--    lib/artist-facts.ts). The partial unique index holds the one-per-topic
--    half in the database too.
-- 2. PRIVATE TO THE TEAM: select for the workspace's active members and its
--    owner; writes go through service-role routes, which also apply the
--    artist-scoped member rule.
-- 3. Deleting the artist deletes its facts.
--
-- ROLLBACK (manual):
--   drop table if exists public.artist_facts;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.artist_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  topic text not null
    constraint artist_facts_topic_check
    check (topic in ('playlist_pitching', 'preferred_channel', 'budget', 'contact', 'other')),
  value text not null
    constraint artist_facts_value_check check (char_length(value) between 1 and 200),
  source text not null default 'manual'
    constraint artist_facts_source_check check (source in ('chat', 'manual')),
  said_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists artist_facts_one_per_topic
  on public.artist_facts(artist_id, topic)
  where topic <> 'other';

create index if not exists artist_facts_workspace_idx
  on public.artist_facts(workspace_id, artist_id);

alter table public.artist_facts enable row level security;

drop policy if exists "Team members read their artist facts" on public.artist_facts;
create policy "Team members read their artist facts"
  on public.artist_facts for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = artist_facts.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = artist_facts.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop trigger if exists set_artist_facts_updated_at on public.artist_facts;
create trigger set_artist_facts_updated_at
  before update on public.artist_facts
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.artist_facts to authenticated, service_role;
