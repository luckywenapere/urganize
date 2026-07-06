-- ============================================================================
-- 20260706_notifications_add_index.sql
--
-- The notifications table (20260525034856_schema_reconciliation.sql) has no
-- index beyond its primary key. GET /api/notifications (lib/tasks-server.ts
-- listNotifications) filters by user_id and orders by created_at on every
-- bell fetch/dropdown-open — a full table scan today, and one that only
-- gets more expensive as notification volume grows.
-- ============================================================================

create index if not exists notifications_user_created_at_idx
  on public.notifications(user_id, created_at desc);
