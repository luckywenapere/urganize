-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Tasks on a project (2026-11-04, #1074, part 2)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- A task belongs to a rollout (release_id) OR to a project still being made
-- (record_id, next_records), never both and never neither. Project tasks are
-- real task rows so chasing, assignment emails, the task pop-up and the AI
-- work on them unchanged. When the project is planned, its open tasks move to
-- the rollout (part 3). See docs/notes/2026-11-04-project-lifecycle.md.
--
-- 1. release_id loses NOT NULL; the exactly-one check replaces it, so no task
--    can end up with no owner at all. Every existing row has a release_id.
-- 2. record_id cascades with its project, as release_id cascades with its rollout.
-- 3. Read access for project tasks goes through the project's team, the
--    next_records "Team members read" shape. The app writes through the
--    service role, as for every other task.
--
-- ROLLBACK (manual, only once no row has a record_id):
--   drop policy if exists "Team members read project tasks" on public.tasks;
--   alter table public.tasks drop constraint if exists tasks_one_owner_check;
--   drop index if exists tasks_record_status_position_idx;
--   alter table public.tasks drop column if exists record_id;
--   alter table public.tasks alter column release_id set not null;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.tasks
  add column if not exists record_id uuid references public.next_records(id) on delete cascade;

alter table public.tasks alter column release_id drop not null;

alter table public.tasks drop constraint if exists tasks_one_owner_check;
alter table public.tasks add constraint tasks_one_owner_check
  check ((release_id is null) <> (record_id is null));

create index if not exists tasks_record_status_position_idx
  on public.tasks(record_id, status, position)
  where record_id is not null;

drop policy if exists "Team members read project tasks" on public.tasks;
create policy "Team members read project tasks" on public.tasks for select using (
  record_id is not null and exists (
    select 1
    from public.next_records r
    join public.workspace_members m on m.workspace_id = r.workspace_id
    where r.id = tasks.record_id and m.user_id = auth.uid() and m.status = 'active'
  )
);
