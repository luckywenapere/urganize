-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- email_log — one row per email Urganize sends
--
-- The 2026-09 email module (lib/email) writes a row on every send: a `pending`
-- row before the Resend POST, flipped to `sent`/`failed` after, or a terminal
-- `skipped` row when email is not configured / a `failed` render. It is the
-- operational record behind the send — what went out, to whom, from which
-- template, and whether it landed.
--
-- NOTHING DEPENDS ON THIS TABLE EXISTING FOR MAIL TO GO OUT. lib/email/log-server.ts
-- never throws and returns null on a failed insert, and lib/email/index.ts sends
-- regardless — "a missing log row is better than a blocked courtesy email". So
-- before this migration is applied, sends still work; only the log (and the
-- surfaces that read it) are inert. The console just carries a `[email-log]` line
-- per send until the table lands.
--
-- The columns mirror lib/email/log-server.ts's EmailLogInsert / EmailLogStatus
-- exactly; `category` and `status` are CHECK-constrained to the closed sets those
-- types already define (registry.ts's EmailCategory, log-server.ts's
-- EmailLogStatus, which already includes the webhook outcomes PR 2 will write:
-- delivered/delayed/bounced/complained/unsubscribed). `trigger` is free text so a
-- new sender needs no migration — the billing_events.type precedent.
--
-- dedupe_key IS NULLABLE WITH A PARTIAL UNIQUE INDEX, not a NOT NULL upsert key.
-- Transactional sends fire on discrete events and carry no key (many null rows,
-- all allowed); the PR-2 scheduled jobs pass a key and the partial unique index
-- is what makes a given key send at most once. batch_id groups a dashboard
-- broadcast's rows (PR 3). Both are opaque text, set by us.
--
-- DELETE RULES: recipient_user_id and actor_user_id both SET NULL. This is an
-- operational log, not a user's own data — cascading would gut the history of
-- every email ever sent to or by a departing account. The recipient's address
-- stays in `recipient` regardless (the row is the record of a real send that
-- happened), the same denormalised posture billing_events and issue_reports.context
-- already take. Scrubbing a deleted account's addresses out of the log is a later
-- concern, not a v1 one.
--
-- RLS ENABLED WITH ZERO POLICIES, which is the point rather than an omission.
-- Every write is the service-role client inside sendEmail, and there is no
-- user-facing read — the PR-3 admin dashboard reads through a service-role admin
-- route. The issue_reports / pricing_validation_responses / mcp_oauth_* posture.
-- The row carries a recipient's email address; do not add a select policy without
-- a surface that needs it, or that address leaks cross-tenant.
--
-- ROLLBACK: drop table if exists public.email_log;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),

  recipient text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  from_address text not null,
  reply_to text,
  subject text not null,

  template text not null,
  category text not null check (
    category in ('transactional', 'onboarding', 'reminders', 'announcements', 'internal')
  ),

  -- pending: written, Resend not yet called. sent: accepted by Resend. skipped:
  -- email not configured. failed: render or send refused. The rest
  -- (delivered/delayed/bounced/complained/unsubscribed) are written by the PR-2
  -- Resend webhook.
  status text not null default 'pending' check (
    status in (
      'pending', 'sent', 'delivered', 'delayed', 'bounced',
      'complained', 'failed', 'skipped', 'unsubscribed'
    )
  ),

  trigger text not null,
  actor_user_id uuid references auth.users(id) on delete set null,

  dedupe_key text,
  batch_id text,
  resend_id text,
  error text,
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency for the PR-2 scheduled jobs: a given dedupe_key sends at most once.
-- Partial, so the many transactional rows with a null key are unconstrained.
create unique index if not exists email_log_dedupe_key_unique_idx
  on public.email_log(dedupe_key)
  where dedupe_key is not null;

-- The admin feed is "everything, newest first".
create index if not exists email_log_created_at_idx
  on public.email_log(created_at desc);

-- "What has this person been sent", newest first.
create index if not exists email_log_recipient_user_created_at_idx
  on public.email_log(recipient_user_id, created_at desc);

drop trigger if exists set_email_log_updated_at on public.email_log;
create trigger set_email_log_updated_at
before update on public.email_log
for each row execute function public.set_updated_at();

alter table public.email_log enable row level security;

-- Deliberately no policies. See the header.

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'email_log'
  ) then
    raise exception 'email_log was not created';
  end if;
end $$;
