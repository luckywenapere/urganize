-- Pricing v4 (founder, 2026-11-08, issue #1112): a new self-serve tier, Solo
-- Plus (id 'solo_plus', ₦12,000 a month). Every table that stores a plan id
-- behind a CHECK constraint has to accept it, or the first Solo Plus checkout
-- fails at the insert. Solo Plus includes distribution for its one artist, so
-- what we owe TRM for it lands in trm_partner_ledger too.
--
-- 'free' is NOT added anywhere: nothing writes it. A team that has not paid is
-- placed on Free by apps/web/lib/team-billing.ts at read time, never by a row.
--
-- Additive only: every value each constraint allowed before is still allowed
-- (read from the live database on 2026-11-08 before writing this), because a
-- value a constraint stops permitting breaks the renewal of any row that
-- carries it. Rows are not touched.
--
--   subscriptions.plan              (renewals, the webhook)
--   subscriptions.pending_plan      (a downgrade parked for the next renewal)
--   payment_invoices.plan           (bank transfer checkout)
--   checkout_clearances.plan        (call-led payment links)
--   bachs_checkouts.plan            (Bachs checkout)
--   trm_partner_ledger.plan         (what we owe TRM)
--
-- Down (only if no row carries 'solo_plus'): re-run the definitions from
-- 20261107100000_subscriptions_allow_pro.sql, and for trm_partner_ledger the one
-- in 20261107200000_team_addons_and_credit_overage.sql.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan = any (array[
    -- Tier ids. 'solo', 'solo_plus', 'manager' and 'pro' are self-serve;
    -- 'label' and 'enterprise' are sales-led and recorded by hand.
    'solo',
    'solo_plus',
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
      'solo_plus'::text,
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
  check (plan in ('solo', 'solo_plus', 'manager', 'pro', 'label'));

alter table public.checkout_clearances
  drop constraint if exists checkout_clearances_plan_check;

alter table public.checkout_clearances
  add constraint checkout_clearances_plan_check
  check (plan in ('solo', 'solo_plus', 'manager', 'pro', 'label'));

alter table public.bachs_checkouts
  drop constraint if exists bachs_checkouts_plan_check;

alter table public.bachs_checkouts
  add constraint bachs_checkouts_plan_check
  check (plan in ('solo', 'solo_plus', 'manager', 'pro'));

alter table public.trm_partner_ledger
  drop constraint if exists trm_partner_ledger_plan_check;

alter table public.trm_partner_ledger
  add constraint trm_partner_ledger_plan_check
  check (plan in ('solo', 'solo_plus', 'manager', 'pro', 'label'));

-- Fail loudly if any constraint did not take.
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
      and pg_get_constraintdef(c.oid) like '%''solo_plus''%'
  );

  if missing is not null then
    raise exception 'These constraints do not permit ''solo_plus'': %', missing;
  end if;
end $$;
