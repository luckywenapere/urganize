-- Rollout chat emails get their own category (2026-10-07).
--
-- Tagging someone with @Name in a rollout's chat, or the whole team with
-- @everyone, now emails them. Those emails carry an unsubscribe link, and the
-- founder wanted turning them off to stop chat mail ONLY, so they are a new
-- category, 'chat', rather than riding 'announcements'. Two check constraints
-- list the categories and both gain it:
--
--   email_log.category           every send is logged with its category
--   email_suppressions.scope     an unsubscribe from chat mail is stored here
--
-- Additive: no row changes, nothing is removed from either list.
--
-- Before this is applied the app still works. A chat email's log row is
-- refused (the send still goes out; the logger never throws), and pressing its
-- unsubscribe link fails to save. Apply it before relying on either.
--
-- ROLLBACK: put back the two constraints below without 'chat' (after deleting
-- any rows that use it).

alter table public.email_log
  drop constraint if exists email_log_category_check;
alter table public.email_log
  add constraint email_log_category_check check (
    category in ('transactional', 'onboarding', 'reminders', 'announcements', 'chat', 'internal')
  );

alter table public.email_suppressions
  drop constraint if exists email_suppressions_scope_check;
alter table public.email_suppressions
  add constraint email_suppressions_scope_check check (
    scope in ('all', 'onboarding', 'reminders', 'announcements', 'chat')
  );
