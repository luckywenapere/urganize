-- =============================================================================
-- Schema Reconciliation Migration
-- Generated: 2026-05-25
-- =============================================================================
--
-- Brings the production schema in line with what the application code expects
-- after Operation 1 (application code cleanup).
--
-- Safe to apply to:
--   - Production (where dropped items exist and need to be dropped)
--   - A fresh checkout running migrations from scratch
--   - A re-run on either (all statements are idempotent)
--
-- This migration does NOT modify data in tables we are keeping.
-- =============================================================================

begin;

-- =============================================================================
-- Section 1: Backfill missing tables
-- =============================================================================
-- Tables created in production via schema-missing fallback code, not via
-- tracked migrations. Adding CREATE TABLE IF NOT EXISTS so a fresh checkout
-- produces the same database as production.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Prerequisite enum types
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

do $$ begin
  create type public.workspace_member_role as enum ('owner', 'admin', 'member', 'guest');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.workspace_member_status as enum ('active', 'invited', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_type as enum ('task_assigned', 'task_commented', 'task_due_soon', 'task_overdue', 'task_status_changed');
exception when duplicate_object then null;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Prerequisite functions
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1a. workspaces
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_owner_id_unique_idx
  on public.workspaces(owner_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1b. workspace_members
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1c. task_groups
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
-- 1d. release_workspaces
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_workspaces (
  release_id uuid primary key references public.releases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  marketing_items jsonb not null default '[]'::jsonb,
  playlist_items jsonb not null default '[]'::jsonb,
  distribution_items jsonb not null default '[]'::jsonb,
  plan_snapshot jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1e. organizations
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text null,
  trial_started_at timestamptz null,
  trial_ends_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1f. organization_members
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1g. task_activity
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1h. task_attachments
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size integer not null default 0,
  storage_path text null,
  created_at timestamptz not null default now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1i. task_comments
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null
);

create index if not exists task_comments_task_idx
  on public.task_comments(task_id, created_at);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1j. ui_state_drafts
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.ui_state_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null,
  scope text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, draft_key)
);

