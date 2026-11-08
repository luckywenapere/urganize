-- Dollar prices outside Nigeria (2026-11-07, #1120).
--
-- A Bachs checkout can now be priced in US dollars. `currency` is what we
-- asked Bachs to charge and `amount_minor` is that amount in its own minor
-- unit (kobo for NGN, cents for USD), which is what the paid check compares.
-- `amount_kobo` stays the naira amount for our own books: for a dollar
-- checkout it holds the naira equivalent at NAIRA_PER_DOLLAR, so margins,
-- revenue and subscriptions keep one unit.
--
-- Additive only. Every existing row is a naira checkout, so it reads
-- currency 'NGN' and amount_minor = amount_kobo.

alter table public.bachs_checkouts
  add column if not exists currency text not null default 'NGN';

alter table public.bachs_checkouts
  add column if not exists amount_minor integer null;

update public.bachs_checkouts
  set amount_minor = amount_kobo
  where amount_minor is null;

alter table public.bachs_checkouts
  drop constraint if exists bachs_checkouts_currency_check;

alter table public.bachs_checkouts
  add constraint bachs_checkouts_currency_check
  check (currency in ('NGN', 'USD'));

alter table public.bachs_checkouts
  drop constraint if exists bachs_checkouts_amount_minor_check;

alter table public.bachs_checkouts
  add constraint bachs_checkouts_amount_minor_check
  check (amount_minor is null or amount_minor > 0);

-- AI credit top-ups through Bachs (#1120). A row now buys either a plan
-- period (purpose 'plan', as before) or one credit pack (purpose 'credits').
-- A credits row has no plan and no interval, so those two go nullable, and a
-- check keeps every plan row exactly as strict as it was.

alter table public.bachs_checkouts
  add column if not exists purpose text not null default 'plan';

alter table public.bachs_checkouts
  add column if not exists credits integer null;

alter table public.bachs_checkouts
  add column if not exists pack_price_naira integer null;

alter table public.bachs_checkouts
  add column if not exists owner_user_id uuid null;

alter table public.bachs_checkouts
  alter column plan drop not null;

alter table public.bachs_checkouts
  alter column billing_interval drop not null;

alter table public.bachs_checkouts
  drop constraint if exists bachs_checkouts_purpose_check;

alter table public.bachs_checkouts
  add constraint bachs_checkouts_purpose_check
  check (
    (purpose = 'plan' and plan is not null and billing_interval is not null)
    or (purpose = 'credits' and credits is not null and credits > 0 and pack_price_naira is not null and workspace_id is not null)
  );
