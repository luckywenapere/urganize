create extension if not exists pgcrypto;

do $$ begin
  create type public.release_type as enum ('single', 'ep', 'album');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.release_status as enum ('draft', 'planning', 'in_progress', 'ready', 'released', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('locked', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
exception when duplicate_object then null;
end $$;

alter type public.task_status add value if not exists 'locked';

do $$ begin
  create type public.task_priority as enum ('urgent', 'high', 'medium', 'low', 'none');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.collaborator_role as enum (
    'artist',
    'manager',
    'producer',
    'writer',
    'engineer',
    'designer',
    'publicist',
    'distributor',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.collaborator_status as enum ('invited', 'active', 'pending', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.asset_category as enum (
    'audio',
    'stems',
    'cover_art',
    'promo_image',
    'video',
    'document',
    'contract',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_entity_type as enum ('release', 'task', 'collaborator', 'asset');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist_name text not null default '',
  release_type public.release_type not null default 'single',
  status public.release_status not null default 'draft',
  release_date date null,
  description text null,
  artwork_asset_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

alter table public.releases
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists artist_name text not null default '',
  add column if not exists release_type public.release_type not null default 'single',
  add column if not exists status public.release_status not null default 'draft',
  add column if not exists release_date date null,
  add column if not exists description text null,
  add column if not exists artwork_asset_id uuid null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz null;

create index if not exists releases_owner_status_date_idx
  on public.releases(owner_user_id, status, release_date);

create index if not exists releases_owner_updated_idx
  on public.releases(owner_user_id, updated_at desc);

drop trigger if exists set_releases_updated_at on public.releases;
create trigger set_releases_updated_at
before update on public.releases
for each row execute function public.set_updated_at();

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  stage_name text null,
  email text null,
  phone text null,
  default_role public.collaborator_role not null default 'other',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collaborators
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists full_name text,
  add column if not exists stage_name text null,
  add column if not exists email text null,
  add column if not exists phone text null,
  add column if not exists default_role public.collaborator_role not null default 'other',
  add column if not exists notes text null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists collaborators_owner_name_idx
  on public.collaborators(owner_user_id, full_name);

create unique index if not exists collaborators_owner_email_unique_idx
  on public.collaborators(owner_user_id, lower(email))
  where email is not null;

drop trigger if exists set_collaborators_updated_at on public.collaborators;
create trigger set_collaborators_updated_at
before update on public.collaborators
for each row execute function public.set_updated_at();

create table if not exists public.release_collaborators (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  role public.collaborator_role not null default 'other',
  status public.collaborator_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, collaborator_id, role)
);

create index if not exists release_collaborators_release_idx
  on public.release_collaborators(release_id, status);

create index if not exists release_collaborators_collaborator_idx
  on public.release_collaborators(collaborator_id);

drop trigger if exists set_release_collaborators_updated_at on public.release_collaborators;
create trigger set_release_collaborators_updated_at
before update on public.release_collaborators
for each row execute function public.set_updated_at();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_collaborator_id uuid null references public.collaborators(id) on delete set null,
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

alter table public.tasks
  add column if not exists release_id uuid references public.releases(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete cascade,
  add column if not exists assigned_collaborator_id uuid null references public.collaborators(id) on delete set null,
  add column if not exists title text,
  add column if not exists description text null,
  add column if not exists status public.task_status not null default 'todo',
  add column if not exists priority public.task_priority not null default 'none',
  add column if not exists due_date timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists position integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists tasks_release_status_position_idx
  on public.tasks(release_id, status, position);

create index if not exists tasks_release_due_date_idx
  on public.tasks(release_id, due_date)
  where due_date is not null;

create index if not exists tasks_assigned_collaborator_idx
  on public.tasks(assigned_collaborator_id, status);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid null references public.releases(id) on delete cascade,
  task_id uuid null references public.tasks(id) on delete set null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  category public.asset_category not null default 'other',
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text null,
  storage_bucket text not null default 'release-assets',
  storage_path text not null,
  public_url text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_scope_check check (release_id is not null or task_id is not null)
);

create index if not exists assets_release_category_idx
  on public.assets(release_id, category, created_at desc);

create index if not exists assets_task_idx
  on public.assets(task_id, created_at desc)
  where task_id is not null;

create unique index if not exists assets_bucket_path_unique_idx
  on public.assets(storage_bucket, storage_path);

drop trigger if exists set_assets_updated_at on public.assets;
create trigger set_assets_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

alter table public.releases
  drop constraint if exists releases_artwork_asset_id_fkey;

alter table public.releases
  add constraint releases_artwork_asset_id_fkey
  foreign key (artwork_asset_id) references public.assets(id) on delete set null;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  release_id uuid null references public.releases(id) on delete cascade,
  task_id uuid null references public.tasks(id) on delete cascade,
  collaborator_id uuid null references public.collaborators(id) on delete set null,
  asset_id uuid null references public.assets(id) on delete set null,
  entity_type public.activity_entity_type not null,
  action text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_owner_created_idx
  on public.activity_logs(owner_user_id, created_at desc);

create index if not exists activity_logs_release_created_idx
  on public.activity_logs(release_id, created_at desc)
  where release_id is not null;

create index if not exists activity_logs_task_created_idx
  on public.activity_logs(task_id, created_at desc)
  where task_id is not null;

alter table public.releases enable row level security;
alter table public.collaborators enable row level security;
alter table public.release_collaborators enable row level security;
alter table public.tasks enable row level security;
alter table public.assets enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "Owners manage releases" on public.releases;
create policy "Owners manage releases"
  on public.releases
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage collaborators" on public.collaborators;
create policy "Owners manage collaborators"
  on public.collaborators
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage release collaborators" on public.release_collaborators;
create policy "Owners manage release collaborators"
  on public.release_collaborators
  for all
  using (
    exists (
      select 1 from public.releases
      where releases.id = release_collaborators.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = release_collaborators.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owners manage release tasks" on public.tasks;
create policy "Owners manage release tasks"
  on public.tasks
  for all
  using (
    exists (
      select 1 from public.releases
      where releases.id = tasks.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = tasks.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owners manage assets" on public.assets;
create policy "Owners manage assets"
  on public.assets
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners read activity logs" on public.activity_logs;
create policy "Owners read activity logs"
  on public.activity_logs
  for select
  using (owner_user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('release-assets', 'release-assets', false)
on conflict (id) do nothing;
