-- The claim email sends itself (2026-10-11), behind
-- NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL (default off).
--
-- A credited collaborator who has an unclaimed page, an email on their credit
-- and a rollout that has come out gets ONE email with their claim link, and ONE
-- reminder seven days later if they still have not claimed it. Before this the
-- link only went out when the rollout owner pressed "Email".
--
-- ADDITIVE AND IDEMPOTENT. Needs 20261010120000_claim_flow.sql. Nothing is
-- rewritten or deleted, and re-running this file changes nothing.
--
-- What it adds, and why:
--
-- 1. person_claim_emails, the record that makes "once" true. One row per
--    person per kind ('invite', 'reminder'), and the unique index is the lock:
--    the daily run inserts the row BEFORE it sends, so a second run (or a
--    second cron call the same morning) loses the insert and sends nothing.
--    It is per PERSON, not per credit: somebody credited on three rollouts
--    gets one email, not three. invite_id is the claim link the email carried,
--    which is how the reminder knows whether the owner sent a newer link since.
--    No policies: the cron writes it as service role and the owner's credits
--    panel reads it through a service-role route.
--
-- 2. A new email category, 'claim'. These emails go to people who never signed
--    up, so they carry an unsubscribe link, and turning them off stops claim
--    mail only. email_log.category and email_suppressions.scope both list the
--    categories in a check constraint, so both gain it (the 'chat' precedent,
--    20261007120000_email_chat_category.sql).
--
-- Before this is applied the automatic run sends nothing: the reservation
-- insert fails and the run stops there. Apply it before switching the flag on.
--
-- ROLLBACK (manual):
--   drop table if exists public.person_claim_emails;
--   -- then put back the two constraints without 'claim' (after deleting any
--   -- email_log / email_suppressions rows that use it).
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 1. The once-only record ------------------------------------------------------

create table if not exists public.person_claim_emails (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person_profiles(id) on delete cascade,
  kind text not null
    constraint person_claim_emails_kind_check check (kind in ('invite', 'reminder')),
  -- The credit the email named. Kept if the credit goes, so "once" still holds.
  submission_id uuid references public.release_credit_submissions(id) on delete set null,
  release_id uuid references public.releases(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  -- The claim link the email carried.
  invite_id uuid references public.person_claim_invites(id) on delete set null,
  -- sending: reserved, the send is in flight (a row stuck here is never retried,
  --   which fails toward NOT emailing twice).
  -- sent: it went out. suppressed: the address unsubscribed or bounced.
  -- failed: the provider refused it for good.
  status text not null default 'sending'
    constraint person_claim_emails_status_check check (status in ('sending', 'sent', 'suppressed', 'failed')),
  error text
    constraint person_claim_emails_error_check check (error is null or char_length(error) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists person_claim_emails_once_key
  on public.person_claim_emails(person_id, kind);

-- The reminder step reads sent first emails by date.
create index if not exists person_claim_emails_due_idx
  on public.person_claim_emails(sent_at)
  where kind = 'invite' and status = 'sent';

alter table public.person_claim_emails enable row level security;
-- No policies. Service role only.

-- 2. The 'claim' email category -----------------------------------------------

alter table public.email_log
  drop constraint if exists email_log_category_check;
alter table public.email_log
  add constraint email_log_category_check check (
    category in ('transactional', 'onboarding', 'reminders', 'announcements', 'chat', 'claim', 'internal')
  );

alter table public.email_suppressions
  drop constraint if exists email_suppressions_scope_check;
alter table public.email_suppressions
  add constraint email_suppressions_scope_check check (
    scope in ('all', 'onboarding', 'reminders', 'announcements', 'chat', 'claim')
  );
