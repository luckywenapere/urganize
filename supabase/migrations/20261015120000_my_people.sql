-- My People (URG-306, 2026-10-15)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Two additions to a team's private layer, nothing removed or rewritten:
--
-- 1. team_relationships.company: where the person works, in the team's own
--    words ("Eko Sound"). Shown as "role · company". Empty for every existing
--    row.
--
-- 2. relationship_interactions: the short log on a person's page ("Sent EP
--    link", "Met at Afro Nation"). Private to the team, like
--    team_relationships: a select policy for the team's own members and NO
--    write policy; every write is a service-role route. Logging one also moves
--    team_relationships.last_contact_at, which the list sorts by.
--
-- Tags, notes and the fee note stay in their columns. The pages stop showing
-- them; nothing is deleted.
--
-- ROLLBACK (manual):
--   drop table if exists public.relationship_interactions;
--   alter table public.team_relationships drop column if exists company;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.team_relationships
  add column if not exists company text not null default ''
    constraint team_relationships_company_check check (char_length(company) <= 60);

create table if not exists public.relationship_interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.person_profiles(id) on delete cascade,
  body text not null
    constraint relationship_interactions_body_check check (char_length(btrim(body)) between 1 and 200),
  happened_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists relationship_interactions_team_person_idx
  on public.relationship_interactions(workspace_id, person_id, happened_at desc);

alter table public.relationship_interactions enable row level security;

drop policy if exists "Team members read their interactions" on public.relationship_interactions;
create policy "Team members read their interactions"
  on public.relationship_interactions for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = relationship_interactions.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = relationship_interactions.workspace_id
        and w.owner_id = auth.uid()
    )
  );
