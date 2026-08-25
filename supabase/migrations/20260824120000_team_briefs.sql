-- Team brief: one standing description of a team, injected into every UrgAns
-- request so a member does not have to re-explain who the roster is and how
-- this label works before getting a usable answer.
--
-- Phase 2 of docs/UrgAns Shared Context Implementation.md.
--
-- Design calls worth recording:
--
--   * ONE ROW PER SECTION, not one row with five content columns. The spec
--     leaves this open ("your call based on what fits the existing style").
--     Per-section attribution is the deciding factor: a single row would need
--     roster_content / roster_updated_by / roster_updated_at times five —
--     fifteen columns, and a migration every time a section is added or
--     renamed. As rows, a section change is data.
--
--   * `section` is a CHECK constraint, not a Postgres enum. Both appear in
--     this schema; the CHECK is right here because the section list is
--     product copy that will change, and `alter type ... add value` cannot
--     run inside a transaction (see 20260810140000_notification_type_due_tiers).
--
--   * OWNER-SCOPED RLS, on a table any MEMBER may edit. That reads like a
--     contradiction and is deliberate: it is the task_outcomes precedent
--     (20260809120000). Every policy in this schema is owner-scoped and real
--     team access lives app-side in the service-role routes, so a team-scoped
--     policy here would be the first of its kind and would disagree with how
--     the rest of the product is enforced. The chain policy below is
--     defense-in-depth for a direct PostgREST call; the route is what actually
--     decides who may edit. The spec asks for "RLS scoped to workspace
--     membership" — this is a conscious deviation, recorded rather than
--     silently taken, and it matches the note CLAUDE.md already carries for
--     task_outcomes.
--
--   * NO HISTORY TABLE. Cut from the spec at v2 after the audit: full version
--     history is a second table plus a retention policy. `updated_by` and
--     `updated_at` per section are the audit trail people actually ask for.
--
--   * No `content` default of NULL. An absent section and an empty one mean
--     the same thing to the prompt (omit it), so the column is `not null
--     default ''` and emptiness is one state rather than two.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.team_brief_sections;
--   alter table public.workspaces drop column if exists brief_edit_restricted;

create table if not exists public.team_brief_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  section text not null,
  content text not null default '',
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_brief_sections_section_check check (
    section in ('roster', 'how_we_work', 'positioning', 'constraints', 'vocabulary')
  )
);

-- One row per section per team. Also the upsert target: the editor writes a
-- section without needing to know whether it has ever been written before.
create unique index if not exists team_brief_sections_workspace_section_unique_idx
  on public.team_brief_sections(workspace_id, section);

drop trigger if exists set_team_brief_sections_updated_at on public.team_brief_sections;
create trigger set_team_brief_sections_updated_at
before update on public.team_brief_sections
for each row execute function public.set_updated_at();

alter table public.team_brief_sections enable row level security;

-- Defense in depth only — see the note above. Real access is the route's.
drop policy if exists "Workspace owners view brief sections" on public.team_brief_sections;
create policy "Workspace owners view brief sections"
  on public.team_brief_sections
  for select
  using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = team_brief_sections.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners create brief sections" on public.team_brief_sections;
create policy "Workspace owners create brief sections"
  on public.team_brief_sections
  for insert
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = team_brief_sections.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners update brief sections" on public.team_brief_sections;
create policy "Workspace owners update brief sections"
  on public.team_brief_sections
  for update
  using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = team_brief_sections.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = team_brief_sections.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners delete brief sections" on public.team_brief_sections;
create policy "Workspace owners delete brief sections"
  on public.team_brief_sections
  for delete
  using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = team_brief_sections.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  );

-- The spec's opt-in restriction: any member edits by default, and an owner may
-- narrow it to owner/admin. Default false, so switching the feature on changes
-- nobody's permissions.
alter table public.workspaces
  add column if not exists brief_edit_restricted boolean not null default false;
