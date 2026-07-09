-- workspace_members lookup indexes
--
-- Every authenticated request resolves workspace access by filtering
-- workspace_members on user_id (membership resolution) and on email
-- (pending-invite activation) — the two most frequently executed query
-- shapes in the app. Until now only composite unique indexes existed
-- ((workspace_id, email) and (workspace_id, user_id)), which cannot serve
-- a bare user_id or email filter, so both queries sequential-scanned the
-- table on every request.

create index if not exists workspace_members_user_id_idx
  on public.workspace_members(user_id)
  where user_id is not null;

create index if not exists workspace_members_email_idx
  on public.workspace_members(email);
