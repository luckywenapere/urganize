-- ============================================================================
-- 20260706020000_notifications_realtime_delete.sql
--
-- The notifications bell only listened for realtime INSERT events, so a
-- notification whose task gets deleted (cascade-deletes the notification
-- row too, per notifications.task_id's ON DELETE CASCADE) stays visible in
-- an already-open dropdown/list until the next manual refetch.
--
-- To let the bell react to DELETE in realtime, Postgres needs to replicate
-- the full old row image, not just the primary key (the default) — the
-- client-side subscription filters DELETE events by `user_id`, a non-PK
-- column, which isn't present in the replicated payload without this.
-- ============================================================================

alter table public.notifications replica identity full;
