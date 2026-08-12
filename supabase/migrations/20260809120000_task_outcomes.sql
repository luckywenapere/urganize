-- Task outcomes ("Done. How did it go?"): after a user marks a task done,
-- UrgAns asks how it went. The answer (a rating chip, an optional note, an
-- optional AI follow-up exchange) is stored here as the memory of the
-- release — later features (the release recap card, UrgAns planning context)
-- read outcomes instead of re-deriving what happened.
--
-- Design calls worth recording:
--   * ONE row per task (`task_id` is unique). Re-completing a task upserts
--     over the old row: the newest completion's story is the task's story,
--     and recap consumers get exactly one row per task. Reopening a task
--     does NOT delete its outcome — it is history of the last completion.
--   * RLS is the release-chain policy `tasks` itself uses (releases.owner
--     = auth.uid()), NOT a team-scoped policy — no table in this schema has
--     team-scoped RLS. Real team access is enforced app-side by
--     ensureTaskAccess (workspace membership, service-role client), exactly
--     like every other task surface. Defense-in-depth only.
--   * `summary` is always present: AI-written when the user left a note,
--     template-built otherwise — so future consumers never need to
--     re-summarize.
--   * `created_at` doubles as the completion-review timestamp
--     (tasks.completed_at is not set by UI completions — a known,
--     out-of-scope gap).
--   * profiles.ask_after_tasks is the per-user "Ask me after tasks" toggle,
--     default ON. User-writable under the existing profiles RLS (the
--     BEFORE UPDATE guard trigger only blocks trial/paid fields).
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.task_outcomes;
--   drop type if exists public.task_outcome_rating;
--   alter table public.profiles drop column if exists ask_after_tasks;

do $$ begin
  create type public.task_outcome_rating as enum (
    'went_well',
    'went_okay',
    'not_to_plan'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.task_outcomes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  outcome public.task_outcome_rating not null,
  note text,
  summary text not null,
  ai_followup_question text,
  ai_followup_answer text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The RLS policy subquery join, future per-release recap reads, and the
-- cascade pass when a release is deleted. The unique constraint on task_id
-- already covers the by-task detail-view read and the upsert conflict target.
create index if not exists task_outcomes_release_id_idx on public.task_outcomes(release_id);

drop trigger if exists set_task_outcomes_updated_at on public.task_outcomes;
create trigger set_task_outcomes_updated_at
before update on public.task_outcomes
for each row execute function public.set_updated_at();

alter table public.task_outcomes enable row level security;

-- Release-chain RLS, mirroring the tasks table's own policy shape
-- (20260510_mvp_release_management_schema.sql). Task rows carry no
-- owner_user_id either; ownership flows through the release.

drop policy if exists "Release owners view task outcomes" on public.task_outcomes;
create policy "Release owners view task outcomes"
  on public.task_outcomes
  for select
  using (
    exists (
      select 1 from public.releases
      where releases.id = task_outcomes.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Release owners create task outcomes" on public.task_outcomes;
create policy "Release owners create task outcomes"
  on public.task_outcomes
  for insert
  with check (
    exists (
      select 1 from public.releases
      where releases.id = task_outcomes.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Release owners update task outcomes" on public.task_outcomes;
create policy "Release owners update task outcomes"
  on public.task_outcomes
  for update
  using (
    exists (
      select 1 from public.releases
      where releases.id = task_outcomes.release_id
        and releases.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.releases
      where releases.id = task_outcomes.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Release owners delete task outcomes" on public.task_outcomes;
create policy "Release owners delete task outcomes"
  on public.task_outcomes
  for delete
  using (
    exists (
      select 1 from public.releases
      where releases.id = task_outcomes.release_id
        and releases.owner_user_id = auth.uid()
    )
  );

-- Per-user "Ask me after tasks" preference, default ON. Read client-side to
-- gate the post-completion sheet; written from Settings via the anon client
-- under the existing profiles update policy.
alter table public.profiles add column if not exists ask_after_tasks boolean not null default true;
