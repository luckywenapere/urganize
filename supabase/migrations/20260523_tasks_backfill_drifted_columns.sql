-- =============================================================================
-- Backfill drifted columns on the tasks table
-- =============================================================================
--
-- The collaborative tasks system (workspaces, task_groups, workspace_members)
-- was created in production via the schema-missing fallback in tasks-server.ts
-- (TASKS_SQL) rather than through tracked migrations. This migration brings the
-- migration history in line with production reality.
--
-- Four columns exist in production but not in migrations:
--   1. workspace_id  — FK to workspaces, NOT NULL in production
--   2. group_id      — FK to task_groups, nullable
--   3. assigned_to_user_id — FK to auth.users, nullable
--   4. assigned_to   — FK to workspace_members, nullable
--
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this migration
-- is safe to apply to production (where everything already exists) and to fresh
-- databases (where the columns are missing).
--
-- Dependency: workspaces, workspace_members, and task_groups tables must exist.
-- In production they do. On fresh databases, the schema-missing fallback in
-- tasks-server.ts creates them on first use. A future migration should codify
-- those tables properly; this migration handles only the tasks columns.
-- =============================================================================

begin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 0. Prerequisite tables (create if missing)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- These tables exist in production but not in prior migrations. Create them
-- here so the FK references below succeed on fresh databases.

do $$ begin
  create type public.workspace_member_role as enum ('owner', 'admin', 'member', 'guest');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.workspace_member_status as enum ('active', 'invited', 'removed');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_owner_id_unique_idx
  on public.workspaces(owner_id);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  email text not null,
  role public.workspace_member_role not null default 'member',
  status public.workspace_member_status not null default 'invited',
  invited_at timestamptz not null default now(),
  joined_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_members_workspace_email_unique_idx
  on public.workspace_members(workspace_id, email);
create unique index if not exists workspace_members_workspace_user_unique_idx
  on public.workspace_members(workspace_id, user_id)
  where user_id is not null;

create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  release_id uuid null references public.releases(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_groups_workspace_release_idx
  on public.task_groups(workspace_id, release_id, position);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. workspace_id — uuid, NOT NULL in production, FK to workspaces
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Production: workspace_id uuid not null references public.workspaces(id) on delete cascade
--
-- We add as nullable here because ALTER TABLE ... ADD COLUMN ... NOT NULL fails
-- if the table has existing rows with no default. In production the column
-- already exists (IF NOT EXISTS skips). On fresh databases the tasks table is
-- empty so the NOT NULL constraint added below succeeds.

alter table public.tasks
  add column if not exists workspace_id uuid null;

-- Add FK constraint if not already present.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_workspace_id_fkey'
      and table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table public.tasks
      add constraint tasks_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. group_id — uuid, nullable, FK to task_groups
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Production: group_id uuid null references public.task_groups(id) on delete set null

alter table public.tasks
  add column if not exists group_id uuid null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_group_id_fkey'
      and table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table public.tasks
      add constraint tasks_group_id_fkey
      foreign key (group_id) references public.task_groups(id) on delete set null;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. assigned_to_user_id — uuid, nullable, FK to auth.users
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Production: assigned_to_user_id uuid null references auth.users(id) on delete set null

alter table public.tasks
  add column if not exists assigned_to_user_id uuid null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_assigned_to_user_id_fkey'
      and table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table public.tasks
      add constraint tasks_assigned_to_user_id_fkey
      foreign key (assigned_to_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. assigned_to — uuid, nullable, FK to workspace_members
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Production: assigned_to uuid null references public.workspace_members(id) on delete set null

alter table public.tasks
  add column if not exists assigned_to uuid null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_assigned_to_fkey'
      and table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table public.tasks
      add constraint tasks_assigned_to_fkey
      foreign key (assigned_to) references public.workspace_members(id) on delete set null;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. Indexes (match production)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create index if not exists tasks_workspace_idx
  on public.tasks(workspace_id, updated_at desc);

create index if not exists tasks_release_group_idx
  on public.tasks(release_id, group_id, position);

create index if not exists tasks_assigned_to_user_idx
  on public.tasks(assigned_to_user_id, due_date);

create index if not exists tasks_assigned_to_idx
  on public.tasks(assigned_to, due_date);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6. RLS on prerequisite tables
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Match the policies the app expects. Tasks RLS already goes through releases
-- (owner check via join), which is unchanged.

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.task_groups enable row level security;

-- Workspace owners can manage their workspace.
drop policy if exists "Owners manage workspaces" on public.workspaces;
create policy "Owners manage workspaces"
  on public.workspaces
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Workspace members can read their workspace's members.
drop policy if exists "Members read workspace members" on public.workspace_members;
create policy "Members read workspace members"
  on public.workspace_members
  for select
  using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- Workspace owners can manage members.
drop policy if exists "Owners manage workspace members" on public.workspace_members;
create policy "Owners manage workspace members"
  on public.workspace_members
  for all
  using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = workspace_members.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  );

-- Task groups inherit access from workspace owner.
drop policy if exists "Owners manage task groups" on public.task_groups;
create policy "Owners manage task groups"
  on public.task_groups
  for all
  using (
    exists (
      select 1 from public.workspaces
      where workspaces.id = task_groups.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = task_groups.workspace_id
        and workspaces.owner_id = auth.uid()
    )
  );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 7. Known additional drift (documented, not fixed here)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The migration-defined tasks table has release_id as NOT NULL with ON DELETE
-- CASCADE. The production/app DDL has it as nullable with ON DELETE SET NULL.
-- Production is correct (tasks can exist without a release in the workspace
-- model). Fixing this requires ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL
-- plus changing the FK action, which is a separate migration.

commit;
