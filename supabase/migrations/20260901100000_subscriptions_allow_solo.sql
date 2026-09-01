-- Solo becomes a plan a subscription row may actually hold.
--
-- WHY THIS EXISTS. Solo shipped on 2026-08-30 as a pricing-page tier with four
-- ceilings (1 artist, 2 seats, 1 active release, 40 UrgAns actions a month) and
-- an entitlement entry in apps/web/lib/entitlements.ts — but it was deliberately
-- unsellable, "the same staging Manager itself shipped in". Part of that staging
-- was leaving 'solo' out of the two CHECK constraints below, so nothing could
-- write it and `resolveTeamTier` could never return it. Every Solo ceiling was
-- therefore unreachable dead code: advertised at ₦8,000, enforced on nobody.
--
-- This is the migration half of un-staging it (founder decision, 2026-09-01).
--
-- ADDITIVE AND NON-DESTRUCTIVE. Every value both constraints previously allowed
-- is retained verbatim; 'solo' is added. No row changes, no backfill, and no
-- existing subscription is re-graded — a stored plan resolves exactly as it did
-- before this ran. Rolling it back means re-running the previous definitions
-- (kept in 20260823100000 and 20260824110000), which is safe only while no row
-- holds 'solo'.
--
-- ⚠️ THE OPERATIONAL HALF IS NOT IN THIS FILE AND IS NOT OPTIONAL. Applying
-- this migration and shipping the code change makes Solo *reachable*; it does
-- not make it *correct*. Two Paystack Plan objects must be minted at ₦8,000/mo
-- and ₦80,000/yr and their codes set as PAYSTACK_PLAN_SOLO_MONTHLY_NGN /
-- PAYSTACK_PLAN_SOLO_ANNUAL_NGN. Until they are, a Solo checkout returns a 500
-- reading "Paystack plan code not configured" — which is the CORRECT failure and
-- the reason the code half is safe to land first: it refuses rather than charging
-- a Plan that bills the wrong amount. That advertise-versus-charge gap has
-- shipped four times in this repo's history (2026-07-14, -07-15, -08-16,
-- -08-21); minting before flipping is the standing order of operations.
--
-- ADD CONSTRAINT has no IF NOT EXISTS, so both are drop-then-add — the
-- 20260605 / 20260821 / 20260823 / 20260824 precedent in this directory.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. subscriptions.plan may be 'solo'
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan = any (array[
    -- Tier ids (pricing v2). 'solo' and 'manager' are self-serve; 'label' and
    -- 'enterprise' are sales-led and invoiced by hand, so they are storable but
    -- never reached by self-serve checkout.
    'solo',
    'manager',
    'label',
    'enterprise',
    -- Live plan ids, still what production writes today.
    'monthly',
    'annual',
    -- Legacy. Every one of these is load-bearing for an existing row or an
    -- admin path; dropping any silently breaks that subscription's renewal.
    'yearly',
    'access',
    'custom',
    'founding'
  ]::text[]));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. subscriptions.pending_plan may be 'solo'
--
-- Needed for the DOWNGRADE direction specifically. A Manager customer moving to
-- Solo is charged nothing and waits out the period already paid for, which
-- `plan-change.ts` implements by parking the target in `pending_plan` until the
-- renewal applies it. Widening only the constraint above would let a Solo
-- purchase through and refuse a Solo downgrade — the exact half-migrated state
-- that makes a feature look broken to the one customer using it.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions
  drop constraint if exists subscriptions_pending_plan_check;

alter table public.subscriptions
  add constraint subscriptions_pending_plan_check
  check (
    pending_plan is null
    or pending_plan = any (array[
      'solo'::text,
      'manager'::text,
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

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. Prove the intent survived, rather than trusting that it did
--
-- The 20260830100000 precedent: end in a check that raises if the constraint
-- does not actually permit what this file exists to permit. A silently-skipped
-- drop-then-add would otherwise leave the code half live against a database that
-- still refuses every Solo write, and the symptom would be a 500 at checkout
-- rather than anything naming this migration.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

do $$
begin
  if (
    select count(*)
    from pg_constraint
    where conname in ('subscriptions_plan_check', 'subscriptions_pending_plan_check')
      and pg_get_constraintdef(oid) like '%solo%'
  ) <> 2 then
    raise exception
      'Both subscriptions_plan_check and subscriptions_pending_plan_check must permit ''solo''; found fewer than 2.';
  end if;
end $$;
