-- The TRM fee, locked prices and the margin view (2026-10-22). Built on top of
-- 20261022150000_self_serve_checkout.sql: the 6-month period is 'semiannual',
-- and the interval checks that migration set are left exactly as they are.
--
-- ADDITIVE ONLY. Every statement adds a column, a check on a NEW column, or a
-- table, or fills a NEW column where it is empty. Nothing is dropped, renamed or
-- narrowed, and no existing value changes. Safe to re-run.
--
-- The code that writes these columns tolerates them being missing (Postgres
-- 42703 / PGRST204 retry without them), so this can be applied before or after
-- the deploy.
--
-- BACK UP FIRST (run by hand, before this file):
--   create table public.subscriptions_backup_20261022b as select * from public.subscriptions;
--   create table public.subscription_charges_backup_20261022b as select * from public.subscription_charges;
--   and save the body of public.prevent_workspace_billing_self_update()
--   (select pg_get_functiondef('public.prevent_workspace_billing_self_update()'::regprocedure)).
--
-- ROLLBACK, per section (each is independent):
--   1. alter table public.subscriptions drop column if exists price_locked_kobo,
--        drop column if exists plan_version;
--   2. alter table public.subscription_charges drop column if exists payment_channel,
--        drop column if exists billing_interval, drop column if exists plan_version;
--   3. Export public.trm_partner_ledger to CSV first (it is what we owe TRM), then
--        drop table public.trm_partner_ledger;
--   4. Re-run the saved function body, then
--      alter table public.workspaces drop column if exists trm_registered_at,
--        drop column if exists trm_plan;
--   Drop the two backup tables after 30 days.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. subscriptions: the price a subscriber locked in
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions
  add column if not exists price_locked_kobo bigint null,
  add column if not exists plan_version      text   null;

alter table public.subscriptions drop constraint if exists subscriptions_price_locked_kobo_check;
alter table public.subscriptions add constraint subscriptions_price_locked_kobo_check
  check (price_locked_kobo is null or price_locked_kobo >= 0);

-- Existing rows keep what they pay. Only fills the NEW columns where empty.
update public.subscriptions
   set price_locked_kobo = amount,
       plan_version      = 'legacy'
 where price_locked_kobo is null
   and amount is not null;

comment on column public.subscriptions.price_locked_kobo is
  'What one period of this subscription costs, locked at checkout. Card renewals never change it; a new checkout or a paid transfer period sets it to the price paid.';
comment on column public.subscriptions.plan_version is
  'Which price list the subscription was bought on (PRICE_LIST_VERSION in @urganize/pricing, or legacy).';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. subscription_charges: how and for what period each payment was paid
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscription_charges
  add column if not exists payment_channel  text null,
  add column if not exists billing_interval text null,
  add column if not exists plan_version     text null;

alter table public.subscription_charges drop constraint if exists subscription_charges_payment_channel_check;
alter table public.subscription_charges add constraint subscription_charges_payment_channel_check
  check (payment_channel is null or payment_channel in ('card', 'transfer', 'direct_transfer', 'other'));

alter table public.subscription_charges drop constraint if exists subscription_charges_billing_interval_check;
alter table public.subscription_charges add constraint subscription_charges_billing_interval_check
  check (billing_interval is null or billing_interval in ('monthly', 'semiannual', 'annual'));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. trm_partner_ledger: what we owe TRM for "Distribution included"
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.trm_partner_ledger (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        null references public.workspaces (id) on delete set null,
  -- The Paystack reference (or admin_ reference) of the payment it came from.
  charge_reference  text        not null,
  entry_kind        text        not null default 'period',
  plan              text        not null,
  trm_plan          text        not null,
  cost_basis        text        not null,
  billing_mode      text        not null,
  fee_annual_kobo   bigint      null,
  revenue_share_bps integer     null,
  service_months    integer     not null,
  amount_paid_kobo  bigint      not null,
  owed_kobo         bigint      not null,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  exported_at       timestamptz null,
  created_at        timestamptz not null default now(),
  constraint trm_partner_ledger_entry_kind_check check (entry_kind in ('period', 'upfront', 'adjustment')),
  constraint trm_partner_ledger_plan_check check (plan in ('manager', 'label')),
  constraint trm_partner_ledger_trm_plan_check check (trm_plan in ('single_artist', 'label')),
  constraint trm_partner_ledger_cost_basis_check check (cost_basis in ('fixed', 'percent')),
  constraint trm_partner_ledger_billing_mode_check check (billing_mode in ('monthly_prorata', 'annual_upfront')),
  constraint trm_partner_ledger_service_months_check check (service_months between 0 and 12),
  constraint trm_partner_ledger_amount_check check (amount_paid_kobo >= 0),
  constraint trm_partner_ledger_owed_check check (owed_kobo >= 0)
);

-- A redelivered webhook writes nothing twice.
create unique index if not exists trm_partner_ledger_reference_kind_idx
  on public.trm_partner_ledger (charge_reference, entry_kind);
create index if not exists trm_partner_ledger_period_idx
  on public.trm_partner_ledger (period_start desc);
create index if not exists trm_partner_ledger_workspace_idx
  on public.trm_partner_ledger (workspace_id, period_start desc);

alter table public.trm_partner_ledger enable row level security;
-- No policies: only the service role reads or writes.

comment on table public.trm_partner_ledger is
  'What Urganize owes TRM Distro for teams whose plan includes distribution. One row per paid period (monthly_prorata or percent) or per year of registration (annual_upfront). Written by lib/trm/partner-ledger-server.ts only.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. workspaces: when the team was registered on TRM
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.workspaces
  add column if not exists trm_registered_at timestamptz null,
  add column if not exists trm_plan          text        null;

alter table public.workspaces drop constraint if exists workspaces_trm_plan_check;
alter table public.workspaces add constraint workspaces_trm_plan_check
  check (trm_plan is null or trm_plan in ('single_artist', 'label'));

comment on column public.workspaces.trm_registered_at is
  'When the team was first registered on TRM under "Distribution included". Set only after a payment goes through. Service-role write only.';

-- The LIVE body as of 2026-10-22 (read from production after
-- 20261022150000_self_serve_checkout.sql, which added acquisition_path,
-- payment_method and founder_minutes), plus the two TRM columns, so an owner
-- cannot set them from the browser. Nothing it already protects is dropped.
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
         or coalesce(new.founder_minutes, 0) <> 0
         or new.trm_registered_at is not null
         or new.trm_plan is not null then
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
         or new.founder_minutes             is distinct from old.founder_minutes
         or new.trm_registered_at           is distinct from old.trm_registered_at
         or new.trm_plan                    is distinct from old.trm_plan then
        raise exception 'workspaces: billing fields can only be modified by the service role'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
