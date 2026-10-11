-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- WORK REQUESTS: FROM PROFILE TO WORKING TOGETHER (2026-10-10)
--
-- The directory spec's "From profile to working together". Two moves ride the
-- request that already exists, and neither needs a new table:
--
--   1. ARTIST TO MANAGER. kind = 'manager'. The artist asks a manager to take
--      them on and adds a short structured ask: links to their music (up to 3)
--      and a line about their next release. When the manager says yes the
--      server starts a shared rollout (see lib/work-request-collab-server.ts)
--      and records it in accepted_release_id, so "shared rollouts started from
--      the directory" is a count of rows rather than a guess.
--
--   2. MANAGER TO CREW. kind = 'crew' (every existing row). task_id is the
--      open activity the person is being asked to do. When they say yes the
--      server links them to that activity (tasks.assigned_person_id, which the
--      Relationships migration added and nothing wrote) and stamps assigned_at.
--
-- DECISIONS WORTH KNOWING BEFORE CHANGING THIS
--
-- 1. THE NEXT-RELEASE LINE IS HIDDEN FROM THE RECIPIENT UNTIL THEY SAY YES.
--    The standing rule is that an unannounced release never reaches somebody
--    who is about to say no. ask_release_note is typed by the artist, but it is
--    still a release, so the recipient's read path selects it only for a
--    request they have answered 'interested'. ask_links stays visible before
--    the answer: they are music links an artist chose to send, the same thing
--    a profile carries.
--
-- 2. task_id and accepted_release_id ARE SENDER-SIDE ONLY. Both point at
--    releases (a task belongs to one) and neither is in the recipient's column
--    list in app code. They are ON DELETE SET NULL for the reason release_id
--    is: deleting a rollout or an activity must not erase somebody's inbox.
--
-- 3. NO NEW WRITE POLICY. work_requests still has select policies only; every
--    write is a service-role route, because the seat cap, the artist ceiling and
--    the rule that only the recipient moves a status cannot be expressed in RLS.
--
-- 4. kind IS A CHECK, NOT AN ENUM, and a manager ask must be for the manager
--    role. Both for the reasons status is a check: the vocabulary is product
--    copy, and an enum value cannot be added inside a transaction.
--
-- Additive and safe to re-run. Existing rows read as kind 'crew' with no links
-- and nothing linked.
--
-- ROLLBACK (manual):
--   alter table public.work_requests
--     drop column if exists assigned_at, drop column if exists shared_at,
--     drop column if exists accepted_release_id, drop column if exists task_id,
--     drop column if exists ask_release_note, drop column if exists ask_links,
--     drop column if exists kind;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.work_requests
  add column if not exists kind text not null default 'crew',
  add column if not exists ask_links text[] not null default '{}',
  add column if not exists ask_release_note text,
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  add column if not exists accepted_release_id uuid references public.releases(id) on delete set null,
  add column if not exists shared_at timestamptz,
  add column if not exists assigned_at timestamptz;

alter table public.work_requests drop constraint if exists work_requests_kind_check;
alter table public.work_requests
  add constraint work_requests_kind_check check (kind in ('crew', 'manager'));

-- A manager ask is an ask of a manager.
alter table public.work_requests drop constraint if exists work_requests_kind_role_check;
alter table public.work_requests
  add constraint work_requests_kind_role_check
  check (kind <> 'manager' or role = 'manager');

alter table public.work_requests drop constraint if exists work_requests_ask_links_check;
alter table public.work_requests
  add constraint work_requests_ask_links_check check (cardinality(ask_links) <= 3);

alter table public.work_requests drop constraint if exists work_requests_ask_release_note_check;
alter table public.work_requests
  add constraint work_requests_ask_release_note_check
  check (ask_release_note is null or char_length(ask_release_note) <= 140);

-- The sender's per-activity read ("who did I ask for this task"), and the two
-- counts the spec wants: shared rollouts started, and tasks filled, from here.
create index if not exists work_requests_task_idx
  on public.work_requests(task_id)
  where task_id is not null;
create index if not exists work_requests_accepted_release_idx
  on public.work_requests(accepted_release_id)
  where accepted_release_id is not null;