create index if not exists ui_state_drafts_user_scope_idx
  on public.ui_state_drafts(user_id, scope);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1k. pricing_validation_responses
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.pricing_validation_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  willingness text null check (willingness in ('yes', 'maybe', 'no')),
  price_band text null check (price_band in ('under-5000', '5000-10000', '10000-plus', 'not-sure')),
  notes text not null default '',
  placement text not null default 'dashboard' check (placement in ('onboarding', 'dashboard', 'research')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_validation_responses_user_id_idx
  on public.pricing_validation_responses(user_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1l. artists
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1m. profiles
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  name text not null,
  email text not null,
  role text not null check (role = any (array['artist'::text, 'manager'::text, 'artist-manager'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_subscribed boolean default false,
  artist_name text,
  industry_role text,
  onboarding_intent text,
  onboarding_completed_at timestamptz,
  onboarding_task_id uuid references public.tasks(id) on delete set null
);

create unique index if not exists profiles_email_key
  on public.profiles(email);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1n. release_metadata
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_metadata (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  isrc text,
  upc text,
  primary_artist_name text not null default '',
  release_title text not null default '',
  genre text,
  subgenre text,
  label_name text,
  language text,
  explicit boolean,
  artwork_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists release_metadata_release_id_key
  on public.release_metadata(release_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1o. release_events
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists release_events_release_idx
  on public.release_events(release_id, created_at desc);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1p. release_playbook_steps
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phase_key text not null,
  template_key text,
  title text not null,
  description text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  is_custom boolean not null default false,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_playbook_steps_release_id_idx
  on public.release_playbook_steps(release_id);
create index if not exists release_playbook_steps_release_phase_position_idx
  on public.release_playbook_steps(release_id, phase_key, position, created_at);
create unique index if not exists release_playbook_steps_release_template_idx
  on public.release_playbook_steps(release_id, template_key)
  where template_key is not null;
create index if not exists release_playbook_steps_user_id_idx
  on public.release_playbook_steps(user_id, created_at desc);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1q. subscriptions
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  plan text not null check (plan = any (array['monthly'::text, 'yearly'::text])),
  status text default 'active' check (status = any (array['active'::text, 'inactive'::text, 'cancelled'::text, 'expired'::text])),
  amount integer not null,
  paystack_reference text,
  paystack_customer_code text,
  started_at timestamptz default now(),
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists subscriptions_user_id_key
  on public.subscriptions(user_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1r. payments
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount integer not null,
  currency text default 'NGN',
  reference text not null,
  status text default 'pending' check (status = any (array['pending'::text, 'success'::text, 'failed'::text])),
  plan text,
  paystack_response jsonb,
  created_at timestamptz default now()
);

create unique index if not exists payments_reference_key
  on public.payments(reference);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1s. app_settings
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.app_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1t. notifications
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1u. Enable RLS on all backfilled tables
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent.

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.task_groups enable row level security;
alter table public.release_workspaces enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_activity enable row level security;
alter table public.ui_state_drafts enable row level security;
alter table public.pricing_validation_responses enable row level security;
alter table public.artists enable row level security;
alter table public.profiles enable row level security;
alter table public.release_metadata enable row level security;
alter table public.release_events enable row level security;
alter table public.release_playbook_steps enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
-- app_settings: RLS enabled with NO policies. Intentional.
-- Service-role client access only (bypasses RLS).
-- Anon-client reads will silently return empty results.
alter table public.app_settings enable row level security;
alter table public.notifications enable row level security;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1v. set_updated_at triggers for new tables
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Attach the shared trigger to tables with an updated_at column.
-- DROP + CREATE ensures correct definitions on re-runs.

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.release_metadata;
create trigger set_updated_at before update on public.release_metadata
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.release_playbook_steps;
create trigger set_updated_at before update on public.release_playbook_steps
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.subscriptions;
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();


-- =============================================================================
-- Section 2: Backfill missing columns on tasks table
-- =============================================================================
-- These columns exist in production (added by the tasks-server.ts fallback SQL)
-- but were not in migration files until 20260523. Repeated here for
-- completeness; IF NOT EXISTS makes them no-ops where they already exist.

alter table public.tasks
  add column if not exists workspace_id uuid null;

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

-- Indexes matching production (from schema-dump.sql).
create index if not exists tasks_workspace_idx
  on public.tasks(workspace_id, updated_at desc);
create index if not exists tasks_release_group_idx
  on public.tasks(release_id, group_id, position);
create index if not exists tasks_assigned_to_user_id_idx
  on public.tasks(assigned_to_user_id);
create index if not exists tasks_assigned_to_idx
  on public.tasks(assigned_to, due_date);


-- =============================================================================
-- Section 3: Drop dead tables
-- =============================================================================
-- Tables first, columns second. RLS policies on release_profiles and
-- task_batches reference releases.user_id — dropping those tables (CASCADE
-- removes their policies) unblocks the column drop in Section 4.

drop table if exists public.ai_signals cascade;
drop table if exists public.files cascade;
drop table if exists public.task_batches cascade;
drop table if exists public.artist_profiles cascade;
drop table if exists public.release_profiles cascade;
drop table if exists public.ai_tasks cascade;


-- =============================================================================
-- Section 4: Drop dead columns
-- =============================================================================

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4a. releases — drop columns the application no longer references
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- The "Users can CRUD own releases" RLS policy references user_id.
-- It must be dropped before the column, otherwise DROP COLUMN fails.
drop policy if exists "Users can CRUD own releases" on public.releases;

alter table public.releases drop column if exists user_id;
alter table public.releases drop column if exists cover_art;
alter table public.releases drop column if exists current_task_id;
alter table public.releases drop column if exists tasks_completed;
alter table public.releases drop column if exists tasks_skipped;
alter table public.releases drop column if exists campaign_completed;
alter table public.releases drop column if exists campaign_completed_at;
alter table public.releases drop column if exists has_artist_profile;
alter table public.releases drop column if exists deadline;
-- "type" is the legacy text column; release_type enum column remains.
-- The releases_type_check CHECK constraint is auto-dropped with the column.
alter table public.releases drop column if exists type;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4b. collaborators — drop dead columns
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- The collaborators_claimed_user_id_fkey FK is auto-dropped with the column.
alter table public.collaborators drop column if exists claimed_user_id;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4c. release_collaborators — drop credit-collection columns
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- The release_collaborators_submission_token_key unique index is auto-dropped
-- when the submission_token column is dropped.
alter table public.release_collaborators drop column if exists invite_name;
alter table public.release_collaborators drop column if exists invite_contact;
alter table public.release_collaborators drop column if exists submission_token;
alter table public.release_collaborators drop column if exists submission_sent_at;
alter table public.release_collaborators drop column if exists submitted_at;
alter table public.release_collaborators drop column if exists last_reminded_at;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4d. release_collaborators — drop dead status column
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Table is empty (zero rows in production). Column is a remnant of the credit-
-- collection system removed in Operation 1. Recreate the release_idx without
-- status (the old index is auto-dropped when the column is dropped).

alter table public.release_collaborators drop column if exists status;

create index if not exists release_collaborators_release_idx
  on public.release_collaborators(release_id, created_at);


-- =============================================================================
-- Section 5: Tighten constraints
-- =============================================================================

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5a. tasks.release_id — NOT NULL
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Verified: zero rows have null release_id in production (49/49 NOT NULL).

alter table public.tasks alter column release_id set not null;

-- The existing FK uses ON DELETE SET NULL, which would violate the new NOT NULL
-- constraint. Change it to ON DELETE CASCADE to match the intended behaviour
-- (deleting a release deletes its tasks).
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_release_id_fkey'
      and table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table public.tasks drop constraint tasks_release_id_fkey;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_release_id_fkey'
      and table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table public.tasks
      add constraint tasks_release_id_fkey
      foreign key (release_id) references public.releases(id) on delete cascade;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5b. task_groups.release_id — NOT NULL
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Verified: zero rows have null release_id in production (36/36 NOT NULL).
-- FK already uses ON DELETE CASCADE, no change needed.

alter table public.task_groups alter column release_id set not null;


-- =============================================================================
-- Section 6: Add RLS policies
-- =============================================================================
-- Six tables have RLS enabled but no policies (or need policy corrections).
-- Using DROP IF EXISTS + CREATE to ensure correct definitions on re-runs.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6a. workspaces — owner-direct via owner_id
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Owners manage workspaces" on public.workspaces;
create policy "Owners manage workspaces"
  on public.workspaces
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6b. workspace_members — workspace-owner + member self-read
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6c. task_groups — release-chain only
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Previous migration (20260523) created a workspace-based policy. Now that
-- release_id is NOT NULL, we use a release-chain policy instead.

drop policy if exists "Owners manage task groups" on public.task_groups;
create policy "Owners manage task groups"
  on public.task_groups
  for all
  using (
    exists (
      select 1 from public.releases
      where releases.id = task_groups.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = task_groups.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6d. release_metadata — release-chain
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Owners manage release metadata" on public.release_metadata;
create policy "Owners manage release metadata"
  on public.release_metadata
  for all
  using (
    exists (
      select 1 from public.releases
      where releases.id = release_metadata.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = release_metadata.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6e. release_events — release-chain
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Owners manage release events" on public.release_events;
create policy "Owners manage release events"
  on public.release_events
  for all
  using (
    exists (
      select 1 from public.releases
      where releases.id = release_events.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = release_events.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6f. release_playbook_steps — release-chain + user self-read
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Owners manage release playbook steps" on public.release_playbook_steps;
create policy "Owners manage release playbook steps"
  on public.release_playbook_steps
  for all
  using (
    exists (
      select 1 from public.releases
      where releases.id = release_playbook_steps.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = release_playbook_steps.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Users can view own playbook steps" on public.release_playbook_steps;
create policy "Users can view own playbook steps"
  on public.release_playbook_steps
  for select
  using (user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6g. profiles — owner-direct via id
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6h. subscriptions — service-role full access + user self-read
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The "Service role can manage" policy uses USING (true), matching production.
-- Service-role operations bypass RLS anyway; this policy exists for parity.

drop policy if exists "Service role can manage subscriptions" on public.subscriptions;
create policy "Service role can manage subscriptions"
  on public.subscriptions
  for all
  using (true);

drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6i. payments — service-role full access + user self-read
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Service role can manage payments" on public.payments;
create policy "Service role can manage payments"
  on public.payments
  for all
  using (true);

drop policy if exists "Users can view own payments" on public.payments;
create policy "Users can view own payments"
  on public.payments
  for select
  using (auth.uid() = user_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6j. notifications — user manages own notifications
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop policy if exists "Users manage own notifications" on public.notifications;
create policy "Users manage own notifications"
  on public.notifications
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
