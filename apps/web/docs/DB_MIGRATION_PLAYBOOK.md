# Editable Release Playbook Migration

Run this SQL once in the Supabase SQL editor before using editable release playbooks.

```sql
create extension if not exists pgcrypto;

create table if not exists public.release_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phase_key text not null,
  template_key text null,
  title text not null,
  description text null,
  is_completed boolean not null default false,
  completed_at timestamptz null,
  is_custom boolean not null default false,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.release_playbook_steps
  add column if not exists phase_key text not null default 'foundation';
alter table public.release_playbook_steps
  add column if not exists template_key text null;
alter table public.release_playbook_steps
  add column if not exists title text not null default '';
alter table public.release_playbook_steps
  add column if not exists description text null;
alter table public.release_playbook_steps
  add column if not exists is_completed boolean not null default false;
alter table public.release_playbook_steps
  add column if not exists completed_at timestamptz null;
alter table public.release_playbook_steps
  add column if not exists is_custom boolean not null default false;
alter table public.release_playbook_steps
  add column if not exists position integer not null default 1;
alter table public.release_playbook_steps
  add column if not exists updated_at timestamptz not null default now();

create index if not exists release_playbook_steps_release_id_idx
  on public.release_playbook_steps(release_id);
create index if not exists release_playbook_steps_release_phase_position_idx
  on public.release_playbook_steps(release_id, phase_key, position asc, created_at asc);
create index if not exists release_playbook_steps_user_id_idx
  on public.release_playbook_steps(user_id, created_at desc);
create unique index if not exists release_playbook_steps_release_template_idx
  on public.release_playbook_steps(release_id, template_key)
  where template_key is not null;

create or replace function public.reorder_release_playbook_steps(
  p_release_id uuid,
  p_user_id uuid,
  p_phase_key text,
  p_step_ids uuid[]
) returns void
language plpgsql
security definer
as $$
declare
  v_expected_count integer;
  v_matched_count integer;
begin
  if coalesce(array_length(p_step_ids, 1), 0) = 0 then
    raise exception 'Step order is required.';
  end if;

  select count(*)
  into v_expected_count
  from public.release_playbook_steps
  where release_id = p_release_id
    and user_id = p_user_id
    and phase_key = p_phase_key;

  if v_expected_count <> array_length(p_step_ids, 1) then
    raise exception 'Step order must include every step in the phase.';
  end if;

  select count(*)
  into v_matched_count
  from public.release_playbook_steps
  where release_id = p_release_id
    and user_id = p_user_id
    and phase_key = p_phase_key
    and id = any(p_step_ids);

  if v_matched_count <> v_expected_count then
    raise exception 'Invalid step ids for this playbook phase.';
  end if;

  update public.release_playbook_steps as steps
  set position = ordered.position,
      updated_at = now()
  from (
    select step_id, ordinality::integer as position
    from unnest(p_step_ids) with ordinality as provided(step_id, ordinality)
  ) as ordered
  where steps.id = ordered.step_id
    and steps.release_id = p_release_id
    and steps.user_id = p_user_id
    and steps.phase_key = p_phase_key;
end;
$$;

alter table public.release_playbook_steps enable row level security;
```

The old playbook snapshot event remains untouched. On first load, the new table imports completion state from the latest legacy `playbook_state_saved` event and then manages the editable playbook from `release_playbook_steps` going forward.
