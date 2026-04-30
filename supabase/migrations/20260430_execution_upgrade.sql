create extension if not exists pgcrypto;

do $$ begin
  alter type public.task_status add value if not exists 'locked';
exception when undefined_object then
  create type public.task_status as enum ('locked', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
end $$;

alter table public.releases
  add column if not exists state text not null default 'idea',
  add column if not exists readiness_score integer not null default 0;

alter table public.releases
  drop constraint if exists releases_state_check;

alter table public.releases
  add constraint releases_state_check
  check (state in ('idea', 'planning', 'asset_prep', 'distribution', 'campaign', 'post_release'));

alter table public.releases
  drop constraint if exists releases_readiness_score_check;

alter table public.releases
  add constraint releases_readiness_score_check
  check (readiness_score >= 0 and readiness_score <= 100);

alter table public.tasks
  add column if not exists requirement jsonb null,
  add column if not exists dependencies uuid[] not null default '{}'::uuid[],
  add column if not exists state text not null default 'idea',
  add column if not exists auto_generated boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_state_check;

alter table public.tasks
  add constraint tasks_state_check
  check (state in ('idea', 'planning', 'asset_prep', 'distribution', 'campaign', 'post_release'));

create index if not exists tasks_release_state_idx on public.tasks(release_id, state, status);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  release_id uuid null references public.releases(id) on delete cascade,
  task_id uuid null references public.tasks(id) on delete cascade,
  actor_name text not null default 'Urganize',
  action text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_created_idx on public.activity_log(user_id, created_at desc);
create index if not exists activity_log_release_created_idx on public.activity_log(release_id, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "Users can read their activity" on public.activity_log;
create policy "Users can read their activity"
  on public.activity_log
  for select
  using (user_id = auth.uid() or user_id is null);
