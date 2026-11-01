-- Bachs checkouts (2026-11-01, #946). Pay one month or one year through Bachs
-- in any way Bachs takes (Naira card or transfer, mobile money, dollar card,
-- crypto). One row per checkout we open: what it pays for and how much, so the
-- webhook can check the amount and apply the period exactly once (the
-- open -> paid update is the lock).

create table if not exists public.bachs_checkouts (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  checkout_id      text unique,
  user_id          uuid not null,
  workspace_id     uuid null,
  plan             text not null check (plan in ('solo', 'manager')),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  amount_kobo      integer not null check (amount_kobo > 0),
  status           text not null default 'open' check (status in ('open', 'paid', 'expired')),
  paid_currency    text null,
  paid_amount      text null,
  payment_method   text null,
  period_end       timestamptz null,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz null,
  updated_at       timestamptz not null default now()
);

create index if not exists bachs_checkouts_user_idx on public.bachs_checkouts (user_id, created_at desc);

alter table public.bachs_checkouts enable row level security;

drop policy if exists bachs_checkouts_owner_read on public.bachs_checkouts;
create policy bachs_checkouts_owner_read on public.bachs_checkouts
  for select to authenticated using (user_id = auth.uid());

grant select on public.bachs_checkouts to authenticated;
grant select, insert, update, delete on public.bachs_checkouts to service_role;

-- A charge paid through Bachs says so on the margin view.
alter table public.subscription_charges drop constraint if exists subscription_charges_payment_channel_check;
alter table public.subscription_charges add constraint subscription_charges_payment_channel_check
  check (payment_channel is null or payment_channel in ('card', 'transfer', 'direct_transfer', 'bachs', 'other'));
