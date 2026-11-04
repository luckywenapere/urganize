-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- A project can be just an idea (2026-11-04, #1074, mocks approved)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- next_records gains the 'idea' status: a project nobody has started making
-- yet. It moves to 'making' by a button, or by itself the first time a song
-- moves past its Idea stage or a session is saved, and never back. See
-- docs/notes/2026-11-04-project-lifecycle.md.
--
-- The default stays 'making', so every existing caller and row keeps its
-- meaning. Only the check constraint widens.
--
-- ROLLBACK (manual, only once no row is 'idea'):
--   alter table public.next_records drop constraint next_records_status_check;
--   alter table public.next_records add constraint next_records_status_check
--     check (status in ('making', 'planned', 'dropped'));
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.next_records drop constraint if exists next_records_status_check;
alter table public.next_records add constraint next_records_status_check
  check (status in ('idea', 'making', 'planned', 'dropped'));

-- The artist page and the record ask read open projects by team and status.
create index if not exists next_records_workspace_idx on public.next_records(workspace_id, status);
