-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- email_suppressions — addresses we must not send optional mail to
--
-- PR 2 of the email work. Two things put an address here:
--   * the recipient unsubscribed from a category (reason 'unsubscribe',
--     scope = that category), through the link in the email or the
--     List-Unsubscribe one-click header;
--   * Resend told us the address bounced permanently or the recipient marked a
--     message as spam (reasons 'bounce' / 'complaint', scope 'all').
--
-- Only OPTIONAL categories (onboarding, reminders, announcements) consult this
-- table. Transactional mail — an invite someone is waiting for, a receipt-like
-- notice — is never blocked by an unsubscribe, and internal mail is founder-only.
--
-- KEYED ON THE ADDRESS, NOT A USER. A person can unsubscribe from a welcome
-- email without ever having signed in, and an address that bounced is a fact
-- about the address. Stored lowercased; the code lowercases before every read
-- and write.
--
-- unique (email, scope) makes "unsubscribe" idempotent: pressing the link twice,
-- or a mail scanner replaying a one-click POST, is one row.
--
-- RLS ON WITH ZERO POLICIES: every read and write is the service-role client
-- (the public unsubscribe route and the Resend webhook), and the rows are
-- people's email addresses. Do not add a select policy without a surface that
-- needs it.
--
-- ROLLBACK: drop table if exists public.email_suppressions;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  scope text not null check (
    scope in ('all', 'onboarding', 'reminders', 'announcements')
  ),
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint')),
  created_at timestamptz not null default now(),
  unique (email, scope)
);

alter table public.email_suppressions enable row level security;

-- Deliberately no policies. See the header.

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'email_suppressions'
  ) then
    raise exception 'email_suppressions was not created';
  end if;
end $$;
