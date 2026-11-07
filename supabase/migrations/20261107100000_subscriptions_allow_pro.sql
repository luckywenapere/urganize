-- Pricing v3 (founder, 2026-11-07, issue #1112): a new self-serve tier, Pro
-- (id 'pro', ₦40,000 a month). Every table that stores a plan id behind a CHECK
-- constraint has to accept it, or the first Pro checkout fails at the insert.
--
-- Additive only: every value each constraint allowed before is still allowed,
-- because a value a constraint stops permitting breaks the renewal of any row
-- that carries it. Rows are not touched.
--
--   subscriptions.plan              (renewals, the webhook)
--   subscriptions.pending_plan      (a downgrade parked for the next renewal)
--   payment_invoices.plan           (bank transfer checkout)
--   checkout_clearances.plan        (call-led payment links)
--   bachs_checkouts.plan            (Bachs checkout)
--   trm_partner_ledger.plan         (what we owe TRM; Pro includes distribution)
--
-- Down (only if no row carries 'pro'):
--   re-run the previous definitions from 20260901100000_subscriptions_allow_solo.sql,
--   20261022150000_self_serve_checkout.sql, 20261026150000_checkout_clearances.sql,
--   20261101090000_bachs_checkouts.sql and 20261022170000_trm_fee_and_price_lock.sql.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan = any (array[
    -- Tier ids. 'solo', 'manager' and 'pro' are self-serve; 'label' and
    -- 'enterprise' are sales-led and recorded by hand.
    'solo',
    'manager',
    'pro',
    'label',
    'enterprise',
    -- Live plan ids from before the tier model.
    'monthly',
    'annual',
    -- Legacy. Each is load-bearing for an existing row or an admin path.
    'yearly',
    'access',
    'custom',
    'founding'
  ]::text[]));

alter table public.subscriptions
  drop constraint if exists subscriptions_pending_plan_check;

alter table public.subscriptions
  add constraint subscriptions_pending_plan_check
  check (
    pending_plan is null
    or pending_plan = any (array[
      'solo'::text,
      'manager'::text,
      'pro'::text,
      'label'::text,
      'enterprise'::text,
      'monthly'::text,
      'annual'::text,
      'yearly'::text,
      'access'::text,
      'custom'::text,
      'founding'::text
    ])
  );

alter table public.payment_invoices
  drop constraint if exists payment_invoices_plan_check;

alter table public.payment_invoices
  add constraint payment_invoices_plan_check
  check (plan in ('solo', 'manager', 'pro', 'label'));

alter table public.checkout_clearances
  drop constraint if exists checkout_clearances_plan_check;

alter table public.checkout_clearances
  add constraint checkout_clearances_plan_check
  check (plan in ('solo', 'manager', 'pro', 'label'));

alter table public.bachs_checkouts
  drop constraint if exists bachs_checkouts_plan_check;

alter table public.bachs_checkouts
  add constraint bachs_checkouts_plan_check
  check (plan in ('solo', 'manager', 'pro'));

alter table public.trm_partner_ledger
  drop constraint if exists trm_partner_ledger_plan_check;

alter table public.trm_partner_ledger
  add constraint trm_partner_ledger_plan_check
  check (plan in ('manager', 'pro', 'label'));

-- Fail loudly if any constraint did not take. Checks the definition text for
-- 'pro' as a quoted value, so 'project' or similar can never satisfy it.
do $$
declare
  missing text;
begin
  select string_agg(name, ', ')
  into missing
  from unnest(array[
    'subscriptions_plan_check',
    'subscriptions_pending_plan_check',
    'payment_invoices_plan_check',
    'checkout_clearances_plan_check',
    'bachs_checkouts_plan_check',
    'trm_partner_ledger_plan_check'
  ]) as name
  where not exists (
    select 1
    from pg_constraint c
    where c.conname = name
      and pg_get_constraintdef(c.oid) like '%''pro''%'
  );

  if missing is not null then
    raise exception 'These constraints do not permit ''pro'': %', missing;
  end if;
end $$;
