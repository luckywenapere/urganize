# Task Management Migration

Run this SQL in Supabase before using the collaborative task management feature.

```sql
create extension if not exists pgcrypto;

do $$ begin
  create type public.workspace_member_role as enum ('owner', 'admin', 'member', 'guest');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.workspace_member_status as enum ('active', 'invited', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('urgent', 'high', 'medium', 'low', 'none');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_type as enum ('task_assigned', 'task_commented', 'task_due_soon', 'task_overdue', 'task_status_changed');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_owner_id_unique_idx on public.workspaces(owner_id);

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

create unique index if not exists workspace_members_workspace_email_unique_idx on public.workspace_members(workspace_id, email);
create unique index if not exists workspace_members_workspace_user_unique_idx on public.workspace_members(workspace_id, user_id) where user_id is not null;

create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  release_id uuid null references public.releases(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_groups_workspace_release_idx on public.task_groups(workspace_id, release_id, position);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid null references public.task_groups(id) on delete set null,
  release_id uuid null references public.releases(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid null references public.workspace_members(id) on delete set null,
  title text not null,
  description text null,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'none',
  due_date timestamptz null,
  completed_at timestamptz null,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_workspace_idx on public.tasks(workspace_id, updated_at desc);
create index if not exists tasks_release_group_idx on public.tasks(release_id, group_id, position);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to, due_date);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null
);

create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

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

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.task_groups enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_activity enable row level security;
alter table public.notifications enable row level security;
```

Create a private storage bucket for task attachments:

```sql
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;
```

The app uses server-side Supabase admin access for these task APIs, so explicit RLS policies can be added later if you want direct client access in the future.
