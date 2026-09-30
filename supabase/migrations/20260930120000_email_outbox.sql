-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- email_outbox + email_broadcasts — email that goes out later
--
-- The next stage of the email work (2026-09-30). PR 2 left scheduled email out
-- because "which emails to send on a schedule is a product decision that has
-- not been made". It has now: a five-email onboarding sequence for new signups,
-- and emails the founder writes and sends from the admin dashboard.
--
-- email_outbox holds every email that is not sent the moment something
-- happens: the sequence's days 2, 3, 5 and 7, and each recipient of a dashboard
-- broadcast. One sender drains it (lib/email/outbox-server.ts), from the
-- morning cron and from the admin page's Send button.
--
-- THE ROW IS THE LOCK. A row moves queued -> sending with a conditional update
-- before anything is sent, so two senders running at once cannot both send it.
-- dedupe_key is UNIQUE and NOT NULL, which is what makes enrolling a person
-- twice, or queuing a broadcast twice, a no-op rather than a second email:
--   onboarding:<user_id>:<step>     one per person per step
--   broadcast:<broadcast_id>:<email> one per address per broadcast
--
-- DELETE RULES. recipient_user_id CASCADES: a deleted account must not keep
-- getting mail that is still queued. (email_log, by contrast, SETs NULL, because
-- it is the record of mail that already went out.) batch_id cascades from its
-- broadcast. created_by SETs NULL.
--
-- email_broadcasts is the header of a dashboard broadcast: what was written,
-- to whom it was aimed, and how many it reached when it was queued. The
-- progress (sent, waiting, failed) is counted from email_outbox, not stored, so
-- it can never disagree with the queue.
--
-- email_outbox_counts() groups the queue by broadcast, sequence step and status
-- in one round trip for the admin pages. SECURITY INVOKER, and execute is
-- revoked from everyone but service_role, so it reads nothing RLS would not.
--
-- RLS ENABLED WITH ZERO POLICIES on both tables: every read and write is the
-- service-role client (the sender, the cron, the admin routes). The rows carry
-- people's email addresses; do not add a select policy without a surface that
-- needs it.
--
-- NOTHING IS SENT BECAUSE THIS MIGRATION EXISTS. The sequence only queues rows
-- once EMAIL_ONBOARDING_SEQUENCE=on, and a broadcast only once someone presses
-- Send in /admin/emails/new.
--
-- ROLLBACK:
--   drop function if exists public.email_outbox_counts(uuid[], text);
--   drop table if exists public.email_outbox;
--   drop table if exists public.email_broadcasts;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.email_broadcasts (
  id uuid primary key default gen_random_uuid(),

  subject text not null,
  body text not null,
  include_greeting boolean not null default true,
  sign_off boolean not null default true,

  -- The audience as chosen (lib/email/audience.ts's Audience) and in words.
  audience jsonb not null,
  audience_label text not null,

  -- How many were queued, and how many were left out because they unsubscribed.
  total integer not null default 0 check (total >= 0),
  suppressed_count integer not null default 0 check (suppressed_count >= 0),

  created_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_broadcasts_created_at_idx
  on public.email_broadcasts(created_at desc);

alter table public.email_broadcasts enable row level security;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),

  recipient text not null,
  recipient_user_id uuid references auth.users(id) on delete cascade,

  template text not null,
  props jsonb not null default '{}'::jsonb,
  trigger text not null,

  -- The broadcast this row belongs to; null for the onboarding sequence.
  batch_id uuid references public.email_broadcasts(id) on delete cascade,

  dedupe_key text not null unique,
  send_after timestamptz not null default now(),

  -- queued: waiting. sending: claimed by a sender. sent: Resend took it.
  -- skipped: the address unsubscribed. failed: gave up. cancelled: stopped by
  -- the founder, or a sequence step that fell too far behind to make sense.
  status text not null default 'queued' check (
    status in ('queued', 'sending', 'sent', 'skipped', 'failed', 'cancelled')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The sender's question: what is due now, sequence first, oldest first.
create index if not exists email_outbox_due_idx
  on public.email_outbox(send_after)
  where status = 'queued';

create index if not exists email_outbox_batch_idx
  on public.email_outbox(batch_id)
  where batch_id is not null;

create index if not exists email_outbox_recipient_user_idx
  on public.email_outbox(recipient_user_id);

drop trigger if exists set_email_outbox_updated_at on public.email_outbox;
create trigger set_email_outbox_updated_at
before update on public.email_outbox
for each row execute function public.set_updated_at();

alter table public.email_outbox enable row level security;

-- Deliberately no policies on either table. See the header.

create or replace function public.email_outbox_counts(
  p_batch_ids uuid[] default null,
  p_template text default null
)
returns table (batch_id uuid, step text, status text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select o.batch_id, o.props->>'step' as step, o.status, count(*)::bigint as total
  from public.email_outbox o
  where (p_batch_ids is null or o.batch_id = any(p_batch_ids))
    and (p_template is null or o.template = p_template)
  group by o.batch_id, o.props->>'step', o.status;
$$;

revoke execute on function public.email_outbox_counts(uuid[], text) from public, anon, authenticated;
grant execute on function public.email_outbox_counts(uuid[], text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'email_outbox'
  ) then
    raise exception 'email_outbox was not created';
  end if;
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'email_broadcasts'
  ) then
    raise exception 'email_broadcasts was not created';
  end if;
end $$;
