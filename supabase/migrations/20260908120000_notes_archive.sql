-- Notes: archive, as a distinct end from delete.
--
-- Until now a note ended one way — deleted, behind a confirmation, gone. That
-- is the right treatment for something you never want back and the wrong one
-- for the ordinary case, which is a note that has served its purpose. So the
-- notebook accumulated, and the only way to tidy it was destructive.
--
-- Design calls worth recording:
--   * A NULLABLE TIMESTAMP, not a boolean. `archived_at is null` reads exactly
--     as "active", costs the same to index, and records WHEN — which a boolean
--     throws away and nothing can reconstruct. It also leaves room for an
--     auto-purge later without another migration.
--   * NO BACKFILL. Every existing note is active, and null already says so.
--   * `pinned` is deliberately NOT cleared on archive. Pinning is an act of
--     attention and archiving is not an act of forgetting; a restored note
--     comes back where its owner left it. The two flags are independent, and
--     archived notes are filtered out of the list wholesale, so a pinned
--     archived note cannot leak into the active view.
--   * Archiving goes through the ordinary UPDATE path, so the table-wide
--     set_updated_at trigger bumps updated_at. That is intended: the archived
--     view is then ordered most-recently-archived first, which is the order
--     somebody looking for "the thing I just archived" wants. The same
--     trade-off pinning already makes, and recorded for the same reason.
--
-- RLS needs no change: the four owner-scoped policies from the notes
-- migration already cover this column, since it is on the same row.
--
-- ROLLBACK (manual, if ever needed):
--   drop index if exists public.notes_owner_active_idx;
--   drop index if exists public.notes_owner_archived_idx;
--   alter table public.notes drop column if exists archived_at;

alter table public.notes
  add column if not exists archived_at timestamptz;

-- The list's only read path, and the hot one: one owner's ACTIVE notes in
-- (pinned desc, updated_at desc, id desc). Partial, because the active set is
-- what nearly every request wants and excluding archived rows keeps the index
-- the same size as the notebook people actually work in. The sort columns are
-- in the index so keyset paging can walk it without a sort step.
create index if not exists notes_owner_active_idx
  on public.notes(owner_user_id, pinned desc, updated_at desc, id desc)
  where archived_at is null;

-- The mirror, for the archived view. Separate and also partial: archived notes
-- are read rarely, and keeping them out of the index above is the point.
create index if not exists notes_owner_archived_idx
  on public.notes(owner_user_id, updated_at desc, id desc)
  where archived_at is not null;
