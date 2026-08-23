-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing tiers: plan × interval, and a bounded legacy rate
--
-- Groundwork for the three-tier model (manager / label / enterprise) behind
-- NEXT_PUBLIC_FEATURE_PRICING_V2. Schema only: nothing here changes behaviour
-- while that flag is off, because no code path writes the new plan values or
-- reads the new column yet.
--
-- Two changes.
--
-- 1. subscriptions_plan_check accepts the three tier ids.
--
--    Today's allowed set is monthly / annual / yearly / access / custom /
--    founding. Every one of those must survive: a value this constraint no
--    longer permits does not merely fail to display — isRecurringPlan() stops
--    recognising it and the webhook renewal path SILENTLY STOPS EXTENDING the
--    subscription (see the plan_code mismatch branch in
--    app/api/webhooks/paystack/route.ts). So this is purely additive.
--
--    Worth knowing: 'label' has never been in this constraint, and
--    PAYSTACK_PLAN_LABEL_* has never been set, so checkout 500s before the
--    CHECK could reject it. No row anywhere carries plan = 'label'. That is
--    what makes reusing the name for the new flagship tier safe, and why
--    today's contactSales 'label' can simply become 'enterprise' with no data
--    migration.
--
-- 2. workspaces.legacy_rate_expires_at bounds a grandfathered rate.
--
--    Deliberately NOT a new legacy_founding boolean. billing_plan = 'founding'
--    already means "lifetime price lock", is already independent of
--    subscriptions.plan (which is what the spec asks of the flag), and
--    billing_locked_amount is already the rate record. What was missing was an
--    end date, because "lifetime" is the one thing a 12-month legacy rate is
--    not. So: billing_plan is the flag, billing_locked_amount is the rate,
--    this column is the expiry.
--
--    It is admin-visible only, by design. The customer is not shown a
--    countdown to a price rise; the founder gets an internal alert 60 days out
--    and has that conversation personally.
--
-- The trigger extension is not optional. "Owners manage workspaces" is
-- FOR ALL using (owner_id = auth.uid()), so a column left out of
-- prevent_workspace_billing_self_update is a column an owner can set from the
-- browser with the anon client. Leaving legacy_rate_expires_at out would let a
-- team extend its own legacy rate indefinitely.
--
-- ROLLBACK (safe — no code reads either change while the flag is off):
--   alter table public.workspaces drop column if exists legacy_rate_expires_at;
--   alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
--   alter table public.subscriptions add constraint subscriptions_plan_check
--     check (plan = any (array['monthly','annual','yearly','access','custom','founding']::text[]));
--   -- and restore prevent_workspace_billing_self_update from
--   -- 20260821120000_team_trial_hard_paywall.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. Widen subscriptions_plan_check for the tier ids
--
-- ADD CONSTRAINT has no IF NOT EXISTS, so drop-then-add (the 20260605 and
-- 20260821 precedent). Additive: every previously-allowed value is retained.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan = any (array[
    -- Tier ids (pricing v2). 'label' is the flagship; 'enterprise' is
    -- sales-led and invoiced by hand, so it is storable but never reached by
    -- self-serve checkout.
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
-- 2. workspaces.legacy_rate_expires_at
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.workspaces
  add column if not exists legacy_rate_expires_at timestamptz null;

comment on column public.workspaces.legacy_rate_expires_at is
  'When a grandfathered rate stops applying. Pairs with billing_plan = ''founding'' (the flag) and billing_locked_amount (the rate) to bound a lifetime lock to a fixed term. Admin-visible only: the customer is never shown a countdown to a price rise. Null means no legacy rate, or one with no end date.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. Extend the self-update guard to the new column
--
-- Same function as 20260821120000, with legacy_rate_expires_at added to both
-- the INSERT and the UPDATE branch. Replaced whole rather than patched because
-- a plpgsql body cannot be amended in place, and the trigger below is
-- recreated so the two can never disagree about which columns are protected.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
         or new.legacy_rate_expires_at is not null then
        raise exception 'workspaces: billing fields can only be set by the service role'
          using errcode = '42501';
      end if;
    else
      if new.trial_started_at         is distinct from old.trial_started_at
         or new.trial_ends_at            is distinct from old.trial_ends_at
         or new.comped_at                is distinct from old.comped_at
         or new.comped_by                is distinct from old.comped_by
         or new.billing_plan             is distinct from old.billing_plan
         or new.billing_locked_amount    is distinct from old.billing_locked_amount
         or new.billing_notes            is distinct from old.billing_notes
         or new.legacy_rate_expires_at   is distinct from old.legacy_rate_expires_at then
        raise exception 'workspaces: billing fields can only be modified by the service role'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_protect_billing_fields on public.workspaces;
create trigger workspaces_protect_billing_fields
  before insert or update on public.workspaces
  for each row execute function public.prevent_workspace_billing_self_update();
