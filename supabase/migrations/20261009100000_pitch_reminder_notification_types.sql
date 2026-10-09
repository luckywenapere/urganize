-- =============================================================================
-- Add the three Spotify pitch reminders to the notification_type enum
-- =============================================================================
--
-- The Spotify editorial pitch (apps/web/lib/editorial-pitch.ts) is reminded at
-- 28, 14 and 8 days before release day. Reusing the notifications table and
-- its enum instead of a new table gives the reminders the existing bell, the
-- existing push mirror and the deep link for free.
--
-- They are three values rather than one because "sent once" has to be answered
-- per reminder: the sweep looks for a row of that exact type for the task, read
-- or unread. createTaskNotification only dedupes against UNREAD rows, which
-- would resend the same reminder every morning after it had been read.
--
-- ADD VALUE IF NOT EXISTS is idempotent and safe to re-apply. It is
-- intentionally not wrapped in a transaction block: ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that adds it. No subsequent statement
-- here uses the new values (precedent: 20260810140000_notification_type_due_tiers.sql).
-- =============================================================================

alter type public.notification_type add value if not exists 'pitch_reminder_28d';
alter type public.notification_type add value if not exists 'pitch_reminder_14d';
alter type public.notification_type add value if not exists 'pitch_reminder_8d';
