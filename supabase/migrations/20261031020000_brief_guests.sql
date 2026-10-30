-- Brief board, phase 6 (#897, 2026-10-31): share the brief with a person.
--
-- A brief guest is an ordinary workspace_members row with role 'guest',
-- limited to one rollout (release_scope_ids = that rollout). Three columns
-- say it came from a brief:
--
-- - brief_release_id: the rollout it was shared from. Oyin, 31 Oct 2026: these
--   guests take no paid seat, up to 5 per rollout; this column is what the
--   seat count leaves out and the cap counts.
-- - brief_task_ids: the activities picked as their part, assigned to them
--   when they join.
-- - invite_name: the name typed when sharing (the row has no profile yet).

alter table public.workspace_members
  add column if not exists brief_release_id uuid null references public.releases (id) on delete set null,
  add column if not exists brief_task_ids uuid[] null,
  add column if not exists invite_name text null check (invite_name is null or char_length(invite_name) <= 80);

create index if not exists workspace_members_brief_release_idx
  on public.workspace_members (brief_release_id)
  where brief_release_id is not null;
