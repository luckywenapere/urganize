-- =============================================================================
-- Add 'task_due_7d' and 'task_due_3d' to the notification_type enum
-- =============================================================================
--
-- Mobile push notifications (2026-08-10) extends task deadline reminders from
-- a single "due soon" (24h) tier to three tiers: 7 days, 3 days, and 1 day
-- (the existing 'task_due_soon' keeps that role — see
-- apps/web/lib/due-tiers.ts). Reusing the notifications table/enum instead of
-- a new table means the new tiers get the existing bell UI, the existing
-- unread-(user_id,task_id,type) dedupe, and the existing push mirror in
-- createTaskNotification for free.
--
-- ADD VALUE IF NOT EXISTS is idempotent and safe to re-apply. It is
-- intentionally not wrapped in a transaction block: ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that adds it, and bare execution
-- avoids that constraint entirely. No subsequent statement here uses the new
-- values (precedent: 20260527_assets_add_split_sheet_category.sql).
-- =============================================================================

alter type public.notification_type add value if not exists 'task_due_7d';
alter type public.notification_type add value if not exists 'task_due_3d';
