-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Recurring billing: monthly + annual Paystack subscriptions
--
-- Replaces the flat one-time ₦15,000 "access" SKU with two real recurring
-- plans (monthly + annual, NGN + USD). The old `'access'` plan string is
-- retained in the CHECK constraint so currently-paid users (3 accounts on
-- production, all backfilled with plan='access') keep their access through
-- the natural lapse of their expires_at; no rows are rewritten by this
-- migration and no customer is re-billed.
--
-- Three things change here:
--   1. subscriptions.plan CHECK: keep monthly, yearly, access. Add annual
--      (new recurring tier) and custom (admin-provisioned contact-sales
--      tier, no Paystack involvement).
--   2. subscriptions.status CHECK: add trialing and past_due so the new
--      lifecycle states have a place to live without re-writing the gate.
--   3. subscriptions.paystack_subscription_code: new column. The webhook
--      uses it to match RENEWAL charge.success events (whose `reference`
--      is fresh per invoice and does not exist in our payments table) back
--      to the right user_id without falling back to email matching.
--
-- Reversal: the down-migration would restore the prior CHECK constraints
-- and drop the column. Safe because we don't backfill the new column with
-- non-NULL values for existing rows.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 1. Extend the plan CHECK so the webhook + start-checkout can write
--    'monthly' and 'annual' for the new recurring tiers, and 'custom' for
--    the contact-sales tier. 'yearly' kept for any pre-recurring rows that
--    may have been written by the dormant card-tokenization flow (none
--    expected in prod). 'access' kept so the 3 grandfathered customers
--    continue to satisfy the constraint until their year-long access
--    naturally lapses.
alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan = any (array[
    'monthly'::text,
    'annual'::text,
    'yearly'::text,
    'access'::text,
    'custom'::text
  ]));

-- 2. Extend the status CHECK so the webhook can express the renewal
--    lifecycle: trialing (free-trial-via-subscription, if Paystack-side
--    trials are ever used — today's 28-day no-card trial is profile-only
--    and doesn't touch this column) and past_due (renewal failed; Paystack
--    is retrying). The snapshot resolver in lib/subscription-access.ts
--    already treats past_due the same as active until expires_at lapses,
--    which is the desired grace behavior.
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status = any (array[
    'active'::text,
    'trialing'::text,
    'past_due'::text,
    'cancelled'::text,
    'inactive'::text,
    'expired'::text
  ]));

-- 3. Add the subscription_code column. Nullable because:
--    (a) grandfathered 'access' rows never had a Paystack subscription
--    (b) the column is populated on first charge.success after a new
--        recurring checkout — there's a brief window between the start-
--        checkout DB write and the webhook arriving where the row exists
--        with NULL.
alter table public.subscriptions
  add column if not exists paystack_subscription_code text null;

comment on column public.subscriptions.paystack_subscription_code is
  'Paystack subscription code (SUB_xxx). Populated on the first successful charge for a recurring plan. Used to match RENEWAL charge.success events back to the user; the renewal reference is fresh per invoice and does not exist in our payments table.';

-- Index for the renewal-matching path. Partial because most rows (legacy
-- 'access' SKU) will be NULL; we only need the index for recurring rows.
create index if not exists subscriptions_paystack_subscription_code_idx
  on public.subscriptions(paystack_subscription_code)
  where paystack_subscription_code is not null;
