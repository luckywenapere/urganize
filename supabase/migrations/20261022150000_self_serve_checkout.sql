-- Self-serve checkout (2026-10-22). Anyone can sign up, pay for Solo or
-- Manager by card or bank transfer, and start their first rollout with no
-- founder call. Paying skips the waitlist; free and trial sign-ups stay on it.
--
-- Everything here is additive and safe to apply before or after the code:
--   1. subscriptions: 'semiannual' joins the two interval CHECKs (6 months for
--      the price of 5). Founder said yes on 2026-10-22.
--   2. workspaces: acquisition_path, payment_method, founder_minutes and
--      setup_checklist_dismissed_at, with a backfill and an insert trigger.
--   3. team_payment_accounts: one Paystack dedicated account number per payer,
--      reused for every renewal.
--   4. payment_invoices: what a transfer payer owes for one period.
--   5. payment_transfers: every transfer that arrived, from Paystack or
--      recorded by an admin. The Paystack reference is unique, so a webhook
--      delivered twice records once.
--   6. lifecycle_sends: one row per renewal reminder and onboarding nudge, so
--      each goes out once.
--
-- Every new table: row level security on, no policies (service role only),
-- and explicit grants (Supabase stops granting new tables by default on
-- 2026-10-30).

-- 1. ------------------------------------------------------------------------
alter table public.subscriptions
  drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions
  add constraint subscriptions_billing_interval_check
  check (
    billing_interval is null
    or billing_interval = any (array['monthly'::text, 'semiannual'::text, 'annual'::text])
  );

alter table public.subscriptions
  drop constraint if exists subscriptions_pending_billing_interval_check;
alter table public.subscriptions
  add constraint subscriptions_pending_billing_interval_check
  check (
    pending_billing_interval is null
    or pending_billing_interval = any (array['monthly'::text, 'semiannual'::text, 'annual'::text])
  );

-- 2. ------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists acquisition_path text,
  add column if not exists payment_method text,
  add column if not exists founder_minutes integer not null default 0,
  add column if not exists setup_checklist_dismissed_at timestamptz;

alter table public.workspaces drop constraint if exists workspaces_acquisition_path_check;
alter table public.workspaces add constraint workspaces_acquisition_path_check
  check (acquisition_path is null or acquisition_path in ('self_serve', 'concierge', 'legacy'));

alter table public.workspaces drop constraint if exists workspaces_payment_method_check;
alter table public.workspaces add constraint workspaces_payment_method_check
  check (payment_method is null or payment_method in ('card', 'transfer', 'direct_transfer'));

alter table public.workspaces drop constraint if exists workspaces_founder_minutes_check;
alter table public.workspaces add constraint workspaces_founder_minutes_check
  check (founder_minutes >= 0 and founder_minutes <= 100000);

-- How an account got in decides the path: paying is self-serve, being let in
-- by the founder is concierge, everyone before closed sign-up is legacy.
create or replace function public.acquisition_path_for_source(source text)
returns text
language sql
immutable
as $$
  select case
    when source = 'paid_self_serve' then 'self_serve'
    when source in ('admin', 'invite_link', 'invite_email', 'founder_seed') then 'concierge'
    else 'legacy'
  end
$$;

update public.workspaces w
   set acquisition_path = public.acquisition_path_for_source(p.access_source)
  from public.profiles p
 where p.id = w.owner_id
   and w.acquisition_path is null;

update public.workspaces set acquisition_path = 'legacy' where acquisition_path is null;

create or replace function public.set_workspace_acquisition_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.acquisition_path is null then
    select public.acquisition_path_for_source(p.access_source)
      into new.acquisition_path
      from public.profiles p
     where p.id = new.owner_id;
    if new.acquisition_path is null then
      new.acquisition_path := 'legacy';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_set_acquisition_path on public.workspaces;
create trigger workspaces_set_acquisition_path
  before insert on public.workspaces
  for each row execute function public.set_workspace_acquisition_path();

-- An owner must not change how they are counted or billed from the browser.
-- The insert check is unchanged (the trigger above fills acquisition_path on
-- insert); the update check gains the three new billing columns.
create or replace function public.prevent_workspace_billing_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    ''
  );
begin
  if caller_role = 'authenticated' or caller_role = 'anon' then
    if tg_op = 'INSERT' then
      if new.trial_started_at is not null
         or new.trial_ends_at is not null
         or new.comped_at is not null
         or new.comped_by is not null
         or new.billing_plan is not null
         or new.billing_locked_amount is not null
         or new.billing_notes is not null
         or new.legacy_rate_expires_at is not null
         or new.share_reward_claimed_at is not null
         or new.share_reward_kind is not null
         or coalesce(new.paid_bonus_days, 0) <> 0
         or new.cancel_discount_claimed_at is not null
         or new.cancel_invite_extension_at is not null
         or new.trial_cancelled_at is not null
         or new.payment_method is not null
         or coalesce(new.founder_minutes, 0) <> 0 then
        raise exception 'workspaces: billing fields can only be set by the service role'
          using errcode = '42501';
      end if;
    else
      if new.trial_started_at            is distinct from old.trial_started_at
         or new.trial_ends_at               is distinct from old.trial_ends_at
         or new.comped_at                   is distinct from old.comped_at
         or new.comped_by                   is distinct from old.comped_by
         or new.billing_plan                is distinct from old.billing_plan
         or new.billing_locked_amount       is distinct from old.billing_locked_amount
         or new.billing_notes               is distinct from old.billing_notes
         or new.legacy_rate_expires_at      is distinct from old.legacy_rate_expires_at
         or new.share_reward_claimed_at     is distinct from old.share_reward_claimed_at
         or new.share_reward_kind           is distinct from old.share_reward_kind
         or new.paid_bonus_days             is distinct from old.paid_bonus_days
         or new.cancel_discount_claimed_at  is distinct from old.cancel_discount_claimed_at
         or new.cancel_invite_extension_at  is distinct from old.cancel_invite_extension_at
         or new.trial_cancelled_at          is distinct from old.trial_cancelled_at
         or new.acquisition_path            is distinct from old.acquisition_path
         or new.payment_method              is distinct from old.payment_method
         or new.founder_minutes             is distinct from old.founder_minutes then
        raise exception 'workspaces: billing fields can only be modified by the service role'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on column public.workspaces.acquisition_path is
  'How the team arrived: self_serve (paid at checkout), concierge (let in by the founder) or legacy (before closed sign-up). Set on insert from the owner''s profiles.access_source.';
