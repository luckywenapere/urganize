-- Vouch, slice 1 (2026-10-24, founder approved the mock)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- When a team marks done an activity somebody from My People did, it is asked
-- "How was {first name} on this?" and picks one skill ("Cover art", "On time",
-- "Easy to work with"), with an optional one-line note. That answer is a
-- vouch.
--
-- Four decisions worth knowing before changing anything here:
--
-- 1. ONE VOUCH PER TEAM PER SKILL. Unique on (workspace_id, person_id, skill).
--    Vouching the same skill again updates the note (and task_id), so a team
--    cannot stack ten "On time" vouches on one person.
--
-- 2. PRIVATE TO THE TEAM FOR NOW, like team_relationships: a select policy for
--    the team's own members and NO write policy. Every write is a
--    service-role route that resolves the team from the signed-in user.
--    Showing vouches in public waits for the claim flow (a later slice).
--
-- 3. task_id IS NULLABLE and set null if the activity is deleted. The vouch
--    is about the person; the activity is where it came from.
--
-- 4. "Worked together" needs no table: it is derived from
--    tasks.assigned_person_id (added by 20261003100000_relationships.sql).
--
-- Needs person_profiles (the directory) and workspaces, both older than this.
-- The app degrades if this table is missing: no vouch sheet is saved (the
-- route answers that it is not ready) and the person page shows no vouches.
--
-- ROLLBACK (manual):
--   drop table if exists public.person_vouches;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.person_vouches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person_profiles(id) on delete cascade,
  -- The team that vouched.
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  skill text not null
    constraint person_vouches_skill_check check (char_length(btrim(skill)) between 1 and 40),
  note text
    constraint person_vouches_note_check check (note is null or char_length(note) <= 140),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One vouch per team per person per skill. Also the upsert target.
create unique index if not exists person_vouches_team_person_skill_key
  on public.person_vouches(workspace_id, person_id, skill);

create index if not exists person_vouches_person_idx
  on public.person_vouches(person_id);

alter table public.person_vouches enable row level security;

drop policy if exists "Team members read their vouches" on public.person_vouches;
create policy "Team members read their vouches"
  on public.person_vouches for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = person_vouches.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = person_vouches.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop trigger if exists set_person_vouches_updated_at on public.person_vouches;
create trigger set_person_vouches_updated_at
  before update on public.person_vouches
  for each row execute function public.set_updated_at();

-- Supabase stops auto-granting new public tables on 30 Oct 2026 (CLAUDE.md,
-- principle 9). RLS still decides which rows each role sees, and with no write
-- policy only the service role can write.
grant select, insert, update, delete on public.person_vouches to authenticated, service_role;
