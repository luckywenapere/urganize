-- Rollout soft delete and Trash (2026-10-23).
-- Deleting a rollout sets releases.deleted_at instead of removing the row.
-- Tasks, files and activity keep pointing at the release and are not touched,
-- so Restore (deleted_at = null) brings everything back intact. Every read
-- path hides rows where deleted_at is not null; the 30-day purge runs from an
-- app cron and removes only rows deleted more than 30 days ago. Additive only.

alter table public.releases
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- Trash list and the purge job: only deleted rows are indexed, so the index
-- stays tiny and live-rollout reads are unaffected.
create index if not exists releases_deleted_at_idx
  on public.releases (deleted_at)
  where deleted_at is not null;