comment on column public.workspaces.payment_method is
  'card (Paystack, renews by itself), transfer (Paystack dedicated account) or direct_transfer (recorded by an admin). NULL until the team pays.';
comment on column public.workspaces.founder_minutes is
  'Minutes the founder spent setting this team up, typed in on the admin cohort card.';

-- 3. ------------------------------------------------------------------------
create table if not exists public.team_payment_accounts (
  user_id                uuid        primary key references auth.users (id) on delete cascade,
  workspace_id           uuid        null references public.workspaces (id) on delete set null,
  provider               text        not null default 'paystack_dva',
  paystack_customer_code text        not null,
  paystack_account_id    bigint      null,
  account_number         text        not null,
  account_name           text        not null,
  bank_name              text        not null,
  bank_slug              text        null,
  active                 boolean     not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists team_payment_accounts_customer_idx
  on public.team_payment_accounts (paystack_customer_code);

alter table public.team_payment_accounts enable row level security;
revoke all on public.team_payment_accounts from anon, authenticated;
grant all on public.team_payment_accounts to service_role;

-- 4. ------------------------------------------------------------------------
create table if not exists public.payment_invoices (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users (id) on delete cascade,
  workspace_id         uuid        null references public.workspaces (id) on delete set null,
  plan                 text        not null,
  billing_interval     text        not null,
  method               text        not null,
  amount_kobo          bigint      not null,
  credit_applied_kobo  bigint      not null default 0,
  paid_kobo            bigint      not null default 0,
  status               text        not null default 'open',
  promo_code           text        null,
  paystack_reference   text        null,
  period_end           timestamptz null,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz null,
  updated_at           timestamptz not null default now(),
  constraint payment_invoices_plan_check check (plan in ('solo', 'manager', 'label')),
  constraint payment_invoices_interval_check check (billing_interval in ('monthly', 'semiannual', 'annual')),
  constraint payment_invoices_method_check check (method in ('transfer', 'direct_transfer')),
  constraint payment_invoices_status_check check (status in ('open', 'paid', 'cancelled')),
  constraint payment_invoices_amount_check check (amount_kobo > 0 and credit_applied_kobo >= 0 and paid_kobo >= 0)
);

create index if not exists payment_invoices_user_idx on public.payment_invoices (user_id, created_at desc);
create unique index if not exists payment_invoices_one_open_idx
  on public.payment_invoices (user_id) where status = 'open';
create unique index if not exists payment_invoices_reference_idx
  on public.payment_invoices (paystack_reference) where paystack_reference is not null;

alter table public.payment_invoices enable row level security;
revoke all on public.payment_invoices from anon, authenticated;
grant all on public.payment_invoices to service_role;

-- 5. ------------------------------------------------------------------------
create table if not exists public.payment_transfers (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  workspace_id       uuid        null references public.workspaces (id) on delete set null,
  invoice_id         uuid        null references public.payment_invoices (id) on delete set null,
  source             text        not null,
  amount_kobo        bigint      not null,
  paystack_reference text        null,
  bank_reference     text        null,
  received_at        timestamptz not null default now(),
  recorded_by        uuid        null references auth.users (id) on delete set null,
  note               text        null,
  created_at         timestamptz not null default now(),
  constraint payment_transfers_source_check check (source in ('paystack_dva', 'paystack_bank_transfer', 'admin_record')),
  constraint payment_transfers_amount_check check (amount_kobo > 0),
  constraint payment_transfers_note_check check (note is null or char_length(note) <= 500),
  constraint payment_transfers_bank_reference_check check (bank_reference is null or char_length(bank_reference) <= 120)
);

create unique index if not exists payment_transfers_reference_idx
  on public.payment_transfers (paystack_reference) where paystack_reference is not null;
create index if not exists payment_transfers_user_idx on public.payment_transfers (user_id, received_at desc);

alter table public.payment_transfers enable row level security;
revoke all on public.payment_transfers from anon, authenticated;
grant all on public.payment_transfers to service_role;

-- 6. ------------------------------------------------------------------------
create table if not exists public.lifecycle_sends (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  kind         text        not null,
  key          text        not null,
  sent_at      timestamptz not null default now(),
  clicked_at   timestamptz null,
  constraint lifecycle_sends_kind_check check (kind in ('renewal_reminder', 'nudge')),
  constraint lifecycle_sends_unique unique (workspace_id, kind, key)
);

alter table public.lifecycle_sends enable row level security;
revoke all on public.lifecycle_sends from anon, authenticated;
grant all on public.lifecycle_sends to service_role;
