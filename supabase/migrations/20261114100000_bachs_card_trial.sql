-- Card trial for customers abroad (2026-11-14, #1266).
--
-- A customer paying in US dollars adds a card through Bachs to start their
-- free days; Bachs charges it when the trial ends and renews it after that.
-- Bachs makes a subscription only by checking out a recurring PRODUCT, so:
--
--   bachs_products                one Bachs product per plan, period, price and
--                                 trial length, made the first time it is needed.
--   bachs_subscriptions           one row per card trial we opened: first the
--                                 checkout (status 'pending'), then the Bachs
--                                 subscription it became.
--   bachs_subscription_invoices   one row per Bachs invoice we applied. The
--                                 primary key is the lock that makes a paid
--                                 period apply once, however many webhooks come.
--
-- All three are written by service-role routes only: RLS on, no policies.
-- Additive. Safe to run twice.

create table if not exists public.bachs_products (
  id               uuid primary key default gen_random_uuid(),
  plan             text not null,
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  amount_minor     integer not null check (amount_minor > 0),
  trial_days       integer not null check (trial_days >= 0),
  product_id       text not null unique,
  created_at       timestamptz not null default now(),
  unique (plan, billing_interval, amount_minor, trial_days)
);

create table if not exists public.bachs_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique,
  checkout_id          text unique,
  subscription_id      text unique,
  customer_id          text null,
  user_id              uuid not null references auth.users(id) on delete cascade,
  workspace_id         uuid null references public.workspaces(id) on delete set null,
  plan                 text not null,
  billing_interval     text not null check (billing_interval in ('monthly', 'annual')),
  amount_minor         integer not null check (amount_minor > 0),
  status               text not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled')),
  trial_end            timestamptz null,
  current_period_end   timestamptz null,
  cancel_at_period_end boolean not null default false,
  canceled_at          timestamptz null,
  reminder_sent_at     timestamptz null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists bachs_subscriptions_user_idx
  on public.bachs_subscriptions (user_id, created_at desc);
create index if not exists bachs_subscriptions_trial_end_idx
  on public.bachs_subscriptions (trial_end) where status = 'trialing';

create table if not exists public.bachs_subscription_invoices (
  invoice_id      text primary key,
  subscription_id text not null,
  user_id         uuid not null,
  amount_minor    integer not null,
  period_end      timestamptz null,
  created_at      timestamptz not null default now()
);

alter table public.bachs_products enable row level security;
alter table public.bachs_subscriptions enable row level security;
alter table public.bachs_subscription_invoices enable row level security;

grant select, insert, update, delete on public.bachs_products to service_role;
grant select, insert, update, delete on public.bachs_subscriptions to service_role;
grant select, insert, update, delete on public.bachs_subscription_invoices to service_role;
